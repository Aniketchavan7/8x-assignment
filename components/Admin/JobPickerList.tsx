'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { countryNameToISO } from '@/lib/utils/country-iso-mapping';
import type { BrandJobOption } from '@/app/api/admin/brands/[brandId]/jobs/route';

function countryToFlag(country: string | null): string {
  if (!country) return '';
  const iso = country.length === 2 ? country : countryNameToISO(country);
  if (!iso || iso.length !== 2) return '';
  const base = 0x1f1e6;
  const upper = iso.toUpperCase();
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCodePoint(base + a - 65) + String.fromCodePoint(base + b - 65);
}

interface JobPickerListProps {
  jobs: BrandJobOption[];
  selectedId: string | null;
  currentId: string | null;
  onSelect: (job: BrandJobOption) => void;
}

export function JobPickerList({ jobs, selectedId, currentId, onSelect }: JobPickerListProps) {
  if (jobs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground px-3 py-4 text-center border rounded-md">
        No jobs found for this brand.
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
      {jobs.map((j) => {
        const isCurrent = j.id === currentId;
        const isSelected = selectedId === j.id;
        const flag = countryToFlag(j.country);
        // Default to 2 platforms to match the SQL cascade defaults
        // (cascade_pay_config_to_posts and reassign_managed_creator_job).
        const platforms = j.cpm_platforms_allowed?.length || 2;
        const perVideo = j.cpm_base_pay != null ? j.cpm_base_pay / platforms : null;

        return (
          <button
            key={j.id}
            type="button"
            onClick={() => onSelect(j)}
            className={cn(
              'w-full flex items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted',
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {flag && <span className="mr-1">{flag}</span>}
                {j.country ?? '—'}
                <span className="text-muted-foreground font-normal ml-2">
                  {j.job_title}
                </span>
                {isCurrent && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Current
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {j.job_type?.toUpperCase() ?? 'STANDARD'} ·{' '}
                {perVideo != null
                  ? `$${(perVideo / 100).toFixed(2)}/video`
                  : 'No base pay'}{' '}
                · {platforms} platform{platforms === 1 ? '' : 's'}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { countryToFlag };
