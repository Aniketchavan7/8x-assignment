'use server';

import { cache } from 'react';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories, ErrorSeverity } from '@/lib/analytics/events';
import { logAdminAction } from '@/lib/modules/admin/audit-log';
import { transferToCreator } from '@/lib/payments/stripe-connect';
import type { StripeRegion } from '@/lib/payments/stripe-router';

export interface ProcessCpmPayoutResult {
  success: boolean;
  transactionId?: string;
  amountPaid?: number;
  newEarningsPaid?: number;
  currency?: string;
  stripeTransferId?: string;
  error?: string;
}

export interface CpmPayoutRecord {
  transactionId: string;
  amount: number;
  createdAt: string;
  completedAt: string | null;
  status: string;
  description: string | null;
}

export interface CreatorUnpaidCpmSummary {
  totalUnpaid: number;
  submissionCount: number;
}

/**
 * Verify that the given user is an admin.
 */
async function verifyAdminStatus(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', userId)
    .single();

  return !error && data?.account_type === 'admin';
}

/**
 * Process a payout for a single CPM submission using atomic Postgres function.
 * The function locks the row, creates transaction, updates wallet and submission atomically.
 * Then transfers the money to the creator's Stripe Connect account.
 * Incremental model: same submission can be paid multiple times as views grow.
 */
export async function processCpmSubmissionPayout(
  submissionId: string,
  adminId: string
): Promise<ProcessCpmPayoutResult> {
  const supabase = createServiceRoleClient();

  try {
    // Verify admin status first (before calling the RPC)
    const isAdmin = await verifyAdminStatus(adminId);
    if (!isAdmin) {
      return { success: false, error: 'Forbidden: Admin access required' };
    }

    // Call the atomic Postgres function that handles locking and all updates
    const { data, error } = await supabase.rpc('process_cpm_payout', {
      p_submission_id: submissionId,
      p_admin_id: adminId,
    });

    if (error) {
      captureError(error, {
        category: ErrorCategories.DATABASE,
        operation: 'process_cpm_payout_rpc',
        severity: ErrorSeverity.ERROR,
        metadata: { submissionId, adminId },
      });
      return { success: false, error: 'Failed to process payout' };
    }

    const result = data as {
      success: boolean;
      error?: string;
      transaction_id?: string;
      amount_paid?: number;
      new_earnings_paid?: number;
      creator_profile_id?: string;
      currency?: string;
    };

    if (!result.success) {
      return { success: false, error: result.error || 'Payout failed' };
    }

    const creatorProfileId = result.creator_profile_id;
    if (!creatorProfileId) {
      return {
        success: true,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        newEarningsPaid: result.new_earnings_paid,
        currency: result.currency,
        error: 'Database updated but Stripe transfer skipped: No creator profile ID returned',
      };
    }

    // Get creator's Stripe account info for the transfer
    const { data: creatorProfile, error: profileError } = await supabase
      .from('creator_profiles')
      .select('stripe_account_id, stripe_region, display_name')
      .eq('id', creatorProfileId)
      .single();

    if (profileError || !creatorProfile) {
      captureError(profileError || new Error('Creator profile not found'), {
        category: ErrorCategories.DATABASE,
        operation: 'get_creator_for_stripe_transfer',
        severity: ErrorSeverity.ERROR,
        metadata: { submissionId, creatorProfileId },
      });
      // Database update succeeded but Stripe transfer failed - return partial success
      return {
        success: true,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        newEarningsPaid: result.new_earnings_paid,
        currency: result.currency,
        error: 'Database updated but Stripe transfer skipped: Creator profile not found',
      };
    }

    // Skip Stripe transfer if creator doesn't have a connected Stripe account
    if (!creatorProfile.stripe_account_id) {
      console.log('[CPM PAYOUT] Creator has no Stripe account, skipping transfer:', {
        creatorProfileId: creatorProfileId,
        amountPaid: result.amount_paid,
      });

      await logAdminAction(adminId, 'cpm_payout_processed', {
        submissionId,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        creatorProfileId: creatorProfileId,
        currency: result.currency,
        stripeTransferSkipped: true,
        skipReason: 'no_stripe_account',
      });

      return {
        success: true,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        newEarningsPaid: result.new_earnings_paid,
        currency: result.currency,
        error: 'Creator has not connected Stripe - funds recorded but not transferred',
      };
    }

    // Transfer money to creator's Stripe Connect account
    // Always pay in USD - Stripe auto-converts to creator's bank currency
    let stripeTransferId: string | undefined;
    try {
      const transfer = await transferToCreator(
        creatorProfile.stripe_account_id,
        result.amount_paid!,
        `CPM payout for submission ${submissionId}`,
        'USD',
        {
          submission_id: submissionId,
          transaction_id: result.transaction_id || '',
          admin_id: adminId,
          transfer_type: 'cpm_payout',
          creator_profile_id: creatorProfileId,
        },
        creatorProfile.stripe_region as StripeRegion | undefined
      );

      stripeTransferId = transfer.id;

      // Update transaction record with Stripe transfer ID and status
      if (result.transaction_id) {
        await supabase
          .from('creator_transactions')
          .update({
            stripe_transfer_id: stripeTransferId,
            stripe_transfer_status: 'completed',
          })
          .eq('id', result.transaction_id);
      }

      console.log('[CPM PAYOUT] Stripe transfer successful:', {
        submissionId,
        creatorProfileId: creatorProfileId,
        amountPaid: result.amount_paid,
        stripeTransferId,
      });
    } catch (stripeError) {
      captureError(stripeError, {
        category: ErrorCategories.STRIPE,
        operation: 'cpm_stripe_transfer',
        severity: ErrorSeverity.ERROR,
        metadata: {
          submissionId,
          creatorProfileId: creatorProfileId,
          amountPaid: result.amount_paid,
          stripeAccountId: creatorProfile.stripe_account_id,
        },
      });

      // Log the partial success
      await logAdminAction(adminId, 'cpm_payout_processed', {
        submissionId,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        creatorProfileId: creatorProfileId,
        currency: result.currency,
        stripeTransferFailed: true,
        stripeError: stripeError instanceof Error ? stripeError.message : 'Unknown error',
      });

      // Database update succeeded but Stripe transfer failed
      return {
        success: true,
        transactionId: result.transaction_id,
        amountPaid: result.amount_paid,
        newEarningsPaid: result.new_earnings_paid,
        currency: result.currency,
        error: `Database updated but Stripe transfer failed: ${stripeError instanceof Error ? stripeError.message : 'Unknown error'}`,
      };
    }

    // Log the successful payout for audit
    await logAdminAction(adminId, 'cpm_payout_processed', {
      submissionId,
      transactionId: result.transaction_id,
      amountPaid: result.amount_paid,
      creatorProfileId: creatorProfileId,
      currency: result.currency,
      stripeTransferId,
    });

    return {
      success: true,
      transactionId: result.transaction_id,
      amountPaid: result.amount_paid,
      newEarningsPaid: result.new_earnings_paid,
      currency: result.currency,
      stripeTransferId,
    };
  } catch (error) {
    captureError(error, {
      category: ErrorCategories.UNKNOWN,
      operation: 'process_cpm_payout',
      severity: ErrorSeverity.ERROR,
      metadata: { submissionId, adminId },
    });
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Get payout history for a submission. Requires admin authorization.
 * Wrapped with React.cache() for per-request deduplication.
 */
export const getCpmPayoutHistory = cache(async (
  submissionId: string,
  adminId: string
): Promise<CpmPayoutRecord[]> => {
  const isAdmin = await verifyAdminStatus(adminId);
  if (!isAdmin) {
    return [];
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('creator_transactions')
    .select('id, amount, created_at, completed_at, status, description')
    .eq('related_cpm_submission_id', submissionId)
    .eq('transaction_type', 'cpm_earning')
    .order('created_at', { ascending: false });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_payout_history',
      severity: ErrorSeverity.WARNING,
      metadata: { submissionId },
    });
    return [];
  }

  return (data || []).map((tx) => ({
    transactionId: tx.id,
    amount: Math.round(Number(tx.amount) || 0),
    createdAt: tx.created_at || new Date().toISOString(),
    completedAt: tx.completed_at,
    status: tx.status || 'completed',
    description: tx.description,
  }));
});

