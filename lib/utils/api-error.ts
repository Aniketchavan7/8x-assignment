import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories, ErrorSeverity } from '@/lib/analytics/events';

interface ApiErrorContext {
  route: string;
  method: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Captures an API route error to Sentry and PostHog, then returns a standardized error response.
 *
 * @example
 * ```ts
 * export async function GET(request: NextRequest) {
 *   try {
 *     // ... route logic
 *   } catch (error) {
 *     return handleApiError(error, {
 *       route: '/api/brand/settings',
 *       method: 'GET',
 *       userId: user?.id,
 *     });
 *   }
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  context: ApiErrorContext
): NextResponse<{ error: string }> {
  // Auth errors from createAuthenticatedSupabaseClient() should return 401, not 500.
  // Race condition: getUser() and createAuthenticatedSupabaseClient() create independent
  // Supabase clients. The first can consume the refresh token, causing the second to
  // throw — but the user simply isn't authenticated, not a server error.
  if (
    error instanceof Error &&
    error.message.includes('No Supabase session available')
  ) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  // Log to console
  console.error(`[${context.method} ${context.route}] Error:`, error);

  // Capture to Sentry with context
  Sentry.captureException(error, {
    user: context.userId ? { id: context.userId } : undefined,
    tags: {
      route: context.route,
      method: context.method,
      error_type: 'api_route',
    },
    extra: context.metadata,
  });

  // Capture to PostHog
  captureError(error, {
    category: ErrorCategories.UNKNOWN,
    operation: `api_${context.method.toLowerCase()}_${context.route.replace(/\//g, '_')}`,
    severity: ErrorSeverity.ERROR,
    userId: context.userId,
    metadata: {
      route: context.route,
      method: context.method,
      ...context.metadata,
    },
  });

  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/**
 * Wraps an API route handler with automatic error handling.
 * Catches errors and reports them to Sentry and PostHog.
 *
 * @example
 * ```ts
 * export const GET = withApiErrorHandling(
 *   async (request: NextRequest) => {
 *     // ... route logic
 *     return NextResponse.json({ data });
 *   },
 *   { route: '/api/brand/settings', method: 'GET' }
 * );
 * ```
 */
export function withApiErrorHandling<T extends NextResponse>(
  handler: (request: Request) => Promise<T>,
  options: { route: string; method: string }
) {
  return async (request: Request): Promise<T | NextResponse<{ error: string }>> => {
    try {
      return await handler(request);
    } catch (error) {
      return handleApiError(error, {
        route: options.route,
        method: options.method,
      });
    }
  };
}
