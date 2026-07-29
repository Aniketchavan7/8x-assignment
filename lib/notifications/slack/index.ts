/**
 * Slack Notification System
 *
 * Centralized Slack notifications organized by channel/purpose:
 *
 * Development Channel (SLACK_CHANNEL_ID_DEVELOPMENT):
 * - Consecutive failure alerts (3+ sync failures in a row)
 * - Critical error alerts
 *
 * Users Channel (SLACK_CHANNEL_ID_USERS):
 * - User onboarding
 * - Video uploads (intro, application)
 * - Feedback submissions
 *
 * Note: Most cron job notifications were removed to reduce noise
 * (syncs now run every 5 minutes). Only consecutive failure alerts remain.
 *
 * @example
 * ```typescript
 * import { notifyUserOnboarded, notifyConsecutiveFailures } from '@/lib/notifications/slack';
 *
 * await notifyUserOnboarded({ userId, email, name });
 * await notifyConsecutiveFailures({ username, platform, consecutiveFailures, latestError });
 * ```
 */

// Core client and types
export { sendSlackMessage } from './client';
export type { SlackBlock, SlackMrkdwnField } from './client';

// Cron/Development notifications
export { notifyConsecutiveFailures, notifySystemicSyncFailure, notifyStalePostsDeleted, CONSECUTIVE_FAILURE_ALERT_THRESHOLD } from './cron';

// User activity notifications
export {
  notifyUserOnboarded,
  notifyIntroVideoUploaded,
  notifyApplicationVideoUploaded,
  notifyFeedbackReceived,
} from './users';

// Storage quota notifications
export { notifyStorageQuota, notifyStorageHealthy } from './storage';

// Performance report notifications

// Payout notifications
export { notifyPayoutTriggered } from './payouts';

