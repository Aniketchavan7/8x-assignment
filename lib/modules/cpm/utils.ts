import { CpmPayoutCalculation, CpmSubmission } from './types';
import { CPM_ERROR_CODES } from './error-codes';

/**
 * Cached formatters for currency display.
 * Using Map for memoization to avoid recreating formatters on every call.
 */
const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatterCache.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatterCache.set(currency, formatter);
  }
  return formatter;
}

export function calculateCpmEarnings(views: number, cpmRate: number): number {
  if (views <= 0 || cpmRate <= 0) return 0;
  return (views / 1000) * cpmRate;
}

/**
 * Calculate payout for a CPM submission based on views_approved.
 * Earnings are calculated from the total approved views, not the differential
 * between views_current and views_at_submission.
 */
export function calculateSubmissionPayout(
  submission: { views_approved: number },
  cpmRate: number,
  basePay: number,
  cap: number
): CpmPayoutCalculation {
  // Earnings are based on views_approved (total views approved by brand)
  const viewsEarned = submission.views_approved;
  const rawCpmEarnings = calculateCpmEarnings(viewsEarned, cpmRate);

  const totalBeforeCap = basePay + rawCpmEarnings;
  const capReached = totalBeforeCap > cap;
  const totalEarnings = Math.min(totalBeforeCap, cap);
  const cpmEarnings = capReached ? Math.max(0, cap - basePay) : rawCpmEarnings;

  return {
    submissionId: '',
    viewsCurrent: submission.views_approved, // Use views_approved as the "current" for display
    viewsEarned,
    cpmRate,
    cpmEarnings: Math.round(cpmEarnings * 10000) / 10000,
    basePay,
    totalEarnings: Math.round(totalEarnings * 10000) / 10000,
    capReached,
    capAmount: cap,
  };
}

export function formatEarnings(amountCents: number, currency = 'USD'): string {
  return getCurrencyFormatter(currency).format(amountCents / 100);
}

export function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M`;
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1)}K`;
  }
  return views.toString();
}

export function formatCpmRate(rateCents: number): string {
  const formatted = getCurrencyFormatter('USD').format(rateCents / 100);
  return `${formatted} per 1K views`;
}

export function hasReachedCap(totalEarnings: number, cap: number): boolean {
  return totalEarnings >= cap;
}

export function getRemainingBeforeCap(totalEarnings: number, cap: number): number {
  return Math.max(0, cap - totalEarnings);
}

export function viewsNeededForAmount(
  targetAmount: number,
  cpmRate: number,
  currentEarnings = 0
): number {
  if (cpmRate <= 0) return Infinity;
  const amountNeeded = targetAmount - currentEarnings;
  if (amountNeeded <= 0) return 0;
  return Math.ceil((amountNeeded / cpmRate) * 1000);
}

const STATUS_COLORS: Record<string, string> = {
  pending_fetch: 'blue',
  fetch_failed: 'yellow',
  ineligible: 'orange',
  pending_approval: 'yellow',
  approved: 'green',
  rejected: 'red',
  tracking: 'blue',
  completed: 'gray',
  paid: 'green',
  cancelled: 'gray',
};

export function getSubmissionStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'gray';
}

export function getSubmissionStatusInfo(
  status: string,
  errorInfo?: {
    lastFetchError?: string | null;
    ineligibilityReason?: string | null;
    viewsCurrent?: number;
    payoutThreshold?: number;
  }
): { label: string; color: string; description: string; descriptionKey?: string } {
  // Check if views are below threshold for pending_approval status
  const viewsCurrent = errorInfo?.viewsCurrent ?? 0;
  const threshold = errorInfo?.payoutThreshold ?? 1000;
  const isBelowThreshold = viewsCurrent < threshold;

  const statusMap: Record<string, { label: string; color: string; description: string; descriptionKey?: string }> = {
    pending_fetch: {
      label: 'Verifying...',
      color: 'blue',
      description: 'Fetching video data from platform',
    },
    fetch_failed: {
      label: 'Verification in progress',
      color: 'yellow',
      description: errorInfo?.lastFetchError === 'video_not_found'
        ? 'Video not found on platform'
        : 'Retrying verification...',
    },
    ineligible: {
      label: 'Ineligible',
      color: 'orange',
      description: errorInfo?.ineligibilityReason === 'video_too_old'
        ? 'Video must be submitted within 30 minutes of posting.'
        : 'Video does not meet the campaign requirements',
      descriptionKey: errorInfo?.ineligibilityReason === 'video_too_old'
        ? CPM_ERROR_CODES.VIDEO_TOO_OLD
        : CPM_ERROR_CODES.VIDEO_INELIGIBLE,
    },
    pending_approval: isBelowThreshold
      ? {
          label: 'Building Views',
          color: 'blue',
          description: `Needs ${threshold.toLocaleString()} views for approval (${viewsCurrent.toLocaleString()} current)`,
          descriptionKey: 'belowThreshold',
        }
      : {
          label: 'Pending Review',
          color: 'yellow',
          description: 'Waiting for brand approval',
        },
    approved: {
      label: 'Approved',
      color: 'green',
      description: 'Video approved, tracking views',
    },
    rejected: {
      label: 'Rejected',
      color: 'red',
      description: 'Video was not approved',
    },
    tracking: {
      label: 'Tracking',
      color: 'blue',
      description: 'Actively tracking view counts',
    },
    completed: {
      label: 'Completed',
      color: 'gray',
      description: 'Tracking period ended',
    },
    paid: {
      label: 'Paid',
      color: 'green',
      description: 'Earnings have been paid out',
    },
  };

  return statusMap[status] ?? { label: status, color: 'gray', description: '' };
}

export function isEligibleForPayout(
  submission: Pick<CpmSubmission, 'status' | 'views_approved' | 'earnings_total' | 'earnings_paid'>,
  payoutThreshold: number
): boolean {
  const eligibleStatuses = ['approved', 'tracking', 'completed'];
  if (!eligibleStatuses.includes(submission.status)) {
    return false;
  }

  // Use views_approved (brand-approved views) for payout eligibility
  const viewsApproved = submission.views_approved ?? 0;
  if (viewsApproved < payoutThreshold) {
    return false;
  }

  return submission.earnings_total > submission.earnings_paid;
}

export function getPayoutProgress(viewsEarned: number, threshold: number): number {
  if (threshold <= 0) return 100;
  return Math.min(100, Math.round((viewsEarned / threshold) * 100));
}
