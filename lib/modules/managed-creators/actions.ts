'use server';

/**
 * Managed Creators server actions
 * CRUD operations for the managed_creators table
 */

import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Database } from '@/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { managedCreatorStatusSchema, MC_STATUS } from './constants';
import type { ManagedCreator } from './types';
import {
  TASK_CONFIG,
  type TaskId,
  type TaskColumnName,
} from './task-config';
import {
  findOrCreatePlatformAccountWithConnector,
  findTikTokAccountByUsername,
  findInstagramAccountByUsername,
  findYouTubeAccountByUsername,
  getSocialAccountByPlatformId,
} from '@/lib/db/social-accounts';
import { captureDbError } from '@/lib/analytics/capture-error';
import { autoLinkManagedCreatorByEmail } from './auto-link';
import { applyManagedCreatorDropSideEffects } from './drop-side-effects';
import { after } from 'next/server';
import { notifyOnStatusTransition } from './notify-on-status-transition';

type ManagedCreatorInsert = Database['public']['Tables']['managed_creators']['Insert'];
type ManagedCreatorUpdate = Database['public']['Tables']['managed_creators']['Update'];

// =====================================================
// Helper Functions
// =====================================================

/**
 * Backfill managed_creator_posts for existing posts when platform FKs are linked.
 * Uses the backfill_posts_for_managed_creator RPC (idempotent via ON CONFLICT DO NOTHING).
 */
async function backfillPostsForManagedCreator(
  supabase: SupabaseClient<Database>,
  managedCreatorId: string,
  userId?: string
): Promise<void> {
  const { error } = await supabase.rpc('backfill_posts_for_managed_creator', {
    p_managed_creator_id: managedCreatorId,
  });
  if (error) {
    console.error('[backfillPostsForManagedCreator] Failed:', error);
    captureDbError(error, 'backfill_posts_for_managed_creator', { userId, metadata: { managedCreatorId } });
  }
}

/**
 * Check if a social account is already claimed (brand_owned) by another managed creator.
 * Returns the claiming managed creator's ID if found.
 *
 * Policy: A brand can track any account as `tracked_only`, but only one managed creator
 * can claim an account as `brand_owned`. This prevents competitors from claiming
 * accounts that belong to another brand's managed creators.
 */
async function checkAccountAlreadyClaimed(
  supabase: SupabaseClient<Database>,
  platform: 'tiktok' | 'instagram' | 'youtube',
  username: string,
  excludeManagedCreatorId?: string
): Promise<{
  claimed: boolean;
  claimedByManagedCreatorId?: string;
  claimedByManagedCreatorName?: string;
}> {
  // Find platform account by username
  const platformAccount =
    platform === 'tiktok'
      ? await findTikTokAccountByUsername(supabase, username)
      : platform === 'instagram'
        ? await findInstagramAccountByUsername(supabase, username)
        : await findYouTubeAccountByUsername(supabase, username);

  if (!platformAccount) {
    return { claimed: false };
  }

  // Check connector for ownership
  const connector = await getSocialAccountByPlatformId(supabase, platform, platformAccount.id);

  if (!connector) {
    return { claimed: false };
  }

  // If it's brand_owned by a DIFFERENT managed creator, it's claimed
  if (
    connector.account_type === 'brand_owned' &&
    connector.managed_creator_id &&
    connector.managed_creator_id !== excludeManagedCreatorId
  ) {
    // Get the claiming managed creator's name for error message
    const { data: claimingCreator } = await supabase
      .from('managed_creators')
      .select('name')
      .eq('id', connector.managed_creator_id)
      .single();

    return {
      claimed: true,
      claimedByManagedCreatorId: connector.managed_creator_id,
      claimedByManagedCreatorName: claimingCreator?.name || 'another managed creator',
    };
  }

  return { claimed: false };
}

/**
 * Unlink a social account from a managed creator for a specific platform.
 * Sets managed_creator_id to null on the social_accounts connector.
 */
async function unlinkManagedCreatorPlatformAccount(
  supabase: SupabaseClient<Database>,
  managedCreatorId: string,
  platform: 'tiktok' | 'instagram' | 'youtube'
): Promise<void> {
  const column = platform === 'tiktok' ? 'tiktok_account_id' : platform === 'instagram' ? 'instagram_account_id' : 'youtube_account_id';

  await supabase
    .from('social_accounts')
    .update({
      managed_creator_id: null,
      account_type: 'tracked_only',
    })
    .eq('managed_creator_id', managedCreatorId)
    .not(column, 'is', null);
}

// =====================================================
// Create Managed Creator
// =====================================================

const createManagedCreatorSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    location: z.string().optional(),
    tiktokUsername: z.string().optional(),
    instagramUsername: z.string().optional(),
    youtubeUsername: z.string().optional(),
    status: managedCreatorStatusSchema.optional(),
    basePay: z.coerce.number().optional(),
    payment: z.string().optional(),
    paymentMethod: z
      .enum([
        'stripe_connect',
        'sideshift',
        'whop',
        'binance',
        'paypal',
        'bank_transfer',
        'pending',
      ])
      .optional(),
    payoutFrequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
    sourced: z.string().optional(),
    notes: z.string().optional(),
    brandOrganizationId: z.string().uuid().optional(),
  })
  .passthrough();

export interface PreviousOwnershipInfo {
  tiktok?: boolean;
  instagram?: boolean;
  youtube?: boolean;
}

export type CreateManagedCreatorResult =
  | { success: true; creator: ManagedCreator; previouslyOwnedByCreator?: PreviousOwnershipInfo }
  | { error: string };

export const createManagedCreator = validatedActionWithUser<
  typeof createManagedCreatorSchema,
  CreateManagedCreatorResult
>(createManagedCreatorSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (userError || userData?.account_type !== 'admin') {
    return { error: 'Only admins can create managed creators.' };
  }

  // Check if accounts are already claimed by another managed creator
  if (data.tiktokUsername) {
    const tiktokClaim = await checkAccountAlreadyClaimed(supabase, 'tiktok', data.tiktokUsername);
    if (tiktokClaim.claimed) {
      return {
        error: `TikTok account @${data.tiktokUsername} is already managed by "${tiktokClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  if (data.instagramUsername) {
    const instagramClaim = await checkAccountAlreadyClaimed(
      supabase,
      'instagram',
      data.instagramUsername
    );
    if (instagramClaim.claimed) {
      return {
        error: `Instagram account @${data.instagramUsername} is already managed by "${instagramClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  if (data.youtubeUsername) {
    const youtubeClaim = await checkAccountAlreadyClaimed(supabase, 'youtube', data.youtubeUsername);
    if (youtubeClaim.claimed) {
      return {
        error: `YouTube account @${data.youtubeUsername} is already managed by "${youtubeClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  const insertData: ManagedCreatorInsert = {
    name: data.name,
    email: data.email?.toLowerCase() || null,
    phone: data.phone || null,
    location: data.location || null,
    tiktok_username: data.tiktokUsername || null,
    instagram_username: data.instagramUsername || null,
    youtube_username: data.youtubeUsername || null,
    status: data.status || MC_STATUS.APPLIED,
    base_pay: data.basePay || 0,
    payment: data.payment || null,
    payment_method: data.paymentMethod || 'pending',
    payout_frequency: data.payoutFrequency || 'monthly',
    sourced: data.sourced || null,
    notes: data.notes || null,
    brand_organization_id: data.brandOrganizationId || null,
  };

  const { data: creator, error } = await supabase
    .from('managed_creators')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[createManagedCreator] Failed:', error);
    captureDbError(error, 'create_managed_creator', { userId: user.id });
    return { error: 'Failed to create creator. Please try again.' };
  }

  // Auto-link if email matches an existing creator user
  if (creator.email) {
    const serviceSupabase = createServiceRoleClient();
    await autoLinkManagedCreatorByEmail(serviceSupabase, creator.email, {
      managedCreatorId: creator.id,
    });
  }

  // Create social_accounts connector entries and get platform account IDs
  let tiktokAccountId: string | null = null;
  let instagramAccountId: string | null = null;
  let youtubeAccountId: string | null = null;
  const previouslyOwnedByCreator: PreviousOwnershipInfo = {};

  if (data.tiktokUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'tiktok',
      username: data.tiktokUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creator.id,
    });
    if (result) {
      tiktokAccountId = result.platformAccount.id;
      if (result.previouslyOwnedByCreator) {
        previouslyOwnedByCreator.tiktok = true;
      }
    }
  }

  if (data.instagramUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'instagram',
      username: data.instagramUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creator.id,
    });
    if (result) {
      instagramAccountId = result.platformAccount.id;
      if (result.previouslyOwnedByCreator) {
        previouslyOwnedByCreator.instagram = true;
      }
    }
  }

  if (data.youtubeUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'youtube',
      username: data.youtubeUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creator.id,
    });
    if (result) {
      youtubeAccountId = result.platformAccount.id;
      if (result.previouslyOwnedByCreator) {
        previouslyOwnedByCreator.youtube = true;
      }
    }
  }

  // Update managed_creator with platform account FKs
  if (tiktokAccountId || instagramAccountId || youtubeAccountId) {
    const { data: updatedCreator } = await supabase
      .from('managed_creators')
      .update({
        tiktok_account_id: tiktokAccountId,
        instagram_account_id: instagramAccountId,
        youtube_account_id: youtubeAccountId,
      })
      .eq('id', creator.id)
      .select()
      .single();

    if (updatedCreator) {
      await backfillPostsForManagedCreator(supabase, creator.id, user.id);
      revalidatePath('/dashboard/creators');
      const hasPreviousOwnership =
        previouslyOwnedByCreator.tiktok || previouslyOwnedByCreator.instagram || previouslyOwnedByCreator.youtube;
      return {
        success: true,
        creator: updatedCreator,
        ...(hasPreviousOwnership && { previouslyOwnedByCreator }),
      };
    }
  }

  revalidatePath('/dashboard/creators');
  const hasPreviousOwnership =
    previouslyOwnedByCreator.tiktok || previouslyOwnedByCreator.instagram || previouslyOwnedByCreator.youtube;
  return {
    success: true,
    creator,
    ...(hasPreviousOwnership && { previouslyOwnedByCreator }),
  };
});

// =====================================================
// Update Managed Creator
// =====================================================

const updateManagedCreatorSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    location: z.string().optional(),
    tiktokUsername: z.string().optional(),
    instagramUsername: z.string().optional(),
    youtubeUsername: z.string().optional(),
    status: managedCreatorStatusSchema.optional(),
    basePay: z.coerce.number().optional(),
    payment: z.string().optional(),
    paymentOutstanding: z.coerce.number().optional(),
    totalPaid: z.coerce.number().optional(),
    pendingPayout: z.coerce.number().optional(),
    paymentMethod: z
      .enum([
        'stripe_connect',
        'sideshift',
        'whop',
        'binance',
        'paypal',
        'bank_transfer',
        'pending',
      ])
      .optional(),
    payoutFrequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
    tiktokPerformance: z.coerce.number().optional(),
    instagramPerformance: z.coerce.number().optional(),
    sourced: z.string().optional(),
    notes: z.string().optional(),
    // Onboarding checklist
    onboardingCallComplete: z.boolean().optional(),
    handlesComplete: z.boolean().optional(),
    videosComplete: z.boolean().optional(),
    collectedTiktokUrl: z.string().optional(),
    collectedInstagramUrl: z.string().optional(),
    videoUrls: z.array(z.string()).optional(),
  })
  .passthrough();

export type UpdateManagedCreatorResult =
  | { success: true; creator: ManagedCreator; previouslyOwnedByCreator?: PreviousOwnershipInfo }
  | { error: string };

export const updateManagedCreator = validatedActionWithUser<
  typeof updateManagedCreatorSchema,
  UpdateManagedCreatorResult
>(updateManagedCreatorSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (userError || userData?.account_type !== 'admin') {
    return { error: 'Only admins can update managed creators.' };
  }

  // Service-role client for the narrow set of writes that authenticated
  // RLS can no longer perform: social_accounts connector managed_creator_id
  // clear + platform_accounts tracking_disabled flip on old-handle cleanup.
  // Admin identity is already verified above.
  const serviceClient = createServiceRoleClient();

  // Fetch current state to compare username changes
  const { data: currentCreator, error: fetchError } = await supabase
    .from('managed_creators')
    .select(
      'status, tiktok_username, instagram_username, youtube_username, tiktok_account_id, instagram_account_id, youtube_account_id, brand_organization_id, job_id, linked_user_id'
    )
    .eq('id', data.id)
    .single();

  if (fetchError) {
    console.error('[updateManagedCreator] Failed to fetch current state:', fetchError);
    captureDbError(fetchError, 'update_managed_creator_fetch', { userId: user.id, metadata: { creatorId: data.id } });
    return { error: 'Failed to update creator. Please try again.' };
  }

  // Check if NEW accounts are already claimed by another managed creator
  // (excludes current managed creator so re-linking the same account is allowed)
  if (data.tiktokUsername && data.tiktokUsername !== currentCreator.tiktok_username) {
    const tiktokClaim = await checkAccountAlreadyClaimed(
      supabase,
      'tiktok',
      data.tiktokUsername,
      data.id
    );
    if (tiktokClaim.claimed) {
      return {
        error: `TikTok account @${data.tiktokUsername} is already managed by "${tiktokClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  if (data.instagramUsername && data.instagramUsername !== currentCreator.instagram_username) {
    const instagramClaim = await checkAccountAlreadyClaimed(
      supabase,
      'instagram',
      data.instagramUsername,
      data.id
    );
    if (instagramClaim.claimed) {
      return {
        error: `Instagram account @${data.instagramUsername} is already managed by "${instagramClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  if (data.youtubeUsername && data.youtubeUsername !== currentCreator.youtube_username) {
    const youtubeClaim = await checkAccountAlreadyClaimed(
      supabase,
      'youtube',
      data.youtubeUsername,
      data.id
    );
    if (youtubeClaim.claimed) {
      return {
        error: `YouTube account @${data.youtubeUsername} is already managed by "${youtubeClaim.claimedByManagedCreatorName}". An account can only be owned by one managed creator.`,
      };
    }
  }

  const updateData: ManagedCreatorUpdate = {
    updated_at: new Date().toISOString(),
  };

  // Map camelCase to snake_case
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email?.toLowerCase() || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.location !== undefined) updateData.location = data.location || null;
  if (data.tiktokUsername !== undefined) updateData.tiktok_username = data.tiktokUsername || null;
  if (data.instagramUsername !== undefined)
    updateData.instagram_username = data.instagramUsername || null;
  if (data.youtubeUsername !== undefined)
    updateData.youtube_username = data.youtubeUsername || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.basePay !== undefined) updateData.base_pay = data.basePay;
  if (data.payment !== undefined) updateData.payment = data.payment || null;
  if (data.paymentOutstanding !== undefined)
    updateData.payment_outstanding = data.paymentOutstanding;
  if (data.totalPaid !== undefined) updateData.total_paid = data.totalPaid;
  if (data.pendingPayout !== undefined) updateData.pending_payout = data.pendingPayout;
  if (data.paymentMethod !== undefined) updateData.payment_method = data.paymentMethod;
  if (data.payoutFrequency !== undefined) updateData.payout_frequency = data.payoutFrequency;
  if (data.tiktokPerformance !== undefined) updateData.tiktok_performance = data.tiktokPerformance;
  if (data.instagramPerformance !== undefined)
    updateData.instagram_performance = data.instagramPerformance;
  if (data.sourced !== undefined) updateData.sourced = data.sourced || null;
  if (data.notes !== undefined) updateData.notes = data.notes || null;
  // Onboarding checklist
  if (data.onboardingCallComplete !== undefined)
    updateData.onboarding_call_complete = data.onboardingCallComplete;
  if (data.handlesComplete !== undefined) updateData.handles_complete = data.handlesComplete;
  if (data.videosComplete !== undefined) updateData.videos_complete = data.videosComplete;
  if (data.collectedTiktokUrl !== undefined)
    updateData.collected_tiktok_url = data.collectedTiktokUrl || null;
  if (data.collectedInstagramUrl !== undefined)
    updateData.collected_instagram_url = data.collectedInstagramUrl || null;
  if (data.videoUrls !== undefined) updateData.video_urls = data.videoUrls;

  // Track previous creator ownership for UI notifications
  const previouslyOwnedByCreator: PreviousOwnershipInfo = {};

  // Handle TikTok username changes
  const oldTiktok = currentCreator.tiktok_username;
  const oldTiktokAccountId = currentCreator.tiktok_account_id;
  const newTiktok = data.tiktokUsername !== undefined ? data.tiktokUsername || null : oldTiktok;
  const tiktokChanged = data.tiktokUsername !== undefined && oldTiktok !== newTiktok;
  if (tiktokChanged) {
    // Unlink and freeze old account if there was one
    if (oldTiktok && oldTiktokAccountId) {
      await unlinkManagedCreatorPlatformAccount(serviceClient, data.id, 'tiktok');
      await serviceClient
        .from('tiktok_accounts')
        .update({ tracking_disabled: true, tracking_status: 'reduced' })
        .eq('id', oldTiktokAccountId);
      updateData.tiktok_account_id = null;
    }
    // Create/link new social_account if there's a new username
    if (newTiktok) {
      const result = await findOrCreatePlatformAccountWithConnector(supabase, {
        platform: 'tiktok',
        username: newTiktok,
        source: 'managed_creator',
        accountType: 'brand_owned',
        managedCreatorId: data.id,
      });
      if (result) {
        updateData.tiktok_account_id = result.platformAccount.id;
        if (result.previouslyOwnedByCreator) {
          previouslyOwnedByCreator.tiktok = true;
        }
      }
    }
  }

  // Handle Instagram username changes
  const oldInstagram = currentCreator.instagram_username;
  const oldInstagramAccountId = currentCreator.instagram_account_id;
  const newInstagram =
    data.instagramUsername !== undefined ? data.instagramUsername || null : oldInstagram;
  const instagramChanged = data.instagramUsername !== undefined && oldInstagram !== newInstagram;

  if (instagramChanged) {
    // Unlink and freeze old account if there was one
    if (oldInstagram && oldInstagramAccountId) {
      await unlinkManagedCreatorPlatformAccount(serviceClient, data.id, 'instagram');
      await serviceClient
        .from('instagram_accounts')
        .update({ tracking_disabled: true, tracking_status: 'reduced' })
        .eq('id', oldInstagramAccountId);
      updateData.instagram_account_id = null;
    }
    // Create/link new social_account if there's a new username
    if (newInstagram) {
      const result = await findOrCreatePlatformAccountWithConnector(supabase, {
        platform: 'instagram',
        username: newInstagram,
        source: 'managed_creator',
        accountType: 'brand_owned',
        managedCreatorId: data.id,
      });
      if (result) {
        updateData.instagram_account_id = result.platformAccount.id;
        if (result.previouslyOwnedByCreator) {
          previouslyOwnedByCreator.instagram = true;
        }
      }
    }
  }

  // Handle YouTube username changes
  const oldYoutube = currentCreator.youtube_username;
  const oldYoutubeAccountId = currentCreator.youtube_account_id;
  const newYoutube = data.youtubeUsername !== undefined ? data.youtubeUsername || null : oldYoutube;
  const youtubeChanged = data.youtubeUsername !== undefined && oldYoutube !== newYoutube;

  if (youtubeChanged) {
    if (oldYoutube && oldYoutubeAccountId) {
      await unlinkManagedCreatorPlatformAccount(serviceClient, data.id, 'youtube');
      await serviceClient
        .from('youtube_accounts')
        .update({ tracking_disabled: true, tracking_status: 'reduced' })
        .eq('id', oldYoutubeAccountId);
      updateData.youtube_account_id = null;
    }
    if (newYoutube) {
      const result = await findOrCreatePlatformAccountWithConnector(supabase, {
        platform: 'youtube',
        username: newYoutube,
        source: 'managed_creator',
        accountType: 'brand_owned',
        managedCreatorId: data.id,
      });
      if (result) {
        updateData.youtube_account_id = result.platformAccount.id;
        if (result.previouslyOwnedByCreator) {
          previouslyOwnedByCreator.youtube = true;
        }
      }
    }
  }

  const { data: creator, error } = await supabase
    .from('managed_creators')
    .update(updateData)
    .eq('id', data.id)
    .select()
    .single();

  if (error) {
    console.error('[updateManagedCreator] Failed:', error);
    captureDbError(error, 'update_managed_creator', { userId: user.id, metadata: { creatorId: data.id } });
    return { error: 'Failed to update creator. Please try again.' };
  }

  const platformLinked =
    (tiktokChanged && newTiktok) || (instagramChanged && newInstagram) || (youtubeChanged && newYoutube);
  if (creator && platformLinked) {
    await backfillPostsForManagedCreator(supabase, data.id, user.id);
  }

  if (creator && data.status !== undefined && data.status !== currentCreator.status) {
    const previousStatus = currentCreator.status;
    const nextStatus = data.status;
    const creatorId = data.id;
    const brandOrgId = currentCreator.brand_organization_id;
    const jobId = currentCreator.job_id;
    const linkedUserId = currentCreator.linked_user_id;
    after(() =>
      notifyOnStatusTransition(serviceClient, previousStatus, nextStatus, {
        managedCreatorId: creatorId,
        brandOrganizationId: brandOrgId,
        jobId,
        linkedUserId,
      }),
    );
  }

  revalidatePath('/dashboard/creators');
  const hasPreviousOwnership =
    previouslyOwnedByCreator.tiktok || previouslyOwnedByCreator.instagram || previouslyOwnedByCreator.youtube;
  return {
    success: true,
    creator,
    ...(hasPreviousOwnership && { previouslyOwnedByCreator }),
  };
});

// =====================================================
// Delete Managed Creator
// =====================================================

const deleteManagedCreatorSchema = z
  .object({
    id: z.string().uuid(),
  })
  .passthrough();

export type DeleteManagedCreatorResult = { success: true } | { error: string };

export const deleteManagedCreator = validatedActionWithUser<
  typeof deleteManagedCreatorSchema,
  DeleteManagedCreatorResult
>(deleteManagedCreatorSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (userError || userData?.account_type !== 'admin') {
    return { error: 'Only admins can delete managed creators.' };
  }

  const { error } = await supabase.from('managed_creators').delete().eq('id', data.id);

  if (error) {
    console.error('[deleteManagedCreator] Failed:', error);
    captureDbError(error, 'delete_managed_creator', { userId: user.id, metadata: { creatorId: data.id } });
    return { error: 'Failed to delete creator. Please try again.' };
  }

  revalidatePath('/dashboard/creators');
  return { success: true };
});

// =====================================================
// Reject Managed Creator
// =====================================================

const rejectManagedCreatorSchema = z
  .object({
    id: z.string().uuid(),
  })
  .passthrough();

export type RejectManagedCreatorResult =
  | { success: true; creator: ManagedCreator }
  | { error: string };

/**
 * Reject a managed creator.
 * - Sets status to rejected
 * - Unlinks social accounts (sets managed_creator_id to null, account_type to 'tracked_only')
 * - Freezes tracked accounts via BTSA when present, otherwise falls back to direct platform freeze
 * - Keeps BTSA rows for historical data
 * - Does NOT delete the managed_creator row
 */
export const rejectManagedCreator = validatedActionWithUser<
  typeof rejectManagedCreatorSchema,
  RejectManagedCreatorResult
>(rejectManagedCreatorSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (userError || userData?.account_type !== 'admin') {
    return { error: 'Only admins can reject managed creators.' };
  }

  // Get current links
  const { data: currentCreator, error: fetchError } = await supabase
    .from('managed_creators')
    .select('status, tiktok_account_id, instagram_account_id, youtube_account_id, linked_user_id, job_id, brand_organization_id')
    .eq('id', data.id)
    .single();

  if (fetchError) {
    console.error('[rejectManagedCreator] Failed to fetch creator:', fetchError);
    captureDbError(fetchError, 'reject_managed_creator_fetch', { userId: user.id, metadata: { creatorId: data.id } });
    return { error: 'Failed to reject creator. Please try again.' };
  }

  const dropResult = await applyManagedCreatorDropSideEffects(supabase, data.id, currentCreator);
  if (!dropResult.success) {
    console.error(
      `[rejectManagedCreator] Failed during ${dropResult.step}:`,
      dropResult.error
    );
    captureDbError(dropResult.error, `reject_managed_creator_${dropResult.step}`, {
      userId: user.id,
      metadata: { creatorId: data.id },
    });
    return { error: 'Failed to reject creator. Please try again.' };
  }

  // Update managed_creator status (keep the row, just mark as rejected)
  const { data: creator, error: updateError } = await supabase
    .from('managed_creators')
    .update({
      status: MC_STATUS.REJECTED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id)
    .select()
    .single();

  if (updateError) {
    console.error('[rejectManagedCreator] Failed to update:', updateError);
    captureDbError(updateError, 'reject_managed_creator_update', { userId: user.id, metadata: { creatorId: data.id } });
    return { error: 'Failed to reject creator. Please try again.' };
  }

  const previousStatus = currentCreator.status;
  const linkedUserId = currentCreator.linked_user_id;
  const brandOrgId = currentCreator.brand_organization_id ?? null;
  const jobId = currentCreator.job_id;
  const creatorId = data.id;
  after(() =>
    notifyOnStatusTransition(createServiceRoleClient(), previousStatus, MC_STATUS.REJECTED, {
      managedCreatorId: creatorId,
      brandOrganizationId: brandOrgId,
      jobId,
      linkedUserId,
    }),
  );

  revalidatePath('/dashboard/creators');
  return { success: true, creator };
});

// =====================================================
// Save Transcript
// =====================================================

const saveTranscriptSchema = z
  .object({
    managedCreatorId: z.string().uuid(),
    transcript: z.string().min(1, 'Transcript is required'),
    callDate: z.string().optional(),
  })
  .passthrough();

export type SaveTranscriptResult = { success: true; transcriptId: string } | { error: string };

export const saveTranscript = validatedActionWithUser<
  typeof saveTranscriptSchema,
  SaveTranscriptResult
>(saveTranscriptSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Verify user is admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (userError || userData?.account_type !== 'admin') {
    return { error: 'Only admins can save transcripts.' };
  }

  const { data: transcript, error } = await supabase
    .from('managed_creator_transcripts')
    .insert({
      managed_creator_id: data.managedCreatorId,
      transcript: data.transcript,
      call_date: data.callDate || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[saveTranscript] Failed:', error);
    captureDbError(error, 'save_transcript', { userId: user.id, metadata: { managedCreatorId: data.managedCreatorId } });
    return { error: 'Failed to save transcript. Please try again.' };
  }

  // Mark onboarding call as complete
  await supabase
    .from('managed_creators')
    .update({ onboarding_call_complete: true })
    .eq('id', data.managedCreatorId);

  revalidatePath('/dashboard/creators');
  return { success: true, transcriptId: transcript.id };
});

// =====================================================
// Toggle Task Completion (Creator or Admin)
// =====================================================

const toggleTaskCompletionSchema = z
  .object({
    managedCreatorId: z.string().uuid(),
    taskId: z.string(),
    // Coerce string "true"/"false" from FormData to boolean
    completed: z.preprocess((val) => {
      if (typeof val === 'string') return val === 'true';
      return val;
    }, z.boolean()),
  })
  .passthrough();

export type ToggleTaskCompletionResult =
  | { success: true; completedAt: string | null }
  | { error: string };

/**
 * Toggle task completion for a managed creator.
 * Can be called by the creator themselves or by an admin.
 *
 * Validates:
 * - Dependencies are complete before allowing completion
 * - Minimum time since previous task (for warm-up day spacing)
 * - Deadline not exceeded (unless admin is forcing)
 */
export const toggleTaskCompletion = validatedActionWithUser<
  typeof toggleTaskCompletionSchema,
  ToggleTaskCompletionResult
>(toggleTaskCompletionSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Validate taskId is a valid task
  if (!(data.taskId in TASK_CONFIG)) {
    return { error: 'Invalid task ID' };
  }
  const taskId = data.taskId as TaskId;
  const config = TASK_CONFIG[taskId];

  // Fetch the managed creator to verify access and get current state
  const { data: creator, error: fetchError } = await supabase
    .from('managed_creators')
    .select('*')
    .eq('id', data.managedCreatorId)
    .single();

  if (fetchError || !creator) {
    return { error: 'Managed creator not found' };
  }

  // Check if user is the creator, a platform admin, or a brand admin
  const isOwner = creator.linked_user_id === user.id;
  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();
  const isPlatformAdmin = userData?.account_type === 'admin';

  let isBrandAdmin = false;
  if (!isOwner && !isPlatformAdmin && creator.brand_organization_id) {
    // Check if user is a brand admin for this creator's brand
    const { data: brandMember } = await supabase
      .from('brand_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('brand_organization_id', creator.brand_organization_id)
      .single();

    isBrandAdmin = brandMember?.role === 'owner' || brandMember?.role === 'admin';
  }

  const isAdmin = isPlatformAdmin || isBrandAdmin;

  if (!isOwner && !isAdmin) {
    return { error: 'You do not have permission to update this task' };
  }

  // If marking as complete, validate dependencies and timing
  if (data.completed) {
    // Check dependencies
    for (const depId of config.dependsOn) {
      const depConfig = TASK_CONFIG[depId];
      const depValue = creator[depConfig.columnName as keyof typeof creator];
      if (!depValue) {
        return { error: `Must complete "${depConfig.title}" first` };
      }
    }

    // Check minimum time since previous task (for warm-up days) - admins can bypass
    if (config.minHoursAfterPrev > 0 && config.dependsOn.length > 0 && !isAdmin) {
      const prevTaskId = config.dependsOn[0] as TaskId;
      const prevConfig = TASK_CONFIG[prevTaskId];
      const prevCompletedAt = creator[prevConfig.columnName as keyof typeof creator] as string | null;

      if (prevCompletedAt) {
        const hoursSince = (Date.now() - new Date(prevCompletedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < config.minHoursAfterPrev) {
          const remaining = Math.ceil(config.minHoursAfterPrev - hoursSince);
          return { error: `Must wait ${remaining} more hour${remaining !== 1 ? 's' : ''} before completing this task` };
        }
      }
    }

    // Note: Deadlines are informational only - we don't block task completion
    // Creators can still complete tasks after the deadline passes
  }

  // Update the task completion timestamp
  const columnName = config.columnName;
  const newValue = data.completed ? new Date().toISOString() : null;

  const { error: updateError } = await supabase
    .from('managed_creators')
    .update({
      [columnName]: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.managedCreatorId);

  if (updateError) {
    console.error('[toggleTaskCompletion] Failed:', updateError);
    return { error: 'Failed to update task. Please try again.' };
  }

  // Also sync with legacy boolean columns for backwards compatibility
  if (columnName === 'onboarding_call_completed_at') {
    await supabase
      .from('managed_creators')
      .update({ onboarding_call_complete: data.completed })
      .eq('id', data.managedCreatorId);
  } else if (columnName === 'videos_completed_at') {
    await supabase
      .from('managed_creators')
      .update({ videos_complete: data.completed })
      .eq('id', data.managedCreatorId);
  }

  revalidatePath('/dashboard/jobs');
  return { success: true, completedAt: newValue };
});

// =====================================================
// Grant Task Extension (Admin Only)
// =====================================================

const grantTaskExtensionSchema = z
  .object({
    managedCreatorId: z.string().uuid(),
    taskId: z.string(),
    extraHours: z.coerce.number().positive('Extension hours must be positive'),
  })
  .passthrough();

export type GrantTaskExtensionResult =
  | { success: true; totalExtension: number }
  | { error: string };

/**
 * Grant additional time for a task deadline.
 * Can be called by platform admins or brand admins for their brand's creators.
 * Extensions are cumulative.
 */
export const grantTaskExtension = validatedActionWithUser<
  typeof grantTaskExtensionSchema,
  GrantTaskExtensionResult
>(grantTaskExtensionSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Validate taskId first
  if (!(data.taskId in TASK_CONFIG)) {
    return { error: 'Invalid task ID' };
  }
  const taskId = data.taskId as TaskId;
  const config = TASK_CONFIG[taskId];

  // Check if task has a deadline (extensions only make sense for tasks with deadlines)
  if (!config.deadlineHours) {
    return { error: 'This task does not have a deadline.' };
  }

  // Fetch managed creator with brand org info
  const { data: creator, error: fetchError } = await supabase
    .from('managed_creators')
    .select('deadline_extensions, brand_organization_id')
    .eq('id', data.managedCreatorId)
    .single();

  if (fetchError || !creator) {
    return { error: 'Managed creator not found' };
  }

  // Check authorization: platform admin OR brand admin
  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  const isPlatformAdmin = userData?.account_type === 'admin';

  let isBrandAdmin = false;
  if (!isPlatformAdmin && creator.brand_organization_id) {
    // Check if user is a brand admin for this creator's brand
    const { data: brandMember } = await supabase
      .from('brand_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('brand_organization_id', creator.brand_organization_id)
      .single();

    isBrandAdmin = brandMember?.role === 'owner' || brandMember?.role === 'admin';
  }

  if (!isPlatformAdmin && !isBrandAdmin) {
    return { error: 'Only admins can grant task extensions.' };
  }

  // Add extension (cumulative)
  const extensions = (creator.deadline_extensions as Record<string, number>) ?? {};
  const currentExtension = extensions[taskId] ?? 0;
  const newExtension = currentExtension + data.extraHours;
  extensions[taskId] = newExtension;

  // Update database
  const { error: updateError } = await supabase
    .from('managed_creators')
    .update({
      deadline_extensions: extensions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.managedCreatorId);

  if (updateError) {
    console.error('[grantTaskExtension] Failed:', updateError);
    return { error: 'Failed to grant extension. Please try again.' };
  }

  revalidatePath('/dashboard/jobs');
  revalidatePath('/dashboard/creators');
  return { success: true, totalExtension: newExtension };
});

// =====================================================
// Unlock Task Immediately (Admin Only)
// =====================================================

const unlockTaskImmediatelySchema = z
  .object({
    managedCreatorId: z.string().uuid(),
    taskId: z.string(),
  })
  .passthrough();

export type UnlockTaskImmediatelyResult =
  | { success: true; message: string }
  | { error: string };

/**
 * Unlock a timing-locked task by backdating the previous task's completion time.
 * This allows admins to make a task available without waiting for the time constraint.
 *
 * For example, if warmup-day-2 requires 12h after warmup-day-1, this action
 * will set warmup-day-1's completion time to 13 hours ago.
 */
export const unlockTaskImmediately = validatedActionWithUser<
  typeof unlockTaskImmediatelySchema,
  UnlockTaskImmediatelyResult
>(unlockTaskImmediatelySchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Validate taskId first
  if (!(data.taskId in TASK_CONFIG)) {
    return { error: 'Invalid task ID' };
  }
  const taskId = data.taskId as TaskId;
  const config = TASK_CONFIG[taskId];

  // This action only makes sense for tasks with timing constraints
  const hasDependencies = (config.dependsOn as readonly string[]).length > 0;
  if (!config.minHoursAfterPrev || !hasDependencies) {
    return { error: 'This task does not have timing constraints to unlock.' };
  }

  // Fetch managed creator
  const { data: creator, error: fetchError } = await supabase
    .from('managed_creators')
    .select('*, brand_organization_id')
    .eq('id', data.managedCreatorId)
    .single();

  if (fetchError || !creator) {
    return { error: 'Managed creator not found' };
  }

  // Check authorization: platform admin OR brand admin
  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  const isPlatformAdmin = userData?.account_type === 'admin';

  let isBrandAdmin = false;
  if (!isPlatformAdmin && creator.brand_organization_id) {
    const { data: brandMember } = await supabase
      .from('brand_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('brand_organization_id', creator.brand_organization_id)
      .single();

    isBrandAdmin = brandMember?.role === 'owner' || brandMember?.role === 'admin';
  }

  if (!isPlatformAdmin && !isBrandAdmin) {
    return { error: 'Only admins can unlock tasks.' };
  }

  // Get the previous task
  const prevTaskId = config.dependsOn[0] as TaskId;
  const prevConfig = TASK_CONFIG[prevTaskId];
  const prevColumnName = prevConfig.columnName;

  // Check if previous task is completed
  const prevCompletedAt = creator[prevColumnName as keyof typeof creator] as string | null;
  if (!prevCompletedAt) {
    return { error: `Cannot unlock: "${prevConfig.title}" must be completed first.` };
  }

  // Calculate a backdated timestamp that satisfies the timing requirement
  // Set it to (minHoursAfterPrev + 1) hours ago so the task is immediately available
  const backdatedTime = new Date(Date.now() - (config.minHoursAfterPrev + 1) * 60 * 60 * 1000);

  // Update the previous task's completion timestamp
  const { error: updateError } = await supabase
    .from('managed_creators')
    .update({
      [prevColumnName]: backdatedTime.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.managedCreatorId);

  if (updateError) {
    console.error('[unlockTaskImmediately] Failed:', updateError);
    return { error: 'Failed to unlock task. Please try again.' };
  }

  revalidatePath('/dashboard/creators');
  revalidatePath('/dashboard/jobs');
  return {
    success: true,
    message: `Unlocked "${config.title}" by adjusting "${prevConfig.title}" timestamp.`
  };
});
