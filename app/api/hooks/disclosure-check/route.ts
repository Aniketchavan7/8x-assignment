export const runtime = 'nodejs';
export const maxDuration = 30;

import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { requireCronSecret } from '@/lib/cron/auth';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { handleApiError } from '@/lib/utils/api-error';
import { notifyDisclosureMissing } from '@/lib/notifications/admin-slack';

export async function POST(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  let payload: { post_id?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const postId = payload.post_id;
  if (!postId) {
    return Response.json({ error: 'post_id required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('id, post_url, platform, tiktok_username, instagram_username, youtube_username, is_sponsored')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.is_sponsored !== false) {
      return Response.json({ skipped: true, reason: 'Post is disclosed or rule does not apply' });
    }

    const { data: mcp } = await supabase
      .from('managed_creator_posts')
      .select('id, managed_creators(brand_organization_id)')
      .eq('post_id', post.id)
      .maybeSingle();

    if (!mcp) {
      return Response.json({ skipped: true, reason: 'No managed_creator_post for this post' });
    }

    const brandOrgId =
      (mcp.managed_creators as { brand_organization_id: string } | null)?.brand_organization_id ?? null;

    let brandName = 'Unknown';
    if (brandOrgId) {
      const { data: brand } = await supabase
        .from('brand_organizations')
        .select('organization_name')
        .eq('id', brandOrgId)
        .single();
      if (brand?.organization_name) brandName = brand.organization_name;
    }

    const username =
      post.platform === 'tiktok' ? post.tiktok_username
      : post.platform === 'instagram' ? post.instagram_username
      : post.platform === 'youtube' ? post.youtube_username
      : null;

    after(async () => {
      await notifyDisclosureMissing({
        username: username ?? 'unknown',
        brandName,
        postUrl: post.post_url,
        managedCreatorPostId: mcp.id,
      }).catch(captureFireAndForget('disclosure_slack_notification'));
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: '/api/hooks/disclosure-check', method: 'POST' });
  }
}
