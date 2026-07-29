'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { showToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, BarChart3, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  postId: string;
  platform: string;
  currentViewCount: number | null;
  embedded?: boolean;
}

type StatsResult = {
  stillLive: boolean;
  viewCount: number | null;
  fetchedAt: string;
  deltaViews: number | null;
};

export function PostActionBar({ postId, platform, currentViewCount, embedded = false }: Props) {
  const [busy, setBusy] = useState<null | 'stats' | 'sync' | 'media'>(null);
  const [stats, setStats] = useState<StatsResult | null>(null);

  const post = (suffix: string) =>
    fetch(`/api/admin/lookup/post/${postId}/${suffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

  const refreshStats = async () => {
    setBusy('stats');
    setStats(null);
    try {
      const res = await post('check-live');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setStats({ ...data, deltaViews: data.deltaViews ?? null });
    } catch (err) {
      showToast({
        title: 'Refresh stats failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const forceSync = async () => {
    setBusy('sync');
    try {
      const res = await post('force-sync');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Force sync failed');
      showToast({
        title: 'Force sync queued',
        description: data.syncJobId ? `sync_jobs.id = ${data.syncJobId}` : 'Re-fetched.',
        variant: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Force sync failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const reprocessMedia = async () => {
    setBusy('media');
    try {
      const res = await post('reprocess-media');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Reprocess failed');
      showToast({
        title: 'Reprocess queued',
        description: 'Pipeline will redownload + re-run AI on this post.',
        variant: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Reprocess failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2',
        !embedded && 'sticky top-0 z-20'
      )}
    >
      <Badge>{platform}</Badge>
      <span className="font-mono text-xs text-muted-foreground">{postId}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {stats && (
          <Badge
            variant={stats.stillLive ? 'default' : 'destructive'}
            className={cn(
              'text-[10px]',
              stats.stillLive && 'bg-green-600 hover:bg-green-700'
            )}
          >
            {stats.stillLive ? 'live' : 'gone'}
            {stats.viewCount !== null && (
              <span className="ml-1 tabular-nums">
                {stats.viewCount.toLocaleString()} views
              </span>
            )}
            {stats.deltaViews !== null && stats.deltaViews !== 0 && (
              <span className="ml-1 tabular-nums">
                ({stats.deltaViews > 0 ? '+' : ''}
                {stats.deltaViews.toLocaleString()})
              </span>
            )}
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={refreshStats} disabled={busy !== null}>
              {busy === 'stats' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <BarChart3 className="mr-1 h-3.5 w-3.5" />
              )}
              Refresh stats
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-normal text-xs">
            Pulls the latest view count + status straight from the platform
            (TikTok / Instagram / YouTube), updates this post in our database,
            and shows you whether it's still live and how many views it picked
            up since last sync.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={forceSync} disabled={busy !== null}>
              {busy === 'sync' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Force sync
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-normal text-xs">
            Same as Refresh stats but also creates a row in the sync_jobs
            table, so the action shows up in Sync Health history. Use this
            when you want a paper trail (e.g. investigating why a post's stats
            look wrong and you want to prove you re-fetched).
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={reprocessMedia}
              disabled={busy !== null}
            >
              {busy === 'media' ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image className="mr-1 h-3.5 w-3.5" />
              )}
              Reprocess media
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-normal text-xs">
            Use when the thumbnail is missing/broken or the AI summary looks
            wrong. Resets the post's processing flags and triggers the
            pipeline to re-download the video and re-run AI on it.
          </TooltipContent>
        </Tooltip>
        {currentViewCount !== null && stats === null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            current: {currentViewCount.toLocaleString()} views
          </span>
        )}
      </div>
    </div>
  );
}
