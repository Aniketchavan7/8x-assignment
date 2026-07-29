import { Database } from '@/types/supabase';

export type AdminRole = Database['public']['Enums']['admin_role'];

export const ADMIN_ROLES_ORDERED: AdminRole[] = [
  'super_admin',
  'senior_account_manager',
  'account_manager',
  'sales_rep',
];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  senior_account_manager: 'Senior Account Manager',
  account_manager: 'Account Manager',
  sales_rep: 'Sales Rep',
};

export const PAYOUTS_ROLES: AdminRole[] = ['super_admin', 'senior_account_manager'];
export const ACCOUNTS_ROLES: AdminRole[] = ['super_admin'];
export const CAMPAIGNS_ROLES: AdminRole[] = ['super_admin', 'senior_account_manager'];
export const SCOPED_ROLES: AdminRole[] = ['account_manager', 'sales_rep'];

export const PAYOUT_RATE_LIMITS: Partial<Record<AdminRole, { maxCentsPerCreatorPerHour: number }>> = {
  super_admin: { maxCentsPerCreatorPerHour: 1_000_000_00 },
  senior_account_manager: { maxCentsPerCreatorPerHour: 100_000_00 },
  account_manager: { maxCentsPerCreatorPerHour: 10_000_00 },
};

export function hasAccess(userRole: AdminRole, requiredRoles: AdminRole[]): boolean {
  return requiredRoles.includes(userRole);
}
