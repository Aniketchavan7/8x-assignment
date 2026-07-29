import type { createServiceRoleClient } from '@/lib/db/supabase';
import { notify } from './notify';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type VideoReviewStatus = 'approved' | 'needs_changes' | 'rejected';
export type VideoReviewerType = 'admin' | 'ai' | 'brand';

type VideoReviewEvent = 'video_approved' | 'video_needs_changes' | 'video_rejected';

const STATUS_TO_EVENT: Record<VideoReviewStatus, VideoReviewEvent> = {
  approved: 'video_approved',
  needs_changes: 'video_needs_changes',
  rejected: 'video_rejected',
};

const BODY_BUILDERS: Record<VideoReviewEvent, (feedback?: string | null) => string> = {
  video_approved: (feedback) =>
    `Your video has been approved. Great work!${feedback ? ` Feedback: ${feedback}` : ''}`,
  video_needs_changes: (feedback) =>
    `Your video needs a few changes before it can be approved.${
      feedback ? ` What to fix: ${feedback}.` : ''
    } Update the caption or account details and reply here when it's done.`,
  video_rejected: (feedback) =>
    `Your video was not approved for this campaign.${
      feedback ? ` Reason: ${feedback}.` : ''
    } Submit a new video that follows the campaign guidelines.`,
};

export interface NotifyOnVideoReviewInput {
  reviewStatus: VideoReviewStatus;
  managedCreatorPostId?: string | null;
  cpmSubmissionId?: string | null;
  linkedUserId?: string | null;
  brandOrganizationId?: string | null;
  postUrl?: string | null;
  feedback?: string | null;
  reviewerType?: VideoReviewerType;
}

interface ResolvedContext {
  linkedUserId: string;
  brandOrganizationId: string | null;
  postUrl: string | null;
}

async function resolveFromMcp(
  supabase: ServiceClient,
  managedCreatorPostId: string,
): Promise<ResolvedContext | null> {
  const { data } = await supabase
    .from('managed_creator_posts')
    .select(
      `
      managed_creators ( linked_user_id, brand_organization_id ),
      posts ( post_url )
      `
    )
    .eq('id', managedCreatorPostId)
    .maybeSingle();

  if (!data) return null;
  const mc = data.managed_creators as
    | { linked_user_id: string | null; brand_organization_id: string | null }
    | null;
  const post = data.posts as { post_url: string | null } | null;

  if (!mc?.linked_user_id) return null;
  return {
    linkedUserId: mc.linked_user_id,
    brandOrganizationId: mc.brand_organization_id ?? null,
    postUrl: post?.post_url ?? null,
  };
}

async function resolveFromCpmSubmission(
  supabase: ServiceClient,
  cpmSubmissionId: string,
): Promise<ResolvedContext | null> {
  // CPM resolution best-effort — may no-op if relationships are stale (CPM deprecated).
  const { data } = await supabase
    .from('cpm_submissions')
    .select(
      `
      video_url,
      creator_profile:creator_profiles!creator_profile_id ( user_id ),
      job:jobs!job_id ( brand_organization_id )
      `
    )
    .eq('id', cpmSubmissionId)
    .maybeSingle();

  if (!data) return null;
  const profile = data.creator_profile as { user_id: string | null } | null;
  const job = data.job as { brand_organization_id: string | null } | null;

  if (!profile?.user_id) return null;
  return {
    linkedUserId: profile.user_id,
    brandOrganizationId: job?.brand_organization_id ?? null,
    postUrl: data.video_url ?? null,
  };
}

/**
 * Fire a video-review notify() for a creator.
 *
 * Resolves linkedUserId + brandOrganizationId from the MCP or CPM submission
 * if not provided. No-op if the creator can't be resolved.
 *
 * Never throws — errors are routed to Sentry via captureFireAndForget.
 */
export async function notifyOnVideoReview(
  supabase: ServiceClient,
  input: NotifyOnVideoReviewInput,
): Promise<void> {
  try {
    // AI reviews lack per-video context in notification copy — suppress until UX is updated.
    if (input.reviewerType === 'ai') {
      return;
    }

    let linkedUserId = input.linkedUserId ?? null;
    let brandOrganizationId = input.brandOrganizationId ?? null;
    let postUrl = input.postUrl ?? null;

    if (!linkedUserId) {
      let ctx: ResolvedContext | null = null;
      if (input.managedCreatorPostId) {
        ctx = await resolveFromMcp(supabase, input.managedCreatorPostId);
      } else if (input.cpmSubmissionId) {
        ctx = await resolveFromCpmSubmission(supabase, input.cpmSubmissionId);
      }
      if (!ctx) return;
      linkedUserId = ctx.linkedUserId;
      brandOrganizationId = brandOrganizationId ?? ctx.brandOrganizationId;
      postUrl = postUrl ?? ctx.postUrl;
    }

    const event = STATUS_TO_EVENT[input.reviewStatus];
    const trimmedFeedback = input.feedback?.trim() || null;
    const body = BODY_BUILDERS[event](trimmedFeedback);

    const data: Record<string, unknown> = {};
    if (input.managedCreatorPostId) data.managed_creator_post_id = input.managedCreatorPostId;
    if (input.cpmSubmissionId) data.cpm_submission_id = input.cpmSubmissionId;
    if (postUrl) data.post_url = postUrl;
    if (trimmedFeedback) data.feedback = trimmedFeedback;
    if (input.reviewerType) data.reviewer_type = input.reviewerType;

    await notify({
      userId: linkedUserId,
      eventType: event,
      brandOrganizationId,
      body,
      data,
    });
  } catch (err) {
    captureFireAndForget('video_review_notify')(err);
  }
}
