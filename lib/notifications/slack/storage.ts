/**
 * Slack notifications for storage quota monitoring
 * All notifications go to SLACK_CHANNEL_ID_DEVELOPMENT
 */

import { sendSlackMessage, getDevChannel, type SlackBlock, type SlackMrkdwnField } from './client';
import type { QuotaStatus } from '@/lib/storage/quota';
import { formatBytes, ALERT_THRESHOLDS } from '@/lib/storage/quota';

// ============================================================================
// Emoji & Color Mapping
// ============================================================================

const SEVERITY_CONFIG = {
  warning: {
    emoji: '⚠️',
    color: '#F39C12', // Orange
    label: 'Warning',
  },
  urgent: {
    emoji: '❌',
    color: '#E74C3C', // Red
    label: 'Urgent',
  },
  critical: {
    emoji: '🚨',
    color: '#FF0000', // Bright Red
    label: 'CRITICAL',
  },
} as const;

// ============================================================================
// Notification Functions
// ============================================================================

/**
 * Send storage quota alert to Slack
 * Only sends if alert level is warning or higher
 */
export async function notifyStorageQuota(status: QuotaStatus): Promise<boolean> {
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  // Only send if there's an alert
  if (status.alertLevel === 'none') {
    console.log('[Slack] Storage usage within safe limits, no alert needed');
    return false;
  }

  const config = SEVERITY_CONFIG[status.alertLevel];
  const emoji = config.emoji;
  const usedFormatted = formatBytes(status.usedBytes);
  const limitFormatted = formatBytes(status.limitBytes);
  const remainingFormatted = formatBytes(status.remainingBytes);

  // Build message blocks
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} Storage Quota ${config.label}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Supabase storage is at *${status.usedPercentage.toFixed(1)}%* capacity`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Used:*\n${usedFormatted}`,
        },
        {
          type: 'mrkdwn',
          text: `*Limit (${status.tier}):*\n${limitFormatted}`,
        },
        {
          type: 'mrkdwn',
          text: `*Remaining:*\n${remainingFormatted}`,
        },
        {
          type: 'mrkdwn',
          text: `*Threshold:*\n${ALERT_THRESHOLDS[status.alertLevel]}%`,
        },
      ],
    },
  ];

  // Add bucket breakdown if available
  if (status.buckets && status.buckets.length > 0) {
    const bucketFields: SlackMrkdwnField[] = status.buckets
      .slice(0, 5) // Top 5 buckets
      .map((bucket) => ({
        type: 'mrkdwn' as const,
        text: `*${bucket.bucket_id}:*\n${formatBytes(bucket.bytes)} (${bucket.percentage.toFixed(1)}%)`,
      }));

    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Buckets:*',
        },
      },
      {
        type: 'section',
        fields: bucketFields,
      }
    );
  }

  // Add timestamp context
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Checked at: ${new Date(status.calculatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`,
      },
    ],
  });

  // Fallback text for notifications
  const fallbackText = `${emoji} Storage Quota ${config.label}: ${status.usedPercentage.toFixed(1)}% used (${usedFormatted} / ${limitFormatted})`;

  return sendSlackMessage({
    channelId,
    text: fallbackText,
    blocks,
  });
}

/**
 * Send summary notification (used when no alert triggered)
 * Simple one-liner for daily status
 */
export async function notifyStorageHealthy(status: QuotaStatus): Promise<boolean> {
  const channelId = getDevChannel();

  if (!channelId) {
    console.log('[Slack] Development channel not configured');
    return false;
  }

  const usedFormatted = formatBytes(status.usedBytes);
  const limitFormatted = formatBytes(status.limitBytes);

  return sendSlackMessage({
    channelId,
    text: `✅ Storage check: ${status.usedPercentage.toFixed(1)}% used (${usedFormatted} / ${limitFormatted})`,
  });
}
