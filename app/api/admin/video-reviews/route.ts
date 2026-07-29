export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureDbError } from '@/lib/analytics/capture-error';

/**
 * GET /api/admin/video-reviews
 *
 * List managed_creator_posts for admin review with post data, creator data, and review history.
 *
 * Query params:
 *   tab       - unreviewed | reviewed | feedback (default: unreviewed)
 *   brand_id  - Filter by brand organization ID
 *   job_id    - Filter by job ID
 *   creator_id - Filter by managed_creator_id
 *   post      - Specific managed_creator_post ID (deep link from Slack)
 *   page      - Page number (default 1)
 *   limit     - Items per page (default 20, max 50)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (!userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get('tab') || 'unreviewed';
    const brandId = searchParams.get('brand_id');
    const jobId = searchParams.get('job_id');
    const creatorId = searchParams.get('creator_id');
    const postId = searchParams.get('post');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    // If tab=feedback, return review history across all posts
    if (tab === 'feedback') {
      let reviewQuery = supabase
        .from('post_reviews')
        .select(
          `
          id,
          managed_creator_post_id,
          reviewer_type,
          reviewer_id,
          status,
          feedback,
          created_at,
          managed_creator_posts!inner (
            id,
            post_id,
            review_status,
            managed_creators!inner (
              id,
              name,
              job_id,
              brand_organization_id,
              brand_organizations!inner (organization_name),
              jobs (job_title)
            ),
            posts!inner (
              id,
              platform,
              post_url,
              thumbnail_url,
              caption
            )
          ),
          users!reviewer_id (
            email
          )
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filters for feedback tab
      if (brandId) {
        reviewQuery = reviewQuery.eq('managed_creator_posts.managed_creators.brand_organization_id', brandId);
      }
      if (creatorId) {
        reviewQuery = reviewQuery.eq('managed_creator_posts.managed_creator_id', creatorId);
      }

      const { data: reviews, count, error } = await reviewQuery;

      if (error) {
        captureDbError(error, 'fetch_video_review_feedback', { userId: user.id });
        return Response.json({ error: 'Failed to fetch feedback' }, { status: 500 });
      }

      return Response.json({
        reviews: reviews || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    }

    // Main posts query
    const selectFields = `
      id,
      managed_creator_id,
      post_id,
      review_status,
      review_status_updated_at,
      base_pay_cents,
      bonus_cents,
      total_owed_cents,
      total_paid_cents,
      payment_status,
      created_at,
      managed_creators!inner (
        id,
        name,
        slack_user_id,
        linked_user_id,
        job_id,
        brand_organization_id,
        brand_organizations!inner (
          id,
          organization_name
        ),
        jobs (
          id,
          job_title,
          slack_channel_id
        )
      ),
      posts!inner (
        id,
        platform,
        post_url,
        thumbnail_url,
        video_storage_url,
        caption,
        hashtags,
        posted_at,
        latest_views,
        latest_likes,
        latest_comments
      ),
      post_reviews (
        id,
        reviewer_type,
        reviewer_id,
        status,
        feedback,
        metadata,
        created_at,
        users!reviewer_id (email)
      )
    `;

    let query = supabase
      .from('managed_creator_posts')
      .select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Deep link: specific post
    if (postId) {
      query = query.eq('id', postId);
    } else {
      // Tab filters
      if (tab === 'unreviewed') {
        query = query.in('review_status', ['pending', 'needs_changes']);
      } else if (tab === 'reviewed') {
        query = query.in('review_status', ['approved', 'rejected']);
      }

      // Optional filters
      if (brandId) {
        query = query.eq('managed_creators.brand_organization_id', brandId);
      }
      if (jobId) {
        query = query.eq('managed_creators.job_id', jobId);
      }
      if (creatorId) {
        query = query.eq('managed_creator_id', creatorId);
      }

      query = query.range(offset, offset + limit - 1);
    }

    const { data, count, error } = await query;

    if (error) {
      captureDbError(error, 'fetch_video_reviews', { userId: user.id });
      return Response.json({ error: 'Failed to fetch video reviews' }, { status: 500 });
    }

    return Response.json({
      posts: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    captureDbError(error, 'admin_video_reviews_route', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
