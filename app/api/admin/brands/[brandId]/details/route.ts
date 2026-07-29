import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSTGREST_MAX_ROWS = 10000;

async function fetchAllBatched<T>(
  buildQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
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

type ManagedCreatorPostCountRow = {
  id: string;
  posts: {
    id: string;
    tiktok_account_id: string | null;
    instagram_account_id: string | null;
    youtube_account_id: string | null;
  };
};

export type ExtendedBrandDetails = {
  wallet: {
    available_balance: number;
    pending_balance: number;
    total_deposited: number;
    total_spent: number;
    currency: string;
  } | null;
  jobs: {
    total: number;
    active: number;
    draft: number;
    completed: number;
  };
  tracked_accounts: Array<{
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    username: string | null;
    display_name: string | null;
    profile_pic_url: string | null;
    follower_count: number | null;
    post_count: number;
    frozen: boolean;
  }>;
  applications: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
  };
  portal_config_jobs: Array<{ id: string; job_title: string; status: string; target_country: string | null }>;
  all_jobs: Array<{ id: string; job_title: string; status: string }>;
  job_ids: string[];
  lifecycle: {
    transcript_uploaded: boolean;
    primary_portal_config_job_id: string | null;
    managed_creators_count: number;
    recent_posts_count: number;
    paid_posts_count: number;
  };
};

