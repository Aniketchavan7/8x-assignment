/**
 * Unit tests for CPM utility functions.
 *
 * Tests the earnings calculation and helper functions including:
 * - calculateCpmEarnings: Core CPM rate calculation
 * - calculateSubmissionPayout: Full payout with caps and base pay
 * - isEligibleForPayout: Payout eligibility checks
 * - viewsNeededForAmount: Views needed to reach target
 * - hasReachedCap / getRemainingBeforeCap: Cap logic
 * - formatEarnings / formatViews / formatCpmRate: Display formatting
 * - getSubmissionStatusColor / getSubmissionStatusInfo: Status helpers
 * - getPayoutProgress: Progress calculation
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCpmEarnings,
  calculateSubmissionPayout,
  formatEarnings,
  formatViews,
  formatCpmRate,
  hasReachedCap,
  getRemainingBeforeCap,
  viewsNeededForAmount,
  getSubmissionStatusColor,
  getSubmissionStatusInfo,
  isEligibleForPayout,
  getPayoutProgress,
} from '../utils';

describe('CPM Utils', () => {
  describe('calculateCpmEarnings', () => {
    it('should calculate earnings correctly for standard views', () => {
      // $2.50 CPM rate (250 cents), 10,000 views = $25.00
      expect(calculateCpmEarnings(10000, 250)).toBe(2500);
    });

    it('should calculate earnings for 1,000 views exactly', () => {
      // $1.00 CPM rate, 1,000 views = $1.00
      expect(calculateCpmEarnings(1000, 100)).toBe(100);
    });

    it('should handle large view counts', () => {
      // $3.00 CPM rate, 1,000,000 views = $3,000
      expect(calculateCpmEarnings(1000000, 300)).toBe(300000);
    });

    it('should handle fractional views (less than 1000)', () => {
      // $2.00 CPM rate, 500 views = $1.00
      expect(calculateCpmEarnings(500, 200)).toBe(100);
    });

    it('should return 0 for zero views', () => {
      expect(calculateCpmEarnings(0, 250)).toBe(0);
    });

    it('should return 0 for negative views', () => {
      expect(calculateCpmEarnings(-1000, 250)).toBe(0);
    });

    it('should return 0 for zero CPM rate', () => {
      expect(calculateCpmEarnings(10000, 0)).toBe(0);
    });

    it('should return 0 for negative CPM rate', () => {
      expect(calculateCpmEarnings(10000, -100)).toBe(0);
    });
  });

  describe('calculateSubmissionPayout', () => {
    it('should calculate basic payout without cap', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 10000 },
        250, // $2.50 CPM
        0,   // No base pay
        100000 // $1000 cap
      );

      expect(result.viewsEarned).toBe(10000);
      expect(result.cpmEarnings).toBe(2500);
      expect(result.basePay).toBe(0);
      expect(result.totalEarnings).toBe(2500);
      expect(result.capReached).toBe(false);
    });

    it('should include base pay in total earnings', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 10000 },
        250, // $2.50 CPM
        1000, // $10 base pay
        100000 // $1000 cap
      );

      expect(result.cpmEarnings).toBe(2500);
      expect(result.basePay).toBe(1000);
      expect(result.totalEarnings).toBe(3500); // $25 + $10
      expect(result.capReached).toBe(false);
    });

    it('should cap earnings at maximum', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 100000 }, // 100K views
        500, // $5.00 CPM = $500 earnings (before cap)
        0,
        25000 // $250 cap
      );

      expect(result.totalEarnings).toBe(25000); // Capped at $250
      expect(result.capReached).toBe(true);
      expect(result.cpmEarnings).toBe(25000); // CPM earnings capped
    });

    it('should handle cap with base pay correctly', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 50000 }, // 50K views
        500, // $5.00 CPM = $250 CPM earnings
        10000, // $100 base pay
        30000 // $300 cap
      );

      // Total before cap: $250 + $100 = $350
      // Capped at $300
      // CPM earnings after cap: $300 - $100 base = $200
      expect(result.totalEarnings).toBe(30000);
      expect(result.cpmEarnings).toBe(20000);
      expect(result.basePay).toBe(10000);
      expect(result.capReached).toBe(true);
    });

    it('should handle zero views', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 0 },
        250,
        1000, // Base pay only
        50000
      );

      expect(result.viewsEarned).toBe(0);
      expect(result.cpmEarnings).toBe(0);
      expect(result.totalEarnings).toBe(1000); // Just base pay
      expect(result.capReached).toBe(false);
    });

    it('should handle base pay exceeding cap', () => {
      const result = calculateSubmissionPayout(
        { views_approved: 10000 },
        250,
        60000, // $600 base pay
        50000  // $500 cap
      );

      // Base pay alone exceeds cap
      expect(result.totalEarnings).toBe(50000); // Capped
      expect(result.cpmEarnings).toBe(0); // No room for CPM after base pay
      expect(result.capReached).toBe(true);
    });
  });

  describe('formatEarnings', () => {
    it('should format cents to USD correctly', () => {
      expect(formatEarnings(2500)).toBe('$25.00');
      expect(formatEarnings(100)).toBe('$1.00');
      expect(formatEarnings(0)).toBe('$0.00');
    });

    it('should handle large amounts', () => {
      expect(formatEarnings(100000)).toBe('$1,000.00');
      expect(formatEarnings(1000000)).toBe('$10,000.00');
    });

    it('should handle fractional cents', () => {
      expect(formatEarnings(150)).toBe('$1.50');
      expect(formatEarnings(99)).toBe('$0.99');
    });
  });

  describe('formatViews', () => {
    it('should format small numbers as-is', () => {
      expect(formatViews(0)).toBe('0');
      expect(formatViews(500)).toBe('500');
      expect(formatViews(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatViews(1000)).toBe('1.0K');
      expect(formatViews(1500)).toBe('1.5K');
      expect(formatViews(10000)).toBe('10.0K');
      expect(formatViews(999999)).toBe('1000.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatViews(1000000)).toBe('1.0M');
      expect(formatViews(1500000)).toBe('1.5M');
      expect(formatViews(10000000)).toBe('10.0M');
    });
  });

  describe('formatCpmRate', () => {
    it('should format CPM rate with per 1K views suffix', () => {
      expect(formatCpmRate(250)).toBe('$2.50 per 1K views');
      expect(formatCpmRate(100)).toBe('$1.00 per 1K views');
      expect(formatCpmRate(500)).toBe('$5.00 per 1K views');
    });
  });

  describe('hasReachedCap', () => {
    it('should return true when earnings equal cap', () => {
      expect(hasReachedCap(50000, 50000)).toBe(true);
    });

    it('should return true when earnings exceed cap', () => {
      expect(hasReachedCap(60000, 50000)).toBe(true);
    });

    it('should return false when earnings below cap', () => {
      expect(hasReachedCap(40000, 50000)).toBe(false);
    });

    it('should handle zero earnings', () => {
      expect(hasReachedCap(0, 50000)).toBe(false);
    });
  });

  describe('getRemainingBeforeCap', () => {
    it('should return correct remaining amount', () => {
      expect(getRemainingBeforeCap(20000, 50000)).toBe(30000);
    });

    it('should return zero when cap is reached', () => {
      expect(getRemainingBeforeCap(50000, 50000)).toBe(0);
    });

    it('should return zero when earnings exceed cap', () => {
      expect(getRemainingBeforeCap(60000, 50000)).toBe(0);
    });

    it('should return full cap when earnings are zero', () => {
      expect(getRemainingBeforeCap(0, 50000)).toBe(50000);
    });
  });

  describe('viewsNeededForAmount', () => {
    it('should calculate views needed correctly', () => {
      // Need $25 more at $2.50 CPM = 10,000 views
      expect(viewsNeededForAmount(2500, 250, 0)).toBe(10000);
    });

    it('should account for current earnings', () => {
      // Need $50 total, have $25, at $2.50 CPM = 10,000 more views
      expect(viewsNeededForAmount(5000, 250, 2500)).toBe(10000);
    });

    it('should return 0 if target already reached', () => {
      expect(viewsNeededForAmount(5000, 250, 5000)).toBe(0);
      expect(viewsNeededForAmount(5000, 250, 6000)).toBe(0);
    });

    it('should return Infinity for zero CPM rate', () => {
      expect(viewsNeededForAmount(5000, 0, 0)).toBe(Infinity);
    });

    it('should return Infinity for negative CPM rate', () => {
      expect(viewsNeededForAmount(5000, -100, 0)).toBe(Infinity);
    });

    it('should round up to nearest view', () => {
      // $1.50 at $2.00 CPM = 750 views (exactly)
      expect(viewsNeededForAmount(150, 200, 0)).toBe(750);
      // $1.51 at $2.00 CPM = 755 views (needs rounding up)
      expect(viewsNeededForAmount(151, 200, 0)).toBe(755);
    });
  });

  describe('getSubmissionStatusColor', () => {
    it('should return correct colors for known statuses', () => {
      expect(getSubmissionStatusColor('pending_fetch')).toBe('blue');
      expect(getSubmissionStatusColor('fetch_failed')).toBe('yellow');
      expect(getSubmissionStatusColor('ineligible')).toBe('orange');
      expect(getSubmissionStatusColor('pending_approval')).toBe('yellow');
      expect(getSubmissionStatusColor('approved')).toBe('green');
      expect(getSubmissionStatusColor('rejected')).toBe('red');
      expect(getSubmissionStatusColor('tracking')).toBe('blue');
      expect(getSubmissionStatusColor('completed')).toBe('gray');
      expect(getSubmissionStatusColor('paid')).toBe('green');
      expect(getSubmissionStatusColor('cancelled')).toBe('gray');
    });

    it('should return gray for unknown status', () => {
      expect(getSubmissionStatusColor('unknown')).toBe('gray');
      expect(getSubmissionStatusColor('')).toBe('gray');
    });
  });

  describe('getSubmissionStatusInfo', () => {
    it('should return info for pending_fetch', () => {
      const info = getSubmissionStatusInfo('pending_fetch');
      expect(info.label).toBe('Verifying...');
      expect(info.color).toBe('blue');
    });

    it('should return info for approved', () => {
      const info = getSubmissionStatusInfo('approved');
      expect(info.label).toBe('Approved');
      expect(info.color).toBe('green');
    });

    it('should handle pending_approval below threshold', () => {
      const info = getSubmissionStatusInfo('pending_approval', {
        viewsCurrent: 500,
        payoutThreshold: 1000,
      });
      expect(info.label).toBe('Building Views');
      expect(info.color).toBe('blue');
      expect(info.description).toContain('1,000 views');
    });

    it('should handle pending_approval above threshold', () => {
      const info = getSubmissionStatusInfo('pending_approval', {
        viewsCurrent: 2000,
        payoutThreshold: 1000,
      });
      expect(info.label).toBe('Pending Review');
      expect(info.color).toBe('yellow');
    });

    it('should handle fetch_failed with video_not_found', () => {
      const info = getSubmissionStatusInfo('fetch_failed', {
        lastFetchError: 'video_not_found',
      });
      expect(info.description).toBe('Video not found on platform');
    });

    it('should handle ineligible with video_too_old', () => {
      const info = getSubmissionStatusInfo('ineligible', {
        ineligibilityReason: 'video_too_old',
      });
      expect(info.description).toContain('30 minutes');
      expect(info.descriptionKey).toBe('video_too_old');
    });

    it('should return default for unknown status', () => {
      const info = getSubmissionStatusInfo('unknown_status');
      expect(info.label).toBe('unknown_status');
      expect(info.color).toBe('gray');
    });
  });

  describe('isEligibleForPayout', () => {
    it('should return true for approved submission meeting threshold', () => {
      const result = isEligibleForPayout(
        {
          status: 'approved',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(true);
    });

    it('should return true for tracking status', () => {
      const result = isEligibleForPayout(
        {
          status: 'tracking',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(true);
    });

    it('should return true for completed status', () => {
      const result = isEligibleForPayout(
        {
          status: 'completed',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(true);
    });

    it('should return false for pending_approval status', () => {
      const result = isEligibleForPayout(
        {
          status: 'pending_approval',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(false);
    });

    it('should return false for rejected status', () => {
      const result = isEligibleForPayout(
        {
          status: 'rejected',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(false);
    });

    it('should return false when views below threshold', () => {
      const result = isEligibleForPayout(
        {
          status: 'approved',
          views_approved: 500,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(false);
    });

    it('should return false when already fully paid', () => {
      const result = isEligibleForPayout(
        {
          status: 'approved',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 2500, // Fully paid
        },
        1000
      );
      expect(result).toBe(false);
    });

    it('should return true when partially paid', () => {
      const result = isEligibleForPayout(
        {
          status: 'approved',
          views_approved: 5000,
          earnings_total: 2500,
          earnings_paid: 1000, // Partially paid
        },
        1000
      );
      expect(result).toBe(true);
    });

    it('should handle null views_approved', () => {
      const result = isEligibleForPayout(
        {
          status: 'approved',
          views_approved: null as unknown as number,
          earnings_total: 2500,
          earnings_paid: 0,
        },
        1000
      );
      expect(result).toBe(false);
    });
  });

  describe('getPayoutProgress', () => {
    it('should return correct percentage', () => {
      expect(getPayoutProgress(500, 1000)).toBe(50);
      expect(getPayoutProgress(250, 1000)).toBe(25);
      expect(getPayoutProgress(750, 1000)).toBe(75);
    });

    it('should cap at 100%', () => {
      expect(getPayoutProgress(1500, 1000)).toBe(100);
      expect(getPayoutProgress(2000, 1000)).toBe(100);
    });

    it('should return 0 for zero views', () => {
      expect(getPayoutProgress(0, 1000)).toBe(0);
    });

    it('should return 100 for zero threshold', () => {
      expect(getPayoutProgress(500, 0)).toBe(100);
    });

    it('should return 100 for negative threshold', () => {
      expect(getPayoutProgress(500, -100)).toBe(100);
    });

    it('should round to nearest integer', () => {
      expect(getPayoutProgress(333, 1000)).toBe(33);
      expect(getPayoutProgress(666, 1000)).toBe(67);
    });
  });
});
