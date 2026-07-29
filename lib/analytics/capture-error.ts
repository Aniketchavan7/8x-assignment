/**
 * Universal error capture utility for PostHog.
 *
 * Can be called from anywhere (server or client) to capture errors with context.
 * Only sends to PostHog in production/staging environments.
 *
 * @example
 * ```typescript
 * import { captureError } from '@/lib/analytics/capture-error';
 *
 * try {
 *   await stripe.checkout.sessions.create(...);
 * } catch (error) {
 *   captureError(error, {
 *     category: 'stripe',
 *     operation: 'create_checkout_session',
 *     userId: user?.id,
 *     metadata: { priceId, customerId }
 *   });
 *   throw error;
 * }
 * ```
 */

import { ErrorCategories, ErrorSeverity } from './events';
import type { ErrorCategory, ErrorSeverityLevel } from './events';
import { getAppEnvironment, getClientAppEnvironment } from '@/lib/utils/env-detection';

export interface CaptureErrorOptions {
  /**
   * Category of the error - helps filter in PostHog.
   * @default 'unknown'
   */
  category?: ErrorCategory;

  /**
   * What operation was being attempted when the error occurred.
   * Examples: 'create_checkout_session', 'fetch_applications', 'sync_tiktok_account'
   */
  operation?: string;

  /**
   * Severity level of the error.
   * - 'error': Something broke (default)
   * - 'warning': Degraded but working
   * - 'info': Notable but not a problem
   * @default 'error'
   */
  severity?: ErrorSeverityLevel;

  /**
   * User ID to associate with the error.
   */
  userId?: string;

  /**
   * Additional context to include with the error.
   * Avoid including sensitive data (passwords, full card numbers, etc.)
   */
  metadata?: Record<string, unknown>;

  /**
   * Request URL if available.
   */
  url?: string;

  /**
   * HTTP method if available.
   */
  method?: string;

  /**
   * Whether to send a Slack alert for this error.
   * Defaults to true for severity='error' in production (server-side only).
   * Set to false to suppress Slack alerts for specific errors.
   */
  sendSlackAlert?: boolean;
}

/**
 * Extract useful information from an error object.
 */
function extractErrorInfo(error: unknown): {
  message: string;
  stack: string | null;
  name: string;
  code?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || null,
      name: error.name,
      // Some errors have a code property (e.g., Stripe errors)
      code: (error as Error & { code?: string }).code,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      stack: null,
      name: 'Error',
    };
  }

  // Handle objects with message property (e.g. Supabase PostgrestError)
  if (error && typeof error === 'object' && 'message' in error) {
    const obj = error as Record<string, unknown>;
    const parts = [String(obj.message || '')];
    if (obj.details) parts.push(`details: ${obj.details}`);
    if (obj.hint) parts.push(`hint: ${obj.hint}`);
    const combined = parts.filter(Boolean).join(' | ');
    return {
      message: combined || `Unknown error (code: ${obj.code || 'none'})`,
      stack: null,
      name: 'Error',
      code: obj.code ? String(obj.code) : undefined,
    };
  }

  return {
    message: String(error || 'Unknown error'),
    stack: null,
    name: 'Error',
  };
}

/**
 * Capture an error to PostHog with structured context.
 *
 * Works on both server and client. Only sends in production/staging.
 * Also logs to console in development for debugging.
 */
