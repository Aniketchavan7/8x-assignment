/**
 * CPM Campaign Constants
 *
 * Centralized defaults for CPM-related values.
 * All monetary values are in cents (e.g., 100 = $1.00).
 */

/**
 * Default values for CPM campaigns when database values are null.
 */
export const CPM_DEFAULTS = {
  /** Default CPM rate in cents ($1.00 per 1000 views) */
  RATE_CENTS: 100,
  /** Default maximum earnings cap per creator in cents ($1000) */
  CAP_CENTS: 100000,
  /** Default base pay per video in cents ($0) */
  BASE_PAY_CENTS: 0,
  /** Default minimum views before payout is eligible */
  PAYOUT_THRESHOLD: 1000,
  /** Default allowed platforms for submissions */
  PLATFORMS: ['tiktok', 'instagram', 'youtube'] as const,
} as const;

/**
 * Rate limiting configuration for CPM submissions.
 */
export const CPM_RATE_LIMITS = {
  /** Minimum seconds between video submissions per user */
  SUBMISSION_COOLDOWN_SECONDS: 3,
} as const;

/**
 * URL validation limits for CPM submissions.
 */
export const CPM_URL_LIMITS = {
  /** Maximum URL length to prevent ReDoS attacks */
  MAX_URL_LENGTH: 2048,
} as const;

/**
 * Cron job configuration for CPM sync.
 */
export const CPM_SYNC_CONFIG = {
  /** Batch size for parallel processing */
  BATCH_SIZE: 5,
  /** Delay between batches in milliseconds */
  BATCH_DELAY_MS: 500,
  /** Delay between individual requests in milliseconds */
  REQUEST_DELAY_MS: 200,
  /** Maximum pending submissions to retry per cron run */
  MAX_PENDING_RETRIES: 20,
  /** Maximum tracking submissions to sync per cron run */
  MAX_TRACKING_SYNCS: 50,
} as const;

/**
 * Campaign budget configuration for CPM campaigns.
 * All monetary values are in cents.
 */
export const CPM_BUDGET = {
  /** Minimum funding required to publish a campaign ($50) */
  MIN_FUNDING_CENTS: 5000,
  /** Minimum remaining balance before withdrawal delists campaign ($50) */
  MIN_BALANCE_BEFORE_DELIST_CENTS: 5000,
  /** Budget granted to existing CPM campaigns ($100) */
  GRANDFATHERED_BUDGET_CENTS: 10000,
} as const;

// =====================================================
// Budget Helper Functions
// =====================================================

/**
 * Calculate the maximum withdrawal amount that would delist the campaign.
 * Returns 0 if the remaining budget is already below threshold.
 */
export function calculateDelistThreshold(remainingBudgetCents: number): number {
  const amountThatWouldDelist = remainingBudgetCents - CPM_BUDGET.MIN_BALANCE_BEFORE_DELIST_CENTS + 1;
  return Math.max(0, amountThatWouldDelist);
}

/**
 * Check if a withdrawal amount would cause the campaign to be delisted.
 */
export function wouldDelistCampaign(remainingBudgetCents: number, withdrawAmountCents: number): boolean {
  return (remainingBudgetCents - withdrawAmountCents) < CPM_BUDGET.MIN_BALANCE_BEFORE_DELIST_CENTS;
}
