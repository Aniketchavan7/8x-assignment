import { NextResponse, NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

interface PlatformStats {
  views: number;
  posts: number;
  cpm: number | null;
}

interface AggregateStatsResponse {
  all: PlatformStats;
  tiktok: PlatformStats;
  instagram: PlatformStats;
  meta: {
    totalCreators: number;
    creatorsWithPosts: number;
    totalBasePay: number;
  };
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

export async function GET(request: NextRequest) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { supabase, brandId, isAdmin } = context;

    // Fetch all managed creators for this brand
    let creatorsQuery = supabase
      .from('managed_creators')
      .select('id, base_pay, tiktok_account_id, instagram_account_id');

    if (!isAdmin && brandId) {
      creatorsQuery = creatorsQuery.eq('brand_organization_id', brandId);
    } else if (brandId) {
      // Admin viewing as specific brand
      creatorsQuery = creatorsQuery.eq('brand_organization_id', brandId);
    }

    const { data: creators, error: creatorsError } = await creatorsQuery;

    if (creatorsError) {
      console.error(
        '[GET /api/managed-creators/aggregate-stats] Error fetching creators:',
        creatorsError
      );
      return NextResponse.json({ error: 'Failed to fetch creators' }, { status: 500 });
    }

    if (!creators || creators.length === 0) {
      const emptyStats: PlatformStats = { views: 0, posts: 0, cpm: null };
      return NextResponse.json({
        all: emptyStats,
        tiktok: emptyStats,
        instagram: emptyStats,
        meta: {
          totalCreators: 0,
          creatorsWithPosts: 0,
          totalBasePay: 0,
        },
      } as AggregateStatsResponse);
    }

    // Collect all account IDs
    const tiktokAccountIds: string[] = [];
    const instagramAccountIds: string[] = [];
    let totalBasePay = 0;

    for (const creator of creators) {
      totalBasePay += Number(creator.base_pay) || 0;
      if (creator.tiktok_account_id) {
        tiktokAccountIds.push(creator.tiktok_account_id);
      }
      if (creator.instagram_account_id) {
        instagramAccountIds.push(creator.instagram_account_id);
      }
    }

    // Also check social_accounts table for any additional linked accounts
    const creatorIds = creators.map((c) => c.id);
    const { data: socialAccounts } = await supabase
      .from('social_accounts')
      .select('tiktok_account_id, instagram_account_id')
      .in('managed_creator_id', creatorIds);

    if (socialAccounts) {
      for (const sa of socialAccounts) {
        if (sa.tiktok_account_id && !tiktokAccountIds.includes(sa.tiktok_account_id)) {
          tiktokAccountIds.push(sa.tiktok_account_id);
        }
        if (sa.instagram_account_id && !instagramAccountIds.includes(sa.instagram_account_id)) {
          instagramAccountIds.push(sa.instagram_account_id);
        }
      }
    }

    // If no accounts linked, return empty stats
    if (tiktokAccountIds.length === 0 && instagramAccountIds.length === 0) {
      const emptyStats: PlatformStats = { views: 0, posts: 0, cpm: null };
      return NextResponse.json({
        all: emptyStats,
        tiktok: emptyStats,
        instagram: emptyStats,
        meta: {
          totalCreators: creators.length,
          creatorsWithPosts: 0,
          totalBasePay,
        },
      } as AggregateStatsResponse);
    }

    // Build OR filter for posts query
    const orFilters: string[] = [];
    if (tiktokAccountIds.length > 0) {
      orFilters.push(`tiktok_account_id.in.(${tiktokAccountIds.join(',')})`);
    }
    if (instagramAccountIds.length > 0) {
      orFilters.push(`instagram_account_id.in.(${instagramAccountIds.join(',')})`);
    }

    // Fetch all posts for linked accounts
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, latest_views, platform, tiktok_account_id, instagram_account_id')
      .or(orFilters.join(','))
      .eq('tracking_status', 'active');

    if (postsError) {
      console.error(
        '[GET /api/managed-creators/aggregate-stats] Error fetching posts:',
        postsError
      );
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
    }

    const allPosts = posts || [];

    // Calculate stats per platform
    let tiktokViews = 0;
    let tiktokPosts = 0;
    let instagramViews = 0;
    let instagramPosts = 0;

    const accountsWithPosts = new Set<string>();

    for (const post of allPosts) {
      const views = post.latest_views || 0;
      if (post.platform === 'tiktok') {
        tiktokViews += views;
        tiktokPosts += 1;
        if (post.tiktok_account_id) accountsWithPosts.add(post.tiktok_account_id);
      } else if (post.platform === 'instagram') {
        instagramViews += views;
        instagramPosts += 1;
        if (post.instagram_account_id) accountsWithPosts.add(post.instagram_account_id);
      }
    }

    const totalViews = tiktokViews + instagramViews;
    const totalPosts = tiktokPosts + instagramPosts;

    // Calculate CPM: (totalBasePay / totalViews) * 1000
    // This is a simplified aggregate CPM based on monthly base pay
    const calculateCpm = (views: number): number | null => {
      if (views === 0 || totalBasePay === 0) return null;
      return Math.round((totalBasePay / views) * 1000 * 100) / 100;
    };

    // Count creators with posts
    const creatorsWithPosts = creators.filter((c) => {
      const hasTiktokPosts = c.tiktok_account_id && accountsWithPosts.has(c.tiktok_account_id);
      const hasInstagramPosts =
        c.instagram_account_id && accountsWithPosts.has(c.instagram_account_id);
      return hasTiktokPosts || hasInstagramPosts;
    }).length;

    const response: AggregateStatsResponse = {
      all: {
        views: totalViews,
        posts: totalPosts,
        cpm: calculateCpm(totalViews),
      },
      tiktok: {
        views: tiktokViews,
        posts: tiktokPosts,
        cpm: calculateCpm(tiktokViews),
      },
      instagram: {
        views: instagramViews,
        posts: instagramPosts,
        cpm: calculateCpm(instagramViews),
      },
      meta: {
        totalCreators: creators.length,
        creatorsWithPosts,
        totalBasePay: Math.round(totalBasePay * 100) / 100,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/aggregate-stats',
      method: 'GET',
    });
  }
}
