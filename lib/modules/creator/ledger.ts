/**
 * Creator Ledger Module
 *
 * Single source of truth for all creator money movements.
 * All balances are derived from creator_transactions - no cached values.
 */

import { createServiceRoleClient } from '@/lib/db/supabase';
import type { Database } from '@/types/supabase';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories } from '@/lib/analytics/events';

type TransactionType = Database['public']['Enums']['creator_transaction_type'];
type StripeTransferStatus = 'not_applicable' | 'pending' | 'completed' | 'failed';

// =====================================================
// Types
// =====================================================

export interface CreatorBalance {
  availableCents: number; // In Stripe, ready to withdraw
  pendingStripeCents: number; // Earned but not yet in Stripe
  totalEarnedCents: number; // Lifetime earnings
  totalWithdrawnCents: number; // Lifetime withdrawals
}

export interface RecordEarningParams {
  creatorProfileId: string;
  walletId?: string | null;
  amount: number; // cents, positive
  type: Extract<TransactionType, 'cpm_earning' | 'earning' | 'flat_fee' | 'bonus' | 'adjustment'>;
  jobId?: string | null;
  cpmSubmissionId?: string | null;
  description: string;
  stripeTransferStatus?: StripeTransferStatus;
  createdBy?: string;
}

export interface RecordEarningResult {
  transactionId: string;
}

// =====================================================
// Get Creator Balance
// =====================================================

/**
 * Get creator's balance breakdown from the ledger.
 * All values derived from creator_transactions.
 */
export async function getCreatorBalance(creatorProfileId: string): Promise<CreatorBalance> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('get_creator_balance', {
    p_creator_profile_id: creatorProfileId,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_creator_balance',
      metadata: { creatorProfileId },
    });
    throw new Error(`Failed to get creator balance: ${error.message}`);
  }

  // RPC returns array with single row
  const row = Array.isArray(data) ? data[0] : data;

  return {
    availableCents: Number(row?.available_cents ?? 0),
    pendingStripeCents: Number(row?.pending_stripe_cents ?? 0),
    totalEarnedCents: Number(row?.total_earned_cents ?? 0),
    totalWithdrawnCents: Number(row?.total_withdrawn_cents ?? 0),
  };
}

// =====================================================
// Record Earning
// =====================================================

/**
 * Record an earning transaction in the ledger.
 * This is the single entry point for all earnings (CPM, flat fee, bonus, etc.)
 *
 * Uses atomic RPC function with advisory lock to prevent race conditions
 * in concurrent balance calculations.
 */
export async function recordEarning(params: RecordEarningParams): Promise<RecordEarningResult> {
  const supabase = createServiceRoleClient();

  const {
    creatorProfileId,
    walletId,
    amount,
    type,
    jobId,
    cpmSubmissionId,
    description,
    stripeTransferStatus = 'pending',
  } = params;

  if (amount <= 0) {
    throw new Error('Earning amount must be positive');
  }

  // Use atomic RPC function with advisory lock to prevent race conditions
  const { data, error } = await supabase.rpc('record_earning_atomic', {
    p_creator_profile_id: creatorProfileId,
    p_amount: amount,
    p_type: type,
    p_job_id: jobId ?? undefined,
    p_cpm_submission_id: cpmSubmissionId ?? undefined,
    p_description: description,
    p_stripe_transfer_status: stripeTransferStatus,
    p_wallet_id: walletId ?? undefined,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'record_earning',
      metadata: { creatorProfileId, amount, type },
    });
    throw new Error(`Failed to record earning: ${error.message}`);
  }

  // RPC returns jsonb object with success, transaction_id, etc.
  const result = data as { success: boolean; transaction_id?: string; error?: string };

  if (!result.success) {
    throw new Error(result.error || 'Failed to record earning');
  }

  // Fire `payment_sent` notify (IOU semantics — see CLAUDE.md "Paid = database
  // IOU"). Awaited so the notify INSERT can't be killed by Vercel freezing the
  // function before it completes; errors inside notifyPaymentSent are caught.
  await notifyPaymentSent(supabase, creatorProfileId, amount, jobId ?? null, description);

  return { transactionId: result.transaction_id! };
}

