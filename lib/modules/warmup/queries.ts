import { createServiceRoleClient } from '@/lib/db/supabase';
import { getR2SignedUrl } from '@/lib/storage/r2';
import type { Json } from '@/types/supabase';
import { WARMUP_PLATFORMS } from './constants';
import { getWarmupWindows, isWindowDue, toDateKey } from './windows';
import {
  VerdictSchema,
  type ScreenTimeVerdict,
  type WarmupAiStatus,
  type WarmupPlatform,
  type WarmupReviewStatus,
} from './verify-screenshot';

export class WarmupConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarmupConflictError';
  }
}

export interface WarmupManagedCreator {
  id: string;
  brand_organization_id?: string | null;
  onboarding_started_at?: string | null;
}

interface WarmupDailyActivityRow {
  activity_date: string;
  scrolled_platforms: WarmupPlatform[];
  niche_video_urls: string[];
}

interface WarmupScreenshotSubmissionRow {
  id: string;
  platform: WarmupPlatform;
  window_index: number;
  screenshot_bucket: string;
  screenshot_key: string;
  ai_status: WarmupAiStatus;
  review_status: WarmupReviewStatus;
  ai_reported_minutes_spent: number | null;
  ai_verdict: Json | null;
}

export interface WarmupDailyActivityPayload {
  scrolledPlatforms: WarmupPlatform[];
  nicheVideoUrls: string[];
}

export interface WarmupScreenshotSubmissionPayload {
  id: string;
  screenshotUrl: string | null;
  aiStatus: WarmupAiStatus;
  reviewStatus: WarmupReviewStatus;
  aiReportedMinutesSpent: number | null;
  aiVerdict: ScreenTimeVerdict | null;
}

export interface WarmupScreenshotTaskPayload {
  platform: WarmupPlatform;
  windowIndex: number;
  periodStart: string;
  periodEnd: string;
  status: 'submitted' | 'due' | 'upcoming';
  submission: WarmupScreenshotSubmissionPayload | null;
}

export interface WarmupTimelinePayload {
  managedCreatorId: string;
  warmupStartDate: string | null;
  currentWindowIndex: number | null;
  expectedDailyDates: string[];
  dailyActivities: Record<string, WarmupDailyActivityPayload>;
  screenshotTasks: WarmupScreenshotTaskPayload[];
}

async function rowToScreenshotPayload(
  row: WarmupScreenshotSubmissionRow
): Promise<WarmupScreenshotSubmissionPayload> {
  const bucket = row.screenshot_bucket;
  const key = row.screenshot_key;
  const screenshotUrl = await getR2SignedUrl(bucket, key, 3600);

  const aiVerdict = row.ai_verdict ? (VerdictSchema.safeParse(row.ai_verdict).data ?? null) : null;

  return {
    id: row.id,
    screenshotUrl,
    aiStatus: row.ai_status,
    reviewStatus: row.review_status,
    aiReportedMinutesSpent: row.ai_reported_minutes_spent,
    aiVerdict,
  };
}

export async function getWarmupTimeline(
  managedCreator: WarmupManagedCreator
): Promise<WarmupTimelinePayload> {
  const supabase = createServiceRoleClient();
  const warmupStartedAt = managedCreator.onboarding_started_at ?? null;
  const windowsResult = getWarmupWindows({ warmupStartedAt });

  const [dailyResult, submissionsResult] = await Promise.all([
    supabase
      .from('warmup_daily_activity')
      .select('activity_date, scrolled_platforms, niche_video_urls')
      .eq('managed_creator_id', managedCreator.id)
      .order('activity_date', { ascending: true }),
    supabase
      .from('warmup_screenshot_submissions')
      .select(
        'id, platform, window_index, screenshot_bucket, screenshot_key, ai_status, review_status, ai_reported_minutes_spent, ai_verdict'
      )
      .eq('managed_creator_id', managedCreator.id)
      .order('period_end', { ascending: true }),
  ]);

  if (dailyResult.error) throw dailyResult.error;
  if (submissionsResult.error) throw submissionsResult.error;

  const dailyRows: WarmupDailyActivityRow[] = dailyResult.data ?? [];
  const submissionRows: WarmupScreenshotSubmissionRow[] = submissionsResult.data ?? [];

  const dailyActivities: Record<string, WarmupDailyActivityPayload> = Object.fromEntries(
    dailyRows.map((row) => [
      row.activity_date,
      {
        scrolledPlatforms: row.scrolled_platforms ?? [],
        nicheVideoUrls: row.niche_video_urls ?? [],
      },
    ])
  );

  const submissionsByWindowPlatform = new Map(
    await Promise.all(
      submissionRows.map(
        async (row): Promise<[string, WarmupScreenshotSubmissionPayload]> => [
          `${row.window_index}:${row.platform}`,
          await rowToScreenshotPayload(row),
        ]
      )
    )
  );

  const screenshotTasks = windowsResult.windows.flatMap((window) =>
    WARMUP_PLATFORMS.map((platform) => {
      const submission = submissionsByWindowPlatform.get(`${window.index}:${platform}`) ?? null;
      const status: WarmupScreenshotTaskPayload['status'] = submission
        ? 'submitted'
        : isWindowDue(window)
          ? 'due'
          : 'upcoming';
      return {
        platform,
        windowIndex: window.index,
        periodStart: toDateKey(window.periodStart),
        periodEnd: toDateKey(window.periodEnd),
        status,
        submission,
      };
    })
  );

  return {
    managedCreatorId: managedCreator.id,
    warmupStartDate: windowsResult.warmupStartDate
      ? toDateKey(windowsResult.warmupStartDate)
      : null,
    currentWindowIndex: windowsResult.currentWindowIndex,
    expectedDailyDates: windowsResult.expectedDailyDates.map(toDateKey),
    dailyActivities,
    screenshotTasks,
  };
}

