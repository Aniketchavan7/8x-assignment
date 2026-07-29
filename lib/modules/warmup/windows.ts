export interface WarmupWindow {
  index: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface WarmupWindowsResult {
  warmupStartDate: Date | null;
  currentWindowIndex: number | null;
  windows: WarmupWindow[];
  expectedDailyDates: Date[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Given the number of days since warmup started (`dayOffset`), returns the
 * warmup window index for that day.
 */
function getWindowForDayOffset(dayOffset: number): number {
  if (dayOffset <= 3) return 1;
  return Math.floor((dayOffset - 4) / 7) + 2;
}

export function toDateKey(date: Date): string {
  return utcDateOnly(date).toISOString().slice(0, 10);
}

export function getWarmupWindow(warmupStartDate: Date, index: number): WarmupWindow {
  if (index === 1) {
    return {
      index,
      periodStart: warmupStartDate,
      periodEnd: addDays(warmupStartDate, 3),
    };
  } else {
    const periodStart = addDays(warmupStartDate, 4 + (index - 2) * 7);
    return {
      index,
      periodStart,
      periodEnd: addDays(periodStart, 6),
    };
  }
}

export function getWarmupWindows({
  warmupStartedAt,
  futureWindowCount = 8,
}: {
  warmupStartedAt: string | null;
  futureWindowCount?: number;
}): WarmupWindowsResult {
  const now = new Date();
  if (!warmupStartedAt) {
    return {
      warmupStartDate: null,
      currentWindowIndex: null,
      windows: [],
      expectedDailyDates: [],
    };
  }

  const warmupStartDate = utcDateOnly(new Date(warmupStartedAt));
  const today = utcDateOnly(now);
  const dayOffset = Math.floor((today.getTime() - warmupStartDate.getTime()) / DAY_MS);

  if (dayOffset < 0) {
    return {
      warmupStartDate,
      currentWindowIndex: null,
      windows: [getWarmupWindow(warmupStartDate, 1)],
      expectedDailyDates: [],
    };
  }

  const currentWindowIndex = getWindowForDayOffset(dayOffset);
  const windowCount = currentWindowIndex + Math.max(1, futureWindowCount);
  const windows = Array.from({ length: windowCount }, (_, i) =>
    getWarmupWindow(warmupStartDate, i + 1)
  );
  const expectedDailyDates = Array.from({ length: dayOffset + 1 }, (_, i) =>
    addDays(warmupStartDate, i)
  );

  return {
    warmupStartDate,
    currentWindowIndex,
    windows,
    expectedDailyDates,
  };
}

export function isWindowDue(window: WarmupWindow): boolean {
  return utcDateOnly(new Date()).getTime() >= utcDateOnly(window.periodEnd).getTime();
}

export function windowStatusFor(
  submissions: Array<{ windowIndex?: number | null; window_index?: number | null }>,
  window: WarmupWindow
): 'submitted' | 'due' | 'upcoming' {
  const hasSubmission = submissions.some(
    (submission) => (submission.windowIndex ?? submission.window_index) === window.index
  );
  if (hasSubmission) return 'submitted';
  return isWindowDue(window) ? 'due' : 'upcoming';
}
