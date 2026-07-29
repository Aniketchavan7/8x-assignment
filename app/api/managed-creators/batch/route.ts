import { NextResponse, NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { findOrCreatePlatformAccountWithConnector } from '@/lib/db/social-accounts';
import { validateAndExtractUsername } from '@/lib/utils/social-username';
import type { Database } from '@/types/supabase';
import { handleApiError } from '@/lib/utils/api-error';
import { autoLinkManagedCreatorByEmail } from '@/lib/modules/managed-creators/auto-link';
import { getBrandContext, triggerAccountSync } from '@/lib/modules/managed-creators/api-helpers';
import {
  applyManagedCreatorDropSideEffects,
  reverseManagedCreatorDropSideEffects,
} from '@/lib/modules/managed-creators/drop-side-effects';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';
import { notifyOnStatusTransition } from '@/lib/modules/managed-creators/notify-on-status-transition';
import { after } from 'next/server';

const BATCH_MUTABLE_FIELDS = new Set([
  'name',
  'email',
  'phone',
  'location',
  'tiktok_username',
  'instagram_username',
  'youtube_username',
  'status',
  'country',
  'notes',
  'tags',
  'base_course_status',
  'sourced',
  'base_pay',
  'payment',
  'payment_method',
  'payout_frequency',
]);

/**
 * Link social accounts for a managed creator and update the FK columns.
 */
async function linkSocialAccountsForCreator(
  supabase: ReturnType<typeof createServiceRoleClient>,
  creatorId: string,
  _brandOrgId: string,
  tiktokUsername: string | null,
  instagramUsername: string | null,
  youtubeUsername: string | null = null
): Promise<{ tiktokAccountId: string | null; instagramAccountId: string | null; youtubeAccountId: string | null }> {
  let tiktokAccountId: string | null = null;
  let instagramAccountId: string | null = null;
  let youtubeAccountId: string | null = null;

  if (tiktokUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'tiktok',
      username: tiktokUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creatorId,
    });
    if (result) {
      tiktokAccountId = result.platformAccount.id;
      await triggerAccountSync('tiktok', tiktokUsername, tiktokAccountId);
    }
  }

  if (instagramUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'instagram',
      username: instagramUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creatorId,
    });
    if (result) {
      instagramAccountId = result.platformAccount.id;
      await triggerAccountSync('instagram', instagramUsername, instagramAccountId);
    }
  }

  if (youtubeUsername) {
    const result = await findOrCreatePlatformAccountWithConnector(supabase, {
      platform: 'youtube',
      username: youtubeUsername,
      source: 'managed_creator',
      accountType: 'brand_owned',
      managedCreatorId: creatorId,
    });
    if (result) {
      youtubeAccountId = result.platformAccount.id;
      await triggerAccountSync('youtube', youtubeUsername, youtubeAccountId);
    }
  }

  // Update the managed_creator with account FKs
  const fkUpdate: Record<string, string | null> = {};
  if (tiktokAccountId) fkUpdate.tiktok_account_id = tiktokAccountId;
  if (instagramAccountId) fkUpdate.instagram_account_id = instagramAccountId;
  if (youtubeAccountId) fkUpdate.youtube_account_id = youtubeAccountId;

  if (Object.keys(fkUpdate).length > 0) {
    await supabase
      .from('managed_creators')
      .update(fkUpdate)
      .eq('id', creatorId);
  }

  return { tiktokAccountId, instagramAccountId, youtubeAccountId };
}

type ManagedCreator = Database['public']['Tables']['managed_creators']['Row'];
type PaymentMethod = Database['public']['Tables']['managed_creators']['Row']['payment_method'];
type PayoutFrequency = Database['public']['Tables']['managed_creators']['Row']['payout_frequency'];
type Status = Database['public']['Tables']['managed_creators']['Row']['status'];

interface UpdateItem {
  id: string;
  changes: Record<string, unknown>;
}

interface CreateItem {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  country?: string | null;
  tiktok_username?: string | null;
  instagram_username?: string | null;
  youtube_username?: string | null;
  status?: Status;
  base_pay?: number;
  payment?: string | null;
  payment_method?: PaymentMethod;
  payout_frequency?: PayoutFrequency;
  sourced?: string | null;
  notes?: string | null;
  job_id?: string | null;
}

