/**
 * Custom hooks for analytics data fetching
 *
 * Caching Strategy:
 * - API routes use Cache-Control: private, no-store (user-specific data)
 * - React Query staleTime: 2 minutes (aligned with typical sync intervals)
 * - React Query gcTime: 10 minutes (keeps data in memory for faster subsequent loads)
 * - Cache invalidation on signout and "view as brand" context changes
 *
 * Cache Invalidation Points:
 * - User signout: Clears all analytics cache to prevent data leakage
 * - Admin "view as brand" end: Clears cache when exiting brand impersonation
 * - Manual sync triggers: Invalidates specific query keys after sync operations
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';

export interface PostData {
  id: string;
  thumbnail_url: string | null;
  caption: string | null;
  tiktok_username: string;
  account_profile_pic_url: string | null;
  post_url: string;
  posted_at: string;
  campaign: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
  is_outperforming: boolean;
  video_duration: number | null;
  paid_views: number | null;
  tracking_status: 'active' | 'excluded' | 'untracked' | 'deleted';
}

export interface AccountData {
  id: string;
  tiktok_username: string;
  profile_pic_url: string | null;
  profile_url: string;
  campaign: string;
  outperforming_videos_percentage: number | null;
  posts_count: number | null;
  total_views: number | null;
  total_likes: number | null;
  total_comments: number | null;
  engagement_rate: number | null;
  average_video_views: number | null;
  posts_last_7_days: {
    count: number;
    daily_breakdown: number[];
    average_per_day: number;
  };
  last_synced_at: string | null;
  last_posts_fetched_at: string | null;
  syncStatus?: 'pending' | 'syncing' | 'completed' | 'failed';
  platform?: 'tiktok' | 'instagram' | 'youtube';
  syncError?: string;
}

import { CACHE_TIMES } from '@/lib/modules/cache-constants';

// Shared cache configuration for analytics hooks
const CACHE_CONFIG = {
  staleTime: CACHE_TIMES.ANALYTICS, // 2 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes - keeps data in memory
  refetchOnWindowFocus: false,
  refetchOnMount: true, // Refetch on mount to ensure fresh data when navigating
} as const;

/**
 * Hook to fetch analytics posts
 * @param startDate - Optional start date for filtering posts
 * @param endDate - Optional end date for filtering posts
 * @param campaign - Optional campaign name for filtering posts
 * @param account - Optional account username for filtering posts
 * @param platform - Optional platform for filtering posts
 */
export function useAnalyticsPosts(
  startDate?: Date,
  endDate?: Date,
  campaign?: string,
  account?: string,
  platform?: string,
  fetchFn: typeof fetch = fetch
) {
  return useQuery({
    queryKey: [
      '/api/analytics/posts',
      startDate?.toISOString(),
      endDate?.toISOString(),
      campaign,
      account,
      platform,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) {
        params.append('startDate', startDate.toISOString());
      }
      if (endDate) {
        params.append('endDate', endDate.toISOString());
      }
      if (campaign) {
        params.append('campaign', campaign);
      }
      if (account) {
        params.append('account', account);
      }
      if (platform) {
        params.append('platform', platform);
      }
      // Fetch posts for analytics overview (high limit for accurate calculations)
      params.append('limit', '5000');
      const url = `/api/analytics/posts?${params.toString()}`;

      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics posts');
      }
      const result = await response.json();
      return result.data || [];
    },
    placeholderData: keepPreviousData,
    ...CACHE_CONFIG,
  });
}

export type ChartMetricType = 'views_gained' | 'views_by_post_date';

import type { ChartDataResponse } from './chart-data/types';
export type { ChartDataPoint, ChartDataTotals, ChartDataResponse } from './chart-data/types';

export interface UseChartDataOptions {
  enabled?: boolean;
}

export interface UseChartDataParams {
  startDate: Date | null;
  endDate: Date | null;
  campaign?: string;
  account?: string;
  platform?: string;
  metricType?: ChartMetricType;
  allTime?: boolean;
}

/**
 * Hook to fetch chart data
 * @param startDate - Start date for filtering posts (can be null for allTime)
 * @param endDate - End date for filtering posts (can be null for allTime)
 * @param campaign - Optional campaign name for filtering posts
 * @param account - Optional account username for filtering posts
 * @param platform - Optional platform for filtering posts
 * @param metricType - Type of metric to display:
 *   - 'views_gained': Shows actual views gained per day (default), includes totals for KPIs
 *   - 'views_by_post_date': Shows views for posts uploaded on each day (legacy)
 * @param options - Additional options (enabled, fetchFn, allTime)
 */
export function useChartData(
  startDate: Date | null,
  endDate: Date | null,
  campaign?: string,
  account?: string,
  platform?: string,
  metricType: ChartMetricType = 'views_gained',
  fetchFn: typeof fetch = fetch,
  options: UseChartDataOptions & { allTime?: boolean } = {}
) {
  const { enabled = true, allTime = false } = options;

  return useQuery({
    queryKey: [
      '/api/analytics/chart-data',
      startDate?.toISOString(),
      endDate?.toISOString(),
      campaign,
      account,
      platform,
      metricType,
      allTime,
    ],
    queryFn: async (): Promise<ChartDataResponse> => {
      // For allTime mode, we can proceed without dates - API will handle it
      if (!allTime && (!startDate || !endDate)) {
        return { data: [], totals: undefined };
      }

      const params = new URLSearchParams({ metricType });

      // For allTime, pass the flag instead of calculated dates
      if (allTime) {
        params.append('allTime', 'true');
      } else if (startDate && endDate) {
        params.append('startDate', startDate.toISOString());
        params.append('endDate', endDate.toISOString());
      }

      if (campaign) {
        params.append('campaign', campaign);
      }
      if (account) {
        params.append('account', account);
      }
      if (platform) {
        params.append('platform', platform);
      }
      const url = `/api/analytics/chart-data?${params.toString()}`;

      const response = await fetchFn(url);

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const result = await response.json();
      return {
        data: result.data || [],
        totals: result.totals,
      };
    },
    ...CACHE_CONFIG,
    enabled: enabled && (allTime || (!!startDate && !!endDate)),
  });
}

/**
 * Hook to fetch analytics accounts
 * @param fetchFn - Optional fetch function for context injection (e.g., admin view-as)
 */
export function useAnalyticsAccounts(fetchFn: typeof fetch = fetch) {
  return useQuery({
    queryKey: ['/api/analytics/accounts'],
    queryFn: async () => {
      const response = await fetchFn('/api/analytics/accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics accounts');
      }
      const result = await response.json();
      return result.data || [];
    },
    ...CACHE_CONFIG,
  });
}