async function notifyPaymentSent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  creatorProfileId: string,
  amountCents: number,
  jobId: string | null,
  description: string
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('user_id')
      .eq('id', creatorProfileId)
      .maybeSingle();
    if (!profile?.user_id) return;

    let brandOrgId: string | null = null;
    if (jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('brand_organization_id')
        .eq('id', jobId)
        .maybeSingle();
      brandOrgId = job?.brand_organization_id ?? null;
    }

    const dollars = (amountCents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const { notify } = await import('@/lib/messaging/notify');
    await notify({
      userId: profile.user_id,
      eventType: 'payment_sent',
      brandOrganizationId: brandOrgId,
      body: `You've been paid $${dollars}. ${description}`,
      data: {
        amount_cents: amountCents,
        job_id: jobId,
      },
    });
  } catch (error) {
    // Fire-and-forget — earnings are recorded even if notify fails.
    console.error('[recordEarning] notify(payment_sent) failed:', error);
  }
}

// =====================================================
// Record Withdrawal
// =====================================================

/**
 * Record a withdrawal transaction (transfer to Stripe Connect).
 * Uses atomic RPC with advisory lock to prevent race conditions.
 * Amount should be positive - it will be stored as negative by the RPC.
 *
 * Note: Withdrawals are now recorded at transfer time (in USD) rather than
 * payout time (in bank currency) to avoid currency mismatch issues.
 */
export async function recordWithdrawal(params: {
  creatorProfileId: string;
  walletId?: string | null;
  amount: number; // cents, positive (will be stored as negative)
  description: string;
  stripeTransferId?: string;
  stripePayoutId?: string;
}): Promise<RecordEarningResult> {
  const supabase = createServiceRoleClient();

  const { creatorProfileId, walletId, amount, description, stripeTransferId, stripePayoutId } = params;

  if (amount <= 0) {
    throw new Error('Withdrawal amount must be positive');
  }

  // Use atomic RPC function with advisory lock to prevent race conditions
  const { data, error } = await supabase.rpc('record_withdrawal_atomic', {
    p_creator_profile_id: creatorProfileId,
    p_amount: amount,
    p_description: description,
    p_stripe_payout_id: stripePayoutId ?? undefined,
    p_stripe_transfer_id: stripeTransferId ?? undefined,
    p_wallet_id: walletId ?? undefined,
  });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'record_withdrawal',
      metadata: { creatorProfileId, amount },
    });
    throw new Error(`Failed to record withdrawal: ${error.message}`);
  }

  // RPC returns jsonb object with success, transaction_id, etc.
  const result = data as {
    success: boolean;
    transaction_id?: string;
    error?: string;
    available_cents?: number;
    requested_cents?: number;
  };

  if (!result.success) {
    const errorMsg = result.error || 'Failed to record withdrawal';
    if (result.error === 'Insufficient available balance') {
      throw new Error(
        `Insufficient available balance for withdrawal. Available: ${result.available_cents} cents, Requested: ${result.requested_cents} cents`
      );
    }
    throw new Error(errorMsg);
  }

  if (!result.transaction_id) {
    throw new Error('Withdrawal recorded but no transaction ID returned');
  }

  return { transactionId: result.transaction_id };
}

// =====================================================
// Get Earnings for CPM Submission
// =====================================================

/**
 * Get total earnings already recorded for a specific CPM submission.
 * Used to calculate incremental earnings when additional views are approved.
 */
export async function getEarningsForSubmission(cpmSubmissionId: string): Promise<number> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('creator_transactions')
    .select('amount')
    .eq('related_cpm_submission_id', cpmSubmissionId)
    .gt('amount', 0); // Only positive amounts (earnings, not withdrawals)

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_earnings_for_submission',
      metadata: { cpmSubmissionId },
    });
    throw new Error(`Failed to get submission earnings: ${error.message}`);
  }

  return (data ?? []).reduce((sum, tx) => sum + tx.amount, 0);
}