export async function captureError(
  error: unknown,
  options: CaptureErrorOptions = {}
): Promise<void> {
  const {
    category = ErrorCategories.UNKNOWN,
    operation,
    severity = ErrorSeverity.ERROR,
    userId,
    metadata = {},
    url,
    method,
    sendSlackAlert,
  } = options;

  const errorInfo = extractErrorInfo(error);
  const timestamp = new Date().toISOString();
  const isServer = typeof window === 'undefined';
  const environment = isServer ? getAppEnvironment() : getClientAppEnvironment();

  // Build the event properties
  const properties: Record<string, unknown> = {
    // Environment for filtering staging vs production
    environment,

    // Error details
    error_message: errorInfo.message,
    error_stack: errorInfo.stack,
    error_name: errorInfo.name,
    error_code: errorInfo.code,

    // Context
    error_category: category,
    error_operation: operation,
    error_severity: severity,
    timestamp,

    // Request context (if available)
    request_url: url,
    request_method: method,

    // Additional metadata
    ...metadata,
  };

  // Always log to console for visibility
  const logPrefix = `[${severity.toUpperCase()}] [${category}]${operation ? ` ${operation}` : ''}:`;
  if (severity === ErrorSeverity.ERROR) {
    console.error(logPrefix, errorInfo.message, { ...metadata, stack: errorInfo.stack });
  } else if (severity === ErrorSeverity.WARNING) {
    console.warn(logPrefix, errorInfo.message, metadata);
  } else {
    console.info(logPrefix, errorInfo.message, metadata);
  }

  // Check if we should send to PostHog
  const shouldTrack = await shouldTrackErrorsAsync();
  if (!shouldTrack) {
    return;
  }

  try {
    if (isServer) {
      // Server-side: use posthog-node
      const { getPostHogClient } = await import('./posthog-server');
      const client = getPostHogClient();

      if (client) {
        client.capture({
          distinctId: userId || 'anonymous',
          event: 'error_captured',
          properties,
        });
      }
    } else {
      // Client-side: use posthog-js
      const posthog = (await import('posthog-js')).default;
      posthog.capture('error_captured', {
        ...properties,
        // Add client-specific context
        user_agent: navigator.userAgent,
        current_url: window.location.href,
      });
    }
  } catch (captureErr) {
    // Silently fail - don't break the app if error tracking fails
    console.warn('Failed to capture error to PostHog:', captureErr);
  }

  // Send Slack alert for critical errors in production (server-side only)
  const isProduction = environment === 'production';
  const shouldSendSlackAlert =
    isServer && isProduction && severity === ErrorSeverity.ERROR && sendSlackAlert !== false;

  if (shouldSendSlackAlert) {
    try {
      const { sendCriticalErrorAlert } = await import('@/lib/notifications/slack/client');
      sendCriticalErrorAlert({
        message: errorInfo.message,
        stack: errorInfo.stack,
        url,
        userId,
        operation,
        category,
        metadata,
      }).catch((slackErr) => {
        console.warn('Failed to send Slack alert:', slackErr);
      });
    } catch (importErr) {
      console.warn('Failed to import Slack client:', importErr);
    }
  }
}

/**
 * Check if error tracking should be enabled (async version for dynamic import).
 */
async function shouldTrackErrorsAsync(): Promise<boolean> {
  try {
    const { shouldTrackErrors } = await import('@/lib/utils/env-detection');
    return shouldTrackErrors();
  } catch {
    // If we can't import, default to not tracking
    return false;
  }
}

/**
 * Convenience function to capture a database error.
 */
export function captureDbError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    ...options,
    category: ErrorCategories.DATABASE,
    operation,
  });
}

/**
 * Convenience function to capture a Stripe error.
 */
export function captureStripeError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    ...options,
    category: ErrorCategories.STRIPE,
    operation,
  });
}

/**
 * Convenience function to capture a TikTok API error.
 * Note: Slack alerts are disabled by default for TikTok errors
 * since syncs run frequently and transient errors are common.
 */
export function captureTikTokError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    sendSlackAlert: false, // Disabled - too noisy with frequent syncs
    ...options,
    category: ErrorCategories.TIKTOK_API,
    operation,
  });
}

/**
 * Convenience function to capture an Instagram API error.
 * Note: Slack alerts are disabled by default for Instagram errors
 * since syncs run frequently and transient errors are common.
 */
export function captureInstagramError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    sendSlackAlert: false, // Disabled - too noisy with frequent syncs
    ...options,
    category: ErrorCategories.INSTAGRAM_API,
    operation,
  });
}

/**
 * Convenience function to capture an authentication error.
 */
export function captureAuthError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    ...options,
    category: ErrorCategories.AUTH,
    operation,
  });
}

/**
 * Convenience function to capture an upload error.
 */
export function captureUploadError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    ...options,
    category: ErrorCategories.UPLOAD,
    operation,
  });
}

/**
 * Convenience function to capture a validation error (usually warning level).
 */
export function captureValidationError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    severity: ErrorSeverity.WARNING,
    ...options,
    category: ErrorCategories.VALIDATION,
    operation,
  });
}

/**
 * Convenience function to capture an external API error (non-TikTok).
 */
export function captureExternalApiError(
  error: unknown,
  operation: string,
  options: Omit<CaptureErrorOptions, 'category' | 'operation'> = {}
): Promise<void> {
  return captureError(error, {
    ...options,
    category: ErrorCategories.EXTERNAL_API,
    operation,
  });
}
