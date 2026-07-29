'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { AdminWarmupSummaryResponse } from '@/app/api/admin/managed-creators/[id]/warmup-summary/route';
import { WARMUP_PLATFORMS, warmupPlatformForUrl } from '@/lib/modules/warmup/constants';
import type { WarmupPlatform } from '@/lib/modules/warmup/verify-screenshot';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const DAY_MS = 24 * 60 * 60 * 1000;
const PLATFORM_LABEL: Record<WarmupPlatform, string> = {
  tiktok: 'TT',
  instagram: 'IG',
  youtube: 'YT',
};
const PLATFORM_NAME: Record<WarmupPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

function utcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date: Date): string {
  return utcDateOnly(date).toISOString().slice(0, 10);
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date
  );
}

interface MonthCell {
  dateKey: string;
  isCurrentMonth: boolean;
}

function getMonthCells(visibleMonth: Date): MonthCell[] {
  const start = monthStart(visibleMonth);
  const firstWeekday = start.getUTCDay();
  const nextMonth = addMonths(start, 1);
  const dayCount = Math.round((nextMonth.getTime() - start.getTime()) / DAY_MS);
  const totalCells = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const gridStart = addDays(start, -firstWeekday);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      dateKey: toDateKey(date),
      isCurrentMonth: date.getUTCMonth() === start.getUTCMonth(),
    };
  });
}

function classifyDay({
  dateKey,
  expectedDates,
  dailyActivity,
}: {
  dateKey: string;
  expectedDates: Set<string>;
  dailyActivity: AdminWarmupSummaryResponse['dailyActivities'][string] | undefined;
}): 'done' | 'due-today' | 'missed' | 'blank' {
  if (!expectedDates.has(dateKey)) return 'blank';
  const hasActivity =
    !!dailyActivity &&
    (dailyActivity.scrolledPlatforms.length > 0 || dailyActivity.nicheVideoUrls.length > 0);
  if (hasActivity) return 'done';
  const todayKey = toDateKey(new Date());
  if (dateKey === todayKey) return 'due-today';
  if (dateKey < todayKey) return 'missed';
  return 'blank';
}

export function WarmupSummaryCalendar({ managedCreatorId }: { managedCreatorId: string }) {
  const query = useQuery<AdminWarmupSummaryResponse>({
    queryKey: ['/api/admin/managed-creators', managedCreatorId, 'warmup-summary'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/managed-creators/${managedCreatorId}/warmup-summary`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch warmup summary');
      return res.json();
    },
  });

  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date()));

  useEffect(() => {
    if (query.data?.warmupStartDate) {
      setVisibleMonth(monthStart(parseDateKey(query.data.warmupStartDate)));
    }
  }, [query.data?.warmupStartDate]);

  const expectedDates = useMemo(
    () => new Set(query.data?.expectedDailyDates ?? []),
    [query.data?.expectedDailyDates]
  );
  const monthCells = useMemo(() => getMonthCells(visibleMonth), [visibleMonth]);

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-background py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading warmup summary...
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
        Failed to load warmup summary.
      </div>
    );
  }

  if (!query.data.warmupStartDate) {
    return (
      <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
        Warmup has not started for this creator.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Daily Warmup Summary</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Green days have scroll or niche URL activity. Yellow is due today. Red is missed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-36 text-center text-sm font-medium">
            {formatMonth(visibleMonth)}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthCells.map(({ dateKey, isCurrentMonth }) => {
          const activity = query.data.dailyActivities[dateKey];
          const state = classifyDay({ dateKey, expectedDates, dailyActivity: activity });
          const urlsByPlatform = WARMUP_PLATFORMS.reduce<Record<WarmupPlatform, number>>(
            (acc, platform) => {
              acc[platform] = (activity?.nicheVideoUrls ?? []).filter(
                (url) => warmupPlatformForUrl(url) === platform
              ).length;
              return acc;
            },
            { tiktok: 0, instagram: 0, youtube: 0 }
          );

          return (
            <div
              key={dateKey}
              className={cn(
                'min-h-24 rounded-md border p-2 text-left',
                state === 'done' &&
                  'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
                state === 'due-today' &&
                  'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
                state === 'missed' &&
                  'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
                state === 'blank' && 'bg-muted/30',
                !isCurrentMonth && 'border-muted bg-muted/10 opacity-60'
              )}
            >
              <div
                className={cn(
                  'mb-2 text-xs font-semibold tabular-nums',
                  !isCurrentMonth && 'text-muted-foreground'
                )}
              >
                {Number(dateKey.slice(-2))}
              </div>
              <div className="space-y-1">
                <PlatformDots label="Scroll" active={activity?.scrolledPlatforms ?? []} />
                <PlatformCounts label="URLs" counts={urlsByPlatform} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlatformDots({ label, active }: { label: string; active: WarmupPlatform[] }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-8 cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 whitespace-normal">
          Platforms the creator confirmed they scrolled on this date.
        </TooltipContent>
      </Tooltip>
      {WARMUP_PLATFORMS.map((platform) => (
        <PlatformChip
          key={platform}
          platform={platform}
          className={cn(
            'rounded px-1 py-0.5 font-medium',
            active.includes(platform)
              ? 'bg-emerald-600 text-white'
              : 'bg-muted text-muted-foreground'
          )}
        />
      ))}
    </div>
  );
}

function PlatformCounts({
  label,
  counts,
}: {
  label: string;
  counts: Record<WarmupPlatform, number>;
}) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-8 cursor-help text-muted-foreground underline decoration-dotted underline-offset-2">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 whitespace-normal">
          Niche video links submitted by platform on this date. A number means multiple links.
        </TooltipContent>
      </Tooltip>
      {WARMUP_PLATFORMS.map((platform) => (
        <PlatformChip
          key={platform}
          platform={platform}
          className={cn(
            'rounded px-1 py-0.5 font-medium',
            counts[platform] > 0 ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
          )}
          suffix={counts[platform] > 1 ? ` ${counts[platform]}` : ''}
        />
      ))}
    </div>
  );
}

function PlatformChip({
  platform,
  className,
  suffix = '',
}: {
  platform: WarmupPlatform;
  className: string;
  suffix?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('cursor-help', className)}>
          {PLATFORM_LABEL[platform]}
          {suffix}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{PLATFORM_NAME[platform]}</TooltipContent>
    </Tooltip>
  );
}
