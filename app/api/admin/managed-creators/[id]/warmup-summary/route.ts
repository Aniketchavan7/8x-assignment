import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import { getWarmupWindows, toDateKey } from '@/lib/modules/warmup/windows';
import type { WarmupPlatform } from '@/lib/modules/warmup/verify-screenshot';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface AdminWarmupSummaryResponse {
  warmupStartDate: string | null;
  currentWindowIndex: number | null;
  expectedDailyDates: string[];
  dailyActivities: Record<
    string,
    {
      scrolledPlatforms: WarmupPlatform[];
      nicheVideoUrls: string[];
    }
  >;
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
      .select('id, onboarding_started_at')
      .eq('id', id)
      .single();

    if (creatorError || !managedCreator) {
      return Response.json({ error: 'Managed creator not found' }, { status: 404 });
    }

    const windows = getWarmupWindows({
      warmupStartedAt: managedCreator.onboarding_started_at ?? null,
    });

    const { data, error } = await supabase
      .from('warmup_daily_activity')
      .select('activity_date, scrolled_platforms, niche_video_urls')
      .eq('managed_creator_id', id)
      .order('activity_date', { ascending: true });

    if (error) throw error;

    const dailyActivities: AdminWarmupSummaryResponse['dailyActivities'] = Object.fromEntries(
      (data ?? []).map((row) => [
        row.activity_date,
        {
          scrolledPlatforms: row.scrolled_platforms,
          nicheVideoUrls: row.niche_video_urls,
        },
      ])
    );

    const response: AdminWarmupSummaryResponse = {
      warmupStartDate: windows.warmupStartDate ? toDateKey(windows.warmupStartDate) : null,
      currentWindowIndex: windows.currentWindowIndex,
      expectedDailyDates: windows.expectedDailyDates.map(toDateKey),
      dailyActivities,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/warmup-summary',
      method: 'GET',
    });
  }
}
