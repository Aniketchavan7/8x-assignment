import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import {
  getManagedCreatorSocialAccounts,
  getCreatorSocialAccounts,
  type UnifiedSocialAccount,
} from '@/lib/db/social-accounts';
import {
  extractTikTokUsername,
  extractInstagramUsername,
  extractYouTubeUsername,
} from '@/lib/utils/social-username';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type AccountSource =
  | 'fk_creator_profile'
  | 'fk_managed_creator'
  | 'mc_text_platform'
  | 'mc_text_only'
  | 'btsa_orphan_handle'
  | 'btsa_same_brand';

export type CreatorDetailResponse = {
  profile: {
    id: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    profile_picture: string | null;
    intro_video_url: string | null;
    location: string | null;
    phone: string | null;
    email: string | null;
    account_status: string | null;
    onboarding_status: string | null;
    work_status: string | null;
    average_rating: number | null;
    total_jobs_completed: number | null;
    created_at: string | null;
    updated_at: string | null;
    user_id: string | null;
  };
  user: {
    id: string;
    email: string;
    country: string | null;
    last_active_at: string | null;
  } | null;
  managedCreators: Array<{
    id: string;
    name: string | null;
    notes: string | null;
    slack_user_id: string | null;
    brand_name: string | null;
    brand_slug: string | null;
    brand_organization_id: string | null;
    job_title: string | null;
    job_id: string | null;
    job_country: string | null;
    status: string | null;
    base_pay: number | null;
    total_paid: number | null;
    pending_payout: number | null;
    payment_method: string | null;
    created_at: string | null;
    advance_balance_cents: number;
    tiktok_username: string | null;
    instagram_username: string | null;
    youtube_username: string | null;
    country: string | null;
    linked_user_id: string | null;
    linked_creator_profile_id: string | null;
    tiktokTracked: boolean;
    instagramTracked: boolean;
    youtubeTracked: boolean;
    tiktokFrozen: boolean;
    instagramFrozen: boolean;
    youtubeFrozen: boolean;
    tiktokPostCount: number;
    instagramPostCount: number;
    youtubePostCount: number;
  }>;
  videos: Array<{
    id: string;
    slot_number: number;
    storage_path: string;
    brand_name: string | null;
    created_at: string | null;
  }>;
  socialAccounts: UnifiedSocialAccount[];
  wallet: {
    available_balance: number;
    pending_balance: number;
    total_earned: number;
    total_withdrawn: number;
  } | null;
  transactions: Array<{
    id: string;
    transaction_type: string;
    amount: number;
    status: string | null;
    description: string | null;
    created_at: string | null;
    managed_creator_post_id: string | null;
  }>;
  stripe: {
    account_id: string | null;
    payouts_enabled: boolean | null;
    charges_enabled: boolean | null;
    region: string | null;
  } | null;
  postPayments: Array<{
    id: string;
    post_id: string;
    managed_creator_id: string;
    base_pay_cents: number;
    bonus_cents: number;
    total_owed_cents: number;
    total_paid_cents: number;
    payment_status: string;
    offplatform_method: string | null;
    platform: string | null;
    native_id: string | null;
    latest_views: number | null;
    thumbnail_url: string | null;
    post_url: string | null;
    posted_at: string | null;
    brand_name: string | null;
    brand_organization_id: string | null;
    job_title: string | null;
    isMispriced: boolean;
  }>;
  connectedAccounts: Array<{
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    username: string;
    profileUrl: string | null;
    followerCount: number | null;
    postCount: number;
    accountType: string;
    isActive: boolean;
    lastSyncedAt: string | null;
    lastPostsFetchedAt: string | null;
    createdAt: string | null;
    trackedBy: Array<{
      brandName: string;
      brandOrganizationId: string;
      frozen: boolean;
    }>;
    managedCreatorId: string | null;
    creatorProfileId: string | null;
    platformAccountId: string | null;
    linked: boolean;
    fkMismatch: boolean;
    hasAccountRow: boolean;
    sourcedFromMcText: boolean;
    sources: AccountSource[];
  }>;
  referrals: {
    shareCode: string | null;
    count: number;
    funnel: { signedUp: number; videoSubmitted: number; active: number };
    users: Array<{
      id: string;
      firstName: string | null;
      lastInitial: string | null;
      creatorProfileId: string | null;
      createdAt: string;
      stage: 'signed_up' | 'video_submitted' | 'active';
      daysActive: number | null;
      paidCents: number;
    }>;
  };
};

// Keep legacy type for backward compatibility with PATCH consumers
export type AdminCreatorDetail = CreatorDetailResponse;

type ManagedCreatorRow = {
  id: string;
  name: string | null;
  status: string | null;
  base_pay: number | null;
  bonus_milestones: unknown;
  total_paid: number | null;
  pending_payout: number | null;
  payment_method: string | null;
  created_at: string | null;
  advance_balance_cents: number;
  notes: string | null;
  slack_user_id: string | null;
  brand_organization_id: string | null;
  tiktok_username: string | null;
  instagram_username: string | null;
  youtube_username: string | null;
  tiktok_account_id: string | null;
  instagram_account_id: string | null;
  youtube_account_id: string | null;
  country: string | null;
  linked_user_id: string | null;
  linked_creator_profile_id: string | null;
  job_id: string | null;
  brand_organizations: { organization_name: string; organization_slug: string } | null;
  jobs: { job_title: string; target_country: string | null; cpm_platforms_allowed: string[] | null } | null;
};

type TrackedAccountInfo = {
  tiktokTracked: boolean;
  instagramTracked: boolean;
  youtubeTracked: boolean;
  tiktokFrozen: boolean;
  instagramFrozen: boolean;
  youtubeFrozen: boolean;
  tiktokPostCount: number;
  instagramPostCount: number;
  youtubePostCount: number;
};

function mapManagedCreator(mc: ManagedCreatorRow, tracking: TrackedAccountInfo) {
  return {
    id: mc.id,
    name: mc.name,
    notes: mc.notes,
    slack_user_id: mc.slack_user_id,
    brand_name: mc.brand_organizations?.organization_name ?? null,
    brand_slug: mc.brand_organizations?.organization_slug ?? null,
    brand_organization_id: mc.brand_organization_id,
    job_title: mc.jobs?.job_title ?? null,
    job_id: mc.job_id,
    job_country: mc.jobs?.target_country ?? null,
    status: mc.status,
    base_pay: mc.base_pay,
    total_paid: mc.total_paid,
    pending_payout: mc.pending_payout,
    payment_method: mc.payment_method,
    created_at: mc.created_at,
    advance_balance_cents: mc.advance_balance_cents,
    tiktok_username: mc.tiktok_username,
    instagram_username: mc.instagram_username,
    youtube_username: mc.youtube_username,
    country: mc.country,
    linked_user_id: mc.linked_user_id,
    linked_creator_profile_id: mc.linked_creator_profile_id ?? null,
    ...tracking,
  };
}

function deduplicateSocialAccounts(accounts: UnifiedSocialAccount[]): UnifiedSocialAccount[] {
  const seen = new Map<string, UnifiedSocialAccount>();
  for (const acc of accounts) {
    const key = `${acc.platform}:${acc.platformAccountId}`;
    if (!seen.has(key)) {
      seen.set(key, acc);
    }
  }
  return Array.from(seen.values());
}

