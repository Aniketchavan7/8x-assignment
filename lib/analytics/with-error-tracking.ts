import { NextRequest, NextResponse } from 'next/server';
import { isNextRouterError } from 'next/dist/client/components/is-next-router-error';
import * as Sentry from '@sentry/nextjs';
import { getPostHogClient } from './posthog-server';
import { getUser } from '@/lib/modules/auth/queries';
import {
  shouldTrackErrors as shouldTrackErrorsUtil,
  shouldShowLogs,
} from '@/lib/utils/env-detection';

/**
 * Extract error information from an error object.
 */
function extractErrorInfo(error: unknown): {
  message: string;
  stack: string | null;
  name: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || null,
      name: error.name,
    };
  }

  return {
    message: String(error || 'Unknown error'),
    stack: null,
    name: 'Error',
  };
}

/**
 * Capture a server error to PostHog.
 */
async function captureServerError(
  error: unknown,
  context: {
    url: string;
    method: string;
    userId?: string;
    additionalMetadata?: Record<string, unknown>;
  }
) {
  if (!shouldTrackErrorsUtil()) {
    return;
  }

  try {
    const client = getPostHogClient();
    if (!client) {
      return;
    }

    const errorInfo = extractErrorInfo(error);

    await client.capture({
      distinctId: context.userId || 'anonymous',
      event: 'server_error',
      properties: {
        error_message: errorInfo.message,
        error_stack: errorInfo.stack,
        error_name: errorInfo.name,
        request_url: context.url,
        request_method: context.method,
        timestamp: new Date().toISOString(),
        ...context.additionalMetadata,
      },
    });
  } catch (err) {
    // Silently fail - don't break the app if error tracking fails
    if (shouldShowLogs()) {
      console.warn('Failed to capture server error to PostHog:', err);
    }
  }
}

/**
 * Type for Next.js route handler functions.
 * Supports both Request and NextRequest for compatibility.
 * Updated for Next.js 15 which requires params to be a Promise.
 */
type RouteHandler = (
  request: NextRequest | Request,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response> | NextResponse | Response;

/**
 * Wrapper function for Next.js API route handlers that automatically tracks errors.
 *
 * Usage:
 * ```ts
 * export const GET = withErrorTracking(async (request: NextRequest) => {
 *   // Your route handler code
 *   return NextResponse.json({ data: 'success' });
 * });
 * ```
 *
 * The wrapper will:
 * - Catch any errors thrown in the handler
 * - Send error events to PostHog (only in production/staging)
 * - Re-throw the error so Vercel logs it
 *
 * @param handler - The route handler function to wrap
 * @param options - Optional configuration
 * @returns Wrapped handler function
 */
export function withErrorTracking(
  handler: RouteHandler,
  options?: {
    /**
     * Function to extract user ID from the request.
     * If not provided, will attempt to get user ID using getUser().
     * Set to null to disable user ID extraction.
     */
    getUserId?:
      | ((request: NextRequest | Request) => Promise<string | undefined> | string | undefined)
      | null;

    /**
     * Additional metadata to include with error events.
     */
    getMetadata?: (
      request: NextRequest | Request,
      error: unknown
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  }
): (
  request: NextRequest | Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response> | NextResponse | Response {
  return async (
    request: NextRequest | Request,
    context: { params: Promise<Record<string, string>> }
  ) => {
    try {
      const response = await handler(request, context);
      return response;
    } catch (error) {
      // Don't log Next.js navigation signals (redirect, notFound) as errors
      if (isNextRouterError(error)) {
        throw error;
      }

      // Extract user ID - use provided function, or default to getUser(), or skip if null
      let userId: string | undefined;
      if (options?.getUserId === null) {
        userId = undefined;
      } else if (options?.getUserId) {
        userId = await Promise.resolve(options.getUserId(request));
      } else {
        // Default: try to get user ID using getUser()
        try {
          const user = await getUser();
          userId = user?.id;
        } catch {
          // Silently fail if getUser() fails
          userId = undefined;
        }
      }

      // Get additional metadata if provided
      const additionalMetadata = options?.getMetadata
        ? await Promise.resolve(options.getMetadata(request, error))
        : undefined;

      // Capture error to Sentry
      try { Sentry.captureException(error); } catch {}

      // Capture error to PostHog
      // Extract URL and method - both Request and NextRequest have these properties
      const url = (request as Request).url;
      const method = (request as Request).method;

      await captureServerError(error, {
        url,
        method,
        userId,
        additionalMetadata,
      });

      // Re-throw the error so Vercel logs it
      throw error;
    }
  };
}

/**
 * Wrapper for edge runtime route handlers.
 *
 * Usage:
 * ```ts
 * export const runtime = 'edge';
 * export const GET = withErrorTrackingEdge(async (request: NextRequest) => {
 *   // Your edge handler code
 *   return NextResponse.json({ data: 'success' });
 * });
 * ```
 */
export function withErrorTrackingEdge(
  handler: RouteHandler,
  options?: {
    getUserId?:
      | ((request: NextRequest | Request) => Promise<string | undefined> | string | undefined)
      | null;
    getMetadata?: (
      request: NextRequest | Request,
      error: unknown
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  }
): (
  request: NextRequest | Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse | Response> | NextResponse | Response {
  return async (
    request: NextRequest | Request,
    context: { params: Promise<Record<string, string>> }
  ) => {
    try {
      const response = await handler(request, context);
      return response;
    } catch (error) {
      // Don't log Next.js navigation signals (redirect, notFound) as errors
      if (isNextRouterError(error)) {
        throw error;
      }

      // Extract user ID - use provided function, or default to getUser(), or skip if null
      let userId: string | undefined;
      if (options?.getUserId === null) {
        userId = undefined;
      } else if (options?.getUserId) {
        userId = await Promise.resolve(options.getUserId(request));
      } else {
        // Default: try to get user ID using getUser()
        try {
          const user = await getUser();
          userId = user?.id;
        } catch {
          // Silently fail if getUser() fails
          userId = undefined;
        }
      }

      // Get additional metadata if provided
      const additionalMetadata = options?.getMetadata
        ? await Promise.resolve(options.getMetadata(request, error))
        : undefined;

      // Capture error to Sentry
      try { Sentry.captureException(error); } catch {}

      // Capture error to PostHog
      // Extract URL and method - both Request and NextRequest have these properties
      const url = (request as Request).url;
      const method = (request as Request).method;

      await captureServerError(error, {
        url,
        method,
        userId,
        additionalMetadata,
      });

      // Re-throw the error so Vercel logs it
      throw error;
    }
  };
}
