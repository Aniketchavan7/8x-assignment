export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureDbError } from '@/lib/analytics/capture-error';
import { sanitizeSearchFilter } from '@/lib/utils';

export interface CreatorPostPaymentData {
  id: string;
  managed_creator_id: string;
  post_id: string;
  creator_name: string;
  creator_profile_id: string | null;
  managed_creator_status: string;
  brand_name: string;
  job_title: string | null;
  platform: string;
  post_url: string;
  thumbnail_url: string | null;
  posted_at: string | null;
  latest_views: number;
  base_pay_cents: number;
  bonus_cents: number;
  total_owed_cents: number;
  total_paid_cents: number;
  outstanding_cents: number;
  payment_status: string;
  review_status: string;
  offplatform_method: string | null;
  ad_code: string | null;
  is_sponsored: boolean | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
}

export interface CreatorPostPaymentGroupedData {
  id: string;
  managed_creator_id: string;
  job_id: string | null;
  creator_name: string;
  creator_profile_id: string | null;
  managed_creator_status: string;
  brand_name: string;
  job_title: string | null;
  post_count: number;
  ad_code_count: number;
  base_pay_cents: number;
  bonus_cents: number;
  total_owed_cents: number;
  total_paid_cents: number;
  outstanding_cents: number;
  payment_status: string;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
}

export interface CreatorPostPaymentsResponse {
  rows: CreatorPostPaymentData[] | CreatorPostPaymentGroupedData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  grouped?: boolean;
}

