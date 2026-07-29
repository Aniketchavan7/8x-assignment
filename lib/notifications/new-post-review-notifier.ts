import { createServiceRoleClient } from '@/lib/db/supabase';
import { notifyNewPostForReview } from '@/lib/notifications/admin-slack';

/**
 * Send Slack notifications for recently created managed_creator_posts that need review.
 *
 * Called after sync crons complete to notify admins about new posts.
 * Queries managed_creator_posts created in the last N minutes with review_status='pending'.
 *
 * @param sinceMinutes - Look back this many minutes for new posts (default: 15)
 */
export async function notifyNewPostsForReview(sinceMinutes = 15): Promise<number> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

  const { data: newPosts, error } = await supabase
    .from('managed_creator_posts')
    .select(
      `
      id,
      review_status,
      created_at,
      managed_creators!inner (
        name,
        brand_organization_id,
        brand_organizations (organization_name),
        jobs (job_title)
      ),
      posts!inner (
        post_url,
        caption,
        thumbnail_url,
        platform
      )
    `
    )
    .eq('review_status', 'pending')
    .gte('created_at', since)
    .is('review_status_updated_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !newPosts || newPosts.length === 0) {
    return 0;
  }

  const promises = newPosts
    .filter((mcp) => {
      const post = mcp.posts as any;
      return post?.post_url && post?.platform;
    })
    .map((mcp) => {
      const mc = mcp.managed_creators as any;
      const post = mcp.posts as any;
      return notifyNewPostForReview(
        {
          managedCreatorPostId: mcp.id,
          post: {
            post_url: post.post_url,
            caption: post.caption || undefined,
            thumbnail_url: post.thumbnail_url || undefined,
            platform: post.platform,
          },
          creatorName: mc?.name || 'Unknown',
          brandName: mc?.brand_organizations?.organization_name || 'Unknown',
          jobTitle: mc?.jobs?.job_title || undefined,
        },
        mc?.brand_organization_id
      );
    });

  const results = await Promise.allSettled(promises);
  const notified = results.filter((r) => r.status === 'fulfilled').length;
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[NewPostReviewNotifier] Failed to notify:', r.reason);
    }
  }

  // Mark notified posts so they won't be picked up on the next cron run.
  // The query filters on review_status_updated_at IS NULL, so setting this
  // prevents duplicate notifications when the lookback window (15min) overlaps
  // with the cron interval (5min).
  if (notified > 0) {
    const notifiedIds = newPosts
      .filter((_, i) => results[i].status === 'fulfilled')
      .map((p) => p.id);
    await supabase
      .from('managed_creator_posts')
      .update({ review_status_updated_at: new Date().toISOString() })
      .in('id', notifiedIds)
      .is('review_status_updated_at', null);
  }

  return notified;
}
