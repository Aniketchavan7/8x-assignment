/**
 * Slack notifications for user activity events
 * All notifications go to SLACK_CHANNEL_ID_USERS
 */
import { sendSlackMessage, getUsersChannel } from './client';
import { sanitizeSlackText } from '@/lib/utils/sanitize-slack';

// ============================================================================
// Onboarding Notifications
// ============================================================================

/**
 * Notify when a new user completes onboarding
 * Sends a simple one-line message to avoid cluttering the channel
 */
export async function notifyUserOnboarded(params: {
  name?: string;
  accountType?: 'creator' | 'brand_member';
  creatorType?: string;
  country?: string;
}): Promise<boolean> {
  const { name, accountType, creatorType, country } = params;
  const channelId = getUsersChannel();

  if (!channelId) {
    console.log('[Slack] Users channel not configured');
    return false;
  }

  // Build a simple one-line message
  const parts: string[] = [];

  if (name) parts.push(sanitizeSlackText(name));
  if (accountType) parts.push(accountType === 'brand_member' ? 'Brand' : 'Creator');
  if (creatorType) parts.push(sanitizeSlackText(creatorType));
  if (country) parts.push(sanitizeSlackText(country));

  const details = parts.length > 0 ? parts.join(' · ') : 'New user';

  return sendSlackMessage({
    channelId,
    text: `🎉 ${details}`,
  });
}

// ============================================================================
// Account Deletion Notifications
// ============================================================================

/**
 * Notify when a user deletes their account
 * Sends a simple one-line message matching the onboarding style
 */
export async function notifyUserDeleted(params: {
  name?: string;
  email?: string;
  accountType?: 'creator' | 'brand_member' | string | null;
}): Promise<boolean> {
  const { name, email, accountType } = params;
  const channelId = getUsersChannel();

  if (!channelId) {
    console.log('[Slack] Users channel not configured');
    return false;
  }

  // Build a simple one-line message
  const parts: string[] = [];

  if (name) parts.push(sanitizeSlackText(name));
  else if (email) parts.push(sanitizeSlackText(email));
  if (accountType) parts.push(accountType === 'brand_member' ? 'Brand' : 'Creator');

  const details = parts.length > 0 ? parts.join(' · ') : 'A user';

  return sendSlackMessage({
    channelId,
    text: `👋 ${details} deleted their account`,
  });
}

// ============================================================================
// Video Upload Notifications
// ============================================================================

/**
 * Notify when a user uploads an intro video
 * Simple one-line message with video link
 */
export async function notifyIntroVideoUploaded(params: {
  userName?: string;
  videoUrl?: string;
}): Promise<boolean> {
  const { userName, videoUrl } = params;
  const channelId = getUsersChannel();

  if (!channelId) {
    console.log('[Slack] Users channel not configured');
    return false;
  }

  const displayName = userName ? sanitizeSlackText(userName) : 'A creator';
  const videoLink = videoUrl ? `\n<${videoUrl}|View video>` : '';

  return sendSlackMessage({
    channelId,
    text: `🎥 ${displayName} uploaded intro video${videoLink}`,
  });
}

/**
 * Notify when a user uploads an application video
 * Simple one-line message with job context and video link
 */
export async function notifyApplicationVideoUploaded(params: {
  userName?: string;
  jobTitle?: string;
  brandName?: string;
  videoUrl?: string;
}): Promise<boolean> {
  const { userName, jobTitle, brandName, videoUrl } = params;
  const channelId = getUsersChannel();

  if (!channelId) {
    console.log('[Slack] Users channel not configured');
    return false;
  }

  const parts: string[] = [];
  if (userName) parts.push(sanitizeSlackText(userName));
  if (jobTitle) parts.push(sanitizeSlackText(jobTitle));
  if (brandName) parts.push(sanitizeSlackText(brandName));

  const details = parts.length > 0 ? parts.join(' · ') : 'New application video';
  const videoLink = videoUrl ? `\n<${videoUrl}|View video>` : '';

  return sendSlackMessage({
    channelId,
    text: `📹 ${details}${videoLink}`,
  });
}

// ============================================================================
// Feedback Notifications
// ============================================================================

/**
 * Notify when a user submits feedback
 * Shows full feedback message (no truncation)
 */
export async function notifyFeedbackReceived(params: {
  userName?: string;
  accountType?: 'creator' | 'brand_member' | string | null;
  message: string;
}): Promise<boolean> {
  const { userName, accountType, message } = params;
  const channelId = getUsersChannel();

  if (!channelId) {
    console.log('[Slack] Users channel not configured');
    return false;
  }

  const userParts: string[] = [];
  if (userName) userParts.push(sanitizeSlackText(userName));
  if (accountType) userParts.push(accountType === 'brand_member' ? 'Brand' : 'Creator');

  const userInfo = userParts.length > 0 ? userParts.join(' · ') : 'Anonymous';

  return sendSlackMessage({
    channelId,
    text: `💬 *${userInfo}*\n"${sanitizeSlackText(message)}"`,
  });
}

