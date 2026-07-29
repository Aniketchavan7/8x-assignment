/**
 * Admin Lookup — server-side data queries.
 *
 * Pulls everything needed for a post or account view in a small handful
 * of round-trips. Service role is required; routes verify admin first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type Service = SupabaseClient<Database>;

export interface PostLookupData {
  post: Database['public']['Tables']['posts']['Row'];
  socialAccount: {
    id: string | null;
    tiktokAccount: Database['public']['Tables']['tiktok_accounts']['Row'] | null;
    instagramAccount: Database['public']['Tables']['instagram_accounts']['Row'] | null;
    youtubeAccount: Database['public']['Tables']['youtube_accounts']['Row'] | null;
  };
  managedCreatorPosts: Array<{
    mcp: Database['public']['Tables']['managed_creator_posts']['Row'];
    managedCreator:
      | (Database['public']['Tables']['managed_creators']['Row'] & {
          brand_organization: { id: string; organization_name: string | null } | null;
          job: { id: string; job_title: string | null } | null;
        })
      | null;
  }>;
  syncJobs: Database['public']['Tables']['sync_jobs']['Row'][];
  transactions: Database['public']['Tables']['creator_transactions']['Row'][];
}

export async function loadPostLookup(
  supabase: Service,
  postId: string
): Promise<PostLookupData | null> {
  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return null;

  const platformAccountIds = [
    post.tiktok_account_id,
    post.instagram_account_id,
    post.youtube_account_id,
  ].filter((id): id is string => id !== null);

  const [
    socialAccount,
    tiktokAccount,
    instagramAccount,
    youtubeAccount,
    mcpRows,
    syncJobs,
  ] = await Promise.all([
    post.social_account_connector_id
      ? supabase
          .from('social_accounts')
          .select('id')
          .eq('id', post.social_account_connector_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    post.tiktok_account_id
      ? supabase
          .from('tiktok_accounts')
          .select('*')
          .eq('id', post.tiktok_account_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    post.instagram_account_id
      ? supabase
          .from('instagram_accounts')
          .select('*')
          .eq('id', post.instagram_account_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    post.youtube_account_id
      ? supabase
          .from('youtube_accounts')
          .select('*')
          .eq('id', post.youtube_account_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    supabase
      .from('managed_creator_posts')
      .select('*')
      .eq('post_id', postId)
      .then((r) => r.data ?? []),
    platformAccountIds.length > 0
      ? supabase
          .from('sync_jobs')
          .select('*')
          .in('account_id', platformAccountIds)
          .order('created_at', { ascending: false })
          .limit(20)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  let realTransactions: Database['public']['Tables']['creator_transactions']['Row'][] = [];
  if (mcpRows.length > 0) {
    const { data } = await supabase
      .from('creator_transactions')
      .select('*')
      .in(
        'managed_creator_post_id',
        mcpRows.map((r) => r.id)
      )
      .order('created_at', { ascending: false });
    realTransactions = data ?? [];
  }

  // Hydrate managed_creators with brand + job
  const mcIds = mcpRows.map((r) => r.managed_creator_id);
  let managedCreators: Array<
    Database['public']['Tables']['managed_creators']['Row'] & {
      brand_organization: { id: string; organization_name: string | null } | null;
      job: { id: string; job_title: string | null } | null;
    }
  > = [];
  if (mcIds.length > 0) {
    const { data } = await supabase
      .from('managed_creators')
      .select('*, brand_organization:brand_organizations(id, organization_name), job:jobs(id, job_title)')
      .in('id', mcIds);
    managedCreators = (data as typeof managedCreators) ?? [];
  }

  return {
    post,
    socialAccount: {
      id: socialAccount?.id ?? null,
      tiktokAccount,
      instagramAccount,
      youtubeAccount,
    },
    managedCreatorPosts: mcpRows.map((mcp) => ({
      mcp,
      managedCreator: managedCreators.find((mc) => mc.id === mcp.managed_creator_id) ?? null,
    })),
    syncJobs,
    transactions: realTransactions,
  };
}

export interface AccountLookupData {
  socialAccount: Database['public']['Tables']['social_accounts']['Row'];
  tiktokAccount: Database['public']['Tables']['tiktok_accounts']['Row'] | null;
  instagramAccount: Database['public']['Tables']['instagram_accounts']['Row'] | null;
  youtubeAccount: Database['public']['Tables']['youtube_accounts']['Row'] | null;
  trackedBy: Array<
    Database['public']['Tables']['brand_tracked_social_accounts']['Row'] & {
      brand_organization: { id: string; organization_name: string | null } | null;
    }
  >;
  managedCreators: Array<
    Database['public']['Tables']['managed_creators']['Row'] & {
      brand_organization: { id: string; organization_name: string | null } | null;
      job: { id: string; job_title: string | null } | null;
    }
  >;
  syncJobs: Database['public']['Tables']['sync_jobs']['Row'][];
}

export async function loadAccountLookup(
  supabase: Service,
  socialAccountId: string
): Promise<AccountLookupData | null> {
  const { data: socialAccount } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .maybeSingle();
  if (!socialAccount) return null;

  const platformAccountIds = [
    socialAccount.tiktok_account_id,
    socialAccount.instagram_account_id,
    socialAccount.youtube_account_id,
  ].filter((id): id is string => id !== null);

  const [tiktokAccount, instagramAccount, youtubeAccount, trackedBy, syncJobs] =
    await Promise.all([
      socialAccount.tiktok_account_id
        ? supabase
            .from('tiktok_accounts')
            .select('*')
            .eq('id', socialAccount.tiktok_account_id)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      socialAccount.instagram_account_id
        ? supabase
            .from('instagram_accounts')
            .select('*')
            .eq('id', socialAccount.instagram_account_id)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      socialAccount.youtube_account_id
        ? supabase
            .from('youtube_accounts')
            .select('*')
            .eq('id', socialAccount.youtube_account_id)
            .maybeSingle()
            .then((r) => r.data)
        : Promise.resolve(null),
      supabase
        .from('brand_tracked_social_accounts')
        .select('*, brand_organization:brand_organizations(id, organization_name)')
        .eq('social_account_connector_id', socialAccountId)
        .then((r) => (r.data as AccountLookupData['trackedBy']) ?? []),
      platformAccountIds.length > 0
        ? supabase
            .from('sync_jobs')
            .select('*')
            .in('account_id', platformAccountIds)
            .order('created_at', { ascending: false })
            .limit(20)
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);

  // managed_creators referencing any of the platform accounts
  let managedCreators: AccountLookupData['managedCreators'] = [];
  if (platformAccountIds.length > 0) {
    const ors: string[] = [];
    if (socialAccount.tiktok_account_id)
      ors.push(`tiktok_account_id.eq.${socialAccount.tiktok_account_id}`);
    if (socialAccount.instagram_account_id)
      ors.push(`instagram_account_id.eq.${socialAccount.instagram_account_id}`);
    if (socialAccount.youtube_account_id)
      ors.push(`youtube_account_id.eq.${socialAccount.youtube_account_id}`);
    if (ors.length > 0) {
      const { data } = await supabase
        .from('managed_creators')
        .select(
          '*, brand_organization:brand_organizations(id, organization_name), job:jobs(id, job_title)'
        )
        .or(ors.join(','));
      managedCreators = (data as AccountLookupData['managedCreators']) ?? [];
    }
  }

  return {
    socialAccount,
    tiktokAccount,
    instagramAccount,
    youtubeAccount,
    trackedBy,
    managedCreators,
    syncJobs,
  };
}

export async function loadAccountPosts(
  supabase: Service,
  socialAccount: Database['public']['Tables']['social_accounts']['Row'],
  opts: { limit: number; offset: number }
) {
  const ors: string[] = [];
  if (socialAccount.tiktok_account_id)
    ors.push(`tiktok_account_id.eq.${socialAccount.tiktok_account_id}`);
  if (socialAccount.instagram_account_id)
    ors.push(`instagram_account_id.eq.${socialAccount.instagram_account_id}`);
  if (socialAccount.youtube_account_id)
    ors.push(`youtube_account_id.eq.${socialAccount.youtube_account_id}`);
  if (ors.length === 0) return { rows: [], total: 0 };

  const { data, count } = await supabase
    .from('posts')
    .select('id, platform, post_url, posted_at, latest_views, thumbnail_url, ad_code', {
      count: 'exact',
    })
    .or(ors.join(','))
    .order('posted_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);
  return { rows: data ?? [], total: count ?? 0 };
}

export function platformOf(
  socialAccount: Pick<
    Database['public']['Tables']['social_accounts']['Row'],
    'tiktok_account_id' | 'instagram_account_id' | 'youtube_account_id'
  >
): 'tiktok' | 'instagram' | 'youtube' | null {
  if (socialAccount.tiktok_account_id) return 'tiktok';
  if (socialAccount.instagram_account_id) return 'instagram';
  if (socialAccount.youtube_account_id) return 'youtube';
  return null;
}
