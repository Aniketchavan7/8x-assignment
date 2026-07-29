/**
 * System Alerts
 *
 * Utility for sending critical system alerts to Slack.
 * Used for programmatic alerting from code (e.g., payment failures, system errors).
 *
 * Requires SLACK_ALERTS_WEBHOOK_URL environment variable.
 */

export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export type AlertSeverityLevel = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export interface SystemAlert {
  severity: AlertSeverityLevel;
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

function getSeverityEmoji(severity: AlertSeverityLevel): string {
  switch (severity) {
    case AlertSeverity.CRITICAL:
      return ':rotating_light:';
    case AlertSeverity.WARNING:
      return ':warning:';
    case AlertSeverity.INFO:
    default:
      return ':information_source:';
  }
}

function getSeverityColor(severity: AlertSeverityLevel): string {
  switch (severity) {
    case AlertSeverity.CRITICAL:
      return '#dc2626'; // red-600
    case AlertSeverity.WARNING:
      return '#f59e0b'; // amber-500
    case AlertSeverity.INFO:
    default:
      return '#3b82f6'; // blue-500
  }
}

function formatAlertBlocks(alert: SystemAlert): SlackBlock[] {
  const emoji = getSeverityEmoji(alert.severity);
  const severityLabel = alert.severity.toUpperCase();

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${severityLabel}: ${alert.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: alert.message,
      },
    },
  ];

  // Add context fields if provided
  if (alert.context && Object.keys(alert.context).length > 0) {
    const contextFields = Object.entries(alert.context)
      .slice(0, 10) // Limit to 10 fields
      .map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n\`${JSON.stringify(value)}\``,
      }));

    blocks.push({
      type: 'section',
      fields: contextFields,
    });
  }

  // Add timestamp
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Sent at: ${new Date().toISOString()} | Environment: ${process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'unknown'}`,
      },
    ],
  });

  return blocks;
}

/**
 * Send a critical system alert to Slack.
 *
 * Requires SLACK_ALERTS_WEBHOOK_URL environment variable.
 * If not configured, logs the alert to console instead.
 *
 * @example
 * ```typescript
 * await sendCriticalAlert({
 *   severity: AlertSeverity.CRITICAL,
 *   title: 'Payment Processing Failed',
 *   message: 'Failed to transfer funds to creator account',
 *   context: {
 *     creatorId: 'abc123',
 *     amount: 5000,
 *     error: error.message,
 *   },
 * });
 * ```
 */
export async function sendCriticalAlert(alert: SystemAlert): Promise<boolean> {
  const webhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL;

  // Always log the alert
  const logFn =
    alert.severity === AlertSeverity.CRITICAL
      ? console.error
      : alert.severity === AlertSeverity.WARNING
        ? console.warn
        : console.log;

  logFn(`[SystemAlert] ${alert.severity.toUpperCase()}: ${alert.title}`, {
    message: alert.message,
    context: alert.context,
  });

  // If no webhook configured, just log
  if (!webhookUrl) {
    console.log('[SystemAlert] SLACK_ALERTS_WEBHOOK_URL not configured, alert logged only');
    return false;
  }

  try {
    const blocks = formatAlertBlocks(alert);
    const color = getSeverityColor(alert.severity);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: `${alert.severity.toUpperCase()}: ${alert.title}`,
        attachments: [
          {
            color,
            blocks,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[SystemAlert] Failed to send to Slack: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[SystemAlert] Error sending to Slack:', error);
    return false;
  }
}

/**
 * Send a payment failure alert.
 * Convenience wrapper for payment-related failures.
 */
export async function alertPaymentFailure(data: {
  type: 'transfer' | 'payout' | 'deposit';
  amount: number;
  currency: string;
  userId?: string;
  error: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  return sendCriticalAlert({
    severity: AlertSeverity.CRITICAL,
    title: `${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Failed`,
    message: `A ${data.type} of ${data.amount / 100} ${data.currency.toUpperCase()} failed.`,
    context: {
      type: data.type,
      amount_cents: data.amount,
      currency: data.currency,
      user_id: data.userId,
      error: data.error,
      ...data.metadata,
    },
  });
}

