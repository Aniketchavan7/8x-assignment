'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface PostPaymentDetailPanelProps {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PostPaymentDetailResponse {
  post: {
    id: string;
    platform: string;
    post_url: string;
    thumbnail_url: string | null;
    posted_at: string | null;
    latest_views: number;
  };
  payment: {
    id: string;
    managed_creator_id: string;
    base_pay_cents: number;
    cpm_rate: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    calculated_pay_cents: number;
    bonus_cents: number;
    total_owed_cents: number;
    total_paid_cents: number;
    payment_status: string;
    platform_count: number;
    created_at: string;
  };
  creator_config: {
    name: string;
    base_pay: number;
    cpm_rate: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    linked_creator_profile_id: string | null;
  };
  job_config: {
    id: string;
    title: string;
    base_pay_cents: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    platforms_required: string[];
  } | null;
  payment_history: Array<{
    id: string;
    amount: number;
    views_at_payment: number | null;
    created_at: string;
    admin_email: string | null;
  }>;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k`;
  return views.toLocaleString();
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  youtube: 'bg-red-600 text-white',
};

export function PostPaymentDetailPanel({ id, open, onOpenChange }: PostPaymentDetailPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-creator-post-payment-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/creator-post-payments/${id}`);
      if (!res.ok) throw new Error('Failed to fetch post payment detail');
      return res.json() as Promise<PostPaymentDetailResponse>;
    },
    enabled: !!id && open,
    staleTime: 30 * 1000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[600px] sm:max-w-[600px] overflow-y-auto p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Payment Detail</SheetTitle>
        </SheetHeader>
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-sm text-destructive">
            Failed to load details.
          </div>
        )}

        {data && <PanelContent data={data} />}
      </SheetContent>
    </Sheet>
  );
}