/**
 * GET /api/admin/creator-post-payments
 *
 * Returns paginated managed creator post payments with filtering.
 * Admin-only endpoint.
 *
 * Query params:
 *   page         - Page number (default 1)
 *   limit        - Items per page (default 50, max 100)
 *   status       - Filter: all | unpaid | partially_paid | paid (comma-separated)
 *   brand_id     - Filter by brand organization ID
 *   job_id       - Filter by job ID
 *   creator_id   - Filter by managed_creator_id
 *   search       - Search creator name
 *   hide_settled - Exclude rows where payment_status = 'paid'
 *   group_by     - 'creator_job' to aggregate by creator+job
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const status = searchParams.get('status') || 'all';
    const brandId = searchParams.get('brand_id') || null;
    const jobId = searchParams.get('job_id') || null;
    const creatorId = searchParams.get('creator_id') || null;
    const search = searchParams.get('search') || null;
    const hideSettled = searchParams.get('hide_settled') === 'true';
    const reviewStatus = searchParams.get('review_status') || null;
    const groupBy = searchParams.get('group_by') || null;

    const offset = (page - 1) * limit;

    // Helper: apply all filters to a query builder
    function applyFilters<T extends { eq: Function; ilike: Function; in: Function; neq: Function }>(q: T): T {
      if (status !== 'all') {
        const statuses = status.split(',').filter(Boolean);
        if (statuses.length === 1) {
          q = q.eq('payment_status', statuses[0]) as T;
        } else if (statuses.length > 1) {
          q = q.in('payment_status', statuses) as T;
        }
      }
      if (hideSettled) {
        q = q.neq('payment_status', 'paid').neq('payment_status', 'excluded') as T;
      }
      if (brandId) {
        q = q.eq('managed_creators.brand_organization_id', brandId) as T;
      }
      if (jobId) {
        q = q.eq('managed_creators.job_id', jobId) as T;
      }
      if (creatorId) {
        q = q.eq('managed_creator_id', creatorId) as T;
      }
      if (search) {
        const sanitized = sanitizeSearchFilter(search);
        q = q.ilike('managed_creators.name', `%${sanitized}%`) as T;
      }
      if (reviewStatus) {
        const validReviewStatuses = ['pending', 'approved', 'needs_changes', 'rejected'];
        const statuses = reviewStatus.split(',').filter((s) => validReviewStatuses.includes(s));
        if (statuses.length === 1) {
          q = q.eq('review_status', statuses[0]) as T;
        } else if (statuses.length > 1) {
          q = q.in('review_status', statuses) as T;
        }
      }
      return q;
    }

    // ─── Grouped mode: aggregate by creator+job (server-side) ───
    if (groupBy === 'creator_job') {
      const rawStatus = status !== 'all' ? status.split(',').filter(Boolean) : undefined;
      const statusArr = rawStatus?.length ? rawStatus : undefined;
      const reviewArr = reviewStatus
        ? reviewStatus.split(',').filter((s) => ['pending', 'approved', 'needs_changes', 'rejected'].includes(s))
        : null;

      const { data: rpcRows, error: rpcError } = await supabase.rpc('get_grouped_post_payments', {
        p_status: statusArr,
        p_brand_id: brandId || undefined,
        p_job_id: jobId || undefined,
        p_search: search ? sanitizeSearchFilter(search) : undefined,
        p_hide_settled: hideSettled,
        p_review_status: reviewArr && reviewArr.length > 0 ? reviewArr : undefined,
      });

      if (rpcError) {
        captureDbError(rpcError, 'fetch_grouped_creator_post_payments', { userId: user.id });
        return Response.json({ error: 'Failed to fetch grouped data' }, { status: 500 });
      }

      const groupedRows: CreatorPostPaymentGroupedData[] = (rpcRows || []).map((row) => ({
        id: `${row.managed_creator_id}::${row.job_id || 'none'}`,
        managed_creator_id: row.managed_creator_id,
        job_id: row.job_id,
        creator_name: row.creator_name || 'Unknown',
        creator_profile_id: row.creator_profile_id,
        managed_creator_status: row.managed_creator_status || 'active',
        brand_name: row.brand_name || 'Unknown',
        job_title: row.job_title,
        stripe_account_id: row.stripe_account_id,
        stripe_payouts_enabled: row.stripe_payouts_enabled || false,
        post_count: Number(row.post_count),
        ad_code_count: Number(row.ad_code_count),
        base_pay_cents: Number(row.base_pay_cents),
        bonus_cents: Number(row.bonus_cents),
        total_owed_cents: Number(row.total_owed_cents),
        total_paid_cents: Number(row.total_paid_cents),
        outstanding_cents: Number(row.outstanding_cents),
        payment_status: row.payment_status,
      }));

      const total = groupedRows.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedRows = groupedRows.slice(offset, offset + limit);

      return Response.json({
        rows: paginatedRows,
        total,
        page,
        limit,
        totalPages,
        grouped: true,
      });
    }

    // ─── Flat mode (default) ───
    const selectFields = `
      id,
      managed_creator_id,
      post_id,
      base_pay_cents,
      bonus_cents,
      total_owed_cents,
      total_paid_cents,
      payment_status,
      review_status,
      offplatform_method,
      managed_creators!inner (
        id,
        name,
        status,
        linked_creator_profile_id,
        job_id,
        brand_organization_id,
        creator_profiles!linked_creator_profile_id (
          stripe_account_id,
          stripe_payouts_enabled
        ),
        brand_organizations!inner (
          id,
          organization_name
        ),
        jobs (
          job_title
        )
      ),
      posts!inner (
        id,
        platform,
        post_url,
        thumbnail_url,
        posted_at,
        latest_views,
        ad_code,
        is_sponsored
      )
    `;

    // Count query
    const countQuery = applyFilters(
      supabase
        .from('managed_creator_posts')
        .select('id, managed_creators!inner(id, name, job_id, brand_organization_id, brand_organizations!inner(id)), posts!inner(id)', {
          count: 'exact',
          head: true,
        })
    );

    // Data query
    const dataQuery = applyFilters(
      supabase
        .from('managed_creator_posts')
        .select(selectFields)
        .order('created_at', { ascending: false })
    ).range(offset, offset + limit - 1);

    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

    if (countResult.error) {
      captureDbError(countResult.error, 'count_creator_post_payments', {
        userId: user.id,
      });
      return Response.json({ error: 'Failed to count post payments' }, { status: 500 });
    }

    const total = countResult.count || 0;
    const totalPages = Math.ceil(total / limit);

    if (dataResult.error) {
      captureDbError(dataResult.error, 'fetch_creator_post_payments', {
        userId: user.id,
      });
      return Response.json({ error: 'Failed to fetch post payments' }, { status: 500 });
    }

    const rows: CreatorPostPaymentData[] = (dataResult.data || []).map((row: any) => {
      const mc = row.managed_creators;
      const post = row.posts;
      const brand = mc?.brand_organizations;
      const job = mc?.jobs;

      return {
        id: row.id,
        managed_creator_id: row.managed_creator_id,
        post_id: row.post_id,
        creator_name: mc?.name || 'Unknown',
        creator_profile_id: mc?.linked_creator_profile_id || null,
        managed_creator_status: mc?.status || 'active',
        brand_name: brand?.organization_name || 'Unknown',
        job_title: job?.job_title || null,
        platform: post?.platform || 'unknown',
        post_url: post?.post_url || '',
        thumbnail_url: post?.thumbnail_url || null,
        posted_at: post?.posted_at || null,
        latest_views: post?.latest_views || 0,
        base_pay_cents: row.base_pay_cents || 0,
        bonus_cents: row.bonus_cents || 0,
        total_owed_cents: row.total_owed_cents || 0,
        total_paid_cents: row.total_paid_cents || 0,
        outstanding_cents: (row.total_owed_cents || 0) - (row.total_paid_cents || 0),
        payment_status: row.payment_status || 'unpaid',
        review_status: row.review_status || 'pending',
        offplatform_method: row.offplatform_method || null,
        ad_code: post?.ad_code || null,
        is_sponsored: post?.is_sponsored ?? null,
        stripe_account_id: mc?.creator_profiles?.stripe_account_id || null,
        stripe_payouts_enabled: mc?.creator_profiles?.stripe_payouts_enabled || false,
      };
    });

    // Sort by posted_at descending (newest first) — can't sort by joined table in PostgREST
    rows.sort((a, b) => {
      const aDate = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const bDate = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return bDate - aDate;
    });

    return Response.json({
      rows,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    captureDbError(error, 'admin_creator_post_payments_route', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
