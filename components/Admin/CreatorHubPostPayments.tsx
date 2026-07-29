'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import type { CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';

type PostPayment = CreatorDetailResponse['postPayments'][number];

interface VideoGroup {
  nativeId: string;
  posts: PostPayment[];
  totalOwed: number;
  totalPaid: number;
}

function groupPostsByVideo(posts: PostPayment[]): VideoGroup[] {
  const groups = new Map<string, PostPayment[]>();
  for (const post of posts) {
    const key = post.native_id || post.id;
    const existing = groups.get(key) || [];
    existing.push(post);
    groups.set(key, existing);
  }
  return Array.from(groups.entries()).map(([nativeId, groupPosts]) => ({
    nativeId,
    posts: groupPosts.sort((a, b) => (a.platform || '').localeCompare(b.platform || '')),
    totalOwed: groupPosts.reduce((s, p) => s + p.total_owed_cents, 0),
    totalPaid: groupPosts.reduce((s, p) => s + p.total_paid_cents, 0),
  }));
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatViews(views: number | null): string {
  if (views == null) return '\u2014';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return views.toString();
}

const statusConfig: Record<string, { bg: string; dot: string; label: string }> = {
  paid: { bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', dot: 'bg-emerald-500', label: 'Paid' },
  unpaid: { bg: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300', dot: 'bg-red-500', label: 'Unpaid' },
  partially_paid: { bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500', label: 'Partial' },
  excluded: { bg: 'bg-gray-50 text-gray-500 dark:bg-gray-900/50 dark:text-gray-400', dot: 'bg-gray-400', label: 'Excluded' },
};

function PaymentStatusBadge({ status, method }: { status: string; method: string | null }) {
  const config = statusConfig[status] || { bg: 'bg-muted text-muted-foreground', dot: 'bg-gray-400', label: status };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${config.bg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
      {method && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300 truncate max-w-[100px]" title={method}>
          {method}
        </span>
      )}
    </div>
  );
}

export function CreatorHubPostPayments({
  postPayments,
  onRefresh,
}: {
  postPayments: PostPayment[];
  onRefresh?: () => void;
}) {
  const [repricing, setRepricing] = useState(false);
  const [repriceError, setRepriceError] = useState<string | null>(null);

  const mispricedPosts = useMemo(() => postPayments.filter((p) => p.isMispriced), [postPayments]);
  const mispricedUnpaid = useMemo(
    () => mispricedPosts.filter((p) => p.payment_status !== 'paid'),
    [mispricedPosts],
  );

  const mcIdsToReprice = useMemo(() => {
    const ids = new Set<string>();
    for (const p of mispricedUnpaid) ids.add(p.managed_creator_id);
    return Array.from(ids);
  }, [mispricedUnpaid]);

  const handleReprice = async () => {
    if (mcIdsToReprice.length === 0) return;
    const confirmed = window.confirm(
      `Reprice ${mispricedUnpaid.length} unpaid post(s) to match the current job?`,
    );
    if (!confirmed) return;
    setRepriceError(null);
    setRepricing(true);
    try {
      const results = await Promise.all(
        mcIdsToReprice.map((mcId) =>
          fetch(`/api/admin/managed-creators/${mcId}/reprice-posts`, { method: 'POST' }),
        ),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const j = await failed.json().catch(() => ({}));
        throw new Error(j.error || 'Reprice failed');
      }
      onRefresh?.();
    } catch (err) {
      setRepriceError(err instanceof Error ? err.message : 'Reprice failed');
    } finally {
      setRepricing(false);
    }
  };

  if (postPayments.length === 0) {
    return <div className="text-sm text-muted-foreground">No post payments found</div>;
  }

  const groups = groupPostsByVideo(postPayments);

  return (
    <div className="space-y-3">
      {mispricedPosts.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 px-3 py-2 text-sm">
          <div>
            <span className="font-medium">{mispricedPosts.length}</span> post
            {mispricedPosts.length === 1 ? '' : 's'} priced under an old job.
            {repriceError && (
              <span className="ml-2 text-destructive">· {repriceError}</span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReprice}
            disabled={mispricedUnpaid.length === 0 || repricing}
          >
            {repricing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Repricing…
              </>
            ) : (
              `Reprice unpaid (${mispricedUnpaid.length})`
            )}
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Platform</th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Views</th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Owed</th>
              <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Paid</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Brand</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIdx) => (
              <GroupRows key={group.nativeId} group={group} isEven={groupIdx % 2 === 0} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, isEven }: { group: VideoGroup; isEven: boolean }) {
  const bgClass = isEven ? '' : 'bg-muted/20';

  return (
    <>
      {group.posts.map((post) => (
        <tr key={post.id} className={`border-b last:border-0 ${bgClass} hover:bg-muted/30 transition-colors`}>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              {post.platform && post.post_url ? (
                <PlatformIcon platform={post.platform} url={post.post_url} type="post" />
              ) : (
                <span className="text-muted-foreground text-xs">{post.platform || '\u2014'}</span>
              )}
            </div>
          </td>
          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatViews(post.latest_views)}</td>
          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
            {formatCurrency(post.total_owed_cents)}
            {post.isMispriced && (
              <div className="text-[10px] text-muted-foreground font-sans font-normal">
                priced under old job
              </div>
            )}
          </td>
          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(post.total_paid_cents)}</td>
          <td className="px-4 py-2.5">
            <PaymentStatusBadge status={post.payment_status} method={post.offplatform_method} />
          </td>
          <td className="px-4 py-2.5"><div className="text-muted-foreground truncate max-w-[140px]">{post.brand_name || '\u2014'}</div></td>
        </tr>
      ))}
      {group.posts.length > 1 && (
        <tr className="border-b last:border-0 bg-muted/40">
          <td className="px-4 py-1.5 text-xs font-medium text-muted-foreground" colSpan={2}>Video total</td>
          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-xs font-medium">{formatCurrency(group.totalOwed)}</td>
          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-xs font-medium">{formatCurrency(group.totalPaid)}</td>
          <td colSpan={2} />
        </tr>
      )}
    </>
  );
}
