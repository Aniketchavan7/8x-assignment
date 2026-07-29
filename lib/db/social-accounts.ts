/**
 * Social Accounts Helper Module
 *
 * Provides a unified API for working with the social_accounts connector table,
 * which links platform-specific accounts (TikTok, Instagram) to ownership entities
 * (creator_profiles, managed_creators).
 *
 * Architecture:
 * - social_accounts: Connector table with FKs to platform tables and ownership tables
 * - tiktok_accounts: TikTok-specific account data
 * - instagram_accounts: Instagram-specific account data
 * - creator_profiles: Creator ownership
 * - managed_creators: Brand-managed creator ownership
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import type { SocialAccount, TikTokAccount, InstagramAccount, YouTubeAccount } from '@/lib/db/types';
import { createServiceRoleClient } from '@/lib/db/supabase';

// =============================================================================
// Types
// =============================================================================

export type Platform = 'tiktok' | 'instagram' | 'youtube';

export type SocialAccountType = 'personal' | 'brand_owned' | 'tracked_only' | 'listening_passive';

/**
 * Unified social account representation combining connector + platform data.
 */
export interface UnifiedSocialAccount {
  // Connector table fields
  id: string;
  accountType: SocialAccountType;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;

  // Platform info
  platform: Platform;
  platformAccountId: string;
  username: string;
  profileUrl: string | null;
  profilePicUrl: string | null;

  // Platform-specific metrics (when available)
  followerCount?: number | null;
  isVerified?: boolean | null;

  // Ownership
  creatorProfileId: string | null;
  managedCreatorId: string | null;
}

/**
 * Options for creating a social account link.
 */
export interface CreateSocialAccountLinkOptions {
  platform: Platform;
  platformAccountId: string;
  accountType?: SocialAccountType;
  creatorProfileId?: string;
  managedCreatorId?: string;
}

/**
 * Options for creating a new platform account with connector.
 */
export interface CreatePlatformAccountOptions {
  platform: Platform;
  username: string;
  profileUrl?: string;
  source?: string;
  accountType?: SocialAccountType;
  creatorProfileId?: string;
  managedCreatorId?: string;
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get all social accounts for a creator profile with platform details.
 */
export async function getCreatorSocialAccounts(
  supabase: SupabaseClient<Database>,
  creatorProfileId: string
): Promise<UnifiedSocialAccount[]> {
  // Query connector table with joins
  const { data: connectors, error } = await supabase
    .from('social_accounts')
    .select(
      `
      id,
      account_type,
      is_active,
      created_at,
      updated_at,
      tiktok_account_id,
      instagram_account_id,
      youtube_account_id,
      creator_profile_id,
      managed_creator_id,
      tiktok_accounts!social_accounts_tiktok_account_id_fkey (
        id,
        tiktok_username,
        profile_url,
        profile_pic_url
      ),
      instagram_accounts!social_accounts_instagram_account_id_fkey (
        id,
        instagram_username,
        profile_url,
        profile_pic_url,
        follower_count,
        is_verified
      ),
      youtube_accounts!social_accounts_youtube_account_id_fkey (
        id,
        youtube_username,
        profile_url,
        profile_pic_url
      )
    `
    )
    .eq('creator_profile_id', creatorProfileId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching creator social accounts:', error);
    return [];
  }

  return (connectors || []).map(normalizeToUnified);
}

/**
 * Get all social accounts for a managed creator with platform details.
 */
export async function getManagedCreatorSocialAccounts(
  supabase: SupabaseClient<Database>,
  managedCreatorId: string
): Promise<UnifiedSocialAccount[]> {
  const { data: connectors, error } = await supabase
    .from('social_accounts')
    .select(
      `
      id,
      account_type,
      is_active,
      created_at,
      updated_at,
      tiktok_account_id,
      instagram_account_id,
      youtube_account_id,
      creator_profile_id,
      managed_creator_id,
      tiktok_accounts!social_accounts_tiktok_account_id_fkey (
        id,
        tiktok_username,
        profile_url,
        profile_pic_url
      ),
      instagram_accounts!social_accounts_instagram_account_id_fkey (
        id,
        instagram_username,
        profile_url,
        profile_pic_url,
        follower_count,
        is_verified
      ),
      youtube_accounts!social_accounts_youtube_account_id_fkey (
        id,
        youtube_username,
        profile_url,
        profile_pic_url
      )
    `
    )
    .eq('managed_creator_id', managedCreatorId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching managed creator social accounts:', error);
    return [];
  }

  return (connectors || []).map(normalizeToUnified);
}

/**
 * Get a social account by platform account ID.
 */
export async function getSocialAccountByPlatformId(
  supabase: SupabaseClient<Database>,
  platform: Platform,
  platformAccountId: string
): Promise<SocialAccount | null> {
  const column =
    platform === 'tiktok'
      ? 'tiktok_account_id'
      : platform === 'youtube'
      ? 'youtube_account_id'
      : 'instagram_account_id';

  // Only the currently active connector represents the "current owner" of a
  // platform account. Without the status filter, a `replaced` row from a prior
  // swap (same platform_account_id, e.g. when a creator reclaims a handle they
  // previously used) is returned to callers like findOrCreatePlatformAccount-
  // WithConnector, which would then re-activate it and corrupt the lifecycle
  // history chain.
  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq(column, platformAccountId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Error fetching social account by platform ID:', error);
    return null;
  }

  return data;
}

/**
 * Find a TikTok account by username.
 */
export async function findTikTokAccountByUsername(
  supabase: SupabaseClient<Database>,
  username: string
): Promise<TikTokAccount | null> {
  const { data, error } = await supabase
    .from('tiktok_accounts')
    .select('*')
    .ilike('tiktok_username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error finding TikTok account:', error);
    return null;
  }

