import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { sanitizeSearchFilter } from '@/lib/utils';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';
import type { Database } from '@/types/supabase';

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
function getCountryName(code: string): string {
  try {
    return countryDisplayNames.of(code) || code;
  } catch {
    return code;
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ManagedCreatorStatusFilter = string;

export type ManagedCreatorListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  status: string | null;
  tiktok_username: string | null;
  instagram_username: string | null;
  youtube_username: string | null;
  collected_tiktok_url: string | null;
  collected_instagram_url: string | null;
  tiktok_performance: number | null;
  instagram_performance: number | null;
  base_pay: number | null;
  payment: string | null;
  total_paid: number | null;
  pending_payout: number | null;
  payment_outstanding: number | null;
  payment_method: string | null;
  payout_frequency: string | null;
  last_payment_date: string | null;
  onboarding_call_complete: boolean | null;
  handles_complete: boolean | null;
  videos_complete: boolean | null;
  is_active: boolean | null;
  sourced: string | null;
  notes: string | null;
  brand_organization_id: string | null;
  brand_name: string | null;
  linked_creator_profile_id: string | null;
  linked_user_id: string | null;
  job_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  onboarding_started_at: string | null;
  onboarded_at: string | null;
  onboarding_call_completed_at: string | null;
  read_about_company_completed_at: string | null;
  base_course_status: string | null;
  tiktok_handle_completed_at: string | null;
  instagram_handle_completed_at: string | null;
  warmup_day_1_completed_at: string | null;
  warmup_day_2_completed_at: string | null;
  warmup_day_3_completed_at: string | null;
  warmup_day_4_completed_at: string | null;
  first_post_completed_at: string | null;
  contract_accepted_at: string | null;
  accepted_at: string | null;
  status_changed_at: string | null;
  job_title: string | null;
  job_cpm: number | null;
  job_country: string | null;
  country: string | null;
  video_urls: string[] | null;
  advance_balance_cents: number;
  slack_user_id: string | null;
};

export type ManagedCreatorSummaryItem = Pick<
  ManagedCreatorListItem,
  'country' | 'status' | 'payment_outstanding' | 'videos_complete' | 'handles_complete' | 'first_post_completed_at'
>;

export type ManagedCreatorsApiResponse = {
  data: ManagedCreatorListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ManagedCreatorsSummaryApiResponse = {
  data: ManagedCreatorSummaryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * Fetches all managed creators across all brands with pagination (admin-only).
 * Requires admin account_type to access.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 100)
 * - status: Filter by status (active, inactive, churned)
 * - status: Filter by pipeline status
 * - brand_id: Filter by brand organization ID
 * - search: Search by name, email, or social handles
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const { searchParams } = url;

    // Handle available options request
    const availableBrandsOnly = searchParams.get('available_brands') === 'true';
    if (availableBrandsOnly) {
      const { data: brands, error: brandsError } = await supabase
        .from('brand_organizations')
        .select('id, organization_name')
        .order('organization_name');

      if (brandsError) {
        console.error('Error fetching available brands:', brandsError);
        return Response.json({ error: 'Failed to fetch available brands' }, { status: 500 });
      }

      return Response.json({ brands: brands || [] });
    }

    const availableCountriesOnly = searchParams.get('available_countries') === 'true';
    if (availableCountriesOnly) {
      const { data: rows, error: countriesError } = await supabase.rpc('get_managed_creator_countries');

      if (countriesError) {
        console.error('Error fetching available countries:', countriesError);
        return Response.json({ error: 'Failed to fetch available countries' }, { status: 500 });
      }

      // Normalize ISO codes ("BR") to full names ("Brazil") and deduplicate
      const unique = [...new Set(
        (rows || []).map((r) => getCountryName(r.country)).filter(Boolean)
      )].sort();
      return Response.json({ countries: unique });
    }

    const view = searchParams.get('view');

    // Aggregate status counts for filter popover. Cheap GROUP BY query so
    // counts stay accurate even when the row list is filtered to a subset.
    if (view === 'status_counts') {
      const brandId = searchParams.get('brand_id');
      const countryParam = searchParams.get('country');
      const jobId = searchParams.get('job_id');
      const search = searchParams.get('search');
      const sanitizedSearch = search ? sanitizeSearchFilter(search) : null;
      const countryName = countryParam ? getCountryName(countryParam) : null;

      const { data: rows, error: countsError } = await supabase.rpc('get_managed_creator_status_counts', {
        p_brand_id: brandId || undefined,
        p_country_code: countryParam || undefined,
        p_country_name: countryName || undefined,
        p_job_id: jobId || undefined,
        p_search: sanitizedSearch || undefined,
      });

      if (countsError) {
        console.error('Error fetching managed creator status counts:', countsError);
        return Response.json({ error: 'Failed to fetch status counts' }, { status: 500 });
      }

      const counts: Record<string, number> = {};
      let total = 0;
      for (const row of rows || []) {
        const n = Number(row.count) || 0;
        counts[row.status] = n;
        total += n;
      }

      return Response.json(
        { counts, total },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // Lightweight name list for dropdowns (e.g. video reviews creator filter)
    if (view === 'names') {
      const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '500', 10)));
      const brandId = searchParams.get('brand_id');

      let query = supabase
        .from('managed_creators')
        .select('id, name, brand_organization_id')
        .order('name');

      if (brandId) query = query.eq('brand_organization_id', brandId);

      const { data: names, error: namesError } = await query.limit(limit);

      if (namesError) {
        console.error('Error fetching managed creator names:', namesError);
        return Response.json({ error: 'Failed to fetch managed creator names' }, { status: 500 });
      }

      return Response.json(
        { data: names || [] },
        { headers: { 'Cache-Control': 'private, max-age=300' } }
      );
    }

    // Performance view: aggregated post metrics per managed creator
    if (view === 'performance') {
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10)));
      const statusParam = searchParams.get('status');
      const statuses = statusParam ? statusParam.split(',').filter(Boolean) : null;
      const brandId = searchParams.get('brand_id');
      const country = searchParams.get('country');
      const search = searchParams.get('search');
      const sanitizedSearch = search ? sanitizeSearchFilter(search) : null;
      const offset = (page - 1) * limit;

      const { data, error: rpcError } = await supabase.rpc('get_managed_creator_metrics', {
        p_brand_id: brandId || undefined,
        p_statuses: statuses && statuses.length > 0 ? statuses : undefined,
        p_search: sanitizedSearch || undefined,
        p_country: country || undefined,
        p_limit: limit,
        p_offset: offset,
      });

      if (rpcError) {
        console.error('Error fetching managed creator metrics:', rpcError);
        return Response.json({ error: 'Failed to fetch managed creator metrics' }, { status: 500 });
      }

      const results = data ?? [];
      const total = Number(results[0]?.total_count ?? 0);
      const items = results.map((row) => ({
        id: row.managed_creator_id,
        name: row.name,
        location: row.location,
        status: row.status,
        brand_organization_id: row.brand_organization_id,
        brand_name: row.brand_name,
        linked_creator_profile_id: row.linked_creator_profile_id,
        linked_user_id: row.linked_user_id,
        job_id: row.job_id,
        country: row.country,
        base_pay: row.base_pay != null ? Number(row.base_pay) : null,
        overall_avg_views: Number(row.overall_avg_views || 0),
        overall_post_count: Number(row.overall_post_count || 0),
        last_posted_at: row.last_posted_at,
        tiktok_avg_views: row.tiktok_avg_views != null ? Number(row.tiktok_avg_views) : null,
        tiktok_post_count: row.tiktok_post_count != null ? Number(row.tiktok_post_count) : null,
        tiktok_connected: row.tiktok_connected,
        instagram_avg_views: row.instagram_avg_views != null ? Number(row.instagram_avg_views) : null,
        instagram_post_count: row.instagram_post_count != null ? Number(row.instagram_post_count) : null,
        instagram_connected: row.instagram_connected,
        youtube_avg_views: row.youtube_avg_views != null ? Number(row.youtube_avg_views) : null,
        youtube_post_count: row.youtube_post_count != null ? Number(row.youtube_post_count) : null,
        youtube_connected: row.youtube_connected,
        spark_code_count: Number(row.spark_code_count || 0),
        outstanding_cents: Number(row.outstanding_cents || 0),
      }));

      return Response.json(
        { data: items, total, page, limit, totalPages: Math.ceil(total / limit) },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // Parse pagination and filter parameters
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    // Bounded for safety, but high enough that real brand sizes don't truncate.
    // Largest brand today is ~12k managed_creators; 200k is plenty of headroom.
    const limit = Math.max(1, Math.min(200000, parseInt(searchParams.get('limit') || '100', 10)));
    const offset = (page - 1) * limit;

    const status = searchParams.get('status');
    const statusIn = searchParams.get('status_in');
    const statusInList = statusIn
      ? statusIn.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const brandId = searchParams.get('brand_id');
    const jobId = searchParams.get('job_id');
    const search = searchParams.get('search');
    const countryParam = searchParams.get('country');
    const summary = searchParams.get('summary') === 'true';

    // PostgREST silently caps results at max_rows (default 1000).
    // When the requested range exceeds that, fetch in sequential batches.
    const POSTGREST_MAX_ROWS = 10000;

    // Summary mode: return only the fields needed for dashboard aggregation
    if (summary) {
      let countQuery = supabase.from('managed_creators').select('*', { count: 'exact', head: true });
      let dataQuery = supabase.from('managed_creators').select('country, status, payment_outstanding, videos_complete, handles_complete, first_post_completed_at');

      if (statusInList && statusInList.length > 0) {
        countQuery = countQuery.in('status', statusInList);
        dataQuery = dataQuery.in('status', statusInList);
      } else if (status) {
        countQuery = countQuery.eq('status', status as ManagedCreatorStatusFilter);
        dataQuery = dataQuery.eq('status', status as ManagedCreatorStatusFilter);
      }
      if (brandId) {
        countQuery = countQuery.eq('brand_organization_id', brandId);
        dataQuery = dataQuery.eq('brand_organization_id', brandId);
      }
      if (jobId) {
        countQuery = countQuery.eq('job_id', jobId);
        dataQuery = dataQuery.eq('job_id', jobId);
      }
      if (search) {
        const sanitized = sanitizeSearchFilter(search);
        const orFilter = `name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,tiktok_username.ilike.%${sanitized}%,instagram_username.ilike.%${sanitized}%,youtube_username.ilike.%${sanitized}%`;
        countQuery = countQuery.or(orFilter);
        dataQuery = dataQuery.or(orFilter);
      }

      const summaryLimit = Math.min(limit, POSTGREST_MAX_ROWS);
      const [countResult, dataResult] = await Promise.all([
        countQuery,
        dataQuery.order('created_at', { ascending: false }).range(offset, offset + summaryLimit - 1),
      ]);

      if (countResult.error || dataResult.error) {
        console.error('Error fetching summary:', countResult.error || dataResult.error);
        return Response.json({ error: 'Failed to fetch managed creators summary' }, { status: 500 });
      }

      const total = countResult.count || 0;
      return Response.json(
        {
          data: dataResult.data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        }
      );
    }

    // Server-side country filtering: find which of this brand's linked users match
    // the requested country, then filter managed_creators by linked_user_id OR mc.country.
    // Scoped to brand's linked users so the ID list stays bounded (not global user pool).
    let countryUserIds: string[] | null = null;
    if (countryParam && brandId) {
      const countryName = getCountryName(countryParam); // "BR" → "Brazil"

      // Get linked user IDs for this brand
      const { data: linkedRows, error: linkedError } = await supabase
        .from('managed_creators')
        .select('linked_user_id')
        .eq('brand_organization_id', brandId)
        .not('linked_user_id', 'is', null);

      if (linkedError) {
        console.error('Error fetching linked user IDs for country filter:', linkedError);
      }

      const linkedIds = (linkedRows || []).map((r) => r.linked_user_id as string);

      if (linkedIds.length > 0) {
        // Batch-check which linked users have the matching country
        const BATCH_SIZE = 300;
        const batches = [];
        for (let i = 0; i < linkedIds.length; i += BATCH_SIZE) {
          batches.push(
            supabase.from('users').select('id').eq('country', countryName).in('id', linkedIds.slice(i, i + BATCH_SIZE))
          );
        }
        const results = await Promise.all(batches);
        countryUserIds = [];
        for (const { data, error } of results) {
          if (error) console.error('Error fetching user countries batch:', error);
          for (const u of data || []) countryUserIds.push(u.id);
        }
      } else {
        countryUserIds = [];
      }
    }

    const MANAGED_CREATOR_SELECT = `
      id, name, email, phone, location, status,
      tiktok_username, instagram_username, youtube_username,
      collected_tiktok_url, collected_instagram_url,
      tiktok_performance, instagram_performance,
      base_pay, payment, total_paid, pending_payout, payment_outstanding,
      payment_method, payout_frequency, last_payment_date,
      onboarding_call_complete, handles_complete, videos_complete, is_active,
      sourced, notes, brand_organization_id, linked_creator_profile_id, linked_user_id,
      job_id, created_at, updated_at,
      onboarding_started_at, onboarded_at, onboarding_call_completed_at,
      read_about_company_completed_at, base_course_status,
      tiktok_handle_completed_at, instagram_handle_completed_at,
      warmup_day_1_completed_at, warmup_day_2_completed_at,
      warmup_day_3_completed_at, warmup_day_4_completed_at,
      first_post_completed_at, contract_accepted_at,
      accepted_at, status_changed_at, country, video_urls,
      advance_balance_cents, slack_user_id,
      brand_organizations ( organization_name ),
      jobs ( job_title, cpm_rate, target_country )
    `;

    // Build count query
    let countQuery = supabase.from('managed_creators').select('*', { count: 'exact', head: true });

    // Build data query with brand + job join
    let dataQuery = supabase.from('managed_creators').select(MANAGED_CREATOR_SELECT);

    // Apply filters to both queries
    if (statusInList && statusInList.length > 0) {
      countQuery = countQuery.in('status', statusInList);
      dataQuery = dataQuery.in('status', statusInList);
    } else if (status) {
      countQuery = countQuery.eq('status', status as ManagedCreatorStatusFilter);
      dataQuery = dataQuery.eq('status', status as ManagedCreatorStatusFilter);
    }
    if (brandId) {
      countQuery = countQuery.eq('brand_organization_id', brandId);
      dataQuery = dataQuery.eq('brand_organization_id', brandId);
    }
    if (jobId) {
      countQuery = countQuery.eq('job_id', jobId);
      dataQuery = dataQuery.eq('job_id', jobId);
    }
    if (search) {
      const sanitized = sanitizeSearchFilter(search);
      const orFilter = `name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,tiktok_username.ilike.%${sanitized}%,instagram_username.ilike.%${sanitized}%,youtube_username.ilike.%${sanitized}%`;
      countQuery = countQuery.or(orFilter);
      dataQuery = dataQuery.or(orFilter);
    }
    // Apply server-side country filter.
    // When <=500 matching user IDs, use .in() for exact filtering.
    // When >500, the .in() URL would exceed PostgREST limits (~32KB), so filter by
    // mc.country only server-side and post-filter using userCountryMap after transform.
    const MAX_IN_IDS = 500;
    if (countryParam && countryUserIds) {
      const sanitizedCode = sanitizeSearchFilter(countryParam);
      if (countryUserIds.length > 0 && countryUserIds.length <= MAX_IN_IDS) {
        const idList = countryUserIds.join(',');
        countQuery = countQuery.or(`linked_user_id.in.(${idList}),country.eq.${sanitizedCode}`);
        dataQuery = dataQuery.or(`linked_user_id.in.(${idList}),country.eq.${sanitizedCode}`);
      } else {
        // Either no linked users with that country name, or too many for .in() URL —
        // filter by mc.country (ISO code) only. Portal-sourced creators without
        // mc.country set (only users.country) will be missed in this path.
        countQuery = countQuery.eq('country', sanitizedCode);
        dataQuery = dataQuery.eq('country', sanitizedCode);
      }
    }

    const countResult = await countQuery;
    if (countResult.error) {
      console.error('Error counting managed creators:', countResult.error);
      return Response.json({ error: 'Failed to count managed creators' }, { status: 500 });
    }

    const total = countResult.count || 0;
    const totalPages = Math.ceil(total / limit);

    // Short-circuit when the requested page is past the end of the result set
    // (or the filter matched nothing). Avoids calling .range(offset, -1) which
    // PostgREST rejects with 416 when offset > fetchEnd-1.
    if (total === 0 || offset >= total) {
      return Response.json(
        { data: [], total, page, limit, totalPages },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // Fetch data in batches of POSTGREST_MAX_ROWS.
    // Cap upper bound by both `limit` (caller-requested) and `total` (actual matches)
    // so we don't loop past the end of the result set.
    const fetchEnd = Math.min(offset + limit, total);
    const firstBatchSize = Math.min(limit, POSTGREST_MAX_ROWS);
    const firstBatchEnd = Math.min(offset + firstBatchSize - 1, fetchEnd - 1);
    const firstBatch = await dataQuery.order('created_at', { ascending: false }).range(offset, firstBatchEnd);
    if (firstBatch.error) {
      console.error('Error fetching managed creators:', firstBatch.error);
      return Response.json({ error: 'Failed to fetch managed creators' }, { status: 500 });
    }

    const creators = [...firstBatch.data];

    // If the first batch was full and there are still rows in range, keep fetching
    if (firstBatch.data.length === POSTGREST_MAX_ROWS && offset + POSTGREST_MAX_ROWS < fetchEnd) {
      for (let batchOffset = offset + POSTGREST_MAX_ROWS; batchOffset < fetchEnd; batchOffset += POSTGREST_MAX_ROWS) {
        const batchEnd = Math.min(batchOffset + POSTGREST_MAX_ROWS - 1, fetchEnd - 1);

        // Supabase query builders are consumed after await — rebuild for each batch
        let batchQuery = supabase.from('managed_creators').select(MANAGED_CREATOR_SELECT);
        if (statusInList && statusInList.length > 0) {
          batchQuery = batchQuery.in('status', statusInList);
        } else if (status) {
          batchQuery = batchQuery.eq('status', status as ManagedCreatorStatusFilter);
        }
        if (brandId) batchQuery = batchQuery.eq('brand_organization_id', brandId);
        if (jobId) batchQuery = batchQuery.eq('job_id', jobId);
        if (search) {
          const sanitized = sanitizeSearchFilter(search);
          batchQuery = batchQuery.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,tiktok_username.ilike.%${sanitized}%,instagram_username.ilike.%${sanitized}%,youtube_username.ilike.%${sanitized}%`);
        }
        if (countryParam && countryUserIds) {
          const sanitizedCode = sanitizeSearchFilter(countryParam);
          if (countryUserIds.length > 0 && countryUserIds.length <= MAX_IN_IDS) {
            const idList = countryUserIds.join(',');
            batchQuery = batchQuery.or(`linked_user_id.in.(${idList}),country.eq.${sanitizedCode}`);
          } else {
            batchQuery = batchQuery.eq('country', sanitizedCode);
          }
        }

        const batchResult = await batchQuery.order('created_at', { ascending: false }).range(batchOffset, batchEnd);
        if (batchResult.error) {
          console.error('Error fetching managed creators batch:', batchResult.error);
          return Response.json({ error: 'Failed to fetch managed creators' }, { status: 500 });
        }

        creators.push(...batchResult.data);
      }
    }

    // Fetch country from users table for all linked creators (canonical source from onboarding)
    const linkedUserIds = (creators || [])
      .filter((c) => c.linked_user_id)
      .map((c) => c.linked_user_id as string);

    const userCountryMap = new Map<string, string>();
    if (linkedUserIds.length > 0) {
      const BATCH_SIZE = 300;
      const batches = [];
      for (let i = 0; i < linkedUserIds.length; i += BATCH_SIZE) {
        batches.push(
          supabase.from('users').select('id, country').in('id', linkedUserIds.slice(i, i + BATCH_SIZE))
        );
      }
      const results = await Promise.all(batches);
      for (const { data: userRows, error: userError } of results) {
        if (userError) {
          console.error('Error fetching user countries batch:', userError);
        }
        for (const u of userRows || []) {
          if (u.country) userCountryMap.set(u.id, u.country);
        }
      }
    }

    // Transform data
    const transformedData: ManagedCreatorListItem[] = (creators || []).map((creator) => {
      const brandOrg = creator.brand_organizations as { organization_name: string } | null;
      const job = creator.jobs as { job_title: string; cpm_rate: number | null; target_country: string | null } | null;
      return {
        id: creator.id,
        name: creator.name,
        email: creator.email,
        phone: creator.phone,
        location: creator.location,
        status: creator.status,
        tiktok_username: creator.tiktok_username,
        instagram_username: creator.instagram_username,
        youtube_username: creator.youtube_username,
        collected_tiktok_url: creator.collected_tiktok_url,
        collected_instagram_url: creator.collected_instagram_url,
        tiktok_performance: creator.tiktok_performance,
        instagram_performance: creator.instagram_performance,
        base_pay: creator.base_pay,
        payment: creator.payment,
        total_paid: creator.total_paid,
        pending_payout: creator.pending_payout,
        payment_outstanding: creator.payment_outstanding,
        payment_method: creator.payment_method,
        payout_frequency: creator.payout_frequency,
        last_payment_date: creator.last_payment_date,
        onboarding_call_complete: creator.onboarding_call_complete,
        handles_complete: creator.handles_complete,
        videos_complete: creator.videos_complete,
        is_active: creator.is_active,
        sourced: creator.sourced,
        notes: creator.notes,
        brand_organization_id: creator.brand_organization_id,
        brand_name: brandOrg?.organization_name || null,
        linked_creator_profile_id: creator.linked_creator_profile_id,
        linked_user_id: creator.linked_user_id,
        job_id: creator.job_id,
        created_at: creator.created_at,
        updated_at: creator.updated_at,
        onboarding_started_at: creator.onboarding_started_at,
        onboarded_at: creator.onboarded_at,
        onboarding_call_completed_at: creator.onboarding_call_completed_at,
        read_about_company_completed_at: creator.read_about_company_completed_at,
        base_course_status: creator.base_course_status,
        tiktok_handle_completed_at: creator.tiktok_handle_completed_at,
        instagram_handle_completed_at: creator.instagram_handle_completed_at,
        warmup_day_1_completed_at: creator.warmup_day_1_completed_at,
        warmup_day_2_completed_at: creator.warmup_day_2_completed_at,
        warmup_day_3_completed_at: creator.warmup_day_3_completed_at,
        warmup_day_4_completed_at: creator.warmup_day_4_completed_at,
        first_post_completed_at: creator.first_post_completed_at,
        contract_accepted_at: creator.contract_accepted_at,
        accepted_at: creator.accepted_at ?? null,
        status_changed_at: creator.status_changed_at ?? null,
        job_title: job?.job_title || null,
        job_cpm: job?.cpm_rate ?? null,
        job_country: job?.target_country || null,
        country: (creator.linked_user_id ? userCountryMap.get(creator.linked_user_id) : null) || creator.country || null,
        video_urls: creator.video_urls,
        advance_balance_cents: creator.advance_balance_cents,
        slack_user_id: creator.slack_user_id || null,
      };
    });

    return Response.json(
      {
        data: transformedData,
        total,
        page,
        limit,
        totalPages,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators',
      method: 'GET',
    });
  }
}

/**
 * PATCH /api/admin/managed-creators
 * Bulk update status for a list of managed creator IDs.
 * Body: { ids: string[], status: ManagedCreatorStatus }
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceRoleClient();
    const { data: userData } = await supabase
      .from('users').select('account_type').eq('id', user.id).single();
    if (userData?.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { ids, status } = body as { ids: unknown; status: unknown };

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      return Response.json({ error: 'ids must be a non-empty array of up to 200 IDs' }, { status: 400 });
    }

    if (!ids.every((id) => typeof id === 'string' && id.length > 0)) {
      return Response.json({ error: 'All ids must be non-empty strings' }, { status: 400 });
    }

    const ALLOWED_STATUSES = [
      MC_STATUS.ACCEPTED,
      MC_STATUS.WARMING_UP,
      MC_STATUS.ACTIVE,
      MC_STATUS.GHOSTED,
      MC_STATUS.UNCLEAR,
    ] as const;
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return Response.json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }

    const { data: updatedRows, error } = await supabase
      .from('managed_creators')
      .update({ status: status as string, updated_at: new Date().toISOString() })
      .in('id', ids as string[])
      .select('id');

    if (error) {
      console.error('[PATCH managed-creators bulk] Failed:', error);
      return Response.json({ error: 'Failed to update creators' }, { status: 500 });
    }

    return Response.json({ success: true, updated: updatedRows?.length ?? 0 });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators',
      method: 'PATCH',
    });
  }
}
