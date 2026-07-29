'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, CalendarDays, Images, Link2 } from 'lucide-react';
import type { CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';
import {
  Select as SelectRadix,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select-radix';
import { cn } from '@/lib/utils';
import { WarmupSummaryCalendar } from './WarmupSummaryCalendar';
import { WarmupNicheVideos } from './WarmupNicheVideos';
import { WarmupScreenshotReview } from './WarmupScreenshotReview';

type ManagedCreator = CreatorDetailResponse['managedCreators'][number];
type WarmupSubView = 'summary' | 'niche-videos' | 'screenshots';

const SUB_VIEWS: Array<{ id: WarmupSubView; label: string; icon: typeof CalendarDays }> = [
  { id: 'summary', label: 'Summary', icon: CalendarDays },
  { id: 'niche-videos', label: 'Niche Videos', icon: Link2 },
  { id: 'screenshots', label: 'Screenshot Review', icon: Images },
];

export function WarmupContent({
  managedCreators,
  defaultBrandId,
}: {
  managedCreators: ManagedCreator[];
  defaultBrandId?: string;
}) {
  const creatorsWithBrand = useMemo(
    () => managedCreators.filter((mc) => mc.brand_organization_id),
    [managedCreators]
  );
  const [activeBrandId, setActiveBrandId] = useState<string | null>(
    defaultBrandId || creatorsWithBrand[0]?.brand_organization_id || null
  );
  const [activeSubView, setActiveSubView] = useState<WarmupSubView>('summary');

  const activeMc = creatorsWithBrand.find((mc) => mc.brand_organization_id === activeBrandId);

  if (creatorsWithBrand.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        No campaigns found
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        {creatorsWithBrand.length > 1 ? (
          <SelectRadix
            value={activeBrandId ?? undefined}
            onValueChange={(value) => setActiveBrandId(value)}
          >
            <SelectTrigger className="h-9 w-56 gap-2 text-sm">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {creatorsWithBrand.map((mc) => (
                <SelectItem key={mc.id} value={mc.brand_organization_id ?? ''}>
                  {mc.brand_name || 'Unknown'}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRadix>
        ) : (
          <div className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            {activeMc?.brand_name || 'Unknown campaign'}
          </div>
        )}

        <SubViewSwitcher activeSubView={activeSubView} onChange={setActiveSubView} />
      </div>

      {activeMc ? (
        <div className="space-y-5">
          {activeSubView === 'summary' && <WarmupSummaryCalendar managedCreatorId={activeMc.id} />}
          {activeSubView === 'niche-videos' && <WarmupNicheVideos managedCreatorId={activeMc.id} />}
          {activeSubView === 'screenshots' && (
            <WarmupScreenshotReview managedCreatorId={activeMc.id} />
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">Select a campaign</div>
      )}
    </div>
  );
}

function SubViewSwitcher({
  activeSubView,
  onChange,
}: {
  activeSubView: WarmupSubView;
  onChange: (view: WarmupSubView) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<WarmupSubView, HTMLButtonElement | null>>({
    summary: null,
    'niche-videos': null,
    screenshots: null,
  });
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const button = buttonRefs.current[activeSubView];
    const container = containerRef.current;
    if (!button || !container) return;
    const buttonRect = button.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setIndicator({ left: buttonRect.left - containerRect.left, width: buttonRect.width });
  }, [activeSubView]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex h-9 items-center gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-md bg-primary shadow-sm transition-[transform,width] duration-300 ease-out"
          style={{ width: indicator.width, transform: `translateX(${indicator.left - 4}px)` }}
        />
      )}
      {SUB_VIEWS.map((view) => {
        const Icon = view.icon;
        const isActive = view.id === activeSubView;
        return (
          <button
            key={view.id}
            ref={(node) => {
              buttonRefs.current[view.id] = node;
            }}
            onClick={() => onChange(view.id)}
            className={cn(
              'relative z-10 inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
              isActive
                ? 'text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
