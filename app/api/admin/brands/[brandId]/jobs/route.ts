import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface BrandJobOption {
  id: string;
  job_title: string | null;
  job_type: 'standard' | 'cpm' | null;
  cpm_base_pay: number | null;
  country: string | null;
  cpm_platforms_allowed: string[] | null;
  bonus_milestones: unknown;
  status: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brandId: string }> }
): Promise<Response> {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const { brandId } = await params;

    const { data, error } = await auth.supabase
      .from('jobs')
      .select(
        'id, job_title, job_type, cpm_base_pay, target_country, cpm_platforms_allowed, bonus_milestones, status'
      )
      .eq('brand_organization_id', brandId)
      .in('status', ['open', 'in_progress', 'draft'])
      .order('target_country', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped: BrandJobOption[] = (data ?? []).map((row) => ({
      id: row.id,
      job_title: row.job_title,
      job_type: row.job_type as 'standard' | 'cpm' | null,
      cpm_base_pay: row.cpm_base_pay,
      country: row.target_country,
      cpm_platforms_allowed: row.cpm_platforms_allowed,
      bonus_milestones: row.bonus_milestones,
      status: row.status ?? '',
    }));

    return Response.json({ data: mapped });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brands/[brandId]/jobs',
      method: 'GET',
    });
  }
}
