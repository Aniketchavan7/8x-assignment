/**
 * Slack notifications for cron jobs and development events
 * All notifications go to SLACK_CHANNEL_ID_DEVELOPMENT
 *
 * Design: Simple, clean messages with emojis. Avoid heavy markdown formatting.
 */
import { sendSlackMessage, getDevChannel, getSlackClient } from './client';
import { sanitizeSlackText } from '@/lib/utils/sanitize-slack';

// ============================================================================
// Cron Job Notifications
// ============================================================================

/**
 * Notify when a cron job completes with summary
 * Clean summary with key stats
 */
export async function notifyCronComplete(params: {
  jobName: string;
  accountsProcessed: number;
  totalNewPosts: number;
  failedAccounts: number;
  duration: number;
}): Promise<boolean> {
  const { jobName, accountsProcessed, totalNewPosts, failedAccounts, duration } = params;
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  const emoji = failedAccounts > 0 ? '⚠️' : '✅';
  const durationSec = Math.round(duration / 1000);

  // Build a clean one-liner summary
  const parts = [`${accountsProcessed} accounts`, `${totalNewPosts} new posts`, `${durationSec}s`];

  if (failedAccounts > 0) {
    parts.push(`${failedAccounts} failed`);
  }

  return sendSlackMessage({
    channelId,
    text: `${emoji} ${jobName} complete: ${parts.join(' • ')}`,
  });
}

// ============================================================================
// Timeout Monitoring Notifications
// ============================================================================

/**
 * Critical warning when cron job is approaching timeout
 * Sent at configurable threshold (default: 4 minutes for 5-minute jobs)
 */
export async function notifyCronTimeoutWarning(params: {
  jobName: string;
  elapsedSeconds: number;
  remainingSeconds: number;
}): Promise<boolean> {
  const { jobName, elapsedSeconds, remainingSeconds } = params;
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const remainingMin = Math.floor(remainingSeconds / 60);

  return sendSlackMessage({
    channelId,
    text: `⚠️ ${jobName} timeout warning: ${elapsedMin}m ${elapsedSeconds % 60}s elapsed, ${remainingMin}m ${remainingSeconds % 60}s remaining`,
  });
}

/**
 * Critical alert when cron job is shutting down due to approaching timeout
 * Indicates graceful shutdown was triggered to prevent hard timeout
 */
export async function notifyCronShutdown(params: {
  jobName: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  reason: string;
  accountsProcessed?: number;
  accountsSkipped?: number;
  skippedUsernames?: string[];
}): Promise<boolean> {
  const {
    jobName,
    elapsedSeconds,
    remainingSeconds,
    reason,
    accountsProcessed,
    accountsSkipped,
    skippedUsernames,
  } = params;
  const client = getSlackClient();
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const remainingMin = Math.floor(remainingSeconds / 60);

  const accountsText =
    accountsProcessed !== undefined && accountsSkipped !== undefined
      ? ` (${accountsProcessed} processed, ${accountsSkipped} skipped)`
      : '';

  // Send main message
  const mainText = `🚨 ${jobName} shutdown: ${elapsedMin}m ${elapsedSeconds % 60}s elapsed, ${remainingMin}m ${remainingSeconds % 60}s remaining - ${reason}${accountsText}`;

  // If we have skipped usernames and a client, post with thread reply
  if (skippedUsernames && skippedUsernames.length > 0 && client) {
    try {
      const mainResult = await client.chat.postMessage({
        channel: channelId,
        text: mainText,
      });

      if (mainResult.ok && mainResult.ts) {
        // Post full list in thread
        const usernameList = skippedUsernames.map((u) => `• @${sanitizeSlackText(u)}`).join('\n');
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: mainResult.ts,
          text: `Skipped accounts (will retry next run):\n${usernameList}`,
        });
      }
      return true;
    } catch (error) {
      console.error('[Slack] Error sending shutdown notification with thread:', error);
      return false;
    }
  }

  // Fallback to simple message
  return sendSlackMessage({
    channelId,
    text: mainText,
  });
}

// ============================================================================
// Consecutive Failure Alerting
// ============================================================================

/**
 * Alert threshold for consecutive sync failures
 * When an account hits this many failures in a row, we send an alert
 * Alerts continue for every failure at or above this threshold
 * NOTE: Aligned with maxConsecutiveFailures in lib/config/sync.ts
 */
export const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 5;

/**
 * Notify admin when an account has hit the consecutive failure threshold
 * Includes account details and link to sync health dashboard
 */
export async function notifyConsecutiveFailures(params: {
  username: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  accountId: string;
  consecutiveFailures: number;
  latestError: string;
}): Promise<boolean> {
  const { username, platform, accountId, consecutiveFailures, latestError } = params;
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  const platformEmoji = platform === 'tiktok' ? ':tiktok:' : platform === 'youtube' ? ':youtube:' : ':insta:';

  // Truncate error if too long
  const errorSummary =
    latestError.length > 100 ? latestError.substring(0, 100) + '...' : latestError;

  const text = [
    `🚨 *Consecutive Sync Failures Alert*`,
    `${platformEmoji} @${sanitizeSlackText(username)} has failed ${consecutiveFailures} times in a row`,
    `Error: ${sanitizeSlackText(errorSummary)}`,
    `View: /admin/sync-health (account: ${accountId.slice(0, 8)}...)`,
  ].join('\n');

  return sendSlackMessage({
    channelId,
    text,
  });
}

// ============================================================================
// Systemic Failure Alerting
// ============================================================================

/**
 * Alert when a sync cron run has a high overall failure rate (systemic outage).
 * Called when >= 80% of accounts in a run failed with the same error.
 */
export async function notifySystemicSyncFailure(params: {
  platform: 'tiktok' | 'instagram' | 'youtube';
  failedCount: number;
  totalCount: number;
  commonError: string;
}): Promise<void> {
  const { platform, failedCount, totalCount, commonError } = params;
  const channelId = getDevChannel();
  if (!channelId) return;

  const failureRate = Math.round((failedCount / totalCount) * 100);
  const message =
    `🚨 Systemic ${platform} sync failure: ${failedCount}/${totalCount} accounts failed (${failureRate}%). ` +
    `Error: ${sanitizeSlackText(commonError.slice(0, 200))}`;

  await sendSlackMessage({ channelId, text: message });
}

/**
 * Notify when the stale-post cron actually marks posts deleted, so ops has
 * visibility into an otherwise silent state change.
 */
export async function notifyStalePostsDeleted(params: {
  total: number;
  byPlatform: Record<string, number>;
}): Promise<void> {
  const { total, byPlatform } = params;
  const channelId = getDevChannel();
  if (!channelId) return;

  const breakdown = Object.entries(byPlatform)
    .map(([p, n]) => `${p}: ${n}`)
    .join(', ');
  const text = `🗑️ Stale posts marked deleted: ${total} (${breakdown})`;

  await sendSlackMessage({ channelId, text });
}
