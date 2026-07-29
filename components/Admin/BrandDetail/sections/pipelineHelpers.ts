import type { ManagedCreatorListItem } from '@/app/api/admin/managed-creators/route';
import type { JobApplicationListItem } from '@/lib/types/admin-applications';
import {
  MANAGED_CREATOR_STATUSES,
  MANAGED_CREATOR_STATUS_LABELS,
  type ManagedCreatorStatus,
} from '@/lib/modules/managed-creators/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @deprecated Use ManagedCreatorStatus from constants instead */
export type StatusId = ManagedCreatorStatus;

export const STATUSES: { id: StatusId; label: string }[] =
  MANAGED_CREATOR_STATUSES.map((id) => ({ id, label: MANAGED_CREATOR_STATUS_LABELS[id] }));

// ---------------------------------------------------------------------------
// Status colors — shared across pipeline grid + detail panel
// ---------------------------------------------------------------------------

export const STATUS_CONFIG: Record<string, { num: number; bg: string; text: string; dot: string }> = {
  Applied:            { num: 0, bg: 'bg-blue-50 dark:bg-blue-950/40',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-400' },
  'Video Submitted':  { num: 1, bg: 'bg-indigo-50 dark:bg-indigo-950/40',  text: 'text-indigo-700 dark:text-indigo-300',  dot: 'bg-indigo-400' },
  Accepted:           { num: 2, bg: 'bg-violet-50 dark:bg-violet-950/40',  text: 'text-violet-700 dark:text-violet-300',  dot: 'bg-violet-400' },
  'Warming Up':       { num: 3, bg: 'bg-amber-50 dark:bg-amber-950/40',    text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-400' },
  Active:             { num: 4, bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
  Ghosted:            { num: 5, bg: 'bg-gray-50 dark:bg-gray-950/40',      text: 'text-gray-700 dark:text-gray-300',      dot: 'bg-gray-400' },
  Rejected:           { num: 6, bg: 'bg-red-50 dark:bg-red-950/40',        text: 'text-red-700 dark:text-red-300',        dot: 'bg-red-300' },
  Dropped:            { num: 7, bg: 'bg-red-50 dark:bg-red-950/40',        text: 'text-red-700 dark:text-red-300',        dot: 'bg-red-400' },
  Unclear:            { num: 8, bg: 'bg-rose-50 dark:bg-rose-950/40',      text: 'text-rose-700 dark:text-rose-300',      dot: 'bg-rose-400' },
};

// ---------------------------------------------------------------------------
// Status derivation helpers
// ---------------------------------------------------------------------------

export function warmupProgress(c: ManagedCreatorListItem): number {
  let done = 0;
  if (c.warmup_day_1_completed_at) done++;
  if (c.warmup_day_2_completed_at) done++;
  if (c.warmup_day_3_completed_at) done++;
  if (c.warmup_day_4_completed_at) done++;
  return done;
}

export function isDropped(c: ManagedCreatorListItem): boolean {
  return c.status === 'dropped';
}

export function isRejectedApp(app: JobApplicationListItem): boolean {
  return app.application_status === 'rejected';
}

export function getLastActionAt(mc: ManagedCreatorListItem): string | null {
  const dates = [
    mc.first_post_completed_at,
    mc.warmup_day_4_completed_at,
    mc.warmup_day_3_completed_at,
    mc.warmup_day_2_completed_at,
    mc.warmup_day_1_completed_at,
    mc.instagram_handle_completed_at,
    mc.tiktok_handle_completed_at,
    mc.read_about_company_completed_at,
    mc.onboarding_call_completed_at,
    mc.onboarded_at,
    mc.created_at,
  ].filter(Boolean) as string[];

  if (dates.length === 0) return null;

  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

// ---------------------------------------------------------------------------
// Days column — time at current stage
// ---------------------------------------------------------------------------

export type DaysPhase = 'waiting' | 'accepted' | 'warming_up' | 'posting' | 'stalled' | 'rejected' | 'dropped';

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_TO_PHASE: Record<string, DaysPhase> = {
  applied: 'waiting',
  test_videos_submitted: 'waiting',
  accepted: 'accepted',
  warming_up: 'warming_up',
  active: 'posting',
  ghosted: 'stalled',
  unclear: 'stalled',
  rejected: 'rejected',
  dropped: 'dropped',
};

const PHASE_LABELS: Record<DaysPhase, string> = {
  waiting: 'Applied',
  accepted: 'Accepted',
  warming_up: 'Warming up',
  posting: 'Active',
  stalled: 'Stalled',
  rejected: 'Rejected',
  dropped: 'Dropped',
};

export function getDaysColumnData(mc: ManagedCreatorListItem): {
  days: number | null;
  phase: DaysPhase;
  tooltip: string;
} {
  const phase = STATUS_TO_PHASE[mc.status ?? ''] ?? 'waiting';

  if (phase === 'dropped') {
    return { days: null, phase, tooltip: 'Dropped' };
  }

  if (phase === 'rejected') {
    return { days: null, phase, tooltip: 'Rejected' };
  }

  const sinceDate = mc.status_changed_at ?? mc.created_at;
  if (!sinceDate) {
    return { days: null, phase, tooltip: '' };
  }

  const days = daysSince(sinceDate);
  const label = PHASE_LABELS[phase];
  return { days, phase, tooltip: `${label} for ${days}d` };
}
