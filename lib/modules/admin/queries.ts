import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import type { AdminRole } from './roles';

/**
 * Get the admin member record for the current user.
 * Uses React.cache() for per-request deduplication — safe to call
 * from both layout.tsx and individual page.tsx without extra DB queries.
 *
 * Returns null if the user has no admin_members row.
 */
export const getAdminMember = cache(async function getAdminMember() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  // Look up internal user by email, then check admin_members
  const serviceSupabase = createServiceRoleClient();
  const { data: userData } = await serviceSupabase
    .from('users')
    .select('id')
    .eq('email', authUser.email)
    .maybeSingle();

  const userId = userData?.id ?? null;
  if (!userId) return null;

  const { data } = await serviceSupabase
    .from('admin_members')
    .select('admin_role, job_ids')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  return {
    userId,
    adminRole: data.admin_role as AdminRole,
    jobIds: (data.job_ids ?? []) as string[],
  };
});

/**
 * Get admin role for a specific user ID (for use in API routes without React.cache).
 * Returns null if the user has no admin_members row.
 */
export async function getAdminRole(userId: string): Promise<AdminRole | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('admin_members')
    .select('admin_role')
    .eq('user_id', userId)
    .single();

  return data ? (data.admin_role as AdminRole) : null;
}
