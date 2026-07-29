import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { ADMIN_ROLES_ORDERED, type AdminRole } from './roles';

export interface AdminContext {
  isAdmin: boolean;
  viewingAsBrandId?: string;
}

/**
 * Role-hierarchy admin gate (pentest v2 A2-2 / A2-3).
 *
 * `verifyAdmin()` only checks `users.account_type = 'admin'` and treats all
 * four admin roles as equivalent. Routes that need tighter gating (e.g. OTP
 * impersonation, payouts) should use this helper with an explicit minimum
 * role.
 *
 * Returns null if the caller is not authenticated, is not an admin, or sits
 * below the minimum role in `ADMIN_ROLES_ORDERED`.
 */
export async function requireAdminRole(minRole: AdminRole) {
  const user = await getUser();
  if (!user) return null;

  const supabase = createServiceRoleClient();

  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();
  if (!userData || userData.account_type !== 'admin') return null;

  const { data: memberRow } = await supabase
    .from('admin_members')
    .select('admin_role')
    .eq('user_id', user.id)
    .single();
  if (!memberRow?.admin_role) return null;

  const callerRole = memberRow.admin_role as AdminRole;
  const callerRank = ADMIN_ROLES_ORDERED.indexOf(callerRole);
  const requiredRank = ADMIN_ROLES_ORDERED.indexOf(minRole);
  if (callerRank === -1 || requiredRank === -1) return null;
  // Lower index = higher privilege.
  if (callerRank > requiredRank) return null;

  return { user, supabase, adminRole: callerRole };
}

export async function verifyAdmin() {
  const user = await getUser();
  if (!user) return null;

  const supabase = createServiceRoleClient();
  const { data: userData, error } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (error || !userData || userData.account_type !== 'admin') return null;
  return { user, supabase };
}

export async function getAdminContext(request: Request): Promise<AdminContext> {
  const viewingAsBrandId = request.headers.get('x-admin-view-as-brand');

  if (viewingAsBrandId) {
    const user = await getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const supabase = createServiceRoleClient();
    const { data: userData } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (!userData || userData.account_type !== 'admin') {
      throw new Error('Forbidden: Admin access required for view-as mode');
    }

    return {
      isAdmin: true,
      viewingAsBrandId: viewingAsBrandId || undefined,
    };
  }

  return { isAdmin: false };
}
