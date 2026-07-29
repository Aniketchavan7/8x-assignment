export const runtime = 'nodejs';

import { requireCronSecret } from '@/lib/cron/auth';
import { notifyNewPostsForReview } from '@/lib/notifications/new-post-review-notifier';

/**
 * POST /api/webhooks/new-managed-post
 *
 * Triggers Slack notifications for recently created managed_creator_posts.
 * Called by Supabase database webhook on INSERT to managed_creator_posts,
 * or can be called manually / from cron jobs.
 *
 * Protected by cron secret to prevent unauthorized calls.
 */
export async function POST(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  try {
    const notified = await notifyNewPostsForReview();
    return Response.json({ success: true, notified });
  } catch (error) {
    console.error('[NewManagedPost Webhook] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