  return data;
}

/**
 * Find an Instagram account by username.
 */
export async function findInstagramAccountByUsername(
  supabase: SupabaseClient<Database>,
  username: string
): Promise<InstagramAccount | null> {
  const { data, error } = await supabase
    .from('instagram_accounts')
    .select('*')
    .ilike('instagram_username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error finding Instagram account:', error);
    return null;
  }

  return data;
}

/**
 * Find a YouTube account by username.
 */
export async function findYouTubeAccountByUsername(
  supabase: SupabaseClient<Database>,
  username: string
): Promise<YouTubeAccount | null> {
  const { data, error } = await supabase
    .from('youtube_accounts')
    .select('*')
    .ilike('youtube_username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error finding YouTube account:', error);
    return null;
  }

  return data;
}

// =============================================================================
// Mutation Functions
// =============================================================================

/**
 * Create a connector entry linking a platform account to an owner.
 * Returns the created social_accounts row.
 */
export async function createSocialAccountLink(
  supabase: SupabaseClient<Database>,
  options: CreateSocialAccountLinkOptions
): Promise<SocialAccount | null> {
  const {
    platform,
    platformAccountId,
    accountType = 'personal',
    creatorProfileId,
    managedCreatorId,
  } = options;

  const insertData: Record<string, unknown> = {
    account_type: accountType,
    is_active: true,
    creator_profile_id: creatorProfileId || null,
    managed_creator_id: managedCreatorId || null,
  };

  if (platform === 'tiktok') {
    insertData.tiktok_account_id = platformAccountId;
  } else if (platform === 'youtube') {
    insertData.youtube_account_id = platformAccountId;
  } else {
    insertData.instagram_account_id = platformAccountId;
  }

  const { data, error } = await supabase
    .from('social_accounts')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating social account link:', error);
    return null;
  }

  return data;
}

/**
 * Create a new platform account AND its connector entry.
 * This is a convenience function for creating both in one call.
 */