// =====================================================
// Get Pending Stripe Transactions
// =====================================================

/**
 * Get all transactions that are pending Stripe transfer.
 * Used when creator connects Stripe to batch transfer pending earnings.
 */
export async function getPendingStripeTransactions(creatorProfileId: string): Promise<
  Array<{
    id: string;
    amount: number;
    jobId: string | null;
    cpmSubmissionId: string | null;
    description: string | null;
  }>
> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('creator_transactions')
    .select('id, amount, job_id, related_cpm_submission_id, description')
    .eq('creator_profile_id', creatorProfileId)
    .eq('stripe_transfer_status', 'pending')
    .neq('transaction_type', 'withdrawal');

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_pending_stripe_transactions',
      metadata: { creatorProfileId },
    });
    throw new Error(`Failed to get pending transactions: ${error.message}`);
  }

  return (data ?? []).map((tx) => ({
    id: tx.id,
    amount: tx.amount,
    jobId: tx.job_id,
    cpmSubmissionId: tx.related_cpm_submission_id,
    description: tx.description,
  }));
}

// =====================================================
// Mark Transactions as Transferred
// =====================================================

/**
 * Mark transactions as transferred to Stripe after successful transfer.
 */
export async function markTransactionsTransferred(
  transactionIds: string[],
  stripeTransferId: string
): Promise<{ count: number }> {
  if (transactionIds.length === 0) {
    return { count: 0 };
  }

  const supabase = createServiceRoleClient();

  const { error, count } = await supabase
    .from('creator_transactions')
    .update({
      stripe_transfer_status: 'completed',
      stripe_transfer_id: stripeTransferId,
    })
    .in('id', transactionIds);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'mark_transactions_transferred',
      metadata: { transactionIds, stripeTransferId },
    });
    throw new Error(`Failed to mark transactions transferred: ${error.message}`);
  }

  return { count: count ?? transactionIds.length };
}

// =====================================================
// Mark Transactions as Failed
// =====================================================

/**
 * Mark transactions as failed after Stripe transfer failure.
 */
export async function markTransactionsFailed(transactionIds: string[]): Promise<{ count: number }> {
  if (transactionIds.length === 0) {
    return { count: 0 };
  }

  const supabase = createServiceRoleClient();

  const { error, count } = await supabase
    .from('creator_transactions')
    .update({
      stripe_transfer_status: 'failed',
    })
    .in('id', transactionIds);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'mark_transactions_failed',
      metadata: { transactionIds },
    });
    throw new Error(`Failed to mark transactions failed: ${error.message}`);
  }

  return { count: count ?? transactionIds.length };
}

// =====================================================
// Get Transaction History
// =====================================================

/**
 * Get creator's transaction history with pagination.
 */
export async function getTransactionHistory(
  creatorProfileId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<
  Array<{
    id: string;
    type: TransactionType;
    amount: number;
    description: string | null;
    jobId: string | null;
    stripeTransferStatus: string;
    createdAt: string;
    completedAt: string | null;
    payoutCurrency: string | null;
    payoutAmountCents: number | null;
  }>
> {
  const supabase = createServiceRoleClient();
  const { limit = 50, offset = 0 } = options;

  const { data, error } = await supabase
    .from('creator_transactions')
    .select('id, transaction_type, amount, description, job_id, stripe_transfer_status, created_at, completed_at, payout_currency, payout_amount_cents')
    .eq('creator_profile_id', creatorProfileId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_transaction_history',
      metadata: { creatorProfileId, limit, offset },
    });
    throw new Error(`Failed to get transaction history: ${error.message}`);
  }

  return (data ?? []).map((tx) => ({
    id: tx.id,
    type: tx.transaction_type,
    amount: tx.amount,
    description: tx.description,
    jobId: tx.job_id,
    stripeTransferStatus: tx.stripe_transfer_status,
    createdAt: tx.created_at ?? '',
    completedAt: tx.completed_at,
    payoutCurrency: tx.payout_currency,
    payoutAmountCents: tx.payout_amount_cents,
  }));
}
