import { createServiceRoleClient } from '@/lib/db/supabase';
import type {
  AccountSummary,
  InspectorPost,
  Platform,
  RelationshipsPayload,
} from './types';

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

export async function resolveAccount(
  supabase: SupabaseClient,
  accountId: string
): Promise<AccountSummary | null> {
  // If this is a social_accounts connector id, dereference to the platform id.
  const { data: connector } = await supabase
    .from('social_accounts')
    .select('tiktok_account_id, instagram_account_id, youtube_account_id')
    .eq('id', accountId)
    .maybeSingle();
  if (connector) {
    const derefId =
      connector.tiktok_account_id ??
      connector.instagram_account_id ??
      connector.youtube_account_id;
    if (derefId) accountId = derefId;
  }

  // Probe each platform table.
  const [tt, ig, yt] = await Promise.all([
    supabase
      .from('tiktok_accounts')
      .select(
        'id, tiktok_username, profile_pic_url, profile_url, follower_count, tracking_disabled, tracking_status, sync_status, sync_error, consecutive_sync_failures, last_synced_at, last_posts_fetched_at, backfill_status, backfill_cursor, sync_started_at, created_at'
      )
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('instagram_accounts')
      .select(
        'id, instagram_username, profile_pic_url, profile_url, follower_count, tracking_disabled, tracking_status, sync_status, sync_error, consecutive_sync_failures, last_synced_at, last_posts_fetched_at, backfill_status, backfill_cursor, sync_started_at, created_at, media_count'
      )
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('youtube_accounts')
      .select(
        'id, youtube_username, channel_title, youtube_channel_id, profile_pic_url, profile_url, follower_count, video_count, tracking_disabled, tracking_status, sync_status, sync_error, consecutive_sync_failures, last_synced_at, last_posts_fetched_at, backfill_status, backfill_cursor, sync_started_at, created_at'
      )
      .eq('id', accountId)
      .maybeSingle(),
  ]);

  if (tt.data) {
    const row = tt.data;
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('tiktok_account_id', accountId)
      .is('deleted_at', null);
    return {
      id: row.id,
      platform: 'tiktok',
      username: row.tiktok_username,
      profilePicUrl: row.profile_pic_url,
      profileUrl: row.profile_url,
      followerCount: row.follower_count,
      postCount: count ?? 0,
      channelId: null,
      videoCount: null,
      trackingDisabled: !!row.tracking_disabled,
      trackingStatus: row.tracking_status,
      syncStatus: row.sync_status,
      syncError: row.sync_error,
      consecutiveSyncFailures: row.consecutive_sync_failures ?? null,
      lastSyncedAt: row.last_synced_at,
      lastPostsFetchedAt: row.last_posts_fetched_at,
      backfillStatus: row.backfill_status,
      backfillCursor: row.backfill_cursor,
      syncStartedAt: row.sync_started_at,
      createdAt: row.created_at,
    };
  }

  if (ig.data) {
    const row = ig.data;
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('instagram_account_id', accountId)
      .is('deleted_at', null);
    return {
      id: row.id,
      platform: 'instagram',
      username: row.instagram_username,
      profilePicUrl: row.profile_pic_url,
      profileUrl: row.profile_url,
      followerCount: row.follower_count,
      postCount: count ?? 0,
      channelId: null,
      videoCount: row.media_count,
      trackingDisabled: !!row.tracking_disabled,
      trackingStatus: row.tracking_status,
      syncStatus: row.sync_status,
      syncError: row.sync_error,
      consecutiveSyncFailures: row.consecutive_sync_failures ?? null,
      lastSyncedAt: row.last_synced_at,
      lastPostsFetchedAt: row.last_posts_fetched_at,
      backfillStatus: row.backfill_status,
      backfillCursor: row.backfill_cursor,
      syncStartedAt: row.sync_started_at,
      createdAt: row.created_at,
    };
  }

  if (yt.data) {
    const row = yt.data;
    const { count } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('youtube_account_id', accountId)
      .is('deleted_at', null);
    return {
      id: row.id,
      platform: 'youtube',
      username: row.youtube_username,
      profilePicUrl: row.profile_pic_url,
      profileUrl: row.profile_url,
      followerCount: row.follower_count,
      postCount: count ?? 0,
      channelId: row.youtube_channel_id,
      videoCount: row.video_count,
      trackingDisabled: !!row.tracking_disabled,
      trackingStatus: row.tracking_status,
      syncStatus: row.sync_status,
      syncError: row.sync_error,
      consecutiveSyncFailures: row.consecutive_sync_failures ?? null,
      lastSyncedAt: row.last_synced_at,
      lastPostsFetchedAt: row.last_posts_fetched_at,
      backfillStatus: row.backfill_status,
      backfillCursor: row.backfill_cursor,
      syncStartedAt: row.sync_started_at,
      createdAt: row.created_at,
    };
  }

  return null;
}

export function platformFkColumn(platform: Platform): 'tiktok_account_id' | 'instagram_account_id' | 'youtube_account_id' {
  if (platform === 'tiktok') return 'tiktok_account_id';
  if (platform === 'instagram') return 'instagram_account_id';
  return 'youtube_account_id';
}

export function platformAccountsTable(platform: Platform): 'tiktok_accounts' | 'instagram_accounts' | 'youtube_accounts' {
  if (platform === 'tiktok') return 'tiktok_accounts';
  if (platform === 'instagram') return 'instagram_accounts';
  return 'youtube_accounts';
}

