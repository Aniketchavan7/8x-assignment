import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } from '@/lib/env';

/**
 * Create a Supabase client for server-side operations.
 * This client respects Row Level Security (RLS) policies.
 *
 * Uses the publishable key which is safe to expose and respects RLS policies.
 * For unauthenticated reads where RLS allows public access.
 */
export function createServerSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Create an authenticated Supabase client for server-side operations.
 * Uses Supabase Auth cookie-based sessions, enabling RLS policies to work correctly.
 *
 * @throws {Error} If no Supabase session is available
 *
 * @example
 * ```typescript
 * const supabase = await createAuthenticatedSupabaseClient();
 * const { data } = await supabase.from('users').select('*').eq('id', userId);
 * // RLS policies will automatically filter based on the authenticated user
 * ```
 */
export const createAuthenticatedSupabaseClient = cache(async function createAuthenticatedSupabaseClient() {
  const { createClient: createServerClient } = await import('@/lib/supabase/server');
  const supabase = await createServerClient();

  // Preserve throw-on-no-session contract (existing callers assume authenticated client)
  // 263+ files (330 occurrences) assume the client is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('No Supabase session available. User must be authenticated.');
  }

  return supabase;
});

/**
 * Create a Supabase client with secret key for admin operations.
 * This bypasses RLS and should only be used in server-side API routes
 * or webhooks where elevated permissions are required.
 *
 * Uses the secret key (formerly known as service_role key) which has
 * full database access and bypasses all RLS policies.
 */
export function createServiceRoleClient() {
  if (!SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY environment variable is not set');
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
