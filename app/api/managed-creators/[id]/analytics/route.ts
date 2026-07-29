import { NextResponse, NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

// Calculation modes
type CalculationMode = 'days' | 'posts';

// Analytics response types
interface AccountAnalytics {
  platform: 'tiktok' | 'instagram' | 'youtube';
  username: string;
  views: number;
  posts: number;
  cpm: number | null;
}

interface VideoAnalytics {
  id: string;
  postUrl: string | null;
  views: number;
  postedAt: string | null;
  cpm: number | null;
  platform: 'tiktok' | 'instagram' | 'youtube';
  included: boolean;
}

interface AnalyticsMeta {
  firstPostDate: string | null;
  lastPostDate: string | null;
  daysInRange: number;
  effectivePay: number;
  calculationMode: CalculationMode;
  includedPostCount: number;
  excludedPostCount: number;
  totalPostCount: number;
  platforms: ('tiktok' | 'instagram' | 'youtube')[] | null; // null means all
}

interface CreatorAnalyticsResponse {
  creator: {
    id: string;
    name: string;
    basePay: number;
  };
  totals: {
    views: number;
    posts: number;
    cpm: number | null;
  };
  byAccount: AccountAnalytics[];
  byVideo: VideoAnalytics[];
  meta: AnalyticsMeta;
}

async function getBrandContext(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabase = createServiceRoleClient();

  // Check if user is a global admin
  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.account_type === 'admin';

  // Check for admin view-as-brand header
  const viewAsBrandId = request.headers.get('x-admin-view-as-brand');
  if (viewAsBrandId && isAdmin) {
    return { user, supabase, brandId: viewAsBrandId, isAdmin: true };
  }

  // If admin without view-as context, they can access all
  if (isAdmin) {
    return { user, supabase, brandId: null, isAdmin: true };
  }

  // Check if user is a brand member with admin or owner role
  const { data: brandMember } = await supabase
    .from('brand_members')
    .select('brand_organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (!brandMember || (brandMember.role !== 'owner' && brandMember.role !== 'admin')) {
    return { error: 'Forbidden: Admin access required', status: 403 };
  }

  return { user, supabase, brandId: brandMember.brand_organization_id, isAdmin: false };
}

async function verifyCreatorAccess(
  supabase: ReturnType<typeof createServiceRoleClient>,
  creatorId: string,
  brandId: string | null,
  isAdmin: boolean
) {
  const { data: creator, error } = await supabase
    .from('managed_creators')
    .select('id, name, base_pay, brand_organization_id, tiktok_account_id, instagram_account_id, youtube_account_id, tiktok_username, instagram_username, youtube_username')
    .eq('id', creatorId)
    .single();

  if (error || !creator) {
    return { error: 'Creator not found', status: 404 };
  }

  // Non-admins must have a brand context and it must match the creator's brand
  if (!isAdmin && (!brandId || creator.brand_organization_id !== brandId)) {
    return { error: 'Access denied', status: 403 };
  }

  return { creator };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { id } = await params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const modeParam = searchParams.get('mode') as CalculationMode | null;
    const excludedPostIdsParam = searchParams.get('excludedPostIds');
    const platformsParam = searchParams.get('platforms');

    const calculationMode: CalculationMode = modeParam === 'posts' ? 'posts' : 'days';
    const excludedPostIds = excludedPostIdsParam
      ? new Set(excludedPostIdsParam.split(',').filter(Boolean))
      : new Set<string>();
    const platforms = platformsParam
      ? new Set(platformsParam.split(',').filter(Boolean) as ('tiktok' | 'instagram' | 'youtube')[])
      : null; // null means all platforms

    // Verify access and get creator data
    const access = await verifyCreatorAccess(
      context.supabase,
      id,
      context.brandId,
      context.isAdmin
    );
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { creator } = access;
    const basePay = Number(creator.base_pay) || 0;

    // Collect platform account IDs from managed creator
    const tiktokAccountIds: string[] = [];
    const instagramAccountIds: string[] = [];
    const youtubeAccountIds: string[] = [];

    if (creator.tiktok_account_id) {
      tiktokAccountIds.push(creator.tiktok_account_id);
    }
    if (creator.instagram_account_id) {
      instagramAccountIds.push(creator.instagram_account_id);
    }
    if (creator.youtube_account_id) {
      youtubeAccountIds.push(creator.youtube_account_id);
    }

    // Also check social_accounts table for any linked accounts
    const { data: socialAccounts } = await context.supabase
      .from('social_accounts')
      .select('tiktok_account_id, instagram_account_id, youtube_account_id')
      .eq('managed_creator_id', id);

    if (socialAccounts) {
      for (const sa of socialAccounts) {
        if (sa.tiktok_account_id && !tiktokAccountIds.includes(sa.tiktok_account_id)) {
          tiktokAccountIds.push(sa.tiktok_account_id);
        }
        if (sa.instagram_account_id && !instagramAccountIds.includes(sa.instagram_account_id)) {
          instagramAccountIds.push(sa.instagram_account_id);
        }
        if (sa.youtube_account_id && !youtubeAccountIds.includes(sa.youtube_account_id)) {
          youtubeAccountIds.push(sa.youtube_account_id);
        }
      }
    }

    // Fallback: look up accounts by username when IDs are not linked
    if (tiktokAccountIds.length === 0 && creator.tiktok_username) {
      const { data: ttAccount } = await context.supabase
        .from('tiktok_accounts')
        .select('id')
        .eq('tiktok_username', creator.tiktok_username)
        .limit(1)
        .maybeSingle();
      if (ttAccount) tiktokAccountIds.push(ttAccount.id);
    }
    if (instagramAccountIds.length === 0 && creator.instagram_username) {
      const { data: igAccount } = await context.supabase
        .from('instagram_accounts')
        .select('id')
        .eq('instagram_username', creator.instagram_username)
        .limit(1)
        .maybeSingle();
      if (igAccount) instagramAccountIds.push(igAccount.id);
    }
    if (youtubeAccountIds.length === 0 && creator.youtube_username) {
      const { data: ytAccount } = await context.supabase
        .from('youtube_accounts')
        .select('id')
        .eq('youtube_username', creator.youtube_username)
        .limit(1)
        .maybeSingle();
      if (ytAccount) youtubeAccountIds.push(ytAccount.id);
    }

    // If no accounts found, return empty analytics
    if (tiktokAccountIds.length === 0 && instagramAccountIds.length === 0 && youtubeAccountIds.length === 0) {
      const response: CreatorAnalyticsResponse = {
        creator: {
          id: creator.id,
          name: creator.name,
          basePay,
        },
        totals: {
          views: 0,
          posts: 0,
          cpm: null,
        },
        byAccount: [],
        byVideo: [],
        meta: {
          firstPostDate: null,
          lastPostDate: null,
          daysInRange: 0,
          effectivePay: 0,
          calculationMode,
          includedPostCount: 0,
          excludedPostCount: 0,
          totalPostCount: 0,
          platforms: platforms ? Array.from(platforms) : null,
        },
      };
      return NextResponse.json(response);
    }

    // Fetch account usernames for display
    const accountUsernames: Map<string, { platform: 'tiktok' | 'instagram' | 'youtube'; username: string }> =
      new Map();

    if (tiktokAccountIds.length > 0) {
      const { data: tiktokAccounts } = await context.supabase
        .from('tiktok_accounts')
        .select('id, tiktok_username')
        .in('id', tiktokAccountIds);

      if (tiktokAccounts) {
        for (const ta of tiktokAccounts) {
          accountUsernames.set(ta.id, {
            platform: 'tiktok',
            username: ta.tiktok_username || 'unknown',
          });
        }
      }
    }

    if (instagramAccountIds.length > 0) {
      const { data: instagramAccounts } = await context.supabase
        .from('instagram_accounts')
        .select('id, instagram_username')
        .in('id', instagramAccountIds);

      if (instagramAccounts) {
        for (const ia of instagramAccounts) {
          accountUsernames.set(ia.id, {
            platform: 'instagram',
            username: ia.instagram_username || 'unknown',
          });
        }
      }
    }

    if (youtubeAccountIds.length > 0) {
      const { data: youtubeAccounts } = await context.supabase
        .from('youtube_accounts')
        .select('id, youtube_username')
        .in('id', youtubeAccountIds);

      if (youtubeAccounts) {
        for (const ya of youtubeAccounts) {
          accountUsernames.set(ya.id, {
            platform: 'youtube',
            username: ya.youtube_username || 'unknown',
          });
        }
      }
    }

    // Build OR filter for posts query
    const orFilters: string[] = [];
    if (tiktokAccountIds.length > 0) {
      orFilters.push(`tiktok_account_id.in.(${tiktokAccountIds.join(',')})`);
    }
    if (instagramAccountIds.length > 0) {
      orFilters.push(`instagram_account_id.in.(${instagramAccountIds.join(',')})`);
    }
    if (youtubeAccountIds.length > 0) {
      orFilters.push(`youtube_account_id.in.(${youtubeAccountIds.join(',')})`);
    }

    // Fetch posts for all linked accounts
    let postsQuery = context.supabase
      .from('posts')
      .select(
        'id, post_url, posted_at, latest_views, platform, tiktok_account_id, instagram_account_id, youtube_account_id'
      )
      .or(orFilters.join(','))
      .eq('tracking_status', 'active');

    // Apply date filters if provided
    if (startDateParam) {
      postsQuery = postsQuery.gte('posted_at', startDateParam);
    }
    if (endDateParam) {
      postsQuery = postsQuery.lte('posted_at', endDateParam);
    }

    const { data: posts, error: postsError } = await postsQuery.order('posted_at', {
      ascending: false,
    });

    if (postsError) {
      console.error('[GET /api/managed-creators/[id]/analytics] Error fetching posts:', postsError);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    const allPosts = posts || [];
    const totalPostCount = allPosts.length;

    // Determine first and last post dates (from filtered results)
    const sortedByDate = [...allPosts].sort((a, b) => {
      if (!a.posted_at) return 1;
      if (!b.posted_at) return -1;
      return new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime();
    });
    const firstPostDate = sortedByDate[0]?.posted_at || null;
    const lastPostDate = sortedByDate[sortedByDate.length - 1]?.posted_at || null;

    // Helper to check if a post is included based on all filters
    const isPostIncluded = (post: (typeof allPosts)[0]) => {
      // Check platform filter
      if (platforms && !platforms.has(post.platform as 'tiktok' | 'instagram' | 'youtube')) {
        return false;
      }
      // Check manual exclusion
      if (excludedPostIds.has(post.id)) {
        return false;
      }
      return true;
    };

    // Separate included and excluded posts
    const includedPosts = allPosts.filter(isPostIncluded);
    const excludedPostCount = allPosts.length - includedPosts.length;

    // Calculate totals (only from included posts)
    const totalViews = includedPosts.reduce((sum, post) => sum + (post.latest_views || 0), 0);
    const includedPostCount = includedPosts.length;

    // Calculate days in range
    let daysInRange = 0;
    if (firstPostDate && lastPostDate) {
      const start = startDateParam ? new Date(startDateParam) : new Date(firstPostDate);
      const end = endDateParam ? new Date(endDateParam) : new Date();
      daysInRange = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Calculate effective pay based on mode
    let effectivePay = 0;
    if (calculationMode === 'days') {
      // Time-based: base_pay × (days_in_range / 30)
      effectivePay = basePay * (daysInRange / 30);
    } else {
      // Post-based: base_pay × (included_posts / 30)
      effectivePay = basePay * (includedPostCount / 30);
    }

    // Calculate CPM: (effective_pay / total_views) * 1000
    const totalCpm = effectivePay > 0 && totalViews > 0 ? (effectivePay / totalViews) * 1000 : null;

    // Calculate per-video cost based on effective pay and included posts
    const perVideoCost = includedPostCount > 0 ? effectivePay / includedPostCount : 0;

    // Aggregate by account (only included posts)
    const accountStats: Map<string, { views: number; posts: number }> = new Map();

    for (const post of includedPosts) {
      const accountId = post.tiktok_account_id || post.instagram_account_id || post.youtube_account_id;
      if (!accountId) continue;

      const current = accountStats.get(accountId) || { views: 0, posts: 0 };
      current.views += post.latest_views || 0;
      current.posts += 1;
      accountStats.set(accountId, current);
    }

    // Build byAccount array
    const byAccount: AccountAnalytics[] = [];
    for (const [accountId, stats] of accountStats) {
      const accountInfo = accountUsernames.get(accountId);
      if (!accountInfo) continue;

      const accountCpm =
        effectivePay > 0 && totalViews > 0 ? (effectivePay / totalViews) * 1000 : null;

      byAccount.push({
        platform: accountInfo.platform,
        username: accountInfo.username,
        views: stats.views,
        posts: stats.posts,
        cpm: accountCpm ? Math.round(accountCpm * 100) / 100 : null,
      });
    }

    // Sort by views descending
    byAccount.sort((a, b) => b.views - a.views);

    // Build byVideo array with CPM per video (show all posts, mark included/excluded)
    const byVideo: VideoAnalytics[] = allPosts.map((post) => {
      const views = post.latest_views || 0;
      const isIncluded = isPostIncluded(post);
      // Only calculate CPM for included posts
      const videoCpm = isIncluded && views > 0 ? (perVideoCost / views) * 1000 : null;

      return {
        id: post.id,
        postUrl: post.post_url,
        views,
        postedAt: post.posted_at,
        cpm: videoCpm ? Math.round(videoCpm * 100) / 100 : null,
        platform: post.platform as 'tiktok' | 'instagram' | 'youtube',
        included: isIncluded,
      };
    });

    // Sort by posted_at descending (newest first)
    byVideo.sort((a, b) => {
      if (!a.postedAt) return 1;
      if (!b.postedAt) return -1;
      return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    });

    const response: CreatorAnalyticsResponse = {
      creator: {
        id: creator.id,
        name: creator.name,
        basePay,
      },
      totals: {
        views: totalViews,
        posts: includedPostCount,
        cpm: totalCpm ? Math.round(totalCpm * 100) / 100 : null,
      },
      byAccount,
      byVideo,
      meta: {
        firstPostDate,
        lastPostDate,
        daysInRange,
        effectivePay: Math.round(effectivePay * 100) / 100,
        calculationMode,
        includedPostCount,
        excludedPostCount,
        totalPostCount,
        platforms: platforms ? Array.from(platforms) : null,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/[id]/analytics',
      method: 'GET',
    });
  }
}
