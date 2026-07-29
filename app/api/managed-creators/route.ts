import { NextResponse, NextRequest } from 'next/server';
import { findOrCreatePlatformAccountWithConnector } from '@/lib/db/social-accounts';
import { validateAndExtractUsername } from '@/lib/utils/social-username';
import { handleApiError } from '@/lib/utils/api-error';
import { getBrandContext, triggerAccountSync } from '@/lib/modules/managed-creators/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/managed-creators
 * List managed creators (filtered by brand context)
 * Includes per-creator analytics: totalViews and CPM
 *
 * Query params:
 * - platform: 'tiktok' | 'instagram' | 'all' (default: 'all') - filter stats by platform
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    // Parse platform filter from query params
    const { searchParams } = new URL(request.url);
    const platformFilter = searchParams.get('platform') as 'tiktok' | 'instagram' | 'all' | null;
    const filterPlatform =
      platformFilter === 'tiktok' || platformFilter === 'instagram' ? platformFilter : 'all';

    let query = context.supabase
      .from('managed_creators')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter by brand if we have brand context
    if (context.brandId) {
      query = query.eq('brand_organization_id', context.brandId);
    }

    const { data: creators, error } = await query;

    if (error) {
      console.error('[GET /api/managed-creators] DB Error:', error);
      return NextResponse.json({ error: 'Failed to fetch managed creators' }, { status: 500 });
    }

    if (!creators || creators.length === 0) {
      return NextResponse.json([]);
    }

    // Collect account IDs based on platform filter
    const tiktokAccountIds: string[] = [];
    const instagramAccountIds: string[] = [];

    for (const creator of creators) {
      // Only collect account IDs for the filtered platform(s)
      if (filterPlatform === 'all' || filterPlatform === 'tiktok') {
        if (creator.tiktok_account_id) tiktokAccountIds.push(creator.tiktok_account_id);
      }
      if (filterPlatform === 'all' || filterPlatform === 'instagram') {
        if (creator.instagram_account_id) instagramAccountIds.push(creator.instagram_account_id);
      }
    }

    // Build OR filter for posts query based on platform
    const orFilters: string[] = [];
    if (tiktokAccountIds.length > 0) {
      orFilters.push(`tiktok_account_id.in.(${tiktokAccountIds.join(',')})`);
    }
    if (instagramAccountIds.length > 0) {
      orFilters.push(`instagram_account_id.in.(${instagramAccountIds.join(',')})`);
    }

    // Build account-to-creator lookup
    const accountToCreatorId = new Map<string, string>();
    for (const creator of creators) {
      if (creator.tiktok_account_id) {
        accountToCreatorId.set(creator.tiktok_account_id, creator.id);
      }
      if (creator.instagram_account_id) {
        accountToCreatorId.set(creator.instagram_account_id, creator.id);
      }
    }

    // Fetch posts and aggregate views per creator
    const creatorStats = new Map<string, { views: number; posts: number }>();

    if (orFilters.length > 0) {
      let postsQuery = context.supabase
        .from('posts')
        .select('tiktok_account_id, instagram_account_id, latest_views, platform')
        .or(orFilters.join(','))
        .eq('tracking_status', 'active');

      // Filter by platform if specified
      if (filterPlatform !== 'all') {
        postsQuery = postsQuery.eq('platform', filterPlatform);
      }

      const { data: posts } = await postsQuery;

      if (posts) {
        for (const post of posts) {
          const accountId = post.tiktok_account_id || post.instagram_account_id;
          if (!accountId) continue;

          const creatorId = accountToCreatorId.get(accountId);
          if (!creatorId) continue;

          const current = creatorStats.get(creatorId) || { views: 0, posts: 0 };
          current.views += post.latest_views || 0;
          current.posts += 1;
          creatorStats.set(creatorId, current);
        }
      }
    }

    // Enrich creators with stats
    const enrichedCreators = creators.map((creator) => {
      const stats = creatorStats.get(creator.id);
      const basePay = Number(creator.base_pay) || 0;

      let totalViews: number | null = null;
      let cpm: number | null = null;

      if (stats && stats.views > 0) {
        totalViews = stats.views;
        // CPM = (basePay / views) * 1000
        if (basePay > 0) {
          cpm = Math.round((basePay / stats.views) * 1000 * 100) / 100;
        }
      }

      return {
        ...creator,
        total_views: totalViews,
        cpm,
      };
    });

    return NextResponse.json(enrichedCreators);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators',
      method: 'GET',
    });
  }
}