export async function upsertDailyActivity({
  managedCreatorId,
  activityDate,
  scrolledPlatforms,
  updatedNicheVideoUrls,
}: {
  managedCreatorId: string;
  activityDate: string;
  scrolledPlatforms?: WarmupPlatform[];
  updatedNicheVideoUrls?: string[];
}): Promise<WarmupDailyActivityPayload> {
  const supabase = createServiceRoleClient();
  const { data: existing, error: existingError } = await supabase
    .from('warmup_daily_activity')
    .select('scrolled_platforms, niche_video_urls')
    .eq('managed_creator_id', managedCreatorId)
    .eq('activity_date', activityDate)
    .maybeSingle();

  if (existingError) throw existingError;

  const nextUrls = updatedNicheVideoUrls
    ? Array.from(new Set(updatedNicheVideoUrls.map((item) => item.trim()).filter(Boolean)))
    : undefined;

  const values: {
    managed_creator_id: string;
    activity_date: string;
    scrolled_platforms: WarmupPlatform[];
    niche_video_urls?: string[];
  } = {
    managed_creator_id: managedCreatorId,
    activity_date: activityDate,
    scrolled_platforms: scrolledPlatforms ?? existing?.scrolled_platforms ?? [],
  };
  if (nextUrls) values.niche_video_urls = nextUrls;

  const { data, error } = await supabase
    .from('warmup_daily_activity')
    .upsert(values, { onConflict: 'managed_creator_id,activity_date' })
    .select('scrolled_platforms, niche_video_urls')
    .single();

  if (error) throw error;
  return {
    scrolledPlatforms: data.scrolled_platforms ?? [],
    nicheVideoUrls: data.niche_video_urls ?? [],
  };
}

export async function appendDailyActivityNicheVideoUrl({
  managedCreatorId,
  activityDate,
  nicheVideoUrl,
}: {
  managedCreatorId: string;
  activityDate: string;
  nicheVideoUrl: string;
}): Promise<WarmupDailyActivityPayload> {
  const supabase = createServiceRoleClient();
  const normalizedUrl = nicheVideoUrl.trim();
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: existing, error: existingError } = await supabase
      .from('warmup_daily_activity')
      .select('id, updated_at, scrolled_platforms, niche_video_urls')
      .eq('managed_creator_id', managedCreatorId)
      .eq('activity_date', activityDate)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { data, error } = await supabase
        .from('warmup_daily_activity')
        .insert({
          managed_creator_id: managedCreatorId,
          activity_date: activityDate,
          niche_video_urls: [normalizedUrl],
        })
        .select('scrolled_platforms, niche_video_urls')
        .single();

      if (!error) {
        return {
          scrolledPlatforms: data.scrolled_platforms ?? [],
          nicheVideoUrls: data.niche_video_urls ?? [],
        };
      }
      if (error.code !== '23505') throw error;
      continue;
    }

    const nextUrls = Array.from(new Set([...(existing.niche_video_urls ?? []), normalizedUrl]));

    const { data, error } = await supabase
      .from('warmup_daily_activity')
      .update({ niche_video_urls: nextUrls })
      .eq('id', existing.id)
      .eq('updated_at', existing.updated_at)
      .select('scrolled_platforms, niche_video_urls')
      .maybeSingle();

    if (error) throw error;
    if (data) {
      return {
        scrolledPlatforms: data.scrolled_platforms ?? [],
        nicheVideoUrls: data.niche_video_urls ?? [],
      };
    }
  }

  throw new WarmupConflictError('Could not save niche video URL. Please try again.');
}

