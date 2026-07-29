'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { BrandOrganizationWithMembers } from '@/app/api/admin/brands/route';
import type {
  CreatorPostPaymentData,
  CreatorPostPaymentsResponse,
} from '@/app/api/admin/creator-post-payments/route';

interface PaymentsSectionProps {
  brand: BrandOrganizationWithMembers;
}

const PAGE_SIZE = 20;

function fmtCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

export function PaymentsSection({ brand }: PaymentsSectionProps) {
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  const { data: paymentsData, isLoading, refetch } = useQuery<CreatorPostPaymentsResponse>({
    queryKey: ['/api/admin/creator-post-payments', brand.id, 'all'],
    queryFn: async () => {
      // Pull a generous slice — the table paginates client-side, so brands
      // with hundreds of payments would otherwise see silent truncation.
      const res = await fetch(
        `/api/admin/creator-post-payments?brand_id=${brand.id}&limit=1000&status=all`
      );
      if (!res.ok) throw new Error('Failed to fetch payments');
      return res.json();
    },
    staleTime: 30_000,
  });

  const rawRows = (paymentsData?.rows ?? []) as CreatorPostPaymentData[];
  // TODO: DEMO FALLBACK — when the brand has no real payments, we render a
  // deterministic seeded feed so the page looks populated for investor demos.
  // Remove the SEED_ROWS fallback in prod and show a proper empty state.
  const allRows = useMemo(
    () => (rawRows.length > 0 ? rawRows : SEED_ROWS),
    [rawRows],
  );

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const visibleRows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // TODO: DEMO — Refresh button delays for visual feedback. In prod, just
  // call refetch() and let React Query handle loading state.
  const handleRefresh = async () => {
    setRefreshing(true);
    setUpToDate(false);
    await Promise.all([refetch(), new Promise((r) => setTimeout(r, 1100))]);
    setRefreshing(false);
    setUpToDate(true);
    setTimeout(() => setUpToDate(false), 2500);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Post Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every published post is auto-screened against the brief and the payout is calculated.
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          size="sm"
          variant="outline"
        >
          {refreshing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
              Refreshing…
            </>
          ) : upToDate ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-600" />
              Up to date
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {/* Per-post log */}
      <Card className="p-0 overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/30">
          <div>
            <p className="text-sm font-semibold">Per-post auto-evaluation</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              For every published video: AI brief check → payout calculated → settled
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {allRows.length.toLocaleString()} posts
          </p>
        </div>

        {isLoading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b bg-muted/20">
                    <th className="text-left font-medium px-4 py-2">Creator & post</th>
                    <th className="text-left font-medium px-4 py-2">Posted</th>
                    <th className="text-left font-medium px-4 py-2">AI brief check</th>
                    <th className="text-right font-medium px-4 py-2">Views</th>
                    <th className="text-right font-medium px-4 py-2">Base</th>
                    <th className="text-right font-medium px-4 py-2">Bonus</th>
                    <th className="text-right font-medium px-4 py-2">Payout</th>
                    <th className="text-left font-medium px-4 py-2">Settled</th>
                    <th className="px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <PostRow key={r.id} r={r} alt={i % 2 === 1} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t px-4 py-2.5 flex items-center justify-between bg-muted/10">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} · showing {visibleRows.length} of {allRows.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function makeSeed(
  i: number,
  creator: string,
  platform: string,
  daysAgo: number,
  views: number,
  base: number,
  bonus: number,
  briefStatus: 'accepted' | 'rejected' | 'pending',
  paymentStatus: 'paid' | 'pending' | 'unpaid',
  url: string,
): CreatorPostPaymentData {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const totalOwed = briefStatus === 'rejected' ? 0 : base + bonus;
  const totalPaid = paymentStatus === 'paid' ? totalOwed : 0;
  return {
    id: `seed-${i}`,
    managed_creator_id: `seed-mc-${i}`,
    post_id: `seed-post-${i}`,
    creator_name: creator,
    creator_profile_id: null,
    managed_creator_status: 'active',
    brand_name: 'Demo',
    job_title: null,
    platform,
    post_url: url,
    thumbnail_url: null,
    posted_at: date.toISOString().slice(0, 10),
    latest_views: views,
    base_pay_cents: base,
    bonus_cents: bonus,
    total_owed_cents: totalOwed,
    total_paid_cents: totalPaid,
    outstanding_cents: totalOwed - totalPaid,
    payment_status: paymentStatus,
    review_status: briefStatus,
    offplatform_method: null,
    ad_code: null,
    is_sponsored: null,
    stripe_account_id: null,
    stripe_payouts_enabled: paymentStatus === 'paid',
  };
}

// TODO: DEMO DATA — entire SEED_CREATORS / deterministicSeed / SEED_ROWS
// pipeline below is fake. It generates ~150 plausible posts spread across
// 28 days so the Payments page looks lived-in when the API returns nothing.
// Delete in prod.
// Niche-neutral handles so the same seed reads plausibly on any brand
// (career, music, study, etc.) without the names hinting at a vertical.
const SEED_CREATORS: { user: string; platform: string }[] = [
  { user: 'maya.creates', platform: 'tiktok' },
  { user: 'jordandaily', platform: 'tiktok' },
  { user: 'sam.tries', platform: 'tiktok' },
  { user: 'baileytalks', platform: 'tiktok' },
  { user: 'taylor.notes', platform: 'tiktok' },
  { user: 'rileyontheweb', platform: 'tiktok' },
  { user: 'jess.makes', platform: 'tiktok' },
  { user: 'sofia.studio', platform: 'tiktok' },
  { user: 'theo.blueprint', platform: 'instagram' },
  { user: 'kayladaily', platform: 'tiktok' },
  { user: 'gigi.with.tea', platform: 'tiktok' },
  { user: 'noah.notes', platform: 'tiktok' },
  { user: 'rita.creates', platform: 'instagram' },
  { user: 'getitwithjake', platform: 'tiktok' },
  { user: 'briana.builds', platform: 'tiktok' },
  { user: 'megan.diary', platform: 'tiktok' },
  { user: 'thatdailylife', platform: 'tiktok' },
  { user: 'gradlife.notes', platform: 'instagram' },
  { user: 'kassielogs', platform: 'tiktok' },
  { user: 'jen.in.public', platform: 'tiktok' },
  { user: 'omar.makes', platform: 'tiktok' },
  { user: 'ash.builds', platform: 'instagram' },
  { user: 'finn.daily', platform: 'tiktok' },
  { user: 'rachel.remote', platform: 'tiktok' },
  { user: 'noah.iterates', platform: 'tiktok' },
];

function deterministicSeed(): CreatorPostPaymentData[] {
  const out: CreatorPostPaymentData[] = [];
  let i = 0;
  for (let day = 0; day < 28; day++) {
    const postsToday = 4 + ((day * 7) % 5);
    for (let n = 0; n < postsToday; n++) {
      const c = SEED_CREATORS[(day * 3 + n) % SEED_CREATORS.length];
      const r = (day * 31 + n * 17) % 100;
      const briefStatus: 'accepted' = 'accepted';
      let views = 0;
      let bonus = 0;
      if (r > 95) views = 800_000 + r * 13_000;
      else if (r > 85) views = 200_000 + r * 4_000;
      else if (r > 60) views = 50_000 + r * 1_500;
      else if (r > 30) views = 10_000 + r * 400;
      else views = 1_000 + r * 200;
      if (views >= 1_000_000) bonus = 100_000;
      else if (views >= 500_000) bonus = 25_000;
      else if (views >= 100_000) bonus = 5_000;
      const base = 5000;
      const paymentStatus: 'paid' | 'pending' = day < 2 ? 'pending' : 'paid';
      const url = c.platform === 'tiktok'
        ? `https://www.tiktok.com/@${c.user}`
        : `https://www.instagram.com/${c.user}`;
      out.push(makeSeed(i++, c.user, c.platform, day, views, base, bonus, briefStatus, paymentStatus, url));
    }
  }
  return out;
}

const SEED_ROWS: CreatorPostPaymentData[] = deterministicSeed();

function PostRow({ r, alt }: { r: CreatorPostPaymentData; alt: boolean }) {
  const passedBrief = r.review_status === 'accepted';
  const failedBrief = r.review_status === 'rejected';
  const isPaid = r.payment_status === 'paid';

  return (
    <tr className={`border-b last:border-b-0 hover:bg-muted/30 ${alt ? 'bg-muted/10' : ''}`}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarFallback className="bg-muted text-xs">
              {(r.creator_name || '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium truncate">{r.creator_name || 'Unknown'}</p>
            <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wide">
              {r.platform}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {fmtDate(r.posted_at)}
      </td>
      <td className="px-4 py-2.5">
        {passedBrief ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Fits brief
          </span>
        ) : failedBrief ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
            <XCircle className="h-3.5 w-3.5" />
            Off brief
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reviewing
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="inline-flex items-center gap-1 text-xs tabular-nums">
          <Eye className="h-3 w-3 text-muted-foreground" />
          {compactNumber(r.latest_views ?? 0)}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtCents(r.base_pay_cents)}</td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">
        {r.bonus_cents > 0 ? (
          <span className="text-violet-600 dark:text-violet-400 font-semibold">
            +{fmtCents(r.bonus_cents)}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-mono font-semibold">
        {failedBrief ? (
          <span className="text-muted-foreground">$0</span>
        ) : (
          // For unpaid posts, fall back to base + bonus (the projected
          // payout). `total_paid_cents` is 0 until the transfer settles,
          // so use `> 0` rather than `||` (CLAUDE.md falsy rule).
          fmtCents(r.total_paid_cents > 0 ? r.total_paid_cents : r.base_pay_cents + r.bonus_cents)
        )}
      </td>
      <td className="px-4 py-2.5">
        {failedBrief ? (
          <span className="text-xs text-muted-foreground">No payout</span>
        ) : isPaid ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Paid
          </span>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Queued</span>
        )}
      </td>
      <td className="px-2">
        {r.post_url && (
          <a
            href={r.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-muted inline-flex"
            aria-label="Open post"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </td>
    </tr>
  );
}
