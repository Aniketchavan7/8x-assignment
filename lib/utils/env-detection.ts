/**
 * Environment detection utility.
 *
 * Detects the current environment using existing environment variables:
 * 1. VERCEL_ENV (if on Vercel) - 'development', 'preview', or 'production'
 * 2. NEXT_PUBLIC_SUPABASE_URL contains 'staging' - indicates staging
 * 3. NODE_ENV === 'production' - indicates production
 * 4. Defaults to 'development'
 *
 * This avoids requiring new environment variables.
 */

export type AppEnvironment = 'production' | 'staging' | 'development';

/**
 * Detect the current application environment.
 *
 * Priority:
 * 1. VERCEL_ENV (if on Vercel) - maps 'preview' to 'staging'
 * 2. Check if NEXT_PUBLIC_SUPABASE_URL contains 'staging' - indicates staging
 * 3. NODE_ENV === 'production' - indicates production
 * 4. Defaults to 'development'
 */
export function getAppEnvironment(): AppEnvironment {
  // On Vercel, use VERCEL_ENV
  if (typeof process !== 'undefined' && process.env.VERCEL_ENV) {
    const vercelEnv = process.env.VERCEL_ENV;
    if (vercelEnv === 'production') {
      return 'production';
    }
    if (vercelEnv === 'preview') {
      return 'staging';
    }
    if (vercelEnv === 'development') {
      return 'development';
    }
  }

  // Check if Supabase URL indicates staging
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.toLowerCase();
    if (supabaseUrl.includes('staging')) {
      return 'staging';
    }
  }

  // Check NODE_ENV
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return 'production';
  }

  // Default to development
  return 'development';
}

/**
 * Check if error tracking should be enabled.
 * Only enabled in production and staging environments.
 */
export function shouldTrackErrors(): boolean {
  const env = getAppEnvironment();
  return env === 'production' || env === 'staging';
}

/**
 * Check if we should show debug logs/warnings.
 * Enabled in development and staging (disabled in production).
 */
export function shouldShowLogs(): boolean {
  const env = getAppEnvironment();
  return env === 'development' || env === 'staging';
}

/**
 * Check if we should show debug logs/warnings on the client.
 * Enabled in development and staging (disabled in production).
 */
export function shouldShowClientLogs(): boolean {
  const env = getClientAppEnvironment();
  return env === 'development' || env === 'staging';
}

/**
 * Get the app environment for client-side code.
 * Uses NEXT_PUBLIC_SUPABASE_URL to detect staging, or defaults based on NODE_ENV.
 */
export function getClientAppEnvironment(): AppEnvironment {
  if (typeof window === 'undefined') {
    return 'development';
  }

  // Check if Supabase URL indicates staging
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.toLowerCase() || '';
  if (supabaseUrl.includes('staging')) {
    return 'staging';
  }

  // Check NODE_ENV (available at build time)
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }

  return 'development';
}

/**
 * Check if we're running in production.
 */
export function isProduction(): boolean {
  return getAppEnvironment() === 'production';
}

/**
 * Check if we're running in staging.
 */
export function isStaging(): boolean {
  return getAppEnvironment() === 'staging';
}

/**
 * Check if we're running in development.
 */
export function isDevelopment(): boolean {
  return getAppEnvironment() === 'development';
}

/**
 * Get the app URL (for app.example.com).
 * Uses NEXT_PUBLIC_APP_URL, with fallback to legacy vars (BASE_URL, NEXT_PUBLIC_SITE_URL) as app URL aliases.
 *
 * Step 3 Bridge: BASE_URL and NEXT_PUBLIC_SITE_URL are treated as app URL aliases during transition.
 * This ensures legacy code gets the app URL until fully refactored.
 *
 * @param fallback - Fallback URL if NEXT_PUBLIC_APP_URL is not set
 */
export function getAppUrl(fallback: string = 'http://localhost:3000'): string {
  // Try to import from env.ts (validated)
  try {
    const { NEXT_PUBLIC_APP_URL, BASE_URL } = require('@/lib/env');
    if (NEXT_PUBLIC_APP_URL) {
      return NEXT_PUBLIC_APP_URL;
    }
    // Step 3: Legacy vars act as app URL aliases
    if (BASE_URL) {
      return BASE_URL;
    }
  } catch {
    // If env.ts isn't available (edge cases), fall back to process.env
  }

  // Step 3: Check legacy vars as app URL aliases (BASE_URL, NEXT_PUBLIC_SITE_URL)
  // These are set to app URLs in prod/staging during transition
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    fallback
  );
}

/**
 * Get the marketing URL (for www.example.com).
 * Uses NEXT_PUBLIC_MARKETING_URL only - does NOT fall back to legacy vars.
 *
 * Step 3 Bridge: Legacy vars (BASE_URL, NEXT_PUBLIC_SITE_URL) are app URL aliases,
 * so they should NOT be used for marketing URLs.
 *
 * @param fallback - Fallback URL if NEXT_PUBLIC_MARKETING_URL is not set
 */
export function getMarketingUrl(fallback: string = 'https://www.example.com'): string {
  // Try to import from env.ts (validated)
  try {
    const { NEXT_PUBLIC_MARKETING_URL } = require('@/lib/env');
    if (NEXT_PUBLIC_MARKETING_URL) {
      return NEXT_PUBLIC_MARKETING_URL;
    }
  } catch {
    // If env.ts isn't available (edge cases), fall back to process.env
  }

  // Step 3: Do NOT use BASE_URL or NEXT_PUBLIC_SITE_URL - they're app URL aliases now
  // Only use the explicit marketing URL
  return process.env.NEXT_PUBLIC_MARKETING_URL || fallback;
}

