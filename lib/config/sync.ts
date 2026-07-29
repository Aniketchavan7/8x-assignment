/**
 * Centralized sync configuration for v2 architecture
 *
 * All tunable parameters for the sync system are defined here.
 * This makes it easy to adjust sync behavior without modifying cron logic.
 */

export const SYNC_CONFIG = {
  /**
   * TikTok sync configuration
   * TikTok has generous rate limits (1200 req/min)
   */
  tiktok: {
    /** Sync interval in hours - only sync accounts not synced within this period */
    syncIntervalHours: 4,
    /** Full sync interval in hours - trigger full sync if last full sync was longer ago */
    fullSyncIntervalHours: 24,
    /** Maximum accounts to process per 5-minute cron run */
    maxAccountsPerRun: 20,
    /** Number of accounts to process concurrently in a batch */
    batchSize: 5,
    /** Delay between batches in milliseconds */
    interBatchDelayMs: 1000,
  },

  /**
   * Instagram sync configuration
   * Instagram has strict rate limits (50 req/min) - use conservative settings
   */
  instagram: {
    /** Sync interval in hours - longer than TikTok due to rate limits */
    syncIntervalHours: 6,
    /** Full sync interval in hours - trigger full sync if last full sync was longer ago */
    fullSyncIntervalHours: 24,
    /** Maximum accounts to process per 5-minute cron run */
    maxAccountsPerRun: 14,
    /** Number of accounts to process concurrently in a batch */
    batchSize: 2,
    /** Delay between batches in milliseconds */
    interBatchDelayMs: 3000,
  },

  /**
   * YouTube sync configuration
   * Conservative settings similar to Instagram
   */
  youtube: {
    /** Sync interval in hours */
    syncIntervalHours: 4,
    /** Full sync interval in hours - trigger full sync if last full sync was longer ago */
    fullSyncIntervalHours: 24,
    /** Maximum accounts to process per 5-minute cron run */
    maxAccountsPerRun: 14,
    /** Number of accounts to process concurrently in a batch */
    batchSize: 2,
    /** Delay between batches in milliseconds */
    interBatchDelayMs: 3000,
  },

  /**
   * Backfill configuration for new accounts
   */
  backfill: {
    /** Maximum accounts to process per backfill cron run (both platforms combined) */
    maxAccountsPerRun: 10,
  },

  /**
   * Listening passive accounts - used for social listening with infrequent syncs
   * These accounts sync once on connection (via backfill), then at 48-hour intervals.
   * Only quick syncs are performed (latest page of posts + metrics).
   */
  listeningPassive: {
    /** Sync interval in hours - every 2 days */
    syncIntervalHours: 48,
  },

  /**
   * Video backfill configuration
   * Downloads TikTok videos to Supabase Storage for transcript generation
   */
  videoBackfill: {
    /** Maximum posts to process per cron run */
    maxPostsPerRun: 40,
    /** Number of posts to download concurrently (kept at 1 to avoid OOM — videos can be 100+ MB) */
    batchSize: 1,
    /** Delay between batches in milliseconds */
    interBatchDelayMs: 2000,
    /** Maximum retry attempts for transient errors before giving up */
    maxRetries: 3,
    /** Daily download count at which to send a Slack alert (informational, does not stop downloads) */
    dailyAlertThreshold: 950,
  },

  /**
   * Video processing configuration
   * Reactive pipeline: download → transcribe (Groq) → analyze (Gemini)
   * Triggered by pg_net on post INSERT, with backfill cron as safety net
   */
  videoProcessing: {
    /** Maximum retry attempts before giving up */
    maxRetries: 3,
    /** Maximum posts for backfill safety net to pick up per run */
    maxPostsPerSafetyNetRun: 10,
  },

  /**
   * Shared configuration
   */
  shared: {
    /** Maximum duration for cron jobs in seconds (Vercel Pro limit) */
    maxDuration: 800,
    /** Timeout monitor warning threshold in seconds */
    warningThresholdSeconds: 240,
    /** Timeout monitor shutdown threshold in seconds (should be < maxDuration) */
    shutdownThresholdSeconds: 720,
    /** Time in minutes after which stuck syncs are cleaned up */
    stuckSyncCleanupMinutes: 10,
    /** Max consecutive failures before auto-disabling tracking (account likely deleted) */
    maxConsecutiveFailures: 5,
  },
} as const;

export type Platform = 'tiktok' | 'instagram' | 'youtube';

/**
 * Get platform-specific config
 */
export function getPlatformConfig(platform: Platform) {
  return SYNC_CONFIG[platform];
}

/**
 * Determine sync mode based on last full sync timestamp
 * Full sync if lastFullSyncedAt is NULL or older than fullSyncIntervalHours
 */
export function determineSyncMode(
  platform: Platform,
  lastFullSyncedAt: string | null
): 'quick' | 'full' {
  if (!lastFullSyncedAt) {
    return 'full';
  }

  const config = getPlatformConfig(platform);
  const fullSyncThreshold = new Date(
    Date.now() - config.fullSyncIntervalHours * 60 * 60 * 1000
  );
  const lastFullSync = new Date(lastFullSyncedAt);

  return lastFullSync < fullSyncThreshold ? 'full' : 'quick';
}
