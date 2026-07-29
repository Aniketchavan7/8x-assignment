'use client';

/**
 * Custom Cell Renderers for Admin AG Grid Tables
 *
 * These components render custom content in AG Grid cells
 * for the admin tracked accounts and posts tables.
 * Includes admin-specific renderers for brand, job, and cross-platform views.
 */

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, RefreshCw, ExternalLink, Building2, Briefcase, Download, AlertCircle, Minus } from 'lucide-react';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { PostsLast7DaysChartWithCount } from '@/components/shared/PostsLast7DaysChart';
import { getProxiedImageUrl } from '@/lib/utils/social-username';
import { formatNumber, formatPercentage, formatTimeAgoCompact } from '@/lib/utils/formatters';
import { getEngagementColor, getOutperformingColor } from '@/lib/utils/colors';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { AdminAccountGridData } from './accountColumnDefs';
import type { AdminPostGridData } from './postColumnDefs';

/**
 * Account Cell Renderer
 * Displays avatar and username for admin accounts table
 */
export function AdminAccountCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData> & {
    syncingAccountId?: string | null;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isSyncing = props.syncingAccountId === data.id;
  const imageUrl = getProxiedImageUrl(data.profilePicUrl, data.platform);

  return (
    <div className="flex items-center gap-2 h-full">
      <div className="relative flex-shrink-0">
        <Avatar className="h-8 w-8">
          {imageUrl && <AvatarImage src={imageUrl} alt={data.username} />}
          <AvatarFallback className="text-xs bg-muted">
            {data.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {isSyncing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          </div>
        )}
      </div>
      <span className="font-medium text-sm truncate">@{data.username}</span>
    </div>
  );
}

/**
 * Brand Cell Renderer
 * Displays brand name for admin cross-brand views
 */
export function AdminBrandCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData | AdminPostGridData>
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2 h-full">
      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium truncate">{data.brandName || 'Unknown'}</span>
    </div>
  );
}

export function AdminJobCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData | AdminPostGridData>
) {
  const data = props.data;
  if (!data) return null;

  if (!data.jobId) {
    return <span className="text-sm text-muted-foreground">N/A</span>;
  }

  return (
    <div className="flex items-center gap-2 h-full">
      <Briefcase className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{data.jobTitle || 'Unknown Job'}</span>
    </div>
  );
}

/**
 * Platform Cell Renderer
 * Displays platform icon with link to profile/post
 */
export function AdminPlatformCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData | AdminPostGridData> & {
    type?: 'account' | 'post';
  }
) {
  const data = props.data;
  if (!data) return null;

  const url = 'profileUrl' in data ? data.profileUrl : 'postUrl' in data ? data.postUrl : '';

  return (
    <div className="flex items-center justify-center h-full">
      <PlatformIcon platform={data.platform} url={url} type={props.type || 'account'} />
    </div>
  );
}

/**
 * Campaign Cell Renderer for admin tables
 * Shows campaign as a badge or popover for multiple campaigns
 */
export function AdminCampaignCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData> & {
    onCampaignFilter?: (campaign: string) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  const campaign = data.campaign || 'general';

  // Single campaign - just show as badge
  return (
    <div className="flex items-center justify-center h-full">
      <Badge variant="outline" className="text-xs">
        {campaign === 'general' ? 'General' : campaign}
      </Badge>
    </div>
  );
}

/**
 * Posts Last 7 Days Cell Renderer
 * Displays a mini chart of posting activity
 */
export function AdminPostsLast7DaysCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData>
) {
  const data = props.data;
  if (!data || !data.postsLast7Days) return null;

  return (
    <div className="flex justify-center items-center h-full">
      <PostsLast7DaysChartWithCount
        dailyBreakdown={data.postsLast7Days.dailyBreakdown}
        count={data.postsLast7Days.count}
        averagePerDay={data.postsLast7Days.averagePerDay}
      />
    </div>
  );
}

/**
 * Last Synced Cell Renderer
 * Displays time ago for last sync
 */
export function AdminLastSyncedCellRenderer(props: CustomCellRendererProps<AdminAccountGridData>) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm text-muted-foreground">
        {formatTimeAgoCompact(data.lastSyncedAt)}
      </span>
    </div>
  );
}

/**
 * Sync Action Cell Renderer
 * Displays sync button for accounts with job association
 */
