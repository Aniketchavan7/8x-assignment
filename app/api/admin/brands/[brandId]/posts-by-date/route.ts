import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { handleApiError } from '@/lib/utils/api-error';
import { resolveCountryCode } from '@/lib/utils/countries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSTGREST_MAX_ROWS = 10000;

async function fetchAllBatched<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + POSTGREST_MAX_ROWS - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < POSTGREST_MAX_ROWS) break;
    offset += POSTGREST_MAX_ROWS;
  }
  return results;
}

export type PostsByDateJobBreakdown = {
  id: string;
  job_title: string;
  count: number;
};

export type PostsByDateRow = {
  date: string;
  tiktok: number;
  instagram: number;
  youtube: number;
  total: number;
  uniqueCreators: number;
  jobs: PostsByDateJobBreakdown[];
};

export type PostsByDateJob = {
  id: string;
  job_title: string;
  status: string;
};

export type PostsByDateCountry = {
  code: string;
  count: number;
};

export type PostsByDateTotals = {
  tiktok: number;
  instagram: number;
  youtube: number;
  total: number;
  uniqueCreators: number;
};

export type PostsByDateResponse = {
  rows: PostsByDateRow[];
  totals: PostsByDateTotals;
  jobs: PostsByDateJob[];
  countries: PostsByDateCountry[];
  from: string;
  to: string;
};

type Platform = 'tiktok' | 'instagram' | 'youtube';

