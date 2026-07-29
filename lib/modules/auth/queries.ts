import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';

/**
 * Get the current authenticated user.
 * Returns null if no valid session exists.
 *
 * Flow:
 * 1. Get Supabase Auth user from session cookie
 * 2. Look up users table by email via authenticated client (RLS-enforced)
 * 3. If not found by email (post-email-change), resolve internal ID via
 *    requesting_user_id() RPC and sync the confirmed email to users table
 *
 * RLS policy: requesting_user_id() = id, which resolves the JWT sub to the
 * internal users.id via user_identities. No service role bypass needed.
 *
 * User creation is handled by the handle_new_auth_user DB trigger on
 * auth.users INSERT (fires during signInWithOtp). This function only reads
 * (except for the email sync after a confirmed email change).
 *
 * Uses react.cache() to ensure getUser() is only called once per request.
 */
export const getUser = cache(async function getUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) {
    return null;
  }

  const email = authUser.email;

  // Primary lookup: by email (handles the common case)
  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (userData) {
    return {
      ...userData,
      auth_user_id: authUser.id,
      primary_email: userData.email,
      display_name: userData.email.split('@')[0],
    };
  }

  // Fallback: user confirmed an email change — auth email updated but
  // users.email still has the old value. Resolve via requesting_user_id()
  // (maps JWT sub → internal user ID via user_identities).
  const { data: internalId } = await supabase.rpc('requesting_user_id');

  if (!internalId) {
    return null;
  }

  // Look up by internal ID and sync the confirmed email
  const { data: staleUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', internalId)
    .maybeSingle();

  if (!staleUser) {
    return null;
  }

  // Sync: update users.email to match the confirmed auth email
  const { error: syncError } = await supabase
    .from('users')
    .update({ email })
    .eq('id', internalId);

  if (syncError) {
    console.error('[getUser] Failed to sync confirmed email:', syncError.message);
  }

  return {
    ...staleUser,
    email,
    auth_user_id: authUser.id,
    primary_email: email,
    display_name: email.split('@')[0],
  };
});

