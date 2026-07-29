import type { WarmupScreenshotSubmissionPayload } from '@/lib/modules/warmup/queries';
import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import type {
  ScreenTimeVerdict,
  WarmupAiStatus,
  WarmupPlatform,
  WarmupReviewStatus,
} from '@/lib/modules/warmup/verify-screenshot';
import { VerdictSchema } from '@/lib/modules/warmup/verify-screenshot';
import type { Json } from '@/types/supabase';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WarmupScreenshotSubmissionRow {
  id: string;
  platform: WarmupPlatform;
  window_index: number;
  period_start: string;
  period_end: string;
  ai_status: WarmupAiStatus;
  review_status: WarmupReviewStatus;
  ai_reported_minutes_spent: number | null;
  ai_verdict: Json | null;
}

export interface AdminWarmupScreenshotPayload extends WarmupScreenshotSubmissionPayload {
  platform: WarmupPlatform;
  windowIndex: number;
  periodStart: string;
  periodEnd: string;
}

export interface AdminWarmupScreenshotsResponse {
  flaggedForReview: AdminWarmupScreenshotPayload[];
  others: AdminWarmupScreenshotPayload[];
}

function rowToAdminScreenshotPayload(
  managedCreatorId: string,
  row: WarmupScreenshotSubmissionRow
): AdminWarmupScreenshotPayload {
  return {
    id: row.id,
    screenshotUrl: `/api/admin/managed-creators/${managedCreatorId}/warmup-screenshots/${row.id}/image`,
    aiStatus: row.ai_status,
    reviewStatus: row.review_status,
    aiReportedMinutesSpent: row.ai_reported_minutes_spent,
    aiVerdict: parseAiVerdict(row.ai_verdict),
    platform: row.platform,
    windowIndex: row.window_index,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}

function parseAiVerdict(value: Json | null): ScreenTimeVerdict | null {
  if (!value) return null;
  return VerdictSchema.safeParse(value).data ?? null;
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
      .from('warmup_screenshot_submissions')
      .select(
        'id, platform, window_index, period_start, period_end, ai_status, review_status, ai_reported_minutes_spent, ai_verdict'
      )
      .eq('managed_creator_id', id)
      .order('period_end', { ascending: false });

    if (error) throw error;

    const submissions = (data ?? []).map((row) => rowToAdminScreenshotPayload(id, row));

    const flaggedForReview = submissions.filter(
      (submission) =>
        submission.aiStatus === 'needs_review' && submission.reviewStatus === 'unreviewed'
    );
    const others = submissions.filter(
      (submission) =>
        !(submission.aiStatus === 'needs_review' && submission.reviewStatus === 'unreviewed')
    );

    const response: AdminWarmupScreenshotsResponse = { flaggedForReview, others };
    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/warmup-screenshots',
      method: 'GET',
    });
  }
}
