import { createClient } from '@/lib/supabase/client';

/**
 * Create a Supabase client for browser/client-side operations.
 * Uses Supabase Auth cookie-based sessions, enabling RLS policies to work correctly.
 *
 * Uses the publishable key which is safe to expose in client-side code.
 * Use this for direct uploads to Supabase Storage from the browser to bypass
 * Vercel's 4.5MB serverless function limit.
 */
export function createBrowserSupabaseClient() {
  return createClient();
}

/**
 * Hook-compatible function to get an authenticated Supabase client for browser use.
 * With Supabase Auth, the browser client handles sessions via cookies automatically.
 */
export function useAuthenticatedSupabaseClient() {
  return createClient();
}
