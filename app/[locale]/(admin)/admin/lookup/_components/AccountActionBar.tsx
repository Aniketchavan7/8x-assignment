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
import { Loader2, RefreshCw } from 'lucide-react';

interface Props {
  socialAccountId: string;
  handle: string | null;
  platform: string | null;
}

export function AccountActionBar({ socialAccountId, handle, platform }: Props) {
  const [busy, setBusy] = useState(false);

  const forceSync = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/lookup/account/${socialAccountId}/force-sync`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Force sync failed');
      showToast({
        title: 'Force sync queued',
        description: data.syncJobId
          ? `sync_jobs.id = ${data.syncJobId}`
          : 'Edge function called.',
        variant: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Force sync failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      {platform && <Badge>{platform}</Badge>}
      {handle && <span className="font-medium">@{handle}</span>}
      <span className="font-mono text-xs text-muted-foreground">{socialAccountId}</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={forceSync} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Force sync
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs whitespace-normal text-xs">
            Re-fetches this account's profile (follower count, bio, avatar)
            and the latest 35 posts from the platform. Logs a row in
            sync_jobs. Use when an account looks stale or you've just added
            it and want to backfill immediately.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