/**
 * Fetches extended details for a specific brand (admin-only).
 * Returns wallet info, jobs stats, tracked accounts, and application stats.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandId: string }> }
): Promise<Response> {
  try {
    const { brandId } = await params;

    // Get authenticated user
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

    // Fetch all data in parallel
    const [walletResult, jobsResult, trackedAccountsResult, applicationsResult] = await Promise.all(
      [
        // Brand wallet
        supabase
          .from('brand_wallet')
          .select('available_balance, pending_balance, total_deposited, total_spent, currency')
          .eq('brand_organization_id', brandId)
          .single(),

        // Jobs (include transcript existence flag)
        supabase
          .from('jobs')
          .select('id, status, job_title, portal_config, target_country, transcript, created_at')
          .eq('brand_organization_id', brandId)
          .order('created_at', { ascending: true }),

        // Tracked social accounts via connector FK
        supabase
          .from('brand_tracked_social_accounts')
          .select(
            `
          id,
          frozen,
          social_accounts!brand_tracked_social_accounts_social_account_connector_id_fkey (
            id,
            tiktok_account_id,
            instagram_account_id,
            youtube_account_id,
            tiktok_accounts (
              id,
              tiktok_username,
              profile_pic_url,
              follower_count
            ),
            instagram_accounts (
              id,
              instagram_username,
              full_name,
              profile_pic_url,
              follower_count
            ),
            youtube_accounts (
              id,
              youtube_username,
              channel_title,
              profile_pic_url,
              follower_count
            )
          )
        `
          )
          .eq('brand_organization_id', brandId),

        // Applications (via jobs)
        supabase
          .from('jobs')
          .select('job_applications(id, application_status)')
          .eq('brand_organization_id', brandId),
      ]
    );

    // Process wallet
    const wallet =
      walletResult.data && !walletResult.error
        ? {
            available_balance: walletResult.data.available_balance || 0,
            pending_balance: walletResult.data.pending_balance || 0,
            total_deposited: walletResult.data.total_deposited || 0,
            total_spent: walletResult.data.total_spent || 0,
            currency: walletResult.data.currency || 'usd',
          }
        : null;

    // Process jobs
    const jobs = {
      total: 0,
      active: 0,
      draft: 0,
      completed: 0,
    };
    if (jobsResult.data && !jobsResult.error) {
      jobs.total = jobsResult.data.length;
      jobsResult.data.forEach((job) => {
        if (job.status === 'open' || job.status === 'in_progress') jobs.active++;
        else if (job.status === 'draft') jobs.draft++;
        else if (job.status === 'completed' || job.status === 'closed') jobs.completed++;
      });
    }

    // Derive jobs with portal configs
    const portal_config_jobs: ExtendedBrandDetails['portal_config_jobs'] = [];
    if (jobsResult.data && !jobsResult.error) {
      for (const job of jobsResult.data) {
        if (job.portal_config != null) {
          portal_config_jobs.push({
            id: job.id,
            job_title: job.job_title || 'Untitled',
            status: job.status || 'draft',
            target_country: job.target_country || null,
          });
        }
      }
    }

    // Process tracked accounts (deduplicate)
    const tracked_accounts: ExtendedBrandDetails['tracked_accounts'] = [];
    const seenAccountIds = new Set<string>();

    if (trackedAccountsResult.data && !trackedAccountsResult.error) {
      for (const row of trackedAccountsResult.data) {
        const isFrozen = (row as any).frozen === true;
        // FK join returns single object, not array
        const connector = (row as any).social_accounts as {
          id: string;
          tiktok_account_id: string | null;
          instagram_account_id: string | null;
          youtube_account_id: string | null;
          tiktok_accounts: {
            id: string;
            tiktok_username: string;
            profile_pic_url: string | null;
            follower_count: number | null;
          } | null;
          instagram_accounts: {
            id: string;
            instagram_username: string;
            full_name: string | null;
            profile_pic_url: string | null;
            follower_count: number | null;
          } | null;
          youtube_accounts: {
            id: string;
            youtube_username: string;
            channel_title: string | null;
            profile_pic_url: string | null;
            follower_count: number | null;
          } | null;
        } | null;
        if (!connector) continue;

        const isTiktok = connector.tiktok_account_id !== null;
        const isYoutube = connector.youtube_account_id !== null;
        const accountId = isTiktok
          ? connector.tiktok_account_id!
          : isYoutube
            ? connector.youtube_account_id!
            : connector.instagram_account_id!;

        if (seenAccountIds.has(accountId)) continue;
        seenAccountIds.add(accountId);

        if (isTiktok && connector.tiktok_accounts) {
          tracked_accounts.push({
            id: accountId,
            platform: 'tiktok',
            username: connector.tiktok_accounts.tiktok_username,
            display_name: null,
            profile_pic_url: connector.tiktok_accounts.profile_pic_url,
            follower_count: connector.tiktok_accounts.follower_count,
            post_count: 0,
            frozen: isFrozen,
          });
        } else if (isYoutube && connector.youtube_accounts) {
          tracked_accounts.push({
            id: accountId,
            platform: 'youtube',
            username: connector.youtube_accounts.youtube_username,
            display_name: connector.youtube_accounts.channel_title,
            profile_pic_url: connector.youtube_accounts.profile_pic_url,
            follower_count: connector.youtube_accounts.follower_count,
            post_count: 0,
            frozen: isFrozen,
          });
        } else if (!isTiktok && !isYoutube && connector.instagram_accounts) {
          tracked_accounts.push({
            id: accountId,
            platform: 'instagram',
            username: connector.instagram_accounts.instagram_username,
            display_name: connector.instagram_accounts.full_name,
            profile_pic_url: connector.instagram_accounts.profile_pic_url,
            follower_count: connector.instagram_accounts.follower_count,
            post_count: 0,
            frozen: isFrozen,
          });
        }
      }
    }

    // Query campaign post counts from managed_creator_posts, scoped to this brand.
    if (tracked_accounts.length > 0) {
      const countMap = new Map<string, number>();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const rows = await fetchAllBatched<ManagedCreatorPostCountRow>(() => {
        const query = supabase
          .from('managed_creator_posts')
          .select(
            'id, managed_creators!inner(id, brand_organization_id), posts!inner(id, tiktok_account_id, instagram_account_id, youtube_account_id)',
          )
          .eq('managed_creators.brand_organization_id', brandId)
          .eq('posts.tracking_status', 'active')
          .is('posts.ad_code', null)
          .gte('posts.posted_at', ninetyDaysAgo)
          .order('id');

        return query as unknown as {
          range: (
            from: number,
            to: number,
          ) => PromiseLike<{ data: ManagedCreatorPostCountRow[] | null; error: unknown }>;
        };
      });

      for (const row of rows) {
        const post = row.posts;
        const accountId = post.tiktok_account_id ?? post.youtube_account_id ?? post.instagram_account_id;
        if (accountId) countMap.set(accountId, (countMap.get(accountId) ?? 0) + 1);
      }

      for (const acc of tracked_accounts) {
        acc.post_count = countMap.get(acc.id) ?? 0;
      }
    }

    // Process applications
    const applications = {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    };
    if (applicationsResult.data && !applicationsResult.error) {
      for (const job of applicationsResult.data) {
        const apps = (job as any).job_applications || [];
        for (const app of apps) {
          applications.total++;
          if (app.application_status === 'pending' || app.application_status === 'under_review') {
            applications.pending++;
          } else if (app.application_status === 'accepted') {
            applications.accepted++;
          } else if (app.application_status === 'rejected') {
            applications.rejected++;
          }
        }
      }
    }

    // Lifecycle stats: transcript flag + managed_creators / posts / paid posts
    let primaryPortalConfigJobId: string | null = null;
    let transcriptUploaded = false;
    if (jobsResult.data && !jobsResult.error) {
      const portalJobs = jobsResult.data.filter((j) => (j as { portal_config: unknown }).portal_config != null);
      if (portalJobs.length > 0) {
        primaryPortalConfigJobId = portalJobs[0].id;
        transcriptUploaded = portalJobs.some(
          (j) => typeof (j as { transcript?: string | null }).transcript === 'string'
            && ((j as { transcript: string }).transcript).trim().length > 0,
        );
      }
    }

    let managedCreatorsCount = 0;
    let recentPostsCount = 0;
    let paidPostsCount = 0;

    const { data: mcRows } = await supabase
      .from('managed_creators')
      .select('id')
      .eq('brand_organization_id', brandId);

    const mcIds = (mcRows ?? []).map((r) => (r as { id: string }).id);
    managedCreatorsCount = mcIds.length;

    if (mcIds.length > 0) {
      // Chunk to avoid URL length limits on .in(), then run all chunk
      // queries in parallel so brands with many creators don't pay a
      // sequential round-trip per chunk.
      const CHUNK = 200;
      // 7-day window: recent_posts_count renders in the Lifecycle "This week"
      // tile, which is labelled "last 7 days".
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const chunks: string[][] = [];
      for (let i = 0; i < mcIds.length; i += CHUNK) {
        chunks.push(mcIds.slice(i, i + CHUNK));
      }
      const results = await Promise.all(
        chunks.flatMap((chunk) => [
          supabase
            .from('managed_creator_posts')
            .select('id', { head: true, count: 'exact' })
            .in('managed_creator_id', chunk)
            .gte('created_at', since),
          supabase
            .from('managed_creator_posts')
            .select('id', { head: true, count: 'exact' })
            .in('managed_creator_id', chunk)
            .eq('payment_status', 'paid'),
        ]),
      );
      for (let i = 0; i < results.length; i += 2) {
        recentPostsCount += results[i].count ?? 0;
        paidPostsCount += results[i + 1].count ?? 0;
      }
    }

    const response: ExtendedBrandDetails = {
      wallet,
      jobs,
      tracked_accounts,
      applications,
      portal_config_jobs,
      all_jobs: (jobsResult.data ?? []).map(j => ({ id: j.id, job_title: j.job_title || 'Untitled', status: j.status || 'draft' })),
      job_ids: (jobsResult.data ?? []).map(j => j.id),
      lifecycle: {
        transcript_uploaded: transcriptUploaded,
        primary_portal_config_job_id: primaryPortalConfigJobId,
        managed_creators_count: managedCreatorsCount,
        recent_posts_count: recentPostsCount,
        paid_posts_count: paidPostsCount,
      },
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brands/[brandId]/details',
      method: 'GET',
    });
  }
}
