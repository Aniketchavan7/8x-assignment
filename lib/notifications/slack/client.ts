import { WebClient } from '@slack/web-api';
import { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID_DEVELOPMENT, SLACK_CHANNEL_ID_USERS, SLACK_CHANNEL_ID_MESSAGES } from '@/lib/env';
import { SLACK_CHANNELS } from './channels';

/**
 * Slack Web API client singleton
 * Uses bot token authentication for secure API access
 *
 * Required Slack App setup:
 * - Create app at api.slack.com/apps
 * - Add bot token scopes: chat:write, chat:write.public
 * - Install to workspace and get Bot User OAuth Token (xoxb-...)
 * - Get channel IDs from Slack (right-click channel → View channel details → copy ID at bottom)
 *
 * Channel configuration:
 * - SLACK_CHANNEL_ID_DEVELOPMENT: Cron jobs, system events, errors
 * - SLACK_CHANNEL_ID_USERS: User activity (onboarding, uploads, feedback)
 */
let slackClient: WebClient | null = null;

/**
 * Get or create the Slack WebClient instance
 */
export function getSlackClient(): WebClient | null {
  if (!SLACK_BOT_TOKEN) {
    console.log('[Slack] Bot token not configured, skipping notification');
    return null;
  }

  if (!slackClient) {
    slackClient = new WebClient(SLACK_BOT_TOKEN);
  }

  return slackClient;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Slack Block Kit types for rich message formatting
 */
export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
  elements?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
}

/**
 * Markdown field helper type for building block fields
 */
export type SlackMrkdwnField = { type: 'mrkdwn'; text: string };

// ============================================================================
// Channel Getters
// ============================================================================

/**
 * Get the development channel ID (cron jobs, system events)
 */
export function getDevChannel(): string | undefined {
  return SLACK_CHANNEL_ID_DEVELOPMENT;
}

/**
 * Get the users channel ID (user activity)
 */
export function getUsersChannel(): string | undefined {
  return SLACK_CHANNEL_ID_USERS;
}

/**
 * Get the messages channel ID (creator message replies)
 */
export function getMessagesChannel(): string | undefined {
  return SLACK_CHANNEL_ID_MESSAGES || SLACK_CHANNELS.MESSAGES;
}

// ============================================================================
// Base Message Sender
// ============================================================================

/**
 * Send a message to a Slack channel using the Web API
 * Returns true if successful, false if failed or Slack not configured
 *
 * @param text - Fallback text (shown in notifications and accessibility)
 * @param blocks - Optional Block Kit blocks for rich formatting
 * @param channelId - Channel to send to (required)
 */
export async function sendSlackMessage(params: {
  text: string;
  blocks?: SlackBlock[];
  channelId: string;
}): Promise<boolean> {
  const client = getSlackClient();
  if (!client) {
    return false;
  }

  if (!params.channelId) {
    console.log('[Slack] Channel ID not provided, skipping notification');
    return false;
  }

  try {
    const result = await client.chat.postMessage({
      channel: params.channelId,
      text: params.text,
      blocks: params.blocks,
    });

    if (result.ok) {
      console.log('[Slack] Message sent successfully, ts:', result.ts);
      return true;
    } else {
      console.error('[Slack] API returned error:', result.error);
      return false;
    }
  } catch (error) {
    console.error('[Slack] Error sending message:', error);
    return false;
  }
}

// ============================================================================
// Critical Error Alerting
// ============================================================================

export interface CriticalErrorAlertParams {
  message: string;
  stack?: string | null;
  digest?: string | null;
  url?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  operation?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Send a critical error alert to Slack.
 * Used for production errors that require immediate attention.
 *
 * Sends to the development channel by default (or a dedicated critical channel if configured).
 */
export async function sendCriticalErrorAlert(params: CriticalErrorAlertParams): Promise<boolean> {
  const channelId = getDevChannel();
  if (!channelId) {
    console.log('[Slack] No channel configured for critical alerts');
    return false;
  }

  const timestamp = new Date().toISOString();
  const environment = process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'unknown';

  // Build the alert message
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🚨 Critical Error in ${environment.toUpperCase()}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:*\n\`\`\`${params.message}\`\`\``,
      },
    },
  ];

  // Add context fields
  const contextFields: SlackMrkdwnField[] = [];

  if (params.operation) {
    contextFields.push({ type: 'mrkdwn', text: `*Operation:* ${params.operation}` });
  }
  if (params.category) {
    contextFields.push({ type: 'mrkdwn', text: `*Category:* ${params.category}` });
  }
  if (params.url) {
    contextFields.push({ type: 'mrkdwn', text: `*URL:* ${params.url}` });
  }
  if (params.userId) {
    contextFields.push({ type: 'mrkdwn', text: `*User:* ${params.userId}` });
  }

  if (contextFields.length > 0) {
    blocks.push({
      type: 'section',
      fields: contextFields,
    });
  }

  // Add stack trace if present (truncated for Slack)
  if (params.stack) {
    const truncatedStack = params.stack.length > 500 ? params.stack.substring(0, 500) + '...' : params.stack;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Stack:*\n\`\`\`${truncatedStack}\`\`\``,
      },
    });
  }

  // Add timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Occurred at ${timestamp}${params.digest ? ` | Digest: ${params.digest}` : ''}`,
      },
    ],
  });

  const fallbackText = `🚨 Critical Error in ${environment}: ${params.message}`;

  return sendSlackMessage({
    text: fallbackText,
    blocks,
    channelId,
  });
}
