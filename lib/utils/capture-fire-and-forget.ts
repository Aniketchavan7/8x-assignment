import * as Sentry from '@sentry/nextjs';

/**
 * Drop-in replacement for `.catch(console.error)` that also sends to Sentry.
 *
 * Use for fire-and-forget operations (Slack notifications, emails, system messages)
 * where the error shouldn't crash the request but should be visible in monitoring.
 *
 * @example
 * // Before:
 * notifySlack(msg).catch(console.error);
 * notifySlack(msg).catch((err) => console.error('[Slack] Failed:', err));
 *
 * // After:
 * notifySlack(msg).catch(captureFireAndForget('slack_notification'));
 */
export function captureFireAndForget(operation: string) {
  return (error: unknown) => {
    console.error(`[${operation}]`, error);
    try {
      Sentry.captureException(error, {
        level: 'warning',
        tags: {
          fire_and_forget: 'true',
          operation,
        },
      });
    } catch {
      // Sentry itself failed — never let monitoring break the app
    }
  };
}
