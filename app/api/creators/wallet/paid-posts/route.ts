export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getCreatorContext, errorResponse } from '@/lib/modules/context';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { validateOrigin } from '@/lib/utils/origin-validation';
import { handleApiError } from '@/lib/utils/api-error';

export async function GET(req: NextRequest) {
  try {
    const originError = validateOrigin(req);
    if (originError) return originError;

    const ctx = await getCreatorContext(req);
    if (!ctx.ok) return errorResponse(ctx.error);

    const { creatorProfile } = ctx;

    const supabase = createServiceRoleClient();
    const { data: managedCreators, error: mcError } = await supabase
      .from('managed_creators')
      .select('id, job_id, jobs(job_title, brand_organization_id, brand_organizations(organization_name))')
      .eq('linked_creator_profile_id', creatorProfile.id);

    if (mcError) throw mcError;
    if (!managedCreators?.length) return Response.json({ posts: [] });

    const mcIds = managedCreators.map(mc => mc.id);

    const { data: paidPosts, error: postsError } = await supabase
      .from('managed_creator_posts')
      .select('id, total_paid_cents, payment_status, post_id, posts(id, platform, post_url, thumbnail_url, caption, latest_views, posted_at), managed_creator_id')
      .in('managed_creator_id', mcIds)
      .in('payment_status', ['paid', 'partially_paid'])
      .gt('total_paid_cents', 0)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (postsError) throw postsError;

    type McJob = typeof managedCreators[number]['jobs'];
    const mcJobMap = new Map<string, McJob>(managedCreators.map(mc => [mc.id, mc.jobs]));

    const posts = (paidPosts ?? []).map(pp => {
      const post = pp.posts;
      const job = mcJobMap.get(pp.managed_creator_id);
      return {
        id: pp.id,
        post_id: pp.post_id,
        total_paid_cents: pp.total_paid_cents,
        payment_status: pp.payment_status,
        platform: post?.platform ?? null,
        post_url: post?.post_url ?? null,
        thumbnail_url: post?.thumbnail_url ?? null,
        caption: post?.caption ?? null,
        latest_views: post?.latest_views ?? 0,
        posted_at: post?.posted_at ?? null,
        job_title: job?.job_title ?? null,
        brand_name: (job?.brand_organizations as { organization_name: string } | null)?.organization_name ?? null,
      };
    });

    return Response.json({ posts });
  } catch (error) {
    return handleApiError(error, { route: '/api/creators/wallet/paid-posts', method: 'GET' });
  }
}