/**
 * POST /api/managed-creators
 * Create a new managed creator (requires brand context)
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const body = await request.json();

    // Determine brand context: header > body (admin only) > brand member
    let brandIdToUse = context.brandId;
    if (!brandIdToUse && context.isAdmin && body.brand_organization_id) {
      brandIdToUse = body.brand_organization_id;
    }

    if (!brandIdToUse) {
      return NextResponse.json(
        {
          error:
            'Brand context required. Use x-admin-view-as-brand header or provide brand_organization_id in body.',
        },
        { status: 400 }
      );
    }

    // Check if importing an existing creator profile
    const linkedCreatorProfileId = body.linked_creator_profile_id || null;

    // If linking to existing creator, check if already exists for this brand
    if (linkedCreatorProfileId) {
      const { data: existing } = await context.supabase
        .from('managed_creators')
        .select('id')
        .eq('brand_organization_id', brandIdToUse)
        .eq('linked_creator_profile_id', linkedCreatorProfileId)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'This creator is already in your roster' },
          { status: 409 }
        );
      }
    }

    // If email provided, check if already exists for this brand
    if (body.email) {
      const { data: existing } = await context.supabase
        .from('managed_creators')
        .select('id')
        .eq('brand_organization_id', brandIdToUse)
        .eq('email', body.email)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'A creator with this email is already in your roster' },
          { status: 409 }
        );
      }
    }

    // Validate and extract usernames
    let tiktokUsername: string | null = null;
    let instagramUsername: string | null = null;

    if (body.tiktok_username) {
      const tiktokValidation = validateAndExtractUsername(body.tiktok_username, 'tiktok');
      if ('error' in tiktokValidation) {
        return NextResponse.json({ error: `TikTok: ${tiktokValidation.error}` }, { status: 400 });
      }
      tiktokUsername = tiktokValidation.username;
    }

    if (body.instagram_username) {
      const instagramValidation = validateAndExtractUsername(body.instagram_username, 'instagram');
      if ('error' in instagramValidation) {
        return NextResponse.json(
          { error: `Instagram: ${instagramValidation.error}` },
          { status: 400 }
        );
      }
      instagramUsername = instagramValidation.username;
    }

    const { data: creator, error } = await context.supabase
      .from('managed_creators')
      .insert({
        brand_organization_id: brandIdToUse,
        linked_creator_profile_id: linkedCreatorProfileId,
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        location: body.location || null,
        tiktok_username: tiktokUsername,
        instagram_username: instagramUsername,
        tiktok_added_at: tiktokUsername ? body.tiktok_added_at || new Date().toISOString() : null,
        instagram_added_at: instagramUsername
          ? body.instagram_added_at || new Date().toISOString()
          : null,
        status: body.status || 'applied',
        base_pay: body.base_pay || 0,
        payment: body.payment || null,
        payment_method: body.payment_method || 'pending',
        payout_frequency: body.payout_frequency || 'monthly',
        sourced: body.sourced || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/managed-creators] Error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This creator is already in your roster' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to create creator' }, { status: 500 });
    }

    // Create social_accounts connector entries and get platform account IDs
    // Track if accounts were previously owned by a creator for UI notification
    let tiktokAccountId: string | null = null;
    let instagramAccountId: string | null = null;
    let tiktokCreated = false;
    let instagramCreated = false;
    const previouslyOwnedByCreator: { tiktok?: boolean; instagram?: boolean } = {};

    if (tiktokUsername) {
      const result = await findOrCreatePlatformAccountWithConnector(context.supabase, {
        platform: 'tiktok',
        username: tiktokUsername,
        source: 'managed_creator',
        accountType: 'brand_owned',
        managedCreatorId: creator.id,
      });
      if (result) {
        tiktokAccountId = result.platformAccount.id;
        tiktokCreated = result.created;
        if (result.previouslyOwnedByCreator) {
          previouslyOwnedByCreator.tiktok = true;
        }
      }
    }

    if (instagramUsername) {
      const result = await findOrCreatePlatformAccountWithConnector(context.supabase, {
        platform: 'instagram',
        username: instagramUsername,
        source: 'managed_creator',
        accountType: 'brand_owned',
        managedCreatorId: creator.id,
      });
      if (result) {
        instagramAccountId = result.platformAccount.id;
        instagramCreated = result.created;
        if (result.previouslyOwnedByCreator) {
          previouslyOwnedByCreator.instagram = true;
        }
      }
    }

    // Update managed_creator with platform account FKs
    let updatedCreator = creator;
    if (tiktokAccountId || instagramAccountId) {
      const { data: updated } = await context.supabase
        .from('managed_creators')
        .update({
          tiktok_account_id: tiktokAccountId,
          instagram_account_id: instagramAccountId,
        })
        .eq('id', creator.id)
        .select()
        .single();

      if (updated) {
        updatedCreator = updated;
      }

      // Trigger sync for new accounts (no BTSA link — managed creators are decoupled)
      if (tiktokAccountId && tiktokUsername) {
        await triggerAccountSync('tiktok', tiktokUsername, tiktokAccountId);
      }
      if (instagramAccountId && instagramUsername) {
        await triggerAccountSync('instagram', instagramUsername, instagramAccountId);
      }
    }

    // Return creator with metadata about previous ownership (for UI notification)
    const hasPreviousOwnership =
      previouslyOwnedByCreator.tiktok || previouslyOwnedByCreator.instagram;
    return NextResponse.json({
      ...updatedCreator,
      ...(hasPreviousOwnership && { _meta: { previouslyOwnedByCreator } }),
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators',
      method: 'POST',
    });
  }
}