/**
 * Fetches a single creator profile by ID with full enrichment (admin-only).
 * Accepts optional `?source=managed_creator` query param.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');

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

    let creatorProfileId: string | null = null;
    let fallbackManagedCreator: {
      linked_creator_profile_id: string | null;
      linked_user_id: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      location: string | null;
      created_at: string | null;
      updated_at: string | null;
    } | null = null;

    if (source === 'managed_creator') {
      const { data: mc } = await supabase
        .from('managed_creators')
        .select('linked_creator_profile_id, linked_user_id, name, email, phone, location, created_at, updated_at')
        .eq('id', id)
        .single();

      if (!mc) return Response.json({ error: 'Creator not found' }, { status: 404 });

      creatorProfileId = mc.linked_creator_profile_id;
      if (!creatorProfileId) fallbackManagedCreator = mc;
    } else {
      creatorProfileId = id;
    }

    // Fetch creator profile (or build synthetic from managed_creator)
    let profile: CreatorDetailResponse['profile'];
    let stripe: CreatorDetailResponse['stripe'] = null;

    if (creatorProfileId) {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, display_name, first_name, last_name, bio, profile_picture, intro_video_url, location, phone, email, account_status, onboarding_status, work_status, average_rating, total_jobs_completed, created_at, updated_at, user_id, stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, stripe_region')
        .eq('id', creatorProfileId)
        .single();

      if (error || !data) return Response.json({ error: 'Creator not found' }, { status: 404 });

      profile = {
        id: data.id,
        display_name: data.display_name,
        first_name: data.first_name,
        last_name: data.last_name,
        bio: data.bio,
        profile_picture: data.profile_picture,
        intro_video_url: data.intro_video_url,
        location: data.location,
        phone: data.phone,
        email: data.email,
        account_status: data.account_status,
        onboarding_status: data.onboarding_status,
        work_status: data.work_status,
        average_rating: data.average_rating,
        total_jobs_completed: data.total_jobs_completed,
        created_at: data.created_at,
        updated_at: data.updated_at,
        user_id: data.user_id,
      };

      stripe = data.stripe_account_id
        ? {
            account_id: data.stripe_account_id,
            payouts_enabled: data.stripe_payouts_enabled,
            charges_enabled: data.stripe_charges_enabled,
            region: data.stripe_region,
          }
        : null;
    } else if (fallbackManagedCreator) {
      // Build synthetic profile from managed_creator
      profile = {
        id: id,
        display_name: fallbackManagedCreator.name || 'Unknown',
        first_name: null,
        last_name: null,
        bio: null,
        profile_picture: null,
        intro_video_url: null,
        location: fallbackManagedCreator.location,
        phone: fallbackManagedCreator.phone,
        email: fallbackManagedCreator.email,
        account_status: null,
        onboarding_status: null,
        work_status: null,
        average_rating: null,
        total_jobs_completed: null,
        created_at: fallbackManagedCreator.created_at,
        updated_at: fallbackManagedCreator.updated_at,
        user_id: fallbackManagedCreator.linked_user_id,
      };
    } else {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Parallel enrichment queries
    const [fetchedUser, managedCreators, wallet, transactions] = await Promise.all([
      // 1. User data (include share_code for referral lookup)
      profile.user_id
        ? supabase.from('users').select('id, email, country, last_active_at, share_code')
            .eq('id', profile.user_id).single().then(r => r.data)
        : Promise.resolve(null),

      // 2. All managed_creator rows for this person (raw, mapped after tracking data)
      (async () => {
        const mcSelect = 'id, name, status, base_pay, bonus_milestones, total_paid, pending_payout, payment_method, created_at, advance_balance_cents, notes, slack_user_id, brand_organization_id, tiktok_username, instagram_username, youtube_username, tiktok_account_id, instagram_account_id, youtube_account_id, country, linked_user_id, linked_creator_profile_id, job_id, brand_organizations(organization_name, organization_slug), jobs(job_title, target_country, cpm_platforms_allowed)';
        const orParts: string[] = [];
        if (creatorProfileId) orParts.push(`linked_creator_profile_id.eq.${creatorProfileId}`);
        if (profile.user_id) orParts.push(`linked_user_id.eq.${profile.user_id}`);
        if (orParts.length === 0 && source === 'managed_creator') {
          const { data } = await supabase
            .from('managed_creators')
            .select(mcSelect)
            .eq('id', id);
          return (data as unknown as ManagedCreatorRow[]) ?? [];
        }
        if (orParts.length === 0) return [] as ManagedCreatorRow[];
        const { data } = await supabase
          .from('managed_creators')
          .select(mcSelect)
          .or(orParts.join(','))
          .order('created_at', { ascending: false });
        return (data as unknown as ManagedCreatorRow[]) ?? [];
      })(),

      // 3. Wallet (via RPC function)
      creatorProfileId
        ? supabase.rpc('get_creator_balance', { p_creator_profile_id: creatorProfileId })
            .then(r => {
              const row = r.data?.[0];
              if (!row) return null;
              return {
                available_balance: row.available_cents,
                pending_balance: row.pending_stripe_cents,
                total_earned: row.total_earned_cents,
                total_withdrawn: row.total_withdrawn_cents,
              };
            })
        : Promise.resolve(null),

      // 4. Transactions
      creatorProfileId
        ? supabase.from('creator_transactions')
            .select('id, transaction_type, amount, status, description, created_at, managed_creator_post_id')
            .eq('creator_profile_id', creatorProfileId)
            .order('created_at', { ascending: false }).limit(20).then(r => r.data ?? [])
        : Promise.resolve([]),
    ]);

    // managedCreators here is raw ManagedCreatorRow[] — will be mapped after tracking data
    const rawManagedCreators = managedCreators;
    const mcIds = rawManagedCreators.map(mc => mc.id);
    const mcBrandMap = new Map(rawManagedCreators.map(mc => [mc.id, mc.brand_organizations?.organization_name ?? null]));

    // Fetch videos, social accounts, tracked accounts, post counts, post payments, connected accounts in parallel
    const [videos, socialAccounts, trackedAccounts, postCountsByConnector, postPaymentsRaw, connectedAccountsRaw] = await Promise.all([
      // Videos from managed_creator_videos
      mcIds.length > 0
        ? supabase
            .from('managed_creator_videos')
            .select('id, slot_number, storage_path, managed_creator_id, created_at')
            .in('managed_creator_id', mcIds)
            .is('replaced_at', null)
            .order('slot_number')
            .then(r => (r.data ?? []).map(v => ({
              id: v.id,
              slot_number: v.slot_number,
              storage_path: v.storage_path,
              brand_name: mcBrandMap.get(v.managed_creator_id) ?? null,
              created_at: v.created_at,
            })))
        : Promise.resolve([]),

      // Social accounts: combine from all managed_creators + creator_profile
      (async () => {
        const arrays = await Promise.all([
          ...mcIds.map(mcId => getManagedCreatorSocialAccounts(supabase, mcId)),
          ...(creatorProfileId ? [getCreatorSocialAccounts(supabase, creatorProfileId)] : []),
        ]);
        return deduplicateSocialAccounts(arrays.flat());
      })(),

      // Tracked social accounts for all managed creators
      mcIds.length > 0
        ? supabase
            .from('social_accounts')
            .select('id, managed_creator_id, account_type, tiktok_account_id, instagram_account_id, youtube_account_id')
            .in('managed_creator_id', mcIds)
            .in('account_type', ['tracked_only', 'brand_owned'])
            .then(r => r.data ?? [])
        : Promise.resolve([]),

      // Post counts per social_account_connector_id (will be aggregated per MC)
      mcIds.length > 0
        ? supabase
            .from('social_accounts')
            .select('id, managed_creator_id, tiktok_account_id, instagram_account_id, youtube_account_id, posts(id)')
            .in('managed_creator_id', mcIds)
            .in('account_type', ['tracked_only', 'brand_owned'])
            .then(r => r.data ?? [])
        : Promise.resolve([]),

      // Post payments (managed_creator_posts)
      mcIds.length > 0
        ? supabase
            .from('managed_creator_posts')
            .select(`
              id, post_id, managed_creator_id,
              base_pay_cents, bonus_cents, total_owed_cents, total_paid_cents,
              bonus_milestones,
              payment_status, offplatform_method,
              posts!inner(
                platform, post_id, latest_views,
                thumbnail_url, post_url, posted_at
              ),
              managed_creators!inner(
                brand_organization_id,
                brand_organizations(organization_name),
                jobs(job_title)
              )
            `)
            .in('managed_creator_id', mcIds)
            .order('created_at', { ascending: false })
            .limit(200)
            .then(r => r.data ?? [])
        : Promise.resolve([]),

      // Connected accounts: all social_accounts for this creator with platform + BTSA joins
      (async () => {
        const orParts: string[] = [];
        if (mcIds.length > 0) orParts.push(`managed_creator_id.in.(${mcIds.join(',')})`);
        if (creatorProfileId) orParts.push(`creator_profile_id.eq.${creatorProfileId}`);
        if (orParts.length === 0) return [];

        const { data } = await supabase
          .from('social_accounts')
          .select(`
            id, account_type, is_active, created_at,
            tiktok_account_id, instagram_account_id, youtube_account_id,
            managed_creator_id, creator_profile_id,
            tiktok_accounts(id, tiktok_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            instagram_accounts(id, instagram_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            youtube_accounts(id, youtube_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            brand_tracked_social_accounts(brand_organization_id, frozen, brand_organizations(organization_name))
          `)
          .or(orParts.join(','));

        return data ?? [];
      })(),
    ]);

    // Build a (brandOrgId, platform, platformAccountId) → frozen lookup from BTSA
    // rows attached to this creator's connectors. Covers both new (creator_profile-owned)
    // and legacy (managed_creator-owned) provisioning since we query all connectors
    // owned by either linkage in connectedAccountsRaw.
    type FrozenConnectorRow = {
      tiktok_account_id: string | null;
      instagram_account_id: string | null;
      youtube_account_id: string | null;
      brand_tracked_social_accounts: Array<{ brand_organization_id: string; frozen: boolean }> | null;
    };
    const frozenLookup = new Map<string, boolean>();
    for (const sa of connectedAccountsRaw as FrozenConnectorRow[]) {
      const btsas = sa.brand_tracked_social_accounts ?? [];
      for (const btsa of btsas) {
        if (!btsa.frozen || !btsa.brand_organization_id) continue;
        if (sa.tiktok_account_id) {
          frozenLookup.set(`${btsa.brand_organization_id}:tiktok:${sa.tiktok_account_id}`, true);
        } else if (sa.instagram_account_id) {
          frozenLookup.set(`${btsa.brand_organization_id}:instagram:${sa.instagram_account_id}`, true);
        } else if (sa.youtube_account_id) {
          frozenLookup.set(`${btsa.brand_organization_id}:youtube:${sa.youtube_account_id}`, true);
        }
      }
    }

    // Build tracking info per managed creator
    const trackingByMcId = new Map<string, TrackedAccountInfo>();
    for (const mc of rawManagedCreators) {
      const mcId = mc.id;
      const mcTracked = trackedAccounts.filter(sa => sa.managed_creator_id === mcId);
      const mcPostData = postCountsByConnector.filter(sa => sa.managed_creator_id === mcId);
      const brandId = mc.brand_organization_id;
      trackingByMcId.set(mcId, {
        tiktokTracked: mcTracked.some(sa => sa.tiktok_account_id != null),
        instagramTracked: mcTracked.some(sa => sa.instagram_account_id != null),
        youtubeTracked: mcTracked.some(sa => sa.youtube_account_id != null),
        tiktokFrozen: !!(brandId && mc.tiktok_account_id &&
          frozenLookup.get(`${brandId}:tiktok:${mc.tiktok_account_id}`)),
        instagramFrozen: !!(brandId && mc.instagram_account_id &&
          frozenLookup.get(`${brandId}:instagram:${mc.instagram_account_id}`)),
        youtubeFrozen: !!(brandId && mc.youtube_account_id &&
          frozenLookup.get(`${brandId}:youtube:${mc.youtube_account_id}`)),
        tiktokPostCount: mcPostData
          .filter(sa => sa.tiktok_account_id != null)
          .reduce((sum, sa) => sum + (Array.isArray(sa.posts) ? sa.posts.length : 0), 0),
        instagramPostCount: mcPostData
          .filter(sa => sa.instagram_account_id != null)
          .reduce((sum, sa) => sum + (Array.isArray(sa.posts) ? sa.posts.length : 0), 0),
        youtubePostCount: mcPostData
          .filter(sa => sa.youtube_account_id != null)
          .reduce((sum, sa) => sum + (Array.isArray(sa.posts) ? sa.posts.length : 0), 0),
      });
    }

    const defaultTracking: TrackedAccountInfo = {
      tiktokTracked: false, instagramTracked: false, youtubeTracked: false,
      tiktokFrozen: false, instagramFrozen: false, youtubeFrozen: false,
      tiktokPostCount: 0, instagramPostCount: 0, youtubePostCount: 0,
    };

    const mappedManagedCreators = rawManagedCreators.map(mc =>
      mapManagedCreator(mc, trackingByMcId.get(mc.id) ?? defaultTracking)
    );

    // Map connected accounts with post counts
    type ConnectedRaw = {
      id: string;
      account_type: string;
      is_active: boolean;
      created_at: string | null;
      tiktok_account_id: string | null;
      instagram_account_id: string | null;
      youtube_account_id: string | null;
      managed_creator_id: string | null;
      creator_profile_id: string | null;
      tiktok_accounts: { id: string; tiktok_username: string; profile_url: string | null; follower_count: number | null; last_synced_at: string | null; last_posts_fetched_at: string | null } | null;
      instagram_accounts: { id: string; instagram_username: string; profile_url: string | null; follower_count: number | null; last_synced_at: string | null; last_posts_fetched_at: string | null } | null;
      youtube_accounts: { id: string; youtube_username: string; profile_url: string | null; follower_count: number | null; last_synced_at: string | null; last_posts_fetched_at: string | null } | null;
      brand_tracked_social_accounts: Array<{ brand_organization_id: string; frozen: boolean; brand_organizations: { organization_name: string } | null }>;
    };

    const connectorIds = (connectedAccountsRaw as ConnectedRaw[]).map(sa => sa.id);
    const postCountMap = new Map<string, number>();
    if (connectorIds.length > 0) {
      const { data: postCounts } = await supabase
        .from('social_accounts')
        .select('id, posts(count)')
        .in('id', connectorIds);
      for (const sa of postCounts ?? []) {
        const count = (sa.posts as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
        postCountMap.set(sa.id, count);
      }
    }

    type Platform = 'tiktok' | 'instagram' | 'youtube';
    type ConnectedRow = CreatorDetailResponse['connectedAccounts'][number];

    const connectorRows: ConnectedRow[] = (connectedAccountsRaw as ConnectedRaw[]).map(sa => {
      let platform: Platform;
      let username: string;
      let profileUrl: string | null = null;
      let followerCount: number | null = null;
      let lastSyncedAt: string | null = null;
      let lastPostsFetchedAt: string | null = null;
      let platformAccountId: string | null = null;
      const sources: AccountSource[] = [];
      if (sa.creator_profile_id != null && sa.creator_profile_id === creatorProfileId) {
        sources.push('fk_creator_profile');
      }
      if (sa.managed_creator_id != null && mcIds.includes(sa.managed_creator_id)) {
        sources.push('fk_managed_creator');
      }

      if (sa.tiktok_accounts) {
        platform = 'tiktok';
        username = sa.tiktok_accounts.tiktok_username;
        profileUrl = sa.tiktok_accounts.profile_url;
        followerCount = sa.tiktok_accounts.follower_count;
        lastSyncedAt = sa.tiktok_accounts.last_synced_at;
        lastPostsFetchedAt = sa.tiktok_accounts.last_posts_fetched_at;
        platformAccountId = sa.tiktok_account_id ?? sa.tiktok_accounts.id;
      } else if (sa.instagram_accounts) {
        platform = 'instagram';
        username = sa.instagram_accounts.instagram_username;
        profileUrl = sa.instagram_accounts.profile_url;
        followerCount = sa.instagram_accounts.follower_count;
        lastSyncedAt = sa.instagram_accounts.last_synced_at;
        lastPostsFetchedAt = sa.instagram_accounts.last_posts_fetched_at;
        platformAccountId = sa.instagram_account_id ?? sa.instagram_accounts.id;
      } else if (sa.youtube_accounts) {
        platform = 'youtube';
        username = sa.youtube_accounts.youtube_username;
        profileUrl = sa.youtube_accounts.profile_url;
        followerCount = sa.youtube_accounts.follower_count;
        lastSyncedAt = sa.youtube_accounts.last_synced_at;
        lastPostsFetchedAt = sa.youtube_accounts.last_posts_fetched_at;
        platformAccountId = sa.youtube_account_id ?? sa.youtube_accounts.id;
      } else {
        platform = sa.tiktok_account_id ? 'tiktok' : sa.instagram_account_id ? 'instagram' : 'youtube';
        username = 'unknown';
        platformAccountId = sa.tiktok_account_id ?? sa.instagram_account_id ?? sa.youtube_account_id ?? null;
      }

      return {
        id: sa.id,
        platform,
        username,
        profileUrl,
        followerCount,
        postCount: postCountMap.get(sa.id) ?? 0,
        accountType: sa.account_type,
        isActive: sa.is_active,
        lastSyncedAt,
        lastPostsFetchedAt,
        createdAt: sa.created_at,
        trackedBy: (sa.brand_tracked_social_accounts ?? []).map(btsa => ({
          brandName: btsa.brand_organizations?.organization_name ?? 'Unknown',
          brandOrganizationId: btsa.brand_organization_id,
          frozen: btsa.frozen,
        })),
        managedCreatorId: sa.managed_creator_id,
        creatorProfileId: sa.creator_profile_id,
        platformAccountId,
        linked: false,
        fkMismatch: false,
        hasAccountRow: true,
        sourcedFromMcText: false,
        sources,
      };
    });

    // Build expected pricing per managed_creator_id (for mispriced detection)
    type ExpectedPricing = { basePayCents: number; milestonesKey: string };
    const expectedPricingByMcId = new Map<string, ExpectedPricing>();
    for (const mc of rawManagedCreators) {
      const platformCount = mc.jobs?.cpm_platforms_allowed?.length || 2;
      const rawBase = mc.base_pay == null ? 0 : Number(mc.base_pay);
      const basePayCents = Math.round(rawBase / Math.max(platformCount, 1));
      expectedPricingByMcId.set(mc.id, {
        basePayCents,
        milestonesKey: JSON.stringify(mc.bonus_milestones ?? null),
      });
    }

    const computeIsMispriced = (
      managedCreatorId: string,
      basePayCents: number,
      bonusMilestones: unknown,
    ): boolean => {
      const expected = expectedPricingByMcId.get(managedCreatorId);
      if (!expected) return false;
      if (basePayCents !== expected.basePayCents) return true;
      return JSON.stringify(bonusMilestones ?? null) !== expected.milestonesKey;
    };

    // --- Collect MC text usernames per platform (normalized lowercase) ---
    const mcTextByPlatform: Record<Platform, Set<string>> = {
      tiktok: new Set(),
      instagram: new Set(),
      youtube: new Set(),
    };
    const extractors: Record<Platform, (s: string) => string | null> = {
      tiktok: extractTikTokUsername,
      instagram: extractInstagramUsername,
      youtube: extractYouTubeUsername,
    };
    const textFieldByPlatform: Record<Platform, 'tiktok_username' | 'instagram_username' | 'youtube_username'> = {
      tiktok: 'tiktok_username',
      instagram: 'instagram_username',
      youtube: 'youtube_username',
    };
    for (const mc of rawManagedCreators) {
      for (const platform of ['tiktok', 'instagram', 'youtube'] as const) {
        const raw = mc[textFieldByPlatform[platform]];
        if (!raw) continue;
        const extracted = extractors[platform](raw)?.toLowerCase();
        if (!extracted) continue;
        mcTextByPlatform[platform].add(extracted);
      }
    }

    // --- Query platform tables for MC text matches, including embedded connector + BTSA ---
    const mcTextSharedSelect = `
      social_accounts(
        id, account_type, is_active, created_at, managed_creator_id, creator_profile_id,
        brand_tracked_social_accounts(brand_organization_id, frozen, brand_organizations(organization_name))
      )
    `;

    type PlatformMatchSocialAccount = {
      id: string;
      account_type: string;
      is_active: boolean;
      created_at: string | null;
      managed_creator_id: string | null;
      creator_profile_id: string | null;
      brand_tracked_social_accounts: Array<{
        brand_organization_id: string;
        frozen: boolean;
        brand_organizations: { organization_name: string } | null;
      }>;
    };
    type PlatformMatchBase = {
      id: string;
      profile_url: string | null;
      follower_count: number | null;
      last_synced_at: string | null;
      last_posts_fetched_at: string | null;
      // Supabase returns this as a single object (not array) because
      // social_accounts has a unique constraint on {platform}_account_id.
      social_accounts: PlatformMatchSocialAccount | PlatformMatchSocialAccount[] | null;
    };
    const socialAccountsOf = (m: PlatformMatchBase): PlatformMatchSocialAccount[] => {
      const sa = m.social_accounts;
      if (!sa) return [];
      return Array.isArray(sa) ? sa : [sa];
    };

    // Build a PostgREST `or` expression for case-insensitive exact match.
    // `ilike.<val>` without % wildcards is equivalent to case-insensitive equality.
    // Usernames are restricted to [a-zA-Z0-9._-] by the extractors above, so no escaping required.
    const buildIlikeOr = (field: string, usernames: Set<string>) =>
      Array.from(usernames).map(u => `${field}.ilike.${u}`).join(',');

    const [tiktokTextMatches, instagramTextMatches, youtubeTextMatches] = await Promise.all([
      mcTextByPlatform.tiktok.size > 0
        ? supabase
            .from('tiktok_accounts')
            .select(`id, tiktok_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at, ${mcTextSharedSelect}`)
            .or(buildIlikeOr('tiktok_username', mcTextByPlatform.tiktok))
            .then(r => (r.data ?? []) as unknown as Array<PlatformMatchBase & { tiktok_username: string }>)
        : Promise.resolve([] as Array<PlatformMatchBase & { tiktok_username: string }>),
      mcTextByPlatform.instagram.size > 0
        ? supabase
            .from('instagram_accounts')
            .select(`id, instagram_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at, ${mcTextSharedSelect}`)
            .or(buildIlikeOr('instagram_username', mcTextByPlatform.instagram))
            .then(r => (r.data ?? []) as unknown as Array<PlatformMatchBase & { instagram_username: string }>)
        : Promise.resolve([] as Array<PlatformMatchBase & { instagram_username: string }>),
      mcTextByPlatform.youtube.size > 0
        ? supabase
            .from('youtube_accounts')
            .select(`id, youtube_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at, ${mcTextSharedSelect}`)
            .or(buildIlikeOr('youtube_username', mcTextByPlatform.youtube))
            .then(r => (r.data ?? []) as unknown as Array<PlatformMatchBase & { youtube_username: string }>)
        : Promise.resolve([] as Array<PlatformMatchBase & { youtube_username: string }>),
    ]);

    // Get post counts for any new connector ids we picked up via text matches
    const newConnectorIds = new Set<string>();
    const addFromMatches = <T extends PlatformMatchBase>(matches: T[]) => {
      for (const m of matches) {
        for (const sa of socialAccountsOf(m)) {
          if (!postCountMap.has(sa.id)) newConnectorIds.add(sa.id);
        }
      }
    };
    addFromMatches(tiktokTextMatches);
    addFromMatches(instagramTextMatches);
    addFromMatches(youtubeTextMatches);

    if (newConnectorIds.size > 0) {
      const { data: extraPostCounts } = await supabase
        .from('social_accounts')
        .select('id, posts(count)')
        .in('id', Array.from(newConnectorIds));
      for (const sa of extraPostCounts ?? []) {
        const count = (sa.posts as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
        postCountMap.set(sa.id, count);
      }
    }

    // Build a dedup map keyed by platform:username (lowercase)
    const keyOf = (p: Platform, u: string) => `${p}:${u.toLowerCase()}`;
    const merged = new Map<string, ConnectedRow>();
    for (const row of connectorRows) {
      merged.set(keyOf(row.platform, row.username), row);
    }

    const buildFromMatch = <T extends PlatformMatchBase>(
      platform: Platform,
      match: T,
      username: string,
    ): ConnectedRow => {
      // Prefer a connector that belongs to this creator (by mc or profile);
      // fall back to a truly orphan connector (both FKs null) so Janvi-style cases still attach BTSA info;
      // otherwise null — never borrow another creator's connector/BTSA data.
      const candidateConnectors = socialAccountsOf(match);
      const relevantConnector = candidateConnectors.find(
        sa =>
          (sa.managed_creator_id != null && mcIds.includes(sa.managed_creator_id)) ||
          (sa.creator_profile_id != null && sa.creator_profile_id === creatorProfileId),
      ) ?? candidateConnectors.find(sa => sa.managed_creator_id == null && sa.creator_profile_id == null) ?? null;

      const trackedBy = (relevantConnector?.brand_tracked_social_accounts ?? []).map(btsa => ({
        brandName: btsa.brand_organizations?.organization_name ?? 'Unknown',
        brandOrganizationId: btsa.brand_organization_id,
        frozen: btsa.frozen,
      }));

      const sources: AccountSource[] = ['mc_text_platform'];
      const isOrphan =
        relevantConnector != null &&
        relevantConnector.managed_creator_id == null &&
        relevantConnector.creator_profile_id == null;
      if (isOrphan && trackedBy.length > 0) {
        sources.push('btsa_orphan_handle');
      }

      return {
        id: relevantConnector?.id ?? `mctext:${platform}:${match.id}`,
        platform,
        username,
        profileUrl: match.profile_url,
        followerCount: match.follower_count,
        postCount: relevantConnector ? postCountMap.get(relevantConnector.id) ?? 0 : 0,
        accountType: relevantConnector?.account_type ?? 'untracked',
        isActive: relevantConnector?.is_active ?? false,
        lastSyncedAt: match.last_synced_at,
        lastPostsFetchedAt: match.last_posts_fetched_at,
        createdAt: relevantConnector?.created_at ?? null,
        trackedBy,
        managedCreatorId: relevantConnector?.managed_creator_id ?? null,
        creatorProfileId: relevantConnector?.creator_profile_id ?? null,
        platformAccountId: match.id,
        linked: false,
        fkMismatch: false,
        hasAccountRow: true,
        sourcedFromMcText: true,
        sources,
      };
    };

    const addOrMerge = (row: ConnectedRow) => {
      const key = keyOf(row.platform, row.username);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
        return;
      }
      // Connector-sourced row already exists — keep it but flag that text source also points here.
      existing.sourcedFromMcText = existing.sourcedFromMcText || row.sourcedFromMcText;
      if (!existing.platformAccountId) existing.platformAccountId = row.platformAccountId;
      // Union sources (preserve order, dedup).
      for (const s of row.sources) {
        if (!existing.sources.includes(s)) existing.sources.push(s);
      }
      // Inherit BTSA tracking from the text-match path if the primary connector row lacked it.
      if (existing.trackedBy.length === 0 && row.trackedBy.length > 0) {
        existing.trackedBy = row.trackedBy;
      }
    };

    for (const m of tiktokTextMatches) addOrMerge(buildFromMatch('tiktok', m, m.tiktok_username));
    for (const m of instagramTextMatches) addOrMerge(buildFromMatch('instagram', m, m.instagram_username));
    for (const m of youtubeTextMatches) addOrMerge(buildFromMatch('youtube', m, m.youtube_username));

    // Synthetic rows for MC text handles with NO matching platform_accounts row
    const foundUsernames: Record<Platform, Set<string>> = {
      tiktok: new Set(tiktokTextMatches.map(m => m.tiktok_username.toLowerCase())),
      instagram: new Set(instagramTextMatches.map(m => m.instagram_username.toLowerCase())),
      youtube: new Set(youtubeTextMatches.map(m => m.youtube_username.toLowerCase())),
    };
    for (const platform of ['tiktok', 'instagram', 'youtube'] as const) {
      for (const username of mcTextByPlatform[platform].keys()) {
        if (foundUsernames[platform].has(username)) continue;
        const key = keyOf(platform, username);
        if (merged.has(key)) continue;
        merged.set(key, {
          id: `mctext:${platform}:${username}`,
          platform,
          username,
          profileUrl: null,
          followerCount: null,
          postCount: 0,
          accountType: 'untracked',
          isActive: false,
          lastSyncedAt: null,
          lastPostsFetchedAt: null,
          createdAt: null,
          trackedBy: [],
          managedCreatorId: null,
          creatorProfileId: null,
          platformAccountId: null,
          linked: false,
          fkMismatch: false,
          hasAccountRow: false,
          sourcedFromMcText: true,
          sources: ['mc_text_only'],
        });
      }
    }

    // --- Source B: same-brand orphan BTSA ---
    // Connectors tracked by a brand this creator works with, but with both FKs null
    // (no link to any creator). Surfaces typo'd handles + missed admin links for review.
    const mcBrandIds = Array.from(
      new Set(
        rawManagedCreators
          .map(mc => mc.brand_organization_id)
          .filter((v): v is string => v != null),
      ),
    );

    if (mcBrandIds.length > 0) {
      const { data: sameBrandBtsa } = await supabase
        .from('brand_tracked_social_accounts')
        .select('social_account_connector_id')
        .in('brand_organization_id', mcBrandIds)
        .limit(500);

      const candidateConnectorIds = Array.from(
        new Set((sameBrandBtsa ?? []).map(b => b.social_account_connector_id)),
      );

      if (candidateConnectorIds.length > 0) {
        const { data: orphanConnectors } = await supabase
          .from('social_accounts')
          .select(`
            id, account_type, is_active, created_at,
            tiktok_account_id, instagram_account_id, youtube_account_id,
            managed_creator_id, creator_profile_id,
            tiktok_accounts(id, tiktok_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            instagram_accounts(id, instagram_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            youtube_accounts(id, youtube_username, profile_url, follower_count, last_synced_at, last_posts_fetched_at),
            brand_tracked_social_accounts(brand_organization_id, frozen, brand_organizations(organization_name))
          `)
          .in('id', candidateConnectorIds)
          .is('creator_profile_id', null)
          .is('managed_creator_id', null);

        type OrphanRow = ConnectedRaw;
        const orphans = (orphanConnectors ?? []) as OrphanRow[];

        // Backfill post counts for any new connectors
        const newOrphanIds = orphans.map(o => o.id).filter(id => !postCountMap.has(id));
        if (newOrphanIds.length > 0) {
          const { data: orphanPostCounts } = await supabase
            .from('social_accounts')
            .select('id, posts(count)')
            .in('id', newOrphanIds);
          for (const sa of orphanPostCounts ?? []) {
            const count = (sa.posts as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
            postCountMap.set(sa.id, count);
          }
        }

        for (const sa of orphans) {
          let platform: Platform;
          let username: string;
          let profileUrl: string | null = null;
          let followerCount: number | null = null;
          let lastSyncedAt: string | null = null;
          let lastPostsFetchedAt: string | null = null;
          let platformAccountId: string | null = null;

          if (sa.tiktok_accounts) {
            platform = 'tiktok';
            username = sa.tiktok_accounts.tiktok_username;
            profileUrl = sa.tiktok_accounts.profile_url;
            followerCount = sa.tiktok_accounts.follower_count;
            lastSyncedAt = sa.tiktok_accounts.last_synced_at;
            lastPostsFetchedAt = sa.tiktok_accounts.last_posts_fetched_at;
            platformAccountId = sa.tiktok_account_id ?? sa.tiktok_accounts.id;
          } else if (sa.instagram_accounts) {
            platform = 'instagram';
            username = sa.instagram_accounts.instagram_username;
            profileUrl = sa.instagram_accounts.profile_url;
            followerCount = sa.instagram_accounts.follower_count;
            lastSyncedAt = sa.instagram_accounts.last_synced_at;
            lastPostsFetchedAt = sa.instagram_accounts.last_posts_fetched_at;
            platformAccountId = sa.instagram_account_id ?? sa.instagram_accounts.id;
          } else if (sa.youtube_accounts) {
            platform = 'youtube';
            username = sa.youtube_accounts.youtube_username;
            profileUrl = sa.youtube_accounts.profile_url;
            followerCount = sa.youtube_accounts.follower_count;
            lastSyncedAt = sa.youtube_accounts.last_synced_at;
            lastPostsFetchedAt = sa.youtube_accounts.last_posts_fetched_at;
            platformAccountId = sa.youtube_account_id ?? sa.youtube_accounts.id;
          } else {
            continue;
          }

          // Only keep BTSA entries that match her brands (the SA may have unrelated trackers).
          const trackedBy = (sa.brand_tracked_social_accounts ?? [])
            .filter(btsa => mcBrandIds.includes(btsa.brand_organization_id))
            .map(btsa => ({
              brandName: btsa.brand_organizations?.organization_name ?? 'Unknown',
              brandOrganizationId: btsa.brand_organization_id,
              frozen: btsa.frozen,
            }));

          const orphanRow: ConnectedRow = {
            id: `btsa_orphan:${platform}:${username.toLowerCase()}`,
            platform,
            username,
            profileUrl,
            followerCount,
            postCount: postCountMap.get(sa.id) ?? 0,
            accountType: sa.account_type,
            isActive: sa.is_active,
            lastSyncedAt,
            lastPostsFetchedAt,
            createdAt: sa.created_at,
            trackedBy,
            managedCreatorId: null,
            creatorProfileId: null,
            platformAccountId,
            linked: false,
            fkMismatch: false,
            hasAccountRow: true,
            sourcedFromMcText: false,
            sources: ['btsa_same_brand'],
          };

          // If this connector's handle already matches an MC text row, addOrMerge will
          // union sources (e.g. ['mc_text_platform','btsa_orphan_handle','btsa_same_brand']).
          // Use the connector's real id for the merged row when no prior row exists.
          const key = keyOf(platform, username);
          const existing = merged.get(key);
          if (existing) {
            for (const s of orphanRow.sources) {
              if (!existing.sources.includes(s)) existing.sources.push(s);
            }
            if (existing.trackedBy.length === 0 && trackedBy.length > 0) {
              existing.trackedBy = trackedBy;
            }
            if (!existing.platformAccountId) existing.platformAccountId = platformAccountId;
            // Upgrade synthetic ID to real connector UUID so inspector works.
            if (existing.id.startsWith('mctext:') || existing.id.startsWith('btsa_orphan:')) {
              existing.id = sa.id;
              existing.hasAccountRow = true;
            }
          } else {
            merged.set(key, { ...orphanRow, id: sa.id });
          }
        }
      }
    }

    // --- Compute linked / fkMismatch flags against MC FKs + text ---
    const mcFkByPlatform: Record<Platform, Set<string>> = { tiktok: new Set(), instagram: new Set(), youtube: new Set() };
    const mcFkFieldByPlatform: Record<Platform, 'tiktok_account_id' | 'instagram_account_id' | 'youtube_account_id'> = {
      tiktok: 'tiktok_account_id',
      instagram: 'instagram_account_id',
      youtube: 'youtube_account_id',
    };
    // For each (platform, normalized-text-username), accumulate ALL FKs seen across MCs
    // (value may include null when an MC has the text but no FK). fkMismatch fires when
    // no MC with this text has an FK pointing at the row's platform account.
    const mcTextFks: Record<Platform, Map<string, Set<string | null>>> = {
      tiktok: new Map(),
      instagram: new Map(),
      youtube: new Map(),
    };
    for (const mc of rawManagedCreators) {
      for (const platform of ['tiktok', 'instagram', 'youtube'] as const) {
        const rawText = mc[textFieldByPlatform[platform]];
        const fkId = mc[mcFkFieldByPlatform[platform]] ?? null;
        if (rawText) {
          const normalized = extractors[platform](rawText)?.toLowerCase();
          if (normalized) {
            const set = mcTextFks[platform].get(normalized) ?? new Set<string | null>();
            set.add(fkId);
            mcTextFks[platform].set(normalized, set);
          }
        }
        if (fkId) mcFkByPlatform[platform].add(fkId);
      }
    }

    const connectedAccounts: CreatorDetailResponse['connectedAccounts'] = Array.from(merged.values()).map(row => {
      const linked = row.platformAccountId != null && mcFkByPlatform[row.platform].has(row.platformAccountId);
      // FK mismatch: some MC has text matching this row's username, but no MC with that text
      // has an FK pointing at this row's platform account (so the text → account wire is broken).
      const fks = mcTextFks[row.platform].get(row.username.toLowerCase());
      const fkMismatch = fks != null
        && row.platformAccountId != null
        && !fks.has(row.platformAccountId);
      return { ...row, linked, fkMismatch };
    });

    // Flatten post payments
    const postPayments: CreatorDetailResponse['postPayments'] = (postPaymentsRaw as Array<{
      id: string;
      post_id: string;
      managed_creator_id: string;
      base_pay_cents: number;
      bonus_cents: number;
      total_owed_cents: number;
      total_paid_cents: number;
      bonus_milestones: unknown;
      payment_status: string;
      offplatform_method: string | null;
      posts: {
        platform: string;
        post_id: string | null;
        latest_views: number | null;
        thumbnail_url: string | null;
        post_url: string;
        posted_at: string;
      };
      managed_creators: {
        brand_organization_id: string | null;
        brand_organizations: { organization_name: string } | null;
        jobs: { job_title: string } | null;
      };
    }>).map(mcp => ({
      id: mcp.id,
      post_id: mcp.post_id,
      managed_creator_id: mcp.managed_creator_id,
      base_pay_cents: mcp.base_pay_cents,
      bonus_cents: mcp.bonus_cents,
      total_owed_cents: mcp.total_owed_cents,
      total_paid_cents: mcp.total_paid_cents,
      payment_status: mcp.payment_status,
      offplatform_method: mcp.offplatform_method,
      platform: mcp.posts?.platform ?? null,
      native_id: mcp.posts?.post_id ?? null,
      latest_views: mcp.posts?.latest_views ?? null,
      thumbnail_url: mcp.posts?.thumbnail_url ?? null,
      post_url: mcp.posts?.post_url ?? null,
      posted_at: mcp.posts?.posted_at ?? null,
      brand_name: mcp.managed_creators?.brand_organizations?.organization_name ?? null,
      brand_organization_id: mcp.managed_creators?.brand_organization_id ?? null,
      job_title: mcp.managed_creators?.jobs?.job_title ?? null,
      isMispriced: computeIsMispriced(mcp.managed_creator_id, mcp.base_pay_cents, mcp.bonus_milestones),
    }));

    // Backfill any post payments referenced by transactions but outside the 200-row cap
    const existingPpIds = new Set(postPayments.map(p => p.id));
    const missingPpIds = Array.from(new Set(
      transactions
        .map(t => t.managed_creator_post_id)
        .filter((v): v is string => v != null && !existingPpIds.has(v))
    ));
    if (missingPpIds.length > 0) {
      const { data: extraRaw } = await supabase
        .from('managed_creator_posts')
        .select(`
          id, post_id, managed_creator_id,
          base_pay_cents, bonus_cents, total_owed_cents, total_paid_cents,
          bonus_milestones,
          payment_status, offplatform_method,
          posts!inner(platform, post_id, latest_views, thumbnail_url, post_url, posted_at),
          managed_creators!inner(
            brand_organization_id,
            brand_organizations(organization_name),
            jobs(job_title)
          )
        `)
        .in('id', missingPpIds);
      for (const mcp of (extraRaw ?? []) as typeof postPaymentsRaw) {
        const row = mcp as unknown as {
          id: string; post_id: string; managed_creator_id: string;
          base_pay_cents: number; bonus_cents: number; total_owed_cents: number; total_paid_cents: number;
          bonus_milestones: unknown;
          payment_status: string; offplatform_method: string | null;
          posts: { platform: string; post_id: string | null; latest_views: number | null; thumbnail_url: string | null; post_url: string; posted_at: string };
          managed_creators: { brand_organization_id: string | null; brand_organizations: { organization_name: string } | null; jobs: { job_title: string } | null };
        };
        postPayments.push({
          id: row.id,
          post_id: row.post_id,
          managed_creator_id: row.managed_creator_id,
          base_pay_cents: row.base_pay_cents,
          bonus_cents: row.bonus_cents,
          total_owed_cents: row.total_owed_cents,
          total_paid_cents: row.total_paid_cents,
          payment_status: row.payment_status,
          offplatform_method: row.offplatform_method,
          platform: row.posts?.platform ?? null,
          native_id: row.posts?.post_id ?? null,
          latest_views: row.posts?.latest_views ?? null,
          thumbnail_url: row.posts?.thumbnail_url ?? null,
          post_url: row.posts?.post_url ?? null,
          posted_at: row.posts?.posted_at ?? null,
          brand_name: row.managed_creators?.brand_organizations?.organization_name ?? null,
          brand_organization_id: row.managed_creators?.brand_organization_id ?? null,
          job_title: row.managed_creators?.jobs?.job_title ?? null,
          isMispriced: computeIsMispriced(row.managed_creator_id, row.base_pay_cents, row.bonus_milestones),
        });
      }
    }

    // Fetch referral data if user has a share_code
    const shareCode = fetchedUser?.share_code ?? null;
    let referrals: CreatorDetailResponse['referrals'] = {
      shareCode,
      count: 0,
      funnel: { signedUp: 0, videoSubmitted: 0, active: 0 },
      users: [],
    };

    if (shareCode) {
      const { data: referredRaw, count: referredCount } = await supabase
        .from('users')
        .select('id, created_at, referral_bonus_paid_cents', { count: 'exact' })
        .eq('referrer_source', shareCode)
        .order('created_at', { ascending: false })
        .limit(50) as unknown as {
          data: Array<{ id: string; created_at: string | null; referral_bonus_paid_cents: number }> | null;
          count: number | null;
        };

      const referredUsers = referredRaw ?? [];
      const totalCount = referredCount ?? referredUsers.length;

      if (referredUsers.length > 0) {
        const referredIds = referredUsers.map(u => u.id);

        const [profilesRes, mcsRes] = await Promise.all([
          supabase
            .from('creator_profiles')
            .select('id, user_id, first_name, last_name')
            .in('user_id', referredIds),
          supabase
            .from('managed_creators')
            .select('linked_user_id, status, videos_complete, status_changed_at')
            .in('linked_user_id', referredIds),
        ]);

        const profileMap = new Map<string, { id: string; first_name: string | null; last_name: string | null }>();
        for (const p of profilesRes.data ?? []) {
          if (p.user_id) profileMap.set(p.user_id, { id: p.id, first_name: p.first_name, last_name: p.last_name });
        }

        const videoSubmittedIds = new Set<string>();
        const activeIds = new Set<string>();
        const activeSinceMap = new Map<string, string>();
        for (const mc of mcsRes.data ?? []) {
          if (mc.linked_user_id) {
            if (mc.videos_complete) videoSubmittedIds.add(mc.linked_user_id);
            if (mc.status === 'active') {
              activeIds.add(mc.linked_user_id);
              if (mc.status_changed_at) activeSinceMap.set(mc.linked_user_id, mc.status_changed_at);
            }
          }
        }

        let videoSubmittedCount = 0;
        let activeCount = 0;

        const mappedUsers = referredUsers.map(u => {
          const p = profileMap.get(u.id);
          let stage: 'signed_up' | 'video_submitted' | 'active' = 'signed_up';
          if (activeIds.has(u.id)) {
            stage = 'active';
            activeCount++;
            videoSubmittedCount++;
          } else if (videoSubmittedIds.has(u.id)) {
            stage = 'video_submitted';
            videoSubmittedCount++;
          }
          let daysActive: number | null = null;
          if (stage === 'active') {
            const since = activeSinceMap.get(u.id);
            if (since) {
              daysActive = Math.floor((Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24));
            }
          }
          return {
            id: u.id,
            firstName: p?.first_name ?? null,
            lastInitial: p?.last_name?.[0] ?? null,
            creatorProfileId: p?.id ?? null,
            createdAt: u.created_at ?? new Date().toISOString(),
            stage,
            daysActive,
            paidCents: u.referral_bonus_paid_cents ?? 0,
          };
        });

        referrals = {
          shareCode,
          count: totalCount,
          funnel: { signedUp: totalCount, videoSubmitted: videoSubmittedCount, active: activeCount },
          users: mappedUsers,
        };
      } else {
        referrals = { shareCode, count: totalCount, funnel: { signedUp: totalCount, videoSubmitted: 0, active: 0 }, users: [] };
      }
    }

    const response: CreatorDetailResponse = {
      profile,
      user: fetchedUser ? { id: fetchedUser.id, email: fetchedUser.email, country: fetchedUser.country, last_active_at: fetchedUser.last_active_at } : null,
      managedCreators: mappedManagedCreators,
      videos,
      socialAccounts,
      wallet,
      transactions,
      stripe,
      postPayments,
      connectedAccounts,
      referrals,
    };

    return Response.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/creators/[id]',
      method: 'GET',
    });
  }
}

// Allowed fields that can be updated via PATCH
const ALLOWED_UPDATE_FIELDS = [
  'display_name',
  'bio',
  'location',
  'work_status',
  'account_status',
] as const;

/**
 * Updates a creator profile field (admin-only).
 * Supports partial updates for allowed fields.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;

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

    // Parse request body
    const body = await request.json();

    // Filter to only allowed fields
    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update the creator profile
    // Use maybeSingle so 0-row updates don't error — lets us distinguish "not found" from DB errors
    const profileSelect = 'id, display_name, bio, location, work_status, account_status, user_id';
    const { data: directProfile, error: updateError } = await supabase
      .from('creator_profiles')
      .update(updates)
      .eq('id', id)
      .select(profileSelect)
      .maybeSingle();

    if (updateError) {
      console.error('Error updating creator profile:', updateError);
      return Response.json({ error: 'Failed to update creator profile' }, { status: 500 });
    }

    // If no creator_profile matched, id may be a managed_creator UUID (fallback/synthetic profile)
    let updatedProfile = directProfile;
    if (!updatedProfile) {
      const { data: mc } = await supabase
        .from('managed_creators')
        .select('linked_creator_profile_id, linked_user_id')
        .eq('id', id)
        .maybeSingle();

      if (!mc) {
        return Response.json({ error: 'Creator not found' }, { status: 404 });
      }

      if (mc.linked_creator_profile_id) {
        // MC has a linked profile — retry the update with the real creator_profiles id
        const { data: resolvedProfile, error: resolvedError } = await supabase
          .from('creator_profiles')
          .update(updates)
          .eq('id', mc.linked_creator_profile_id)
          .select(profileSelect)
          .single();
        if (resolvedError || !resolvedProfile) {
          console.error('Error updating creator profile via managed_creator:', resolvedError);
          return Response.json({ error: 'Failed to update creator profile' }, { status: 500 });
        }
        updatedProfile = resolvedProfile;
      } else if (mc.linked_user_id && 'account_status' in updates) {
        // Synthetic profile (no creator_profiles row) — auth ban still applies
        updatedProfile = {
          id,
          display_name: '',
          bio: null,
          location: null,
          work_status: null,
          account_status: updates.account_status as 'active' | 'suspended' | 'deactivated',
          user_id: mc.linked_user_id,
        };
      } else {
        return Response.json({ error: 'Creator not found' }, { status: 404 });
      }
    }

    // Sync ban status to Supabase Auth when account_status changes
    const { user_id: _userId, ...responseProfile } = updatedProfile;

    if ('account_status' in updates && updatedProfile.user_id) {
      const newStatus = updates.account_status as string;
      const isBanning = newStatus === 'suspended' || newStatus === 'deactivated';
      const isUnbanning = newStatus === 'active';

      if (isBanning || isUnbanning) {
        const BAN_DURATION_PERMANENT = '876000h'; // ~100 years
        const { data: identity } = await supabase
          .from('user_identities')
          .select('provider_id')
          .eq('internal_user_id', updatedProfile.user_id)
          .eq('provider', 'supabase_auth')
          .maybeSingle();

        if (identity?.provider_id) {
          const { error: authError } = await supabase.auth.admin.updateUserById(
            identity.provider_id,
            { ban_duration: isBanning ? BAN_DURATION_PERMANENT : 'none' }
          );
          if (authError) {
            console.error('Error updating Supabase Auth ban status:', authError);
            return Response.json({
              ...responseProfile,
              warning: 'Profile updated but failed to sync auth ban status. User may still be able to sign in.',
            });
          }
        } else {
          console.warn('No Supabase Auth identity found for user:', updatedProfile.user_id);
          return Response.json({
            ...responseProfile,
            warning: 'Profile updated but no Supabase Auth identity found. User may still be able to sign in.',
          });
        }
      }
    }

    return Response.json(responseProfile);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/creators/[id]',
      method: 'PATCH',
    });
  }
}
