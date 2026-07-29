/**
 * Type definitions for analytics API responses and database query results
 */

import type { PostData, AccountData } from './hooks';

/**
 * Supported social media platforms for analytics tracking
 */
export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube';

/**
 * Result of Supabase query for brand_tracked_social_accounts with tiktok_accounts join
 * Used in analytics API routes for unified tracking
 */
export type BrandTrackedAccountWithTikTok = {
  social_account_id: string;
  campaign: string;
  platform: 'tiktok';
  created_at: string | null;
  id?: string;
  tiktok_accounts: {
    id: string;
    tiktok_username: string;
    profile_pic_url?: string | null;
    profile_url?: string;
    is_active?: boolean | null;
    tracking_status?: 'active' | 'reduced' | 'disabled' | null;
    last_synced_at?: string | null;
    last_posts_fetched_at?: string | null;
    sync_status?: string | null;
    sync_error?: string | null;
    source?: 'manual' | 'application' | string;
    created_at?: string | null;
  };
};

/**
 * Result of Supabase query for brand_tracked_social_accounts with instagram_accounts join
 * Used in analytics API routes for unified tracking
 */
export type BrandTrackedAccountWithInstagram = {
  social_account_id: string;
  campaign: string;
  platform: 'instagram';
  created_at: string | null;
  id?: string;
  instagram_accounts: {
    id: string;
    instagram_username: string;
    instagram_user_id?: string | null;
    profile_pic_url?: string | null;
    profile_url?: string;
    is_active?: boolean | null;
    tracking_status?: 'active' | 'reduced' | 'disabled' | null;
    last_synced_at?: string | null;
    last_posts_fetched_at?: string | null;
    sync_status?: string | null;
    sync_error?: string | null;
    source?: 'manual' | 'application' | string;
    created_at?: string | null;
  };
};

/**
 * Post data with engagement metrics as returned from /api/analytics/posts
 * This matches the structure returned by the API route
 * Supports both TikTok and Instagram platforms
 */
export type ApiPostResponse = {
  id: string;
  post_url: string;
  posted_at: string;
  caption: string | null;
  thumbnail_url: string | null;
  // Platform-agnostic username (use this for display)
  username: string;
  // Legacy field for backwards compatibility
  tiktok_username: string;
  account_id: string;
  account_profile_pic_url: string | null;
  campaign: string;
  views: number | null;
  paid_views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagement_rate: number | null;
  is_outperforming: boolean;
  last_fetched_at: string | null;
  // Platform indicator
  platform: SocialPlatform;
  // View tier performance classification
  view_tier: string;
  view_tier_label: string;
  // Tracking status for the post
  tracking_status: 'active' | 'excluded' | 'untracked' | 'deleted';
  // R2 video storage URL (TikTok only)
  video_storage_url: string | null;
  // TikTok Spark Ads code (TikTok only)
  ad_code: string | null;
};

/**
 * Account data with metrics as returned from /api/analytics/accounts
 * This matches the structure returned by the API route
 * Supports both TikTok and Instagram platforms
 */
export type ApiAccountResponse = {
  id: string;
  // Platform-agnostic username (use this for display)
  username: string;
  // Legacy field for backwards compatibility
  tiktok_username: string;
  profile_url: string;
  profile_pic_url: string | null;
  source: 'manual' | 'application';
  is_active: boolean;
  tracking_status: 'active' | 'reduced' | 'disabled';
  last_synced_at: string | null;
  last_posts_fetched_at: string | null;
  sync_status: 'pending' | 'syncing' | 'completed' | 'failed' | string;
  sync_error: string | null;
  created_at: string;
  // Deletion timestamp (set when account returns 404 from platform)
  deleted_at: string | null;
  campaign: string;
  total_views: number | null;
  total_likes: number | null;
  total_comments: number | null;
  followers_count: number | null;
  posts_count: number | null;
  outperforming_videos_percentage: number | null;
  engagement_rate: number | null;
  average_video_views: number | null;
  posts_last_7_days: {
    count: number;
    daily_breakdown: number[];
    average_per_day: number;
  };
  // Health score (0-100) based on view tier performance
  health_score: number | null;
  // Breakdown of posts by performance tier
  posts_by_tier?: {
    critical: number;
    acceptable: number;
    good: number;
    amazing: number;
    viral: number;
  };
  // Platform indicator
  platform: SocialPlatform;
};

/**
 * Post data with engagement metrics (used internally in API routes)
 * Supports TikTok, Instagram, and YouTube platforms
 */
export type PostWithMetrics = {
  id: string;
  posted_at: string;
  post_url: string;
  platform: SocialPlatform;
  // TikTok-specific
  tiktok_account_id?: string | null;
  tiktok_username?: string | null;
  // Instagram-specific
  instagram_account_id?: string | null;
  instagram_username?: string | null;
  // YouTube-specific
  youtube_account_id?: string | null;
  youtube_username?: string | null;
};

/**
 * Account data with calculated metrics (used internally in API routes)
 */
export type AccountWithMetrics = AccountData;

/**
 * Creator profile type for brand creators API
 */
export type CreatorProfile = {
  user_id: string | null; // Nullable for placeholder/unclaimed profiles
  display_name: string;
  profile_picture: string | null;
};
