import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import { warmupPlatformForUrl } from '@/lib/modules/warmup/constants';
import type { WarmupPlatform } from '@/lib/modules/warmup/verify-screenshot';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type WarmupNicheVideoPlatform = WarmupPlatform | 'unknown';

export interface ManagedCreatorWarmupNicheVideo {
  activityDate: string;
  url: string;
  platform: WarmupNicheVideoPlatform;
}

export interface ManagedCreatorWarmupNicheVideosResponse {
  videos: ManagedCreatorWarmupNicheVideo[];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { supabase } = auth;

    const { data: managedCreator, error: creatorError } = await supabase
      .from('managed_creators')
      .select('id')
      .eq('id', id)
      .single();

    if (creatorError || !managedCreator) {
      return Response.json({ error: 'Managed creator not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('warmup_daily_activity')
      .select('activity_date, niche_video_urls')
      .eq('managed_creator_id', id)
      .order('activity_date', { ascending: false });

    if (error) throw error;

    const videos: ManagedCreatorWarmupNicheVideo[] = (data ?? []).flatMap((row) =>
      row.niche_video_urls.filter(Boolean).map(
        (url): ManagedCreatorWarmupNicheVideo => ({
          activityDate: row.activity_date,
          url,
          platform: warmupPlatformForUrl(url) ?? 'unknown',
        })
      )
    );

    const response: ManagedCreatorWarmupNicheVideosResponse = { videos };
    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/warmup-niche-videos',
      method: 'GET',
    });
  }
}
