import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { buildManagedCreatorPostFilters } from '@/lib/modules/creator/post-filters';
import { getOrgBySlug, getManagedCreatorForBrand } from '@/lib/modules/portal/queries';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const brandSlug = request.nextUrl.searchParams.get('brandSlug');
    if (!brandSlug) return Response.json({ error: 'brandSlug required' }, { status: 400 });

    const [user, org] = await Promise.all([getUser(), getOrgBySlug(brandSlug)]);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!org) return Response.json({ error: 'Not found' }, { status: 404 });

    const mc = await getManagedCreatorForBrand(user.id, org.id);
    if (!mc) return Response.json({ error: 'Not a managed creator' }, { status: 404 });

    // Use service role client — PostgREST's authenticated role schema cache
    // doesn't recognize social_account_connector_id on posts. Ownership is
    // verified via buildManagedCreatorPostFilters (user → mc → account filters).
    const supabase = createServiceRoleClient();
    const orConditions = await buildManagedCreatorPostFilters(supabase, mc);

    if (orConditions.length === 0) return Response.json({ posts: [], hasMore: false });

    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 30, 100);
    const offset = Number(request.nextUrl.searchParams.get('offset')) || 0;

    // Intentionally no deleted_at filter — a post that the platform 404'd or
    // that the stale-post cron flagged should still appear in the creator's
    // history so they can see what was paid/owed. UI surfaces the deleted
    // state via deleted_at on the row.
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, platform, post_url, post_type, thumbnail_url, caption, posted_at, latest_views, latest_likes, latest_comments, latest_shares, ad_code, ad_code_added_at, deleted_at, managed_creator_posts(total_owed_cents)')
      .or(orConditions.join(','))
      .order('posted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const results = (posts ?? []).map(({ managed_creator_posts: mcp, ...rest }) => ({
      ...rest,
      total_owed_cents: (mcp as { total_owed_cents: number } | null)?.total_owed_cents ?? null,
    }));
    return Response.json({ posts: results, hasMore: results.length === limit });
  } catch (error) {
    return handleApiError(error, { route: '/api/creator/posts', method: 'GET' });
  }
}