export async function getRelationships(
  supabase: SupabaseClient,
  account: AccountSummary
): Promise<RelationshipsPayload> {
  const fkCol = platformFkColumn(account.platform);

  // Managed creators linked to this account
  const { data: mcRows } = await supabase
    .from('managed_creators')
    .select(
      'id, name, status, is_active, brand_organization_id, base_pay, linked_user_id, ' +
        'brand_organizations(organization_name)'
    )
    .eq(fkCol, account.id);

  const managedCreators = (mcRows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    isActive: r.is_active,
    brandOrganizationId: r.brand_organization_id,
    brandName: r.brand_organizations?.organization_name ?? null,
    basePayCents: r.base_pay != null ? Number(r.base_pay) : null,
    fkLinked: true,
    linkedUserId: r.linked_user_id,
  }));

  // BTSAs via the active social_accounts connector.
  const { data: connector } = await supabase
    .from('social_accounts')
    .select('id')
    .eq(fkCol, account.id)
    .eq('status', 'active')
    .maybeSingle();

  let btsas: RelationshipsPayload['btsas'] = [];
  if (connector?.id) {
    const { data: btsaRows } = await supabase
      .from('brand_tracked_social_accounts')
      .select('id, brand_organization_id, campaign, frozen, brand_organizations(organization_name)')
      .eq('social_account_connector_id', connector.id);
    btsas = (btsaRows ?? []).map((r: any) => ({
      id: r.id,
      brandOrganizationId: r.brand_organization_id,
      brandName: r.brand_organizations?.organization_name ?? null,
      campaign: r.campaign,
      frozen: !!r.frozen,
    }));
  }

  // Duplicates (YouTube only)
  let duplicates: RelationshipsPayload['duplicates'] = [];
  if (account.platform === 'youtube' && account.channelId) {
    const { data: dupRows } = await supabase
      .from('youtube_accounts')
      .select('id, youtube_username, follower_count, last_synced_at, created_at')
      .eq('youtube_channel_id', account.channelId)
      .neq('id', account.id);

    if (dupRows && dupRows.length > 0) {
      const ids = dupRows.map((r) => r.id);
      const { data: postCounts } = await supabase
        .from('posts')
        .select('youtube_account_id')
        .in('youtube_account_id', ids)
        .is('deleted_at', null);
      const counts = new Map<string, number>();
      (postCounts ?? []).forEach((p: any) => {
        counts.set(p.youtube_account_id, (counts.get(p.youtube_account_id) ?? 0) + 1);
      });
      duplicates = dupRows.map((r) => ({
        id: r.id,
        username: r.youtube_username,
        followerCount: r.follower_count,
        postCount: counts.get(r.id) ?? 0,
        lastSyncedAt: r.last_synced_at,
        createdAt: r.created_at,
      }));
    }
  }

  return { managedCreators, btsas, duplicates };
}

export async function getPostsForAccount(
  supabase: SupabaseClient,
  account: AccountSummary
): Promise<InspectorPost[]> {
  const fkCol = platformFkColumn(account.platform);

  const { data: postsData } = await supabase
    .from('posts')
    .select(
      'id, platform, post_url, thumbnail_url, posted_at, last_fetched_at, ' +
        'latest_views, latest_likes, latest_comments, latest_shares, is_excluded, ' +
        'video_storage_url, video_stored_at, transcript, video_summary, hygiene_checks'
    )
    .eq(fkCol, account.id)
    .is('deleted_at', null)
    .order('posted_at', { ascending: false })
    .limit(500);

  const posts = (postsData ?? []) as any[];
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  const { data: mcps } = await supabase
    .from('managed_creator_posts')
    .select(
      'id, post_id, managed_creator_id, base_pay_cents, bonus_cents, total_owed_cents, ' +
        'total_paid_cents, payment_status, ' +
        'managed_creators(id, name, brand_organizations(organization_name))'
    )
    .in('post_id', postIds);

  const mcpMap = new Map<string, any>();
  (mcps ?? []).forEach((m: any) => mcpMap.set(m.post_id, m));

  return posts.map((p: any) => {
    const mcp = mcpMap.get(p.id);
    return {
      id: p.id,
      platform: p.platform,
      postUrl: p.post_url,
      thumbnailUrl: p.thumbnail_url,
      postedAt: p.posted_at,
      lastFetchedAt: p.last_fetched_at,
      latestViews: p.latest_views,
      latestLikes: p.latest_likes,
      latestComments: p.latest_comments,
      latestShares: p.latest_shares,
      isExcluded: !!p.is_excluded,
      mcpId: mcp?.id ?? null,
      mcpManagedCreatorId: mcp?.managed_creator_id ?? null,
      mcpManagedCreatorName: mcp?.managed_creators?.name ?? null,
      mcpBrandName: mcp?.managed_creators?.brand_organizations?.organization_name ?? null,
      basePayCents: mcp?.base_pay_cents ?? null,
      bonusCents: mcp?.bonus_cents ?? null,
      totalOwedCents: mcp?.total_owed_cents ?? null,
      totalPaidCents: mcp?.total_paid_cents ?? null,
      paymentStatus: mcp?.payment_status ?? null,
      videoStorageUrl: p.video_storage_url,
      videoStoredAt: p.video_stored_at,
      hasTranscript: !!p.transcript,
      hasSummary: !!p.video_summary,
      hygieneChecks: p.hygiene_checks,
    };
  });
}

export async function getPostEngagementHistory(
  supabase: SupabaseClient,
  postId: string
) {
  const { data } = await supabase
    .from('post_engagement_metrics')
    .select('tracked_at, views, likes, comments, shares')
    .eq('post_id', postId)
    .order('tracked_at', { ascending: true });
  return data ?? [];
}