interface BatchRequest {
  updates: UpdateItem[];
  creates: CreateItem[];
}

/**
 * POST /api/managed-creators/batch
 * Batch update/create managed creators with audit logging
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const body: BatchRequest = await request.json();
    const { updates = [], creates = [] } = body;

    if (!context.brandId && !context.isAdmin) {
      return NextResponse.json({ error: 'Brand context required' }, { status: 400 });
    }

    // Generate a batch ID to group all audit log entries
    const batchId = crypto.randomUUID();
    const errors: Array<{ id: string; error: string }> = [];
    const updatedCreators: Array<Record<string, unknown>> = [];
    const createdCreators: Array<Record<string, unknown>> = [];

    // Process updates
    for (const update of updates) {
      try {
        // First, get the current state to record old values
        const { data, error: fetchError } = await context.supabase
          .from('managed_creators')
          .select('*')
          .eq('id', update.id)
          .single();

        if (fetchError || !data) {
          errors.push({ id: update.id, error: 'Creator not found' });
          continue;
        }

        const currentCreator: ManagedCreator = data;

        // Verify brand access
        if (
          !context.isAdmin &&
          context.brandId &&
          currentCreator.brand_organization_id !== context.brandId
        ) {
          errors.push({ id: update.id, error: 'Access denied' });
          continue;
        }

        // Build update data — only allow known-safe fields
        const filteredChanges: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(update.changes as Record<string, unknown>)) {
          if (BATCH_MUTABLE_FIELDS.has(key)) {
            filteredChanges[key] = value;
          }
        }
        const updateData: Record<string, unknown> = {
          ...filteredChanges,
          updated_at: new Date().toISOString(),
        };

        // Validate and normalize username changes (text-only, no BTSA linking).
        // BTSA account creation + sync happens separately via "add to client dashboard".
        const changes = update.changes as Record<string, unknown>;
        const brandOrgId = currentCreator.brand_organization_id;

        for (const platform of ['tiktok', 'instagram', 'youtube'] as const) {
          const field = `${platform}_username` as const;
          if (!(field in changes)) continue;

          if (changes[field]) {
            const validation = validateAndExtractUsername(changes[field] as string, platform);
            if ('error' in validation) {
              errors.push({ id: update.id, error: `${platform}: ${validation.error}` });
              continue;
            }
            updateData[field] = validation.username;
          } else {
            updateData[field] = null;
          }
        }

        // Set accepted_at timestamp when moving to accepted
        if (changes.status === MC_STATUS.ACCEPTED && currentCreator.status !== MC_STATUS.ACCEPTED) {
          updateData.accepted_at = new Date().toISOString();
        }

        // Auto-advance accepted → warming_up when admin adds a handle
        // Check both current DB status and pending status change in this update
        const effectiveStatus = (updateData.status as string) ?? currentCreator.status;
        if (effectiveStatus === MC_STATUS.ACCEPTED) {
          const hasNewTiktok = changes.tiktok_username && !currentCreator.tiktok_username;
          const hasNewInstagram = changes.instagram_username && !currentCreator.instagram_username;
          if (hasNewTiktok || hasNewInstagram) {
            updateData.status = MC_STATUS.WARMING_UP;
            const now = new Date().toISOString();
            if (hasNewTiktok) updateData.tiktok_handle_completed_at = now;
            if (hasNewInstagram) updateData.instagram_handle_completed_at = now;
          }
        }

        const wasDroppedOrRejected =
          currentCreator.status === 'dropped' || currentCreator.status === 'rejected';
        const isDroppingOrRejecting =
          (changes.status === 'dropped' || changes.status === 'rejected') && !wasDroppedOrRejected;
        if (isDroppingOrRejecting) {
          const dropResult = await applyManagedCreatorDropSideEffects(
            context.supabase,
            update.id,
            currentCreator
          );

          if (!dropResult.success) {
            errors.push({ id: update.id, error: `Failed during ${dropResult.step}` });
            continue;
          }
        }

        const isUndropping =
          changes.status !== undefined &&
          changes.status !== 'dropped' &&
          changes.status !== 'rejected' &&
          wasDroppedOrRejected;
        if (isUndropping) {
          const undropResult = await reverseManagedCreatorDropSideEffects(
            context.supabase,
            update.id,
            currentCreator
          );

          if (!undropResult.success) {
            errors.push({ id: update.id, error: `Failed to reverse drop during ${undropResult.step}` });
            continue;
          }
        }

        const { data: updatedCreator, error: updateError } = await context.supabase
          .from('managed_creators')
          .update(updateData)
          .eq('id', update.id)
          .select()
          .single();

        if (updateError) {
          errors.push({ id: update.id, error: updateError.message });
          continue;
        }

        const previousStatus = currentCreator.status as string | null;
        const nextStatus = (updateData.status as string | undefined) ?? previousStatus;
        if (nextStatus && nextStatus !== previousStatus) {
          const creatorId = update.id;
          const brandOrgId = currentCreator.brand_organization_id;
          const jobId = currentCreator.job_id;
          const linkedUserId = currentCreator.linked_user_id;
          const rejectionReason =
            (changes.rejection_reason as string | undefined) ?? null;
          after(() =>
            notifyOnStatusTransition(context.supabase, previousStatus, nextStatus, {
              managedCreatorId: creatorId,
              brandOrganizationId: brandOrgId,
              jobId,
              rejectionReason,
              linkedUserId,
            }),
          );
        }

        // Record audit log entries for each changed field
        if (brandOrgId) {
          const creatorRecord = currentCreator as Record<string, unknown>;
          const auditEntries = Object.keys(filteredChanges)
            .filter((field) => field !== 'updated_at')
            .map((field) => ({
              managed_creator_id: update.id,
              brand_organization_id: brandOrgId,
              action: 'update' as const,
              field_name: field,
              old_value: creatorRecord[field] != null ? String(creatorRecord[field]) : null,
              new_value: filteredChanges[field] != null ? String(filteredChanges[field]) : null,
              changed_by: context.user.id,
              batch_id: batchId,
            }));

          if (auditEntries.length > 0) {
            const { error: auditError } = await context.supabase
              .from('managed_creator_audit_log')
              .insert(auditEntries);

            if (auditError) {
              console.error('[Batch] Audit log error:', auditError);
            }
          }
        }

        updatedCreators.push(updatedCreator);
      } catch (err) {
        console.error(`[Batch] Error updating creator ${update.id}:`, err);
        errors.push({ id: update.id, error: 'Unexpected error' });
      }
    }

    // Determine brand ID for creates
    const brandIdForCreates = context.brandId;
    if (!brandIdForCreates) {
      if (creates.length > 0) {
        // For admin without brand context, we need brand ID in the request
        return NextResponse.json(
          { error: 'Brand context required for creating new creators' },
          { status: 400 }
        );
      }
    }

    // Process creates (only if we have a brand context)
    if (brandIdForCreates) {
      // Bulk-fetch matching users/profiles for auto-linking (avoids N+1 queries)
      const emailsToLink = creates
        .map((c) => c.email?.trim()?.toLowerCase())
        .filter((e): e is string => !!e);

      const usersByEmail = new Map<string, string>();
      const profilesByUserId = new Map<string, string>();

      if (emailsToLink.length > 0) {
        const { data: matchingUsers } = await context.supabase
          .from('users')
          .select('id, email')
          .in('email', emailsToLink)
          .eq('account_type', 'creator');

        if (matchingUsers && matchingUsers.length > 0) {
          for (const u of matchingUsers) {
            if (u.email) usersByEmail.set(u.email.toLowerCase(), u.id);
          }

          const userIds = matchingUsers.map((u) => u.id);
          const { data: matchingProfiles } = await context.supabase
            .from('creator_profiles')
            .select('id, user_id')
            .in('user_id', userIds);

          if (matchingProfiles) {
            for (const p of matchingProfiles) {
              if (p.user_id) profilesByUserId.set(p.user_id, p.id);
            }
          }
        }
      }

      // Process creates in parallel — each create is independent
      const createResults = await Promise.allSettled(
        creates.map(async (create) => {
          if (!create.name?.trim()) {
            return { ok: false as const, error: 'Name is required' };
          }

          // Validate and extract usernames (sync)
          let tiktokUsername: string | null = null;
          let instagramUsername: string | null = null;
          let youtubeUsername: string | null = null;

          if (create.tiktok_username) {
            const validation = validateAndExtractUsername(create.tiktok_username, 'tiktok');
            if ('error' in validation) {
              return { ok: false as const, error: `TikTok: ${validation.error}` };
            }
            tiktokUsername = validation.username;
          }

          if (create.instagram_username) {
            const validation = validateAndExtractUsername(create.instagram_username, 'instagram');
            if ('error' in validation) {
              return { ok: false as const, error: `Instagram: ${validation.error}` };
            }
            instagramUsername = validation.username;
          }

          if (create.youtube_username) {
            const validation = validateAndExtractUsername(create.youtube_username, 'youtube');
            if ('error' in validation) {
              return { ok: false as const, error: `YouTube: ${validation.error}` };
            }
            youtubeUsername = validation.username;
          }

          const createData = {
            brand_organization_id: brandIdForCreates,
            name: create.name,
            email: create.email?.toLowerCase() || null,
            phone: create.phone || null,
            location: create.location || null,
            country: create.country || null,
            tiktok_username: tiktokUsername,
            instagram_username: instagramUsername,
            youtube_username: youtubeUsername,
            tiktok_added_at: tiktokUsername ? new Date().toISOString() : null,
            instagram_added_at: instagramUsername ? new Date().toISOString() : null,
            youtube_added_at: youtubeUsername ? new Date().toISOString() : null,
            status: (create.status || 'applied') as Status,
            base_pay: create.base_pay || 0,
            payment: create.payment || null,
            payment_method: (create.payment_method || 'pending') as PaymentMethod,
            payout_frequency: (create.payout_frequency || 'monthly') as PayoutFrequency,
            sourced: create.sourced || null,
            notes: create.notes || null,
            job_id: create.job_id || null,
          };

          const { data: newCreator, error: createError } = await context.supabase
            .from('managed_creators')
            .insert(createData)
            .select()
            .single();

          if (createError) {
            return {
              ok: false as const,
              error: createError.code === '23505' ? 'Duplicate creator' : createError.message,
            };
          }

          // Post-insert work: auto-link, social accounts, and audit log are independent
          const createdStatus = createData.status as string;
          after(() =>
            notifyOnStatusTransition(context.supabase, null, createdStatus, {
              managedCreatorId: newCreator.id,
              brandOrganizationId: brandIdForCreates,
              jobId: createData.job_id,
            }),
          );

          await Promise.all([
            // Auto-link if email matches an existing creator user (using bulk-fetched maps)
            (async () => {
              if (!newCreator.email) return;
              const matchedUserId = usersByEmail.get(newCreator.email.toLowerCase());
              if (!matchedUserId) return;
              const matchedProfileId = profilesByUserId.get(matchedUserId);
              if (!matchedProfileId) return;
              await autoLinkManagedCreatorByEmail(context.supabase, newCreator.email, {
                managedCreatorId: newCreator.id,
                userId: matchedUserId,
                creatorProfileId: matchedProfileId,
              });
            })(),
            // Link social accounts and update FKs
            tiktokUsername || instagramUsername || youtubeUsername
              ? linkSocialAccountsForCreator(
                  context.supabase,
                  newCreator.id,
                  brandIdForCreates,
                  tiktokUsername,
                  instagramUsername,
                  youtubeUsername
                )
              : Promise.resolve(),
            // Record audit log entry for create
            context.supabase
              .from('managed_creator_audit_log')
              .insert({
                managed_creator_id: newCreator.id,
                brand_organization_id: brandIdForCreates,
                action: 'create',
                field_name: null,
                old_value: null,
                new_value: JSON.stringify(createData),
                changed_by: context.user.id,
                batch_id: batchId,
              })
              .then(({ error: auditError }) => {
                if (auditError) console.error('[Batch] Audit log error for create:', auditError);
              }),
          ]);

          return { ok: true as const, creator: newCreator };
        })
      );

      for (const result of createResults) {
        if (result.status === 'rejected') {
          console.error('[Batch] Error creating creator:', result.reason);
          errors.push({ id: 'new', error: 'Unexpected error' });
        } else if (!result.value.ok) {
          errors.push({ id: 'new', error: result.value.error });
        } else {
          createdCreators.push(result.value.creator);
        }
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      updated: updatedCreators,
      created: createdCreators,
      auditBatchId: batchId,
      errors,
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/batch',
      method: 'POST',
    });
  }
}
