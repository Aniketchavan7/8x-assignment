import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type { SocialPlatform } from '@/lib/analytics/types';

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ChartDataParams {
  startDate: Date;
  endDate: Date;
  isAllTime: boolean;
  filterCampaign?: string;
  filterAccount?: string;
  filterPlatform?: SocialPlatform;
  metricType: 'views_gained' | 'views_by_post_date';
}

export interface ChartDataPoint {
  date: string; // DD/MM format
  views: number;
  cumulative: number;
}

export interface ChartDataTotals {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
}

export interface ChartDataResponse {
  data: ChartDataPoint[];
  totals?: ChartDataTotals;
}

// ============================================================================
// Internal Data Structures
// ============================================================================

export interface FilteredAccount {
  id: string;
  username: string;
  platform: SocialPlatform;
}

export interface PostWithPostedAt {
  id: string;
  posted_at: string;
}

export interface DailyBucketRow {
  bucket_date: string;
  views_gained: number;
  likes_gained: number;
  comments_gained: number;
  shares_gained: number;
}

// ============================================================================
// Supabase Client Type
// ============================================================================

export type AuthenticatedSupabaseClient = SupabaseClient<Database>;
