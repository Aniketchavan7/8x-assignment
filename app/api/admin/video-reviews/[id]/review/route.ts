export const runtime = 'nodejs';

import { NextRequest, after } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureDbError } from '@/lib/analytics/capture-error';
import { notifyPostReviewed } from '@/lib/notifications/admin-slack';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { notifyOnVideoReview } from '@/lib/messaging/notify-on-video-review';

const VALID_STATUSES = ['approved', 'needs_changes', 'rejected'] as const;
type ReviewStatus = (typeof VALID_STATUSES)[number];

/**
 * POST /api/admin/video-reviews/[id]/review
 *
 * Submit a review for a managed creator post.
 * [id] = managed_creator_post_id
 *
 * Body: { status: 'approved' | 'needs_changes' | 'rejected', feedback?: string }
 *
 * 1. Validates admin user
 * 2. Inserts into post_reviews (trigger auto-updates managed_creator_posts.review_status)
 * 3. Sends system message to creator via sendSystemMessage()
 * 4. Sends Slack notification to per-job channel via notifyPostReviewed()
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { id: managedCreatorPostId } = await params;
    const body = await req.json();
    const { status, feedback } = body as { status: string; feedback?: string };

    if (!status || !VALID_STATUSES.includes(status as ReviewStatus)) {
      return Response.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if ((status === 'needs_changes' || status === 'rejected') && !feedback?.trim()) {
      return Response.json(
        { error: 'Feedback is required for needs_changes and rejected statuses' },
        { status: 400 }
      );
    }

    // Parallelize admin check + post fetch
    const [{ data: userData }, { data: mcp, error: mcpError }] = await Promise.all([
      supabase
        .from('users')
        .select('account_type, email')
        .eq('id', user.id)
        .single(),
      supabase
        .from('managed_creator_posts')
        .select(
          `
          id,
          post_id,
          managed_creators (
            id,
            name,
            slack_user_id,
            linked_user_id,
            job_id,
            brand_organization_id,
            jobs (
              id,
              job_title,
              slack_channel_id
            )
          ),
          posts (
            id,
            platform,
            post_url
          )
        `
        )
        .eq('id', managedCreatorPostId)
        .single(),
    ]);

    if (!userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    if (mcpError || !mcp) {
      return Response.json({ error: 'Managed creator post not found' }, { status: 404 });
    }

    // Insert the review (trigger updates managed_creator_posts.review_status)
    const { data: review, error: reviewError } = await supabase
      .from('post_reviews')
      .insert({
        managed_creator_post_id: managedCreatorPostId,
        reviewer_type: 'admin' as const,
        reviewer_id: user.id,
        status: status as ReviewStatus,
        feedback: feedback?.trim() || null,
      })
      .select('id, status, feedback, created_at')
      .single();

    if (reviewError) {
      captureDbError(reviewError, 'insert_post_review', { userId: user.id });
      return Response.json({ error: 'Failed to submit review' }, { status: 500 });
    }

    const mc = mcp.managed_creators as any;
    const post = mcp.posts as any;
    const job = mc?.jobs as any;

    // Defer notify() and Slack fan-out until after the response is sent.
    after(async () => {
      if (mc?.linked_user_id) {
        await notifyOnVideoReview(supabase, {
          reviewStatus: status as ReviewStatus,
          managedCreatorPostId,
          linkedUserId: mc.linked_user_id,
          brandOrganizationId: mc.brand_organization_id ?? null,
          postUrl: post?.post_url ?? null,
          feedback: feedback?.trim() || null,
          reviewerType: 'admin',
        });
      }

      if (post?.post_url && post?.platform) {
        try {
          await notifyPostReviewed({
            post: { post_url: post.post_url, platform: post.platform },
            creatorName: mc?.name || 'Unknown',
            creatorSlackUserId: mc?.slack_user_id || undefined,
            reviewStatus: status as ReviewStatus,
            feedback: feedback?.trim(),
            reviewerName: userData.email || user.id,
            jobSlackChannelId: job?.slack_channel_id || undefined,
          });
        } catch (err) {
          captureFireAndForget('video_review_slack_notification')(err);
        }
      }
    });

    return Response.json({
      success: true,
      review,
    });
  } catch (error) {
    captureDbError(error, 'admin_video_review_submit', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

