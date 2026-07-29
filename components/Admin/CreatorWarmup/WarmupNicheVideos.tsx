'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2 } from 'lucide-react';
import type {
  ManagedCreatorWarmupNicheVideosResponse,
  WarmupNicheVideoPlatform,
} from '@/app/api/admin/managed-creators/[id]/warmup-niche-videos/route';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const PLATFORM_LABEL: Record<WarmupNicheVideoPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  unknown: 'Other',
};

const PLATFORM_PILL: Record<WarmupNicheVideoPlatform, string> = {
  tiktok: 'border border-border bg-muted/40 text-indigo-600 dark:text-indigo-400',
  instagram: 'border border-border bg-muted/40 text-rose-600 dark:text-rose-400',
  youtube: 'border border-border bg-muted/40 text-amber-600 dark:text-amber-400',
  unknown: 'border border-border bg-muted/40 text-muted-foreground',
};

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function WarmupNicheVideos({ managedCreatorId }: { managedCreatorId: string }) {
  const query = useQuery<ManagedCreatorWarmupNicheVideosResponse>({
    queryKey: ['/api/admin/managed-creators', managedCreatorId, 'warmup-niche-videos'],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/warmup-niche-videos`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Failed to fetch warmup niche videos');
      return res.json();
    },
  });

  if (query.isLoading) {
    return (
      <Card className="p-0 gap-0 overflow-hidden">
        <NicheVideosHeader total={0} />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="p-0 gap-0 overflow-hidden">
        <NicheVideosHeader total={0} />
        <div className="py-12 text-center text-sm text-muted-foreground">
          Failed to load warmup videos.
        </div>
      </Card>
    );
  }

  if (query.data.videos.length === 0) {
    return (
      <Card className="p-0 gap-0 overflow-hidden">
        <NicheVideosHeader total={0} />
        <div className="py-12 text-center text-sm text-muted-foreground">
          No niche videos submitted yet.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <NicheVideosHeader total={query.data.videos.length} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b bg-muted/20">
              <th className="text-left font-medium px-4 py-2">Platform</th>
              <th className="text-left font-medium px-4 py-2">Submitted</th>
              <th className="pl-2 pr-6"></th>
            </tr>
          </thead>
          <tbody>
            {query.data.videos.map((video, index) => (
              <tr
                key={`${video.activityDate}-${video.url}-${index}`}
                className="border-b last:border-b-0 hover:bg-muted/30 h-14"
              >
                <td className="px-4 align-middle">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PLATFORM_PILL[video.platform]}`}
                  >
                    {PLATFORM_LABEL[video.platform]}
                  </span>
                </td>
                <td className="px-4 align-middle text-muted-foreground">
                  {formatDate(video.activityDate)}
                </td>
                <td className="pl-2 pr-6 align-middle text-right">
                  <Button asChild variant="outline" size="sm">
                    <a href={video.url} target="_blank" rel="noopener noreferrer">
                      Open
                      <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </a>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NicheVideosHeader({ total }: { total: number }) {
  return (
    <div className="border-b px-4 py-3 flex items-center justify-between bg-muted/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Submitted videos
      </p>
      <p className="text-xs text-muted-foreground">
        {total === 0 ? 'No submissions' : `${total} submission${total === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}
