import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { SCOPED_ROLES, type AdminRole } from '@/lib/modules/admin/roles';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
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
      .select('admin_role, job_ids')
      .eq('user_id', user.id)
      .maybeSingle();

    const memberRole = (member?.admin_role ?? null) as AdminRole | null;
    const memberJobIds = (member?.job_ids ?? []) as string[];
    const isScoped = memberRole !== null && SCOPED_ROLES.includes(memberRole);

    const { searchParams } = new URL(request.url);
    const brandOrgId = searchParams.get('brand_organization_id');

    let query = supabase
      .from('brand_campaigns')
      .select('*, brand_organizations(id, organization_name, organization_slug, company_logo), jobs!brand_campaigns_job_id_fkey(id, job_title)')
      .order('created_at', { ascending: false });

    if (brandOrgId) {
      query = query.eq('brand_organization_id', brandOrgId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching brand campaigns:', error);
      return Response.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    const decorated = (data ?? []).map((row) => {
      // Campaigns with no linked job are inaccessible to scoped admins (no scoping to honor),
      // even if the campaign's brand has other jobs the admin can see. The detail modal
      // distinguishes this case in its copy.
      const accessible = !isScoped || (row.job_id != null && memberJobIds.includes(row.job_id));
      if (accessible) {
        return { ...row, accessible: true };
      }
      return {
        ...row,
        budget_cents: null,
        base_pay_per_video_cents: null,
        monthly_cap_cents: null,
        min_views_pay_cents: null,
        referral_bonus_cents: null,
        bonus_milestones: null,
        target_video_count: null,
        min_views_threshold: null,
        notes: null,
        posting_frequency: null,
        accessible: false,
      };
    });

    return Response.json({ data: decorated });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brand-campaigns',
      method: 'GET',
    });
  }
}

export async function POST(request: Request): Promise<Response> {
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

    const body = await request.json();
    const {
      brand_organization_id,
      name,
      status,
      country,
      platforms,
      budget_cents,
      target_video_count,
      base_pay_per_video_cents,
      monthly_cap_cents,
      posting_frequency,
      min_views_threshold,
      min_views_pay_cents,
      bonus_milestones,
      referral_bonus_cents,
      start_date,
      end_date,
      notes,
      job_id,
    } = body;

    if (!brand_organization_id || !name?.trim()) {
      return Response.json({ error: 'brand_organization_id and name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('brand_campaigns')
      .insert({
        brand_organization_id,
        name: name.trim(),
        status: status || 'active',
        country: country || null,
        platforms: platforms || [],
        budget_cents: budget_cents ?? null,
        target_video_count: target_video_count ?? null,
        base_pay_per_video_cents: base_pay_per_video_cents ?? null,
        monthly_cap_cents: monthly_cap_cents ?? null,
        posting_frequency: posting_frequency?.trim() || null,
        min_views_threshold: min_views_threshold ?? null,
        min_views_pay_cents: min_views_pay_cents ?? null,
        bonus_milestones: bonus_milestones ?? null,
        referral_bonus_cents: referral_bonus_cents ?? null,
        start_date: start_date || null,
        end_date: end_date || null,
        notes: notes?.trim() || null,
        job_id: job_id || null,
      })
      .select('*, jobs(id, job_title)')
      .single();

    if (error) {
      console.error('Error creating brand campaign:', error);
      return Response.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brand-campaigns',
      method: 'POST',
    });
  }
}