export function AdminSyncActionCellRenderer(
  props: CustomCellRendererProps<AdminAccountGridData> & {
    syncingAccountId?: string | null;
    onSync?: (accountId: string, jobId: string) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isSyncing = props.syncingAccountId === data.id;

  if (isSyncing) {
    return (
      <div className="flex items-center justify-end gap-1.5 text-xs text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }

  if (!data.jobId) {
    return null;
  }

  return (
    <div className="flex items-center justify-end h-full">
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          props.onSync?.(data.id, data.jobId!);
        }}
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Sync
      </Button>
    </div>
  );
}

/**
 * Numeric Value Cell Renderer
 * Formats numbers with compact notation
 */
export function AdminNumericCellRenderer(props: CustomCellRendererProps & { bold?: boolean; colorClass?: string }) {
  const value = props.value;
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  const formatted = formatNumber(value);

  return (
    <div className="flex items-center justify-center h-full">
      <span className={`text-sm tabular-nums ${props.bold ? 'font-medium' : ''} ${props.colorClass || ''}`}>{formatted}</span>
    </div>
  );
}

/**
 * Badge Cell Renderer
 * Displays values as colored badges (engagement rate, outperforming %)
 */
export function AdminBadgeCellRenderer(
  props: CustomCellRendererProps & {
    colorType?: 'engagement' | 'outperforming';
  }
) {
  const value = props.value;
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">N/A</span>;
  }

  const colorFn = props.colorType === 'outperforming' ? getOutperformingColor : getEngagementColor;

  return (
    <div className="flex items-center justify-center h-full">
      <Badge className={colorFn(value)}>{formatPercentage(value)}</Badge>
    </div>
  );
}

/**
 * Post Thumbnail Cell Renderer
 * Displays post thumbnail with link to post
 */
export function AdminPostThumbnailCellRenderer(
  props: CustomCellRendererProps<AdminPostGridData> & {
    fetchingPostIds?: Set<string>;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isFetching = props.fetchingPostIds?.has(data.id);

  return (
    <div className="flex items-center gap-2 h-full">
      {data.thumbnailUrl && data.thumbnailUrl.trim() !== '' && (
        <a
          href={data.postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <img
              src={data.thumbnailUrl}
              alt="Post thumbnail"
              className="h-10 w-10 object-cover rounded border"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            {isFetching && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              </div>
            )}
          </div>
        </a>
      )}
      <a
        href={data.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        View <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

/**
 * Post Account Cell Renderer
 * Displays account username for posts table
 */
export function AdminPostAccountCellRenderer(props: CustomCellRendererProps<AdminPostGridData>) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center h-full">
      <span className="text-sm">@{data.username}</span>
    </div>
  );
}

/**
 * Date Cell Renderer
 * Displays formatted date
 */
export function AdminDateCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (!value) return <span className="text-muted-foreground">N/A</span>;

  try {
    const date = new Date(value);
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm">
          {date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    );
  } catch {
    return <span className="text-muted-foreground">{value}</span>;
  }
}

/**
 * Last Fetched Cell Renderer for posts
 * Displays time ago for last fetch
 */
export function AdminLastFetchedCellRenderer(props: CustomCellRendererProps<AdminPostGridData>) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm text-muted-foreground">
        {formatTimeAgoCompact(data.lastFetchedAt)}
      </span>
    </div>
  );
}

/**
 * Video Storage Cell Renderer
 * Shows download status: stored (clickable to view), error (clickable to see error), or pending
 */
export function AdminVideoStorageCellRenderer(props: CustomCellRendererProps<AdminPostGridData>) {
  const [showError, setShowError] = useState(false);
  const data = props.data;
  if (!data) return null;

  // Not a TikTok video/carousel — N/A
  if (data.platform?.toLowerCase() !== 'tiktok') {
    return (
      <div className="flex items-center justify-center h-full">
        <Minus className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }

  // Stored successfully
  if (data.videoStorageUrl && !data.videoStorageError) {
    return (
      <div className="flex items-center justify-center h-full">
        <a
          href={data.videoStorageUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="View stored video"
        >
          <Badge
            variant="outline"
            className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900"
          >
            <Download className="h-3 w-3 mr-1" />
            Stored
          </Badge>
        </a>
      </div>
    );
  }

  // Error
  if (data.videoStorageError) {
    return (
      <div className="flex items-center justify-center h-full">
        <Popover open={showError} onOpenChange={setShowError}>
          <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Badge
              variant="outline"
              className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-80" side="left">
            <p className="text-sm font-mono break-all">{data.videoStorageError}</p>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Pending
  return (
    <div className="flex items-center justify-center h-full">
      <Badge variant="outline" className="text-muted-foreground">
        Pending
      </Badge>
    </div>
  );
}
