/**
 * Admin Slack Notifications
 *
 * Sends plain-text notifications to admin-configured Slack channels for brands.
 * Uses Slack Bot API (chat.postMessage) since we're using channel IDs.
 */

import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { SLACK_CHANNELS } from '@/lib/notifications/slack/channels';
import { sanitizeSlackText } from '@/lib/utils/sanitize-slack';

// ============================================================================
// Helper Functions
// ============================================================================

async function getBrandInfo(brandOrganizationId: string): Promise<{
  brandName: string;
  adminChannelId: string | null;
}> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('brand_organizations')
    .select('admin_slack_channel_id, organization_name')
    .eq('id', brandOrganizationId)
    .single();

  return {
    brandName: (!error && data?.organization_name) || 'Unknown Brand',
    adminChannelId: (!error && data?.admin_slack_channel_id) || null,
  };
}

async function sendToSlackChannel(channelId: string, text: string): Promise<boolean> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    console.log('[AdminSlack] SLACK_BOT_TOKEN not configured, skipping notification');
    return false;
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelId, text }),
    });

    if (!response.ok) {
      console.error(`[AdminSlack] HTTP error: ${response.status} ${response.statusText}`);
      return false;
    }

    const result = await response.json();

    if (result.ok) {
      console.log('[AdminSlack] Notification sent successfully');
      return true;
    } else {
      console.error('[AdminSlack] API error:', result.error);
      return false;
    }
  } catch (error) {
    console.error('[AdminSlack] Failed to send notification:', error);
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface AdminTestVideosSubmittedData {
  creatorName: string;
  videoCount: number;
}

export async function notifyAdminTestVideosSubmitted(
  brandOrganizationId: string,
  data: AdminTestVideosSubmittedData
): Promise<boolean> {
  const { brandName, adminChannelId } = await getBrandInfo(brandOrganizationId);
  const videoStr = data.videoCount === 1 ? '1 video' : `${data.videoCount} videos`;
  const text = `${sanitizeSlackText(brandName)} :movie_camera: ${sanitizeSlackText(data.creatorName)} submitted test videos (${videoStr})`;

  const sent = await sendToSlackChannel(SLACK_CHANNELS.APPLICATIONS, text);

  if (adminChannelId && adminChannelId !== SLACK_CHANNELS.APPLICATIONS) {
    sendToSlackChannel(adminChannelId, text).catch((slackError) => {
      try { Sentry.captureException(slackError, { tags: { type: 'slack_notification_failed' } }); } catch {}
      console.error(slackError);
    });
  }

  return sent;
}

export async function testSlackChannel(
  channelId: string,
  brandName: string
): Promise<{ success: boolean; error?: string }> {
  const text = `${sanitizeSlackText(brandName)} ✅ Admin notifications connected`;

  const success = await sendToSlackChannel(channelId, text);

  if (!success) {
    return {
      success: false,
      error: 'Failed to send message. Ensure the bot is added to this channel.',
    };
  }

  return { success: true };
}

// ============================================================================
// Post Review Notifications
// ============================================================================

export interface AdminNewPostForReviewData {
  managedCreatorPostId: string;
  post: {
    post_url: string;
    caption?: string;
    thumbnail_url?: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
  };
  creatorName: string;
  brandName: string;
  jobTitle?: string;
}

export async function notifyNewPostForReview(
  data: AdminNewPostForReviewData,
  brandOrganizationId?: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com';
  const reviewUrl = `${appUrl}/admin/video-reviews?post=${data.managedCreatorPostId}`;

  const platformEmoji =
    { tiktok: ':tiktok:', instagram: ':instagram:', youtube: ':youtube:' }[data.post.platform] ||
    ':film_frames:';
  const text = `${platformEmoji} New post from *${sanitizeSlackText(data.creatorName)}* — ${sanitizeSlackText(data.brandName)}${data.jobTitle ? ` (${sanitizeSlackText(data.jobTitle)})` : ''} — <${reviewUrl}|Review it →>`;

  const globalChannel = process.env.SLACK_CHANNEL_ID_VIDEO_REVIEWS || SLACK_CHANNELS.VIDEO_REVIEWS;
  await sendToSlackChannel(globalChannel, text).catch((slackError) => {
    try { Sentry.captureException(slackError, { tags: { type: 'slack_notification_failed' } }); } catch {}
    console.error(slackError);
  });

  if (brandOrganizationId) {
    const { adminChannelId: brandChannel } = await getBrandInfo(brandOrganizationId);
    if (brandChannel && brandChannel !== globalChannel) {
      await sendToSlackChannel(brandChannel, text).catch((slackError) => {
        try { Sentry.captureException(slackError, { tags: { type: 'slack_notification_failed' } }); } catch {}
        console.error(slackError);
      });
    }
  }
}

export interface PostReviewNotificationData {
  post: { post_url: string; platform: 'tiktok' | 'instagram' | 'youtube' };
  creatorName: string;
  creatorSlackUserId?: string;
  reviewStatus: 'approved' | 'needs_changes' | 'rejected';
  feedback?: string;
  reviewerName: string;
  jobSlackChannelId?: string;
}

export async function notifyPostReviewed(data: PostReviewNotificationData): Promise<void> {
  if (!data.jobSlackChannelId) return;

  const statusEmoji = {
    approved: '✅ Approved',
    needs_changes: '⚠️ Needs Changes',
    rejected: '❌ Rejected',
  }[data.reviewStatus];
  const mention = data.creatorSlackUserId ? `<@${sanitizeSlackText(data.creatorSlackUserId)}>` : sanitizeSlackText(data.creatorName);

  let text = `${mention} Video reviewed — *${statusEmoji}*\n<${data.post.post_url}|View video>`;

  if (data.feedback) {
    text += `\n> ${sanitizeSlackText(data.feedback).replace(/\n/g, '\n> ')}`;
  }

  await sendToSlackChannel(data.jobSlackChannelId, text).catch((slackError) => {
    try { Sentry.captureException(slackError, { tags: { type: 'slack_notification_failed' } }); } catch {}
    console.error(slackError);
  });
}

// ============================================================================
// Hygiene Check Notifications
// ============================================================================

const HYGIENE_TESTING_CHANNEL = 'C0AN5FFGMC4';

export async function notifyHygieneFailure(data: {
  username: string;
  brandName: string;
  postUrl: string;
  managedCreatorPostId?: string;
  failedChecks: string[];
  checkDetails: Record<string, { pass: boolean; detail: string }>;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com';
  const failedDetails = data.failedChecks
    .map((key) => {
      const check = data.checkDetails[key];
      const label = key.replace(/_/g, ' ');
      return `• *${label}*: ${check?.detail || 'No detail'}`;
    })
    .join('\n');

  const reviewLink = data.managedCreatorPostId
    ? `<${appUrl}/admin/video-reviews?post=${data.managedCreatorPostId}|Review it →>`
    : '';

  const text = `⚠️ Hygiene check failed for *@${sanitizeSlackText(data.username)}* — ${sanitizeSlackText(data.brandName)}\n\nFailed:\n${failedDetails}\n\n<${data.postUrl}|View on TikTok>${reviewLink ? ` — ${reviewLink}` : ''}`;

  await sendToSlackChannel(HYGIENE_TESTING_CHANNEL, text);
}

// ============================================================================
// Disclosure Check Notifications
// ============================================================================

export async function notifyDisclosureMissing(data: {
  username: string;
  brandName: string;
  postUrl: string;
  managedCreatorPostId?: string;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com';
  const reviewLink = data.managedCreatorPostId
    ? `<${appUrl}/admin/video-reviews?post=${data.managedCreatorPostId}|Review it →>`
    : '';

  const text = `⚠️ Missing required ad disclosure for *@${sanitizeSlackText(data.username)}* — ${sanitizeSlackText(data.brandName)}\n\n<${data.postUrl}|View post>${reviewLink ? ` — ${reviewLink}` : ''}`;

  await sendToSlackChannel(HYGIENE_TESTING_CHANNEL, text);
}

// ============================================================================
// Creator Handle Added Notification
// ============================================================================

export interface AdminCreatorHandleAddedData {
  username: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
}

export async function notifyAdminCreatorHandleAdded(
  brandOrganizationId: string,
  data: AdminCreatorHandleAddedData
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data: org, error } = await supabase
    .from('brand_organizations')
    .select('admin_slack_channel_id, organization_name')
    .eq('id', brandOrganizationId)
    .single();

  if (error || !org?.admin_slack_channel_id) return false;

  const channelId = org.admin_slack_channel_id;
  const brandName = org.organization_name || 'Unknown Brand';
  const platformEmoji = data.platform === 'tiktok' ? ':tiktok:' : data.platform === 'youtube' ? ':youtube:' : ':instagram:';

  const text = `${sanitizeSlackText(brandName)} 🔗 ${platformEmoji} @${sanitizeSlackText(data.username)} — added by creator`;
  return sendToSlackChannel(channelId, text);
}

// ============================================================================
// Creator Handle Changed Notification
// ============================================================================

export interface AdminCreatorHandleChangedData {
  creatorName: string;
  platform: 'tiktok' | 'instagram';
  oldUsername: string;
  newUsername: string | null;
}

export async function notifyAdminCreatorHandleChanged(
  brandOrganizationId: string,
  data: AdminCreatorHandleChangedData
): Promise<void> {
  const { brandName, adminChannelId } = await getBrandInfo(brandOrganizationId);
  const platformEmoji = data.platform === 'tiktok' ? ':tiktok:' : ':instagram:';
  const newHandle = data.newUsername ? `@${sanitizeSlackText(data.newUsername)}` : '(cleared)';

  const text = `${sanitizeSlackText(brandName)} ${platformEmoji} Handle change: ${sanitizeSlackText(data.creatorName)} changed from @${sanitizeSlackText(data.oldUsername)} → ${newHandle} — old account tracking frozen, new account needs tracking`;

  const promises: Promise<boolean>[] = [
    sendToSlackChannel(SLACK_CHANNELS.APPLICATIONS, text),
  ];
  if (adminChannelId) {
    promises.push(sendToSlackChannel(adminChannelId, text));
  }
  await Promise.allSettled(promises);
}

// ============================================================================
// Video Screening Notifications
// ============================================================================

export async function notifyScreeningFailed(params: {
  managedCreatorId: string;
  brandName: string;
  videoCount: number;
}): Promise<boolean> {
  const videoStr = params.videoCount === 1 ? '1 video' : `${params.videoCount} videos`;
  const text = `${sanitizeSlackText(params.brandName)} :no_entry: Video screening FAILED for MC ${params.managedCreatorId}. ${videoStr} did not match any reference videos. Needs manual review.`;
  return sendToSlackChannel(SLACK_CHANNELS.APPLICATIONS, text);
}
