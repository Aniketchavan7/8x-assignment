import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { notify } from '@/lib/messaging/notify';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import type { EventType } from '@/lib/messaging/events';
import { MC_STATUS, type ManagedCreatorStatus } from './constants';

export type StatusTransitionEvent = Extract<
  EventType,
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'creator_dropped'
>;

export interface NotifyOnStatusTransitionContext {
  managedCreatorId: string;
  brandOrganizationId: string | null;
  jobId?: string | null;
  jobTitle?: string;
  rejectionReason?: string | null;
  /** Inbox owner. If absent, we look it up from managed_creators.linked_user_id. */
  linkedUserId?: string | null;
  /**
   * What triggered the status transition. Drives the rejection copy:
   *   - 'video_review' (admin rejected the onboarding video) → video-flavored body
   *   - 'status_change' (generic) → generic application-rejected body
   * Default: 'status_change'.
   */
  triggerContext?: 'video_review' | 'status_change';
}

const ACCEPTED_MIDWAY = new Set<string>([MC_STATUS.ACCEPTED]);
const ACCEPTED_LIVE = new Set<string>([MC_STATUS.WARMING_UP, MC_STATUS.ACTIVE]);

export function mapStatusTransitionToEvent(
  previousStatus: string | null | undefined,
  nextStatus: string,
): StatusTransitionEvent | null {
  if (nextStatus === previousStatus) return null;

  if (previousStatus == null && nextStatus === MC_STATUS.APPLIED) {
    return 'application_received';
  }

  // Both "midway accepted" (status=accepted, test video approved) and
  // "live accepted" (warming_up/active) fire `application_accepted`.
  // We only fire it ONCE — on the first transition into either bucket —
  // so accepted → warming_up does NOT re-notify a creator who already got
  // the "test video approved" message.
  const isAcceptedNext = ACCEPTED_LIVE.has(nextStatus) || ACCEPTED_MIDWAY.has(nextStatus);
  const isAcceptedPrev =
    !!previousStatus && (ACCEPTED_LIVE.has(previousStatus) || ACCEPTED_MIDWAY.has(previousStatus));
  if (isAcceptedNext) {
    if (isAcceptedPrev) return null;
    return 'application_accepted';
  }

  if (nextStatus === MC_STATUS.REJECTED) {
    return 'application_rejected';
  }

  if (nextStatus === MC_STATUS.DROPPED) {
    if (previousStatus === MC_STATUS.REJECTED) return null;
    return 'creator_dropped';
  }

  return null;
}

function bodyForEvent(
  event: StatusTransitionEvent,
  nextStatus: string,
  jobTitle: string,
  brandName: string | null,
  rejectionReason: string | null,
  triggerContext: 'video_review' | 'status_change',
): string {
  switch (event) {
    case 'application_received':
      return `You've applied to ${jobTitle}. We'll get back to you soon.`;
    case 'application_accepted':
      if (ACCEPTED_MIDWAY.has(nextStatus)) {
        return `Great news — your test video for ${jobTitle} was approved. We'll be in touch with next steps.`;
      }
      return `Great news — your application for ${jobTitle} has been accepted! Open the app to get started.`;
    case 'application_rejected':
      if (triggerContext === 'video_review') {
        const target = brandName ?? jobTitle;
        return `Thank you for uploading your video to ${target}. Unfortunately, it didn't quite match what we're looking for. Please re-upload a new video following the brief.`;
      }
      return rejectionReason
        ? `Your application for ${jobTitle} was not selected this time. Reason: ${rejectionReason}`
        : `Your application for ${jobTitle} was not selected this time. Keep applying — more opportunities are coming.`;
    case 'creator_dropped':
      return `You've been removed from ${jobTitle}. If this is a surprise, reply here and we'll look into it.`;
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled status transition event: ${_exhaustive}`);
    }
  }
}

async function fetchJobTitle(
  supabase: SupabaseClient<Database>,
  jobId: string | null | undefined,
): Promise<string> {
  if (!jobId) return 'this campaign';
  const { data } = await supabase
    .from('jobs')
    .select('job_title')
    .eq('id', jobId)
    .maybeSingle();
  return data?.job_title ?? 'this campaign';
}

async function fetchBrandName(
  supabase: SupabaseClient<Database>,
  brandOrganizationId: string | null,
): Promise<string | null> {
  if (!brandOrganizationId) return null;
  const { data } = await supabase
    .from('brand_organizations')
    .select('organization_name')
    .eq('id', brandOrganizationId)
    .maybeSingle();
  return data?.organization_name ?? null;
}

/**
 * Single entrypoint for managed_creators.status transition notifications.
 * Call after a successful DB update — never from the optimistic path.
 *
 * No-ops when:
 * - prev === next
 * - the transition doesn't map to a creator-facing event
 * - linked_user_id can't be resolved (creator not yet linked to a user)
 *
 * Errors are swallowed via captureFireAndForget so a notify failure
 * never blocks the calling request.
 */
export async function notifyOnStatusTransition(
  supabase: SupabaseClient<Database>,
  previousStatus: ManagedCreatorStatus | string | null | undefined,
  nextStatus: ManagedCreatorStatus | string,
  ctx: NotifyOnStatusTransitionContext,
): Promise<void> {
  try {
    const event = mapStatusTransitionToEvent(previousStatus, nextStatus);
    if (!event) return;

    let linkedUserId = ctx.linkedUserId ?? null;
    let brandOrganizationId = ctx.brandOrganizationId;
    let jobId = ctx.jobId ?? null;

    if (linkedUserId == null || brandOrganizationId == null || jobId == null) {
      const { data: mc } = await supabase
        .from('managed_creators')
        .select('linked_user_id, brand_organization_id, job_id')
        .eq('id', ctx.managedCreatorId)
        .maybeSingle();
      if (mc) {
        linkedUserId = linkedUserId ?? mc.linked_user_id ?? null;
        brandOrganizationId = brandOrganizationId ?? mc.brand_organization_id ?? null;
        jobId = jobId ?? mc.job_id ?? null;
      }
    }

    if (!linkedUserId) return;

    const jobTitle = ctx.jobTitle ?? (await fetchJobTitle(supabase, jobId));
    const rejectionReason = ctx.rejectionReason ?? null;
    const triggerContext = ctx.triggerContext ?? 'status_change';
    const isVideoReviewRejection =
      event === 'application_rejected' && triggerContext === 'video_review';
    const brandName = isVideoReviewRejection
      ? await fetchBrandName(supabase, brandOrganizationId)
      : null;

    await notify({
      userId: linkedUserId,
      eventType: event,
      brandOrganizationId,
      body: bodyForEvent(event, nextStatus, jobTitle, brandName, rejectionReason, triggerContext),
      ...(isVideoReviewRejection
        ? { titleOverride: `${brandName ?? jobTitle} — Please re-upload your video` }
        : {}),
      data: {
        managed_creator_id: ctx.managedCreatorId,
        job_id: jobId,
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
        ...(isVideoReviewRejection ? { trigger: 'video_review' } : {}),
      },
    });
  } catch (err) {
    captureFireAndForget('managed_creator_status_notify')(err);
  }
}
