import { createServiceRoleClient } from '@/lib/db/supabase';

export async function logAdminViewAs(
  adminUserId: string,
  brandId: string,
  action: string,
  metadata?: Record<string, any>
) {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from('admin_audit_log').insert({
      admin_user_id: adminUserId,
      action_type: action,
      target_brand_id: brandId,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

/**
 * Log an admin action for audit purposes.
 * This is a fire-and-forget operation that won't throw on failure.
 */
export async function logAdminAction(
  adminUserId: string,
  actionType: string,
  metadata?: Record<string, any>
) {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from('admin_audit_log').insert({
      admin_user_id: adminUserId,
      action_type: actionType,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
