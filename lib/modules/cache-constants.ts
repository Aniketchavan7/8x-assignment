/**
 * Centralized cache time constants for React Query hooks.
 *
 * These constants define how long data is considered "fresh" before React Query
 * will refetch it. Cache times are chosen based on data volatility:
 * - Frequently changing data (subscriptions, conversations): Shorter cache times
 * - Stable data (user info, brand settings): Longer cache times
 * - Rarely changing data (jobs, creators): Very long cache times
 *
 * All hooks should import and use these constants instead of hardcoding values.
 */

export const CACHE_TIMES = {
  USER: 5 * 60 * 1000, // 5 minutes
  BRAND: 5 * 60 * 1000, // 5 minutes
  JOBS: 30 * 60 * 1000, // 30 minutes
  CREATORS: 30 * 60 * 1000, // 30 minutes
  ANALYTICS: 2 * 60 * 1000, // 2 minutes
  CONVERSATIONS: 30 * 1000, // 30 seconds
  CONVERSATION_MESSAGES: 2 * 60 * 1000, // 2 minutes — messages update via realtime, not polling
  SUBSCRIPTION_STATUS: 1 * 60 * 1000, // 1 minute
  SUBSCRIPTION_HISTORY: 5 * 60 * 1000, // 5 minutes
  APPLICATIONS: 5 * 60 * 1000, // 5 minutes
  TEAM_MEMBERS: 5 * 60 * 1000, // 5 minutes
  POSTS: 5 * 60 * 1000, // 5 minutes
  // Admin-specific cache times
  ADMIN_JOBS: 5 * 60 * 1000, // 5 minutes
  ADMIN_CREATORS: 5 * 60 * 1000, // 5 minutes
  ADMIN_BRANDS: 5 * 60 * 1000, // 5 minutes
  ADMIN_APPLICATIONS: 5 * 60 * 1000, // 5 minutes
  ADMIN_CONVERSATIONS: 2 * 60 * 1000, // 2 minutes - admin view doesn't need real-time
  ADMIN_CONVERSATION_MESSAGES: 1 * 60 * 1000, // 1 minute - messages can be slightly stale
  // Other cache times
  COUNTRIES: 10 * 60 * 1000, // 10 minutes - rarely changes
  TRACKED_ACCOUNTS: 5 * 60 * 1000, // 5 minutes
  TRACKED_POSTS: 5 * 60 * 1000, // 5 minutes
  // GA4 cache times
  GA4_CONNECTION: 2 * 60 * 1000, // 2 minutes - connection status can change
  GA4_METRICS: 30 * 60 * 1000, // 30 minutes - historical data rarely changes
  // CPM cache times
  ADMIN_CPM: 2 * 60 * 1000, // 2 minutes - CPM data may need frequent updates
  ADMIN_CAMPAIGNS: 5 * 60 * 1000, // 5 minutes
  // TikTok OAuth cache times
  TIKTOK_CONNECTION: 2 * 60 * 1000, // 2 minutes
  TIKTOK_VIDEOS: 5 * 60 * 1000, // 5 minutes
  // Instagram OAuth cache times
  INSTAGRAM_CONNECTION: 2 * 60 * 1000, // 2 minutes
  INSTAGRAM_MEDIA: 5 * 60 * 1000, // 5 minutes
  // Sync health cache times
  ADMIN_VIDEO_STORAGE: 5 * 60 * 1000, // 5 minutes - data changes with backfill cron (~5min)
} as const;