export async function createPlatformAccountWithConnector(
  supabase: SupabaseClient<Database>,
  options: CreatePlatformAccountOptions
): Promise<{ platformAccount: TikTokAccount | InstagramAccount | YouTubeAccount; connector: SocialAccount } | null> {
  const {
    platform,
    username: rawUsername,
    profileUrl,
    source = 'app',
    accountType = 'personal',
    creatorProfileId,
    managedCreatorId,
  } = options;

  // Clean username - remove @ prefix if present
  const username = rawUsername.replace(/^@/, '');

  // Platform account tables (tiktok/instagram/youtube) are sync-pipeline owned
  // and RLS revokes INSERT/UPDATE/DELETE from the authenticated role. Callers
  // of this helper are already-authorized server actions / API routes, so we
  // elevate to service role here rather than pushing the concern up to every
  // callsite.
  const platformWriter = createServiceRoleClient();

  // Step 1: Create platform account
  let platformAccount: TikTokAccount | InstagramAccount | YouTubeAccount | null = null;

  if (platform === 'tiktok') {
    const { data, error } = await platformWriter
      .from('tiktok_accounts')
      .insert({
        tiktok_username: username,
        profile_url: profileUrl || `https://www.tiktok.com/@${username}`,
        source,
        creator_profile_id: creatorProfileId || null,
        is_active: true,
        tracking_status: 'active',
        backfill_status: 'in_progress', // New accounts need backfill before periodic sync
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating TikTok account:', error);
      return null;
    }
    platformAccount = data;
  } else if (platform === 'youtube') {
    const { data, error } = await platformWriter
      .from('youtube_accounts')
      .insert({
        youtube_username: username,
        profile_url: profileUrl || `https://www.youtube.com/@${username}`,
        source,
        creator_profile_id: creatorProfileId || null,
        is_active: true,
        tracking_status: 'active',
        backfill_status: 'in_progress', // New accounts need backfill before periodic sync
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating YouTube account:', error);
      return null;
    }
    platformAccount = data;
  } else {
    const { data, error } = await platformWriter
      .from('instagram_accounts')
      .insert({
        instagram_username: username,
        profile_url: profileUrl || `https://www.instagram.com/${username}`,
        source,
        creator_profile_id: creatorProfileId || null,
        is_active: true,
        tracking_status: 'active',
        backfill_status: 'in_progress', // New accounts need backfill before periodic sync
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating Instagram account:', error);
      return null;
    }
    platformAccount = data;
  }

  // Step 2: Create connector
  const connector = await createSocialAccountLink(supabase, {
    platform,
    platformAccountId: platformAccount.id,
    accountType,
    creatorProfileId,
    managedCreatorId,
  });

  if (!connector) {
    // Rollback: delete the platform account we just created
    const table =
      platform === 'tiktok'
        ? 'tiktok_accounts'
        : platform === 'youtube'
        ? 'youtube_accounts'
        : 'instagram_accounts';
    await platformWriter.from(table).delete().eq('id', platformAccount.id);
    return null;
  }

  return { platformAccount, connector };
}

export interface FindOrCreateResult {
  platformAccount: TikTokAccount | InstagramAccount | YouTubeAccount;
  connector: SocialAccount;
  created: boolean;
  /** If true, this account was previously owned by a creator (had creator_profile_id) */
  previouslyOwnedByCreator: boolean;
}

/**
 * Find or create a platform account, then ensure a connector exists.
 * Useful for managed creator workflows where the account might already exist.
 *
 * When a managed creator claims an account that was previously owned by a creator:
 * - The account_type is upgraded to 'brand_owned' (managed > creator priority)
 * - The managed_creator_id is set
 * - The previouslyOwnedByCreator flag is returned for UI notification
 */
export async function findOrCreatePlatformAccountWithConnector(
  supabase: SupabaseClient<Database>,
  options: CreatePlatformAccountOptions
): Promise<FindOrCreateResult | null> {
  const {
    platform,
    username: rawUsername,
    accountType = 'brand_owned',
    creatorProfileId,
    managedCreatorId,
  } = options;

  // Clean username - remove @ prefix if present
  const username = rawUsername.replace(/^@/, '');

  // Step 1: Try to find existing platform account
  let platformAccount: TikTokAccount | InstagramAccount | YouTubeAccount | null = null;
  let created = false;
  let previouslyOwnedByCreator = false;

  if (platform === 'tiktok') {
    platformAccount = await findTikTokAccountByUsername(supabase, username);
  } else if (platform === 'youtube') {
    platformAccount = await findYouTubeAccountByUsername(supabase, username);
  } else {
    platformAccount = await findInstagramAccountByUsername(supabase, username);
  }

  // Step 2: Create if not found
  if (!platformAccount) {
    const result = await createPlatformAccountWithConnector(supabase, options);
    if (!result) return null;
    return { ...result, created: true, previouslyOwnedByCreator: false };
  }

  // Step 3: Check if connector already exists
  let existingConnector = await getSocialAccountByPlatformId(
    supabase,
    platform,
    platformAccount.id
  );

  if (existingConnector) {
    // Check if this account was previously owned by a creator (not a managed creator)
    // This is true if it has a creator_profile_id and is either 'personal' type
    // or we're now claiming it for a managed creator
    previouslyOwnedByCreator = !!(
      existingConnector.creator_profile_id &&
      managedCreatorId &&
      existingConnector.managed_creator_id !== managedCreatorId
    );

    // Update ownership if needed
    // When a managed creator claims the account, 'brand_owned' takes priority over 'personal'
    const needsUpdate =
      (creatorProfileId && existingConnector.creator_profile_id !== creatorProfileId) ||
      (managedCreatorId && existingConnector.managed_creator_id !== managedCreatorId);

    if (needsUpdate) {
      // at_most_one_owner CHECK forbids both ownership FKs being set. When an
      // MC is claiming an account that previously had a personal
      // creator_profile_id, explicitly null the personal FK out — mirrors the
      // migration's backfill_active_lifecycle_for_platform logic. Without this
      // the UPDATE silently 23514s and the caller proceeds with a stale,
      // personally-owned connector.
      const nextCreatorProfileId = managedCreatorId
        ? null
        : creatorProfileId ?? existingConnector.creator_profile_id;
      const nextManagedCreatorId =
        managedCreatorId ?? existingConnector.managed_creator_id;

      const { data: updated, error: updateErr } = await supabase
        .from('social_accounts')
        .update({
          creator_profile_id: nextCreatorProfileId,
          managed_creator_id: nextManagedCreatorId,
          // When managed creator claims, upgrade to brand_owned
          account_type: managedCreatorId ? 'brand_owned' : accountType,
        })
        .eq('id', existingConnector.id)
        .select()
        .single();

      if (updateErr) {
        console.error(
          '[findOrCreatePlatformAccountWithConnector] ownership update failed:',
          updateErr,
        );
        return null;
      }
      if (updated) existingConnector = updated;
    }

    return {
      platformAccount,
      connector: existingConnector,
      created: false,
      previouslyOwnedByCreator,
    };
  }

  // Step 4: Create new connector for existing platform account
  const connector = await createSocialAccountLink(supabase, {
    platform,
    platformAccountId: platformAccount.id,
    accountType,
    creatorProfileId,
    managedCreatorId,
  });

  if (!connector) return null;

  return { platformAccount, connector, created: false, previouslyOwnedByCreator: false };
}

/**
 * Update ownership of a social account.
 */
export async function updateSocialAccountOwnership(
  supabase: SupabaseClient<Database>,
  socialAccountId: string,
  options: {
    creatorProfileId?: string | null;
    managedCreatorId?: string | null;
    accountType?: SocialAccountType;
  }
): Promise<SocialAccount | null> {
  const updateData: Record<string, unknown> = {};

  if (options.creatorProfileId !== undefined) {
    updateData.creator_profile_id = options.creatorProfileId;
  }
  if (options.managedCreatorId !== undefined) {
    updateData.managed_creator_id = options.managedCreatorId;
  }
  if (options.accountType !== undefined) {
    updateData.account_type = options.accountType;
  }

  const { data, error } = await supabase
    .from('social_accounts')
    .update(updateData)
    .eq('id', socialAccountId)
    .select()
    .single();

  if (error) {
    console.error('Error updating social account ownership:', error);
    return null;
  }

  return data;
}

/**
 * Deactivate a social account connector (soft delete).
 */
export async function deactivateSocialAccount(
  supabase: SupabaseClient<Database>,
  socialAccountId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('social_accounts')
    .update({ is_active: false })
    .eq('id', socialAccountId);

  if (error) {
    console.error('Error deactivating social account:', error);
    return false;
  }

  return true;
}

/**
 * Remove ownership from a social account (unlink from creator/managed creator).
 */
export async function unlinkSocialAccount(
  supabase: SupabaseClient<Database>,
  socialAccountId: string
): Promise<SocialAccount | null> {
  const { data, error } = await supabase
    .from('social_accounts')
    .update({
      creator_profile_id: null,
      managed_creator_id: null,
      account_type: 'tracked_only',
    })
    .eq('id', socialAccountId)
    .select()
    .single();

  if (error) {
    console.error('Error unlinking social account:', error);
    return null;
  }

  return data;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a connector row with joined platform data to UnifiedSocialAccount.
 */
function normalizeToUnified(row: Record<string, unknown>): UnifiedSocialAccount {
  const tiktok = row.tiktok_accounts as Record<string, unknown> | null;
  const instagram = row.instagram_accounts as Record<string, unknown> | null;
  const youtube = row.youtube_accounts as Record<string, unknown> | null;

  const platform: Platform = tiktok ? 'tiktok' : youtube ? 'youtube' : 'instagram';
  const platformData = tiktok || youtube || instagram || {};

  return {
    id: row.id as string,
    accountType: row.account_type as SocialAccountType,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string | null,
    updatedAt: row.updated_at as string | null,

    platform,
    platformAccountId:
      (platformData.id as string) ||
      ((row.tiktok_account_id || row.youtube_account_id || row.instagram_account_id) as string),
    username: (tiktok?.tiktok_username ||
      youtube?.youtube_username ||
      instagram?.instagram_username) as string,
    profileUrl: (platformData.profile_url as string) || null,
    profilePicUrl: (platformData.profile_pic_url as string) || null,

    followerCount: instagram?.follower_count as number | null,
    isVerified: instagram?.is_verified as boolean | null,

    creatorProfileId: row.creator_profile_id as string | null,
    managedCreatorId: row.managed_creator_id as string | null,
  };
}

/**
 * Build a profile URL from platform and username.
 */
export function buildProfileUrl(platform: Platform, username: string): string {
  const cleanUsername = username.replace(/^@/, '');

  if (platform === 'tiktok') {
    return `https://www.tiktok.com/@${cleanUsername}`;
  }

  if (platform === 'youtube') {
    return `https://www.youtube.com/@${cleanUsername}`;
  }

  return `https://www.instagram.com/${cleanUsername}`;
}
