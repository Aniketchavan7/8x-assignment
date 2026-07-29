import { NextResponse } from 'next/server';
import { getBrandContext, errorResponse } from '@/lib/modules/context';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cpm/jobs
 * Get CPM jobs for the current brand.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getBrandContext(request);
    if (!ctx.ok) {
      return errorResponse(ctx.error);
    }

    const { brandOrganization, supabase } = ctx;

    // Include pending_funding jobs for brand dashboard
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(
        `
        id,
        job_title,
        job_type,
        status,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        cpm_payout_threshold,
        cpm_platforms_allowed,
        target_country,
        auto_approve_applications,
        brand_organization_id,
        budget_cents,
        budget_spent_cents,
        created_at,
        updated_at
      `
      )
      .eq('brand_organization_id', brandOrganization.id)
      .eq('job_type', 'cpm')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/cpm/jobs] DB Error:', error);
      return NextResponse.json({ error: 'Failed to fetch CPM jobs' }, { status: 500 });
    }

    return NextResponse.json(jobs || []);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/cpm/jobs',
      method: 'GET',
    });
  }
}