type JoinedRow = {
  id: string;
  managed_creator_id: string;
  managed_creators: {
    id: string;
    country: string | null;
    job_id: string | null;
    linked_user_id: string | null;
    brand_organization_id: string;
  } | null;
  posts: {
    id: string;
    platform: Platform;
    posted_at: string;
    tracking_status: string;
  } | null;
};

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function ymd(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> },
): Promise<Response> {
  try {
    const [{ brandId }, user] = await Promise.all([params, getUser()]);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const parseDate = (p: string | null, fallback: Date): Date => {
      if (!p) return fallback;
      const d = new Date(p);
      return isNaN(d.getTime()) ? fallback : d;
    };
    const from = parseDate(url.searchParams.get('from'), defaultFrom);
    const to = parseDate(url.searchParams.get('to'), now);

    const jobIdFilters = parseList(url.searchParams.get('jobIds'));
    const countryFilters = parseList(url.searchParams.get('countries')).map((c) => c.toUpperCase());
    const platformFilters = parseList(url.searchParams.get('platforms')) as Platform[];

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch jobs for this brand (for the filter dropdown)
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id, job_title, status')
      .eq('brand_organization_id', brandId)
      .in('status', ['open', 'in_progress', 'completed'])
      .order('created_at', { ascending: false });

    const jobs: PostsByDateJob[] = (jobRows || []).map((j) => ({
      id: j.id,
      job_title: j.job_title,
      status: j.status ?? '',
    }));

    // Pull all managed_creator_posts for this brand in the date range (inner-joined to posts)
    const rows = await fetchAllBatched<JoinedRow>(() => {
      let q = supabase
        .from('managed_creator_posts')
        .select(
          'id, managed_creator_id, managed_creators!inner(id, country, job_id, linked_user_id, brand_organization_id), posts!inner(id, platform, posted_at, tracking_status)',
        )
        .eq('managed_creators.brand_organization_id', brandId)
        .gte('posts.posted_at', from.toISOString())
        .lte('posts.posted_at', to.toISOString())
        .neq('posts.tracking_status', 'deleted')
        .order('id');
      if (jobIdFilters.length > 0) {
        q = q.in('managed_creators.job_id', jobIdFilters);
      }
      if (platformFilters.length > 0) {
        q = q.in('posts.platform', platformFilters);
      }
      return q as unknown as { range: (f: number, t: number) => PromiseLike<{ data: JoinedRow[] | null; error: unknown }> };
    });

    // Backfill countries via users table when managed_creators.country is null.
    const linkedUserIds = new Set<string>();
    for (const r of rows) {
      const mc = r.managed_creators;
      if (!mc) continue;
      if (!mc.country && mc.linked_user_id) {
        linkedUserIds.add(mc.linked_user_id);
      }
    }

    const userCountryById = new Map<string, string | null>();
    if (linkedUserIds.size > 0) {
      const ids = Array.from(linkedUserIds);
      for (let i = 0; i < ids.length; i += POSTGREST_MAX_ROWS) {
        const chunk = ids.slice(i, i + POSTGREST_MAX_ROWS);
        const { data } = await supabase.from('users').select('id, country').in('id', chunk);
        for (const u of data || []) userCountryById.set(u.id, u.country ?? null);
      }
    }

    // Resolve country for each managed_creator involved
    const countryByCreator = new Map<string, string>();
    for (const r of rows) {
      const mc = r.managed_creators;
      if (!mc) continue;
      if (countryByCreator.has(mc.id)) continue;
      let resolved = '';
      if (mc.country && mc.country.trim()) {
        resolved = resolveCountryCode(mc.country).toUpperCase();
      } else if (mc.linked_user_id) {
        const u = userCountryById.get(mc.linked_user_id);
        if (u && u.trim()) resolved = resolveCountryCode(u).toUpperCase();
      }
      countryByCreator.set(mc.id, resolved || 'UNKNOWN');
    }

    // Build the country list (pre-filter) for the filter dropdown
    const countryCounts = new Map<string, number>();
    for (const r of rows) {
      const mc = r.managed_creators;
      if (!mc) continue;
      const code = countryByCreator.get(mc.id) || 'UNKNOWN';
      countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
    }
    const countries: PostsByDateCountry[] = Array.from(countryCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    // Country filter is in-memory (needs the user-country fallback join).
    // Platform filter is pushed down to PostgREST above.
    const filtered = rows.filter((r) => {
      const mc = r.managed_creators;
      const post = r.posts;
      if (!mc || !post) return false;
      if (countryFilters.length > 0) {
        const code = countryByCreator.get(mc.id) || 'UNKNOWN';
        if (!countryFilters.includes(code)) return false;
      }
      return true;
    });

    // Group by date + platform
    type DateBucket = {
      tiktok: number;
      instagram: number;
      youtube: number;
      creators: Set<string>;
      jobCounts: Map<string, number>;
    };
    const byDate = new Map<string, DateBucket>();
    const totals: PostsByDateTotals = { tiktok: 0, instagram: 0, youtube: 0, total: 0, uniqueCreators: 0 };
    const allCreators = new Set<string>();
    const jobTitleById = new Map<string, string>();
    for (const j of jobs) jobTitleById.set(j.id, j.job_title);

    for (const r of filtered) {
      const post = r.posts!;
      const mc = r.managed_creators!;
      const date = ymd(post.posted_at);
      let bucket = byDate.get(date);
      if (!bucket) {
        bucket = { tiktok: 0, instagram: 0, youtube: 0, creators: new Set(), jobCounts: new Map() };
        byDate.set(date, bucket);
      }
      if (post.platform === 'tiktok' || post.platform === 'instagram' || post.platform === 'youtube') {
        bucket[post.platform]++;
        totals[post.platform]++;
      }
      bucket.creators.add(mc.id);
      allCreators.add(mc.id);
      const jobId = mc.job_id;
      if (jobId && jobTitleById.has(jobId)) {
        bucket.jobCounts.set(jobId, (bucket.jobCounts.get(jobId) ?? 0) + 1);
      }
    }

    totals.total = totals.tiktok + totals.instagram + totals.youtube;
    totals.uniqueCreators = allCreators.size;

    const rowsOut: PostsByDateRow[] = Array.from(byDate.entries())
      .map(([date, b]) => ({
        date,
        tiktok: b.tiktok,
        instagram: b.instagram,
        youtube: b.youtube,
        total: b.tiktok + b.instagram + b.youtube,
        uniqueCreators: b.creators.size,
        jobs: Array.from(b.jobCounts.entries())
          .map(([id, count]) => ({ id, job_title: jobTitleById.get(id) ?? 'Unknown', count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const body: PostsByDateResponse = {
      rows: rowsOut,
      totals,
      jobs,
      countries,
      from: from.toISOString(),
      to: to.toISOString(),
    };

    return Response.json(body);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brands/[brandId]/posts-by-date',
      method: 'GET',
    });
  }
}