export async function appendDailyActivityScrolledPlatform({
  managedCreatorId,
  activityDate,
  platform,
}: {
  managedCreatorId: string;
  activityDate: string;
  platform: WarmupPlatform;
}): Promise<WarmupDailyActivityPayload> {
  const supabase = createServiceRoleClient();
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: existing, error: existingError } = await supabase
      .from('warmup_daily_activity')
      .select('id, updated_at, scrolled_platforms, niche_video_urls')
      .eq('managed_creator_id', managedCreatorId)
      .eq('activity_date', activityDate)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { data, error } = await supabase
        .from('warmup_daily_activity')
        .insert({
          managed_creator_id: managedCreatorId,
          activity_date: activityDate,
          scrolled_platforms: [platform],
        })
        .select('scrolled_platforms, niche_video_urls')
        .single();

      if (!error) {
        return {
          scrolledPlatforms: data.scrolled_platforms ?? [],
          nicheVideoUrls: data.niche_video_urls ?? [],
        };
      }
      if (error.code !== '23505') throw error;
      continue;
    }

    const currentPlatforms: WarmupPlatform[] = existing.scrolled_platforms ?? [];
    if (currentPlatforms.includes(platform)) {
      return {
        scrolledPlatforms: currentPlatforms,
        nicheVideoUrls: existing.niche_video_urls ?? [],
      };
    }

    const nextPlatforms = [...currentPlatforms, platform];

    const { data, error } = await supabase
      .from('warmup_daily_activity')
      .update({ scrolled_platforms: nextPlatforms })
      .eq('id', existing.id)
      .eq('updated_at', existing.updated_at)
      .select('scrolled_platforms, niche_video_urls')
      .maybeSingle();

    if (error) throw error;
    if (data) {
      return {
        scrolledPlatforms: data.scrolled_platforms ?? [],
        nicheVideoUrls: data.niche_video_urls ?? [],
      };
    }
  }

  throw new WarmupConflictError('Could not save scroll status. Please try again.');
}

export async function insertScreenshotSubmission({
  managedCreatorId,
  platform,
  windowIndex,
  periodStart,
  periodEnd,
  bucket,
  key,
  createdBy,
}: {
  managedCreatorId: string;
  platform: WarmupPlatform;
  windowIndex: number;
  periodStart: string;
  periodEnd: string;
  bucket: string;
  key: string;
  createdBy: string;
}): Promise<WarmupScreenshotSubmissionPayload> {
  const supabase = createServiceRoleClient();
  const selectColumns =
    'id, platform, window_index, screenshot_bucket, screenshot_key, ai_status, review_status, ai_reported_minutes_spent, ai_verdict';
  const insertPayload = {
    managed_creator_id: managedCreatorId,
    platform,
    window_index: windowIndex,
    period_start: periodStart,
    period_end: periodEnd,
    screenshot_bucket: bucket,
    screenshot_key: key,
    created_by: createdBy,
  };
  const { data, error } = await supabase
    .from('warmup_screenshot_submissions')
    .insert({
      ...insertPayload,
    })
    .select(selectColumns)
    .single();

  if (error?.code === '23505') {
    const { data: replacement, error: replacementError } = await supabase
      .from('warmup_screenshot_submissions')
      .update({
        ...insertPayload,
        ai_status: 'pending',
        ai_reported_minutes_spent: null,
        ai_verdict: null,
        review_status: 'unreviewed',
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      })
      .eq('managed_creator_id', managedCreatorId)
      .eq('platform', platform)
      .eq('window_index', windowIndex)
      .in('ai_status', ['fail', 'needs_review'])
      .not('review_status', 'eq', 'approved')
      .select(selectColumns)
      .maybeSingle();

    if (replacementError) throw replacementError;
    if (replacement) return rowToScreenshotPayload(replacement);

    throw new WarmupConflictError(
      'A screenshot has already been submitted for this platform and window.'
    );
  }
  if (error) throw error;

  return rowToScreenshotPayload(data);
}

export async function updateScreenshotAiResult(
  id: string,
  {
    aiStatus,
    aiReportedMinutesSpent,
    verdict,
  }: {
    aiStatus: Exclude<WarmupAiStatus, 'pending'>;
    aiReportedMinutesSpent: number | null;
    verdict: ScreenTimeVerdict | null;
  }
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('warmup_screenshot_submissions')
    .update({
      ai_status: aiStatus,
      ai_reported_minutes_spent: aiReportedMinutesSpent,
      ai_verdict: verdict,
    })
    .eq('id', id);

  if (error) throw error;
}
