/**
 * Origin validation utilities to prevent API calls from external sources
 * This helps prevent competitors from calling your API directly from scripts/terminals
 */

/**
 * Allowed origins for API requests
 * Only requests from these origins will be accepted
 */
const ALLOWED_ORIGINS = [
  'https://app-staging.example.com',
  'https://www.example.com',
  'https://app.example.com',
  'https://example.com',
  'http://localhost:3000', // Local development
  'http://127.0.0.1:3000', // Local development
];

/**
 * Check if the request origin is allowed
 * @param request - The incoming request
 * @returns true if origin is allowed, false otherwise
 */
export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // Extract hostname from request URL (for same-origin requests)
  let requestHost: string | null = null;
  try {
    const url = new URL(request.url);
    requestHost = url.hostname;
  } catch {
    // Invalid URL
  }

  // Allow same-origin requests from custom domain portals (e.g. ugccreator.business).
  // If the browser's Origin/Referer hostname matches the request's Host, the request
  // came from a page served by this same deployment — safe regardless of domain name.
  // Terminal/curl calls don't send matching Origin headers, so this still blocks scripts.
  if (host) {
    const hostHostname = host.split(':')[0];
    if (origin) {
      try {
        const originHostname = new URL(origin).hostname;
        if (originHostname === hostHostname) return true;
      } catch { /* invalid origin */ }
    }
    if (referer) {
      try {
        const refererHostname = new URL(referer).hostname;
        if (refererHostname === hostHostname) return true;
      } catch { /* invalid referer */ }
    }
  }

  // Check if request is from allowed host (same-origin requests don't send Origin header)
  // But we require either Origin or Referer to prevent terminal/curl calls
  // Terminal calls typically don't send Origin/Referer even if Host matches
  if (host || requestHost) {
    const hostname = host?.split(':')[0] || requestHost;
    if (hostname) {
      const isAllowedHost = ALLOWED_ORIGINS.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return (
            allowedUrl.hostname === hostname || hostname === 'localhost' || hostname === '127.0.0.1'
          );
        } catch {
          return false;
        }
      });

      // Only allow if host matches AND we have Origin or Referer (browser sends these)
      // This prevents terminal/curl calls that might set Host header
      if (isAllowedHost && (origin || referer)) {
        // Browser request with Origin or Referer header
        return true;
      }
    }
  }

  // Check origin header (for cross-origin requests)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.hostname;

      // Check if origin matches allowed origins
      const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.hostname === originHost;
        } catch {
          return false;
        }
      });

      if (isAllowed) {
        return true;
      }
    } catch {
      // Invalid origin URL
    }
  }

  // Check referer header as fallback
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.hostname;

      const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.hostname === refererHost;
        } catch {
          return false;
        }
      });

      if (isAllowed) {
        return true;
      }
    } catch {
      // Invalid referer URL
    }
  }

  return false;
}

/**
 * Validate request origin and return error response if invalid
 * Use this in API routes to block external requests
 *
 * @param request - The incoming request
 * @returns Response with 403 status if origin is invalid, null if valid
 */
export function validateOrigin(request: Request): Response | null {
  // Allow server-to-server calls (cron jobs, webhooks) - they won't have origin
  // Check for special headers that indicate internal calls
  const cronSecret = process.env.CRON_SECRET;
  const isInternalCall =
    request.headers.get('x-vercel-cron') || // Vercel cron jobs
    (cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`); // Cron secret

  if (isInternalCall) {
    return null; // Allow internal calls
  }

  // Allow mobile app requests (Bearer token + X-Client-Platform header).
  // Native apps don't send Origin/Referer headers. Auth is validated
  // downstream by Supabase Auth JWT verification, not here.
  const authHeader = request.headers.get('authorization');
  const clientPlatform = request.headers.get('x-client-platform');
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (
    authHeader?.startsWith('Bearer ') &&
    clientPlatform === 'mobile' &&
    !origin &&
    !referer
  ) {
    return null;
  }

  if (!isOriginAllowed(request)) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Requests must originate from the example.com website',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