function PanelContent({ data }: { data: PostPaymentDetailResponse }) {
  const { post, payment, creator_config, job_config, payment_history } = data;
  const outstanding = payment.total_owed_cents - payment.total_paid_cents;
  const isCpm = payment.cpm_rate != null && payment.cpm_rate > 0;

  // Determine if creator config differs from job defaults
  const hasCreatorOverrides = job_config && (
    (creator_config.base_pay != null && job_config.base_pay_cents != null && creator_config.base_pay !== job_config.base_pay_cents) ||
    (creator_config.cpm_rate != null && creator_config.cpm_rate > 0) ||
    (creator_config.max_pay_cents != null && creator_config.max_pay_cents !== job_config.max_pay_cents) ||
    (creator_config.bonus_milestones && JSON.stringify(creator_config.bonus_milestones) !== JSON.stringify(job_config.bonus_milestones))
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <p className="text-lg font-semibold tracking-tight mb-4">Payment Detail</p>

        <div className="flex gap-4 items-start">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${PLATFORM_COLORS[post.platform] || 'bg-gray-500 text-white'}`}>
                {post.platform}
              </span>
              {post.post_url && (
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  View post
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="text-sm font-semibold truncate mb-3">{creator_config.name}</p>

            <div className="flex items-end gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Views</p>
                <p className="text-2xl font-bold tabular-nums leading-tight">{fmtViews(post.latest_views)}</p>
              </div>
              {post.posted_at && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Posted</p>
                  <p className="text-sm font-medium leading-tight">{fmtDate(post.posted_at)}</p>
                </div>
              )}
            </div>
          </div>

          {post.thumbnail_url ? (
            <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img
                src={post.thumbnail_url}
                alt="Post thumbnail"
                className="w-28 h-28 rounded-lg object-cover bg-muted"
              />
            </a>
          ) : (
            <div className="w-28 h-28 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <span className="text-xs font-bold uppercase text-muted-foreground">
                {post.platform}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Outstanding / Summary Bar */}
      <div className={`mx-6 rounded-lg px-4 py-3 flex items-center justify-between ${outstanding > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-green-50 dark:bg-green-950/20'}`}>
        <div className="space-y-0.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Outstanding</p>
          <p className={`text-xl font-bold font-mono tracking-tight ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {fmt(outstanding)}
          </p>
        </div>
        <div className="text-right space-y-0.5 text-xs text-muted-foreground">
          <p>Owed <span className="font-mono font-medium text-foreground">{fmt(payment.total_owed_cents)}</span></p>
          <p>Paid <span className="font-mono font-medium text-foreground">{fmt(payment.total_paid_cents)}</span></p>
        </div>
      </div>

      {/* Payment Details */}
      <div className="px-6 pt-5 pb-2">
        {/* Job name */}
        {job_config && (
          <p className="text-xs text-muted-foreground mb-3">
            Job: <span className="font-medium text-foreground">{job_config.title}</span>
          </p>
        )}

        {/* Post payment card */}
        <div className="rounded-lg border p-3">
          {payment.created_at && (
            <p className="text-[10px] text-muted-foreground mb-2">Locked {fmtDate(payment.created_at)}</p>
          )}

          {isCpm ? (
            <div className="mb-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">CPM</span>
                <span className="font-mono">{fmt(payment.cpm_rate!)}/1k</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Views</span>
                <span className="font-medium">{fmtViews(post.latest_views)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm border-t border-dashed mt-1 pt-1">
                <span className="text-muted-foreground">Calculated</span>
                <span className="font-mono font-semibold">{fmt(payment.calculated_pay_cents)}</span>
              </div>
            </div>
          ) : (
            <div className="mb-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Base Pay</span>
                <span className="font-mono font-semibold">
                  {fmt(payment.base_pay_cents)}
                  {payment.platform_count > 1 && (
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">
                      /{payment.platform_count} platforms
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {payment.bonus_cents > 0 && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Bonus</span>
              <span className="font-mono font-medium text-green-600">+{fmt(payment.bonus_cents)}</span>
            </div>
          )}

          {payment.max_pay_cents != null && (
            <div className="flex items-baseline justify-between text-xs mt-0.5">
              <span className="text-muted-foreground">Max Cap</span>
              <span className="font-mono text-muted-foreground">{fmt(payment.max_pay_cents)}</span>
            </div>
          )}

          <Milestones milestones={payment.bonus_milestones} currentViews={post.latest_views} />

          <div className="flex items-baseline justify-between text-sm border-t mt-2 pt-2 font-semibold">
            <span>Total Owed</span>
            <span className="font-mono">{fmt(payment.total_owed_cents)}</span>
          </div>
        </div>

        {/* Creator overrides (only if different from job) */}
        {hasCreatorOverrides && (
          <div className="mt-3 rounded-lg border border-dashed border-muted-foreground/25 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Creator overrides vs job default
            </p>
            {creator_config.base_pay != null && job_config!.base_pay_cents != null && creator_config.base_pay !== job_config!.base_pay_cents && (
              <div className="flex items-baseline justify-between text-xs py-0.5">
                <span className="text-muted-foreground">Base Pay</span>
                <span className="font-mono">
                  {fmt(creator_config.base_pay)}
                  <span className="text-muted-foreground ml-1">(job: {fmt(job_config!.base_pay_cents)})</span>
                </span>
              </div>
            )}
            {creator_config.cpm_rate != null && creator_config.cpm_rate > 0 && (
              <div className="flex items-baseline justify-between text-xs py-0.5">
                <span className="text-muted-foreground">CPM Rate</span>
                <span className="font-mono">{fmt(creator_config.cpm_rate)}/1k</span>
              </div>
            )}
            {creator_config.max_pay_cents != null && creator_config.max_pay_cents !== job_config!.max_pay_cents && (
              <div className="flex items-baseline justify-between text-xs py-0.5">
                <span className="text-muted-foreground">Max Cap</span>
                <span className="font-mono">
                  {fmt(creator_config.max_pay_cents)}
                  {job_config!.max_pay_cents != null && (
                    <span className="text-muted-foreground ml-1">(job: {fmt(job_config!.max_pay_cents)})</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="px-6 pt-4 pb-6 border-t mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Payment History
        </p>

        {payment_history.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No payments recorded</p>
        ) : (
          <div className="space-y-2.5">
            {payment_history.map((entry) => {
              const amountCents = typeof entry.amount === 'string' ? Math.round(parseFloat(entry.amount)) : entry.amount;
              return (
                <div key={entry.id} className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">{fmtDate(entry.created_at)}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {entry.views_at_payment != null && <span>{fmtViews(entry.views_at_payment)} views</span>}
                      {entry.admin_email && <span>{entry.admin_email}</span>}
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-sm">{fmt(amountCents)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Milestones({
  milestones,
  currentViews,
}: {
  milestones: Array<{ min_views: number; amount_cents: number }> | null;
  currentViews: number;
}) {
  if (!milestones || milestones.length === 0) return null;

  const sorted = [...milestones].sort((a, b) => a.min_views - b.min_views);
  const highestReached = sorted.filter((m) => currentViews >= m.min_views).at(-1);

  return (
    <div className="mt-1.5 pt-1.5 border-t border-dashed">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Bonuses</p>
      {sorted.map((ms, i) => {
        const reached = currentViews >= ms.min_views;
        const isActive = reached && ms.min_views === highestReached?.min_views;
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs py-px">
            <span className={reached ? 'text-green-600' : 'text-muted-foreground/40'}>
              {reached ? '\u2713' : '\u25CB'}
            </span>
            <span className={reached ? '' : 'text-muted-foreground'}>
              {fmtViews(ms.min_views)}
            </span>
            <span className={`font-mono ${reached ? '' : 'text-muted-foreground'}`}>
              +{fmt(ms.amount_cents)}
            </span>
            {isActive && <span className="text-[9px] font-semibold text-amber-600 uppercase">active</span>}
          </div>
        );
      })}
    </div>
  );
}
