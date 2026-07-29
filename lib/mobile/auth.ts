/**
 * Mobile authentication utilities. Verifies Supabase JWTs from mobile clients
 * and maps them to `users` table entries.
 */

import { createServiceRoleClient } from '@/lib/db/supabase';
import type { User } from '@/lib/db/types';
import { generateShareCode } from '@/lib/utils/share-code';

/**
 * Verify a mobile request's Supabase JWT and return the corresponding User.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify token with Supabase Auth (`auth.getUser(token)`)
 * 3. Look up or auto-provision user in the `users` table
 *
 * Returns `null` when the request cannot be authenticated.
 */
export async function getMobileUser(request: Request): Promise<User | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    if (!token) return null;

    const supabase = createServiceRoleClient();

    // Verify the JWT with Supabase Auth — this also refreshes if needed
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('[mobile/auth] Token verification failed:', authError?.message);
      return null;
    }

    // ---- Existing user → return directly --------------------------------
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (existingUser) return existingUser;

    // ---- First-time mobile user → auto-provision -------------------------
    const shareCode = generateShareCode();

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: authUser.id, // Supabase auth UUID (as TEXT)
        email: authUser.email || '',
        password_hash: '', // No password stored — Supabase Auth manages it
        account_type: 'creator' as const,
        is_verified: !!authUser.email_confirmed_at,
        is_active: true,
        share_code: shareCode,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[mobile/auth] Failed to provision user:', insertError);
      return null;
    }

    // Register identity mapping so requesting_user_id() resolves correctly in RLS
    await supabase.from('user_identities').upsert({
      internal_user_id: authUser.id,
      provider: 'supabase',
      provider_id: authUser.id,
    }, { onConflict: 'provider,provider_id' });

    console.log('[mobile/auth] Provisioned new mobile user:', authUser.id);
    return newUser;
  } catch (error) {
    console.error('[mobile/auth] Unexpected error:', error);
    return null;
  }
}

/**
 * Look up the creator profile for a mobile user.
 * Returns `null` when the user hasn't created a profile yet.
 */
export async function getMobileCreatorProfile(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[mobile/auth] Failed to fetch creator profile:', error);
    return null;
  }
  return data;
}
