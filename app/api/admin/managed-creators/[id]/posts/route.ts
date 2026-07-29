import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import { buildManagedCreatorPostFilters } from '@/lib/modules/creator/post-filters';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export interface CreatorPost {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  post_url: string;
  post_type: string;
  thumbnail_url: string | null;
  video_storage_url: string | null;
  caption: string | null;
  posted_at: string;
  latest_views: number | null;
  latest_likes: number | null;
  latest_comments: number | null;
  latest_shares: number | null;
  latest_saves: number | null;
  latest_engagement_rate: number | null;
  ad_code: string | null;
  ad_code_added_at: string | null;
  cost: number | null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { supabase } = auth;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '0', 10) || 0, 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;

    const { data: mc, error: mcError } = await supabase
      .from('managed_creators')
      .select(
        'tiktok_username, instagram_username, youtube_username, tiktok_account_id, instagram_account_id, youtube_account_id, base_pay'
      )
      .eq('id', id)
      .single();

    if (mcError || !mc) {
      return Response.json({ error: 'Managed creator not found' }, { status: 404 });
    }

    const filters = await buildManagedCreatorPostFilters(supabase, mc);

    if (filters.length === 0) {
      return Response.json({ data: [], base_pay: mc.base_pay });
    }

    let query = supabase
      .from('posts')
      .select(
        'id, platform, post_url, post_type, thumbnail_url, video_storage_url, caption, posted_at, latest_views, latest_likes, latest_comments, latest_shares, latest_saves, latest_engagement_rate, ad_code, ad_code_added_at, cost',
        { count: limit > 0 ? 'exact' : undefined }
      )
      .or(filters.join(','))
      .is('deleted_at', null)
      .order('posted_at', { ascending: false });

    if (limit > 0) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data: posts, error: postsError, count } = await query;

    if (postsError) {
      throw postsError;
    }

    return Response.json({
      data: posts ?? [],
      base_pay: mc.base_pay,
      ...(limit > 0 && { total: count, hasMore: (count ?? 0) > offset + (posts?.length ?? 0) }),
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/posts',
      method: 'GET',
    });
  }
}
