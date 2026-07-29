'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Lock, Pencil } from 'lucide-react';
import { CACHE_TIMES } from '@/lib/modules/cache-constants';
import type { CampaignDetailResponse } from '@/app/api/admin/brand-campaigns/[campaignId]/detail/route';
import type { BrandCampaignRow } from '@/components/Admin/AdminGrid/brandCampaignColumnDefs';

interface CampaignDetailModalProps {
  campaignId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (campaignId: string) => void;
  accessible?: boolean;
  previewRow?: BrandCampaignRow | null;
}

function formatCents(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$${(value / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  completed: 'outline',
};

export function CampaignDetailModal({
  campaignId,
  open,
  onOpenChange,
  onEdit,
  accessible = true,
  previewRow,
}: CampaignDetailModalProps) {
  const { data, isLoading, isError } = useQuery<CampaignDetailResponse>({
    queryKey: ['/api/admin/brand-campaigns', campaignId, 'detail'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brand-campaigns/${campaignId}/detail`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch campaign detail');
      return res.json();
    },
    enabled: !!campaignId && open && accessible,
    staleTime: CACHE_TIMES.ADMIN_CAMPAIGNS,
  });

  if (!accessible && previewRow) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
              {previewRow.name}
            </DialogTitle>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{previewRow.brand_name}</span>
              <span>·</span>
              <Badge variant={STATUS_VARIANT[previewRow.status] ?? 'outline'}>
                {previewRow.status}
              </Badge>
              {previewRow.country && (
                <>
                  <span>·</span>
                  <span>{previewRow.country}</span>
                </>
              )}
            </div>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {previewRow.job_id == null
              ? 'This campaign has no linked job, so it isn’t scoped to any account manager. Ask a senior account manager or super admin to link a job, or to view the campaign on your behalf.'
              : 'You don’t have access to this campaign yet. Ask a senior account manager or super admin to grant access.'}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const bonusCount = Array.isArray(data?.campaign.bonus_milestones)
    ? data!.campaign.bonus_milestones.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-[95vw] !max-h-[92vh] overflow-y-auto">
        {isLoading || !data ? (
          <>
            <DialogTitle className="sr-only">Campaign details</DialogTitle>
            {isError ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Failed to load campaign.
              </div>
            ) : (
              <LoadingSkeleton />
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl">{data.campaign.name}</DialogTitle>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {data.campaign.brand_slug ? (
                      <Link
                        href={`/admin/brands/${data.campaign.brand_slug}`}
                        className="inline-flex items-center gap-1 text-foreground hover:underline"
                      >
                        {data.campaign.brand_name}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span>{data.campaign.brand_name ?? 'Unknown brand'}</span>
                    )}
                    <span className="text-muted-foreground">·</span>
                    <Badge variant={STATUS_VARIANT[data.campaign.status] ?? 'outline'}>
                      {data.campaign.status}
                    </Badge>
                    {data.campaign.country && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{data.campaign.country}</span>
                      </>
                    )}
                  </div>
                </div>
                {onEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(data.campaign.id)}
                    className="shrink-0"
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <Section title="Overview">
                <Stat label="Platforms" value={data.campaign.platforms.join(', ') || '—'} />
                <Stat label="Start date" value={formatDate(data.campaign.start_date)} />
                <Stat label="End date" value={formatDate(data.campaign.end_date)} />
                <Stat
                  label="Job"
                  value={
                    data.campaign.job_id && data.campaign.job_title
                      ? data.campaign.job_title
                      : '— (no linked job)'
                  }
                />
              </Section>

              <Section title="Compensation">
                <Stat
                  label="Base pay / video"
                  value={formatCents(data.campaign.base_pay_per_video_cents)}
                />
                <Stat label="Monthly cap" value={formatCents(data.campaign.monthly_cap_cents)} />
                <Stat
                  label="Referral bonus"
                  value={formatCents(data.campaign.referral_bonus_cents)}
                />
                <Stat
                  label="Min views threshold"
                  value={formatNumber(data.campaign.min_views_threshold)}
                />
                <Stat
                  label="Min views pay"
                  value={formatCents(data.campaign.min_views_pay_cents)}
                />
                <Stat label="Bonus milestones" value={bonusCount.toString()} />
              </Section>

              <Section title="Payment stats">
                <Stat label="Total videos" value={formatNumber(data.stats.totalVideos)} highlight />
                <Stat label="Total paid" value={formatCents(data.stats.totalPaidCents)} highlight />
                <Stat label="Total owed" value={formatCents(data.stats.totalOwedCents)} highlight />
                <Stat
                  label="Remaining to pay"
                  value={formatCents(data.stats.remainingCents)}
                  highlight
                />
              </Section>

              {Object.keys(data.stats.postsByStatus).length > 0 && (
                <Section title="Posts by payment status">
                  {Object.entries(data.stats.postsByStatus).map(([status, count]) => (
                    <Stat key={status} label={status} value={count.toString()} />
                  ))}
                </Section>
              )}

              {data.creators.length > 0 && <CreatorsTable creators={data.creators} />}

              {data.campaign.notes && (
                <Section title="Notes">
                  <p className="col-span-full whitespace-pre-wrap text-sm text-muted-foreground">
                    {data.campaign.notes}
                  </p>
                </Section>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? 'rounded-md border bg-muted/30 p-3' : ''}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

type Creator = CampaignDetailResponse['creators'][number];
type SortKey = 'display_name' | 'status' | 'videos' | 'paidCents' | 'owedCents' | 'remainingCents';

function CreatorsTable({ creators }: { creators: Creator[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('remainingCents');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const rows = creators.map((c) => ({
      ...c,
      remainingCents: Math.max(0, c.owedCents - c.paidCents),
    }));
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [creators, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(typeof sorted[0]?.[key] === 'number' ? 'desc' : 'asc');
    }
  };

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Creators ({creators.length})
      </h3>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <SortableTh label="Creator" col="display_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="left" />
              <SortableTh label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="left" />
              <SortableTh label="Videos" col="videos" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortableTh label="Paid" col="paidCents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortableTh label="Owed" col="owedCents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortableTh label="Remaining" col="remainingCents" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const handle = c.tiktok_username || c.instagram_username || c.youtube_username || '';
              return (
                <tr key={c.managed_creator_id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.display_name || '—'}</div>
                    {handle && (
                      <div className="text-xs text-muted-foreground truncate">@{handle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.status ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.videos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCents(c.paidCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCents(c.owedCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCents(c.remainingCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  align: 'left' | 'right';
}) {
  const active = sortKey === col;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-3/5" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
