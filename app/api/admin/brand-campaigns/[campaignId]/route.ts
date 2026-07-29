import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { SCOPED_ROLES, type AdminRole } from '@/lib/modules/admin/roles';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { data: member } = await supabase
      .from('admin_members')
      .select('admin_role')
      .eq('user_id', user.id)
      .maybeSingle();

    const memberRole = (member?.admin_role ?? null) as AdminRole | null;
    if (memberRole !== null && SCOPED_ROLES.includes(memberRole)) {
      return Response.json({ error: 'Forbidden: insufficient admin role' }, { status: 403 });
    }

    const { campaignId } = await params;
    const body = await request.json();

    const updateFields: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'status', 'country', 'platforms', 'budget_cents',
      'target_video_count', 'base_pay_per_video_cents',
      'monthly_cap_cents', 'posting_frequency', 'min_views_threshold',
      'min_views_pay_cents', 'bonus_milestones', 'referral_bonus_cents',
      'start_date', 'end_date', 'notes', 'job_id',
    ] as const;

    for (const field of allowedFields) {
      if (field in body) {
        updateFields[field] = body[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    if ('name' in updateFields && typeof updateFields.name === 'string') {
      updateFields.name = updateFields.name.trim();
      if (!updateFields.name) {
        return Response.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
    }

    if ('notes' in updateFields && typeof updateFields.notes === 'string') {
      updateFields.notes = updateFields.notes.trim() || null;
    }

    const { data, error } = await supabase
      .from('brand_campaigns')
      .update(updateFields)
      .eq('id', campaignId)
      .select('*, jobs(id, job_title)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }
      console.error('Error updating brand campaign:', error);
      return Response.json({ error: 'Failed to update campaign' }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brand-campaigns/[campaignId]',
      method: 'PATCH',
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { data: member } = await supabase
      .from('admin_members')
      .select('admin_role')
      .eq('user_id', user.id)
      .maybeSingle();

    const memberRole = (member?.admin_role ?? null) as AdminRole | null;
    if (memberRole !== null && SCOPED_ROLES.includes(memberRole)) {
      return Response.json({ error: 'Forbidden: insufficient admin role' }, { status: 403 });
    }

    const { campaignId } = await params;

    const { error } = await supabase
      .from('brand_campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) {
      console.error('Error deleting brand campaign:', error);
      return Response.json({ error: 'Failed to delete campaign' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brand-campaigns/[campaignId]',
      method: 'DELETE',
    });
  }
}