/**
 * Get total unpaid CPM earnings for a creator. Requires admin authorization.
 * Wrapped with React.cache() for per-request deduplication.
 */
export const getCreatorUnpaidCpmTotal = cache(async (
  creatorProfileId: string,
  adminId: string
): Promise<CreatorUnpaidCpmSummary> => {
  const isAdmin = await verifyAdminStatus(adminId);
  if (!isAdmin) {
    return { totalUnpaid: 0, submissionCount: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('cpm_submissions')
    .select('earnings_total, earnings_paid')
    .eq('creator_profile_id', creatorProfileId)
    .in('status', ['approved', 'tracking', 'completed']);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_creator_unpaid_cpm_total',
      severity: ErrorSeverity.WARNING,
      metadata: { creatorProfileId },
    });
    return { totalUnpaid: 0, submissionCount: 0 };
  }

  let totalUnpaid = 0;
  let submissionCount = 0;

  for (const submission of data || []) {
    const unpaid = (Number(submission.earnings_total) || 0) - (Number(submission.earnings_paid) || 0);
    if (unpaid > 0) {
      totalUnpaid += unpaid;
      submissionCount++;
    }
  }

  return {
    totalUnpaid: Math.round(totalUnpaid),
    submissionCount,
  };
});

/**
 * Get all submissions with unpaid balances for admin dashboard. Requires admin authorization.
 * Wrapped with React.cache() for per-request deduplication.
 */
export const getUnpaidCpmSubmissions = cache(async (adminId: string): Promise<Array<{
  submissionId: string;
  creatorProfileId: string;
  creatorName: string;
  jobTitle: string;
  videoUrl: string;
  platform: string;
  earningsTotal: number;
  earningsPaid: number;
  unpaidAmount: number;
}>> => {
  const isAdmin = await verifyAdminStatus(adminId);
  if (!isAdmin) {
    return [];
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('cpm_submissions')
    .select(`
      id,
      creator_profile_id,
      video_url,
      platform,
      earnings_total,
      earnings_paid,
      creator_profile:creator_profiles(display_name),
      job:jobs(job_title)
    `)
    .in('status', ['approved', 'tracking', 'completed'])
    .gt('earnings_total', 0);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_unpaid_cpm_submissions',
      severity: ErrorSeverity.WARNING,
    });
    return [];
  }

  return (data || [])
    .map((s) => {
      const earningsTotal = Number(s.earnings_total) || 0;
      const earningsPaid = Number(s.earnings_paid) || 0;
      const unpaidAmount = Math.round(earningsTotal - earningsPaid);

      const creator = s.creator_profile as { display_name: string } | null;
      const job = s.job as { job_title: string } | null;

      return {
        submissionId: s.id,
        creatorProfileId: s.creator_profile_id,
        creatorName: creator?.display_name || 'Unknown',
        jobTitle: job?.job_title || 'Unknown Campaign',
        videoUrl: s.video_url,
        platform: s.platform,
        earningsTotal: Math.round(earningsTotal),
        earningsPaid: Math.round(earningsPaid),
        unpaidAmount,
      };
    })
    .filter((s) => s.unpaidAmount > 0);
});
