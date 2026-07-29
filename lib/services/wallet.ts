/**
 * Wallet service — shared business logic for web + mobile.
 *
 * Wraps the creator ledger and Stripe Connect account flows so both the
 * Next.js `/api/creators/*` routes and the mobile catchall (`/api/mobile/creators/*`)
 * share one implementation.
 *
 * Balances come from `lib/modules/creator/ledger.ts`, which uses a service-
 * role Supabase client internally (advisory locks + RPCs). We keep that as
 * the single source of truth for money.
 */

import { z } from 'zod';
import {
  getCreatorBalance,
  getTransactionHistory,
  getPendingStripeTransactions,
  markTransactionsTransferred,
  recordWithdrawal,
} from '@/lib/modules/creator/ledger';
import * as Sentry from '@sentry/nextjs';
import { captureStripeError, captureDbError } from '@/lib/analytics/capture-error';
import { transferToCreator } from '@/lib/payments/stripe-connect';
import type { StripeRegion } from '@/lib/payments/stripe-router';
import { ServiceError, type ServiceContext, type ServiceSupabase } from './_types';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

export const requestStripePayoutInputSchema = z.object({
  // Allow 0 so it falls through to the minimum-payout check in the service
  // (original route returned "Minimum payout amount is $1.00", not a schema error).
  amount_cents: z.number().int().nonnegative().optional(),
  // Method is validated inside the service so "Connect Stripe first" /
  // "Complete onboarding" errors fire before "Invalid payout method".
  method: z.string().optional(),
});
export type RequestStripePayoutInput = z.infer<typeof requestStripePayoutInputSchema>;

export const createStripeConnectInputSchema = z.object({
  locale: z.string().optional(),
  country: z.string().optional(),
  return_url: z.string().optional(),
  refresh_url: z.string().optional(),
});
export type CreateStripeConnectInput = z.infer<typeof createStripeConnectInputSchema>;

// ------------------------------------------------------------------
// Response shapes (preserve legacy JSON keys for clients)
// ------------------------------------------------------------------

export interface WalletTransactionDto {
  id: string;
  transaction_type: string;
  amount: number;
  description: string | null;
  job_id: string | null;
  stripe_transfer_status: string;
  created_at: string;
  completed_at: string | null;
  payout_currency: string | null;
  payout_amount_cents: number | null;
}

export interface WalletDashboardDto {
  balance_cents: number;
  pending_cents: number;
  pending_earnings_cents: number;
  total_earned_cents: number;
  total_withdrawn_cents: number;
  currency: string;
  stripe_connected: boolean;
  stripe_payouts_enabled: boolean;
  stripe_charges_enabled: boolean;
  stripe_requires_action: boolean;
  stripe_disabled_reason: string | null;
  stripe_verification_pending: boolean;
  stripe_details_submitted: boolean;
  stripe_us_migration_required: boolean;
  creator_country: string | null;
  recent_transactions: WalletTransactionDto[];
  cpm_earnings: {
    total_earned_cents: number;
    total_paid_cents: number;
    pending_payout_cents: number;
    active_submissions: number;
  };
}

export interface StripePayoutDto {
  success: true;
  payout: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    status: string;
    arrival_date: number;
    created: number;
  };
  remaining_balance: number;
}

export interface StripeConnectLinkDto {
  success: true;
  url: string;
  account_id: string;
  expires_at: number;
}

export interface TransferPendingEarningsDto {
  success: true;
  amount: number;
  currency: string;
}

// ------------------------------------------------------------------
// Common: fetch creator profile for wallet
// ------------------------------------------------------------------

interface WalletCreatorRow {
  id: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_region: string | null;
  stripe_us_migration_required: boolean | null;
  currency: string | null;
  location: string | null;
  display_name?: string | null;
}

async function loadCreatorForWallet(
  ctx: ServiceContext
): Promise<WalletCreatorRow & { user_country: string | null }> {
  const { data, error } = await ctx.supabase
    .from('creator_profiles')
    .select(
      'id, stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, stripe_charges_enabled, currency, stripe_region, stripe_us_migration_required, location, display_name, users!user_id(country)'
    )
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (error) {
    // Preserve pre-refactor observability — main's routes captured this
    // with a `fetch_creator_for_payout`/`fetch_creator_for_wallet` tag
    // rather than the generic route-level tag. Keep that specificity.
    captureDbError(error, 'fetch_creator_for_wallet', { userId: ctx.user.id });
    throw new ServiceError('internal', 'Failed to fetch creator profile.');
  }
  if (!data) {
    throw new ServiceError('not_found', 'Creator not found.');
  }
  const row = data as unknown as WalletCreatorRow & {
    users?: { country: string | null } | null;
  };
  return { ...row, user_country: row.users?.country ?? null };
}

async function ensureWalletRow(
  ctx: ServiceContext,
  creatorProfileId: string
): Promise<void> {
  const { data: wallet } = await ctx.supabase
    .from('creator_wallet')
    .select('id')
    .eq('creator_profile_id', creatorProfileId)
    .maybeSingle();
  if (!wallet) {
    await ctx.supabase
      .from('creator_wallet')
      .insert({ creator_profile_id: creatorProfileId })
      .select('id')
      .single();
  }
}

function mapTransactions(
  transactions: Awaited<ReturnType<typeof getTransactionHistory>>
): WalletTransactionDto[] {
  return transactions.map((tx) => ({
    id: tx.id,
    transaction_type: tx.type,
    amount: tx.amount,
    description: tx.description,
    job_id: tx.jobId,
    stripe_transfer_status: tx.stripeTransferStatus,
    created_at: tx.createdAt,
    completed_at: tx.completedAt,
    payout_currency: tx.payoutCurrency,
    payout_amount_cents: tx.payoutAmountCents,
  }));
}

// ------------------------------------------------------------------
// getWalletDashboard — unified response shape (mobile gets extra keys it can ignore).
// ------------------------------------------------------------------

export async function getWalletDashboard(
  ctx: ServiceContext
): Promise<WalletDashboardDto> {
  const creator = await loadCreatorForWallet(ctx);

  let stripePayoutsEnabled = creator.stripe_payouts_enabled ?? false;
  let stripeChargesEnabled = creator.stripe_charges_enabled ?? false;
  let stripeRequiresAction = false;
  let stripeDisabledReason: string | null = null;
  let stripeVerificationPending = false;
  let stripeDetailsSubmitted = false;
  let stripeAccountInvalid = false;

  if (creator.stripe_account_id) {
    try {
      const { getAccountStatus } = await import('@/lib/payments/stripe-connect');
      const status = await getAccountStatus(creator.stripe_account_id, creator.id);
      stripePayoutsEnabled = status.payoutsEnabled;
      stripeChargesEnabled = status.chargesEnabled;
      stripeRequiresAction = status.requiresAction;
      stripeDetailsSubmitted = status.detailsSubmitted;
      stripeDisabledReason = status.disabledReason;
      stripeVerificationPending =
        status.pendingVerification.length > 0 &&
        status.currentlyDue.length === 0 &&
        status.pastDue.length === 0;

      const { error: updateError } = await ctx.supabase
        .from('creator_profiles')
        .update({
          stripe_onboarding_complete: status.onboardingComplete,
          stripe_charges_enabled: status.chargesEnabled,
          stripe_payouts_enabled: status.payoutsEnabled,
        })
        .eq('id', creator.id);
      if (updateError) {
        Sentry.captureException(updateError, {
          tags: { handler: 'getWalletDashboard', operation: 'sync_stripe_status' },
        });
      }
    } catch (statusError: unknown) {
      Sentry.captureException(statusError, {
        tags: { handler: 'getWalletDashboard' },
      });
      const err = statusError as { code?: string; type?: string };
      if (err?.code === 'account_invalid' || err?.type === 'StripePermissionError') {
        stripeAccountInvalid = true;
        stripePayoutsEnabled = false;
        stripeRequiresAction = true;
        stripeDisabledReason = 'account_invalid';
      } else {
        // Preserve legacy observability: we log other Stripe status errors
        // and fall through to the stored values (the page still renders).
        captureStripeError(statusError, 'refresh_stripe_account_status', {
          userId: ctx.user.id,
          metadata: { stripeAccountId: creator.stripe_account_id },
        });
      }
    }
  }

  const stripeConnected = !!creator.stripe_account_id && !stripeAccountInvalid;

  const balance = await getCreatorBalance(creator.id);
  const transactions = await getTransactionHistory(creator.id, { limit: 30 });
  await ensureWalletRow(ctx, creator.id);

  const { data: cpmSubmissions } = await ctx.supabase
    .from('cpm_submissions')
    .select('id, status')
    .eq('creator_profile_id', creator.id)
    .in('status', ['approved', 'tracking', 'completed', 'paid']);
  const cpmActiveSubmissions = (cpmSubmissions ?? []).filter((s) =>
    ['approved', 'tracking', 'completed'].includes(s.status ?? '')
  ).length;

  const cpmTotalEarned = balance.totalEarnedCents;
  const cpmTotalPaid = balance.totalWithdrawnCents;
  const cpmPendingPayout = cpmTotalEarned - cpmTotalPaid;

  const creatorCountry = creator.location || creator.user_country || null;

  return {
    balance_cents: balance.availableCents,
    pending_cents: balance.pendingStripeCents,
    pending_earnings_cents: balance.pendingStripeCents,
    total_earned_cents: balance.totalEarnedCents,
    total_withdrawn_cents: balance.totalWithdrawnCents,
    currency: 'usd',
    stripe_connected: stripeConnected,
    stripe_payouts_enabled: stripePayoutsEnabled,
    stripe_charges_enabled: stripeChargesEnabled,
    stripe_requires_action: stripeRequiresAction,
    stripe_disabled_reason: stripeDisabledReason,
    stripe_verification_pending: stripeVerificationPending,
    stripe_details_submitted: stripeDetailsSubmitted,
    stripe_us_migration_required: creator.stripe_us_migration_required ?? false,
    creator_country: creatorCountry,
    recent_transactions: mapTransactions(transactions),
    cpm_earnings: {
      total_earned_cents: cpmTotalEarned,
      total_paid_cents: cpmTotalPaid,
      pending_payout_cents: cpmPendingPayout,
      active_submissions: cpmActiveSubmissions,
    },
  };
}

// ------------------------------------------------------------------
// requestStripePayout — single implementation.
// ------------------------------------------------------------------

export async function requestStripePayout(
  ctx: ServiceContext,
  input: RequestStripePayoutInput
): Promise<StripePayoutDto> {
  const { data: creator } = await ctx.supabase
    .from('creator_profiles')
    .select('id, display_name, stripe_account_id, stripe_payouts_enabled, stripe_region')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (!creator) throw new ServiceError('not_found', 'Creator profile not found');
  if (!creator.stripe_account_id) {
    throw new ServiceError('bad_request', 'You need to connect your Stripe account first');
  }
  if (!creator.stripe_payouts_enabled) {
    throw new ServiceError(
      'bad_request',
      'Payouts are not enabled. Please complete your Stripe onboarding.'
    );
  }

  const rawMethod = input.method ?? 'standard';
  if (rawMethod !== 'standard' && rawMethod !== 'instant') {
    throw new ServiceError(
      'bad_request',
      'Invalid payout method. Must be "standard" or "instant".'
    );
  }
  const method: 'standard' | 'instant' = rawMethod;

  const { getStripeForRegion } = await import('@/lib/payments/stripe-router');
  const { stripe: stripeEU } = await import('@/lib/payments/stripe');
  const stripeInstance = creator.stripe_region
    ? getStripeForRegion(
        creator.stripe_region as Parameters<typeof getStripeForRegion>[0]
      )
    : stripeEU;

  const balance = await stripeInstance.balance.retrieve({
    stripeAccount: creator.stripe_account_id,
  });
  const available = balance.available[0];

  if (!available || available.amount <= 0) {
    throw new ServiceError('bad_request', 'No available balance to payout');
  }

  // Legacy behaviour: `amount_cents` absent → default to full available balance
  // (via `??`, which treats 0 as a real value and lets the minimum check fire).
  const payoutAmount = input.amount_cents ?? available.amount;
  if (payoutAmount > available.amount) {
    throw new ServiceError(
      'bad_request',
      'Payout amount exceeds available balance',
      { available_balance: available.amount }
    );
  }
  const MINIMUM_PAYOUT_CENTS = 100;
  if (payoutAmount < MINIMUM_PAYOUT_CENTS) {
    throw new ServiceError('bad_request', 'Minimum payout amount is $1.00', {
      minimum_cents: MINIMUM_PAYOUT_CENTS,
    });
  }

  const idempotencyKey = `creator-payout:${creator.id}:${payoutAmount}:${available.currency}:${Math.floor(Date.now() / 60000)}`;

  let payout;
  try {
    payout = await stripeInstance.payouts.create(
      {
        amount: payoutAmount,
        currency: available.currency,
        method,
        metadata: {
          creator_id: creator.id,
          triggered_by: 'creator',
          stripe_region: creator.stripe_region || 'eu',
        },
      },
      {
        stripeAccount: creator.stripe_account_id,
        idempotencyKey,
      }
    );
  } catch (stripeError: unknown) {
    const err = stripeError as {
      message?: string;
      code?: string;
      type?: string;
      raw?: { message?: string };
    };
    const message = err.message || err.raw?.message || 'Payout failed';
    throw new ServiceError('upstream_failure', message, {
      stripe_code: err.code,
      stripe_type: err.type,
    });
  }

  return {
    success: true,
    payout: {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      method: payout.method,
      status: payout.status,
      arrival_date: payout.arrival_date,
      created: payout.created,
    },
    remaining_balance: available.amount - payoutAmount,
  };
}

// ------------------------------------------------------------------
// createStripeConnectLink — onboarding link (mobile deep link default).
// ------------------------------------------------------------------

export async function createStripeConnectLink(
  ctx: ServiceContext,
  input: CreateStripeConnectInput
): Promise<StripeConnectLinkDto> {
  const { data: creator } = await ctx.supabase
    .from('creator_profiles')
    .select('id, display_name, stripe_account_id, stripe_region')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (!creator) throw new ServiceError('not_found', 'Creator profile not found');

  // Mobile-biased defaults — this service is currently called only from
  // the mobile catchall. Web callers MUST pass `return_url`/`refresh_url`;
  // the `eightx://` scheme is a mobile deep link and would break a web
  // redirect.
  const returnUrl = input.return_url ?? 'eightx://stripe-return';
  const refreshUrl = input.refresh_url ?? 'eightx://stripe-refresh';

  const { stripe: stripeEU } = await import('@/lib/payments/stripe');
  const { getStripeForRegion } = await import('@/lib/payments/stripe-router');
  const stripeInstance = creator.stripe_region
    ? getStripeForRegion(
        creator.stripe_region as Parameters<typeof getStripeForRegion>[0]
      )
    : stripeEU;

  let accountId = creator.stripe_account_id;

  if (!accountId) {
    const account = await stripeInstance.accounts.create(
      {
        type: 'express',
        email: ctx.user.email ?? undefined,
        metadata: {
          creator_profile_id: creator.id,
          user_id: ctx.user.id,
          platform: 'mobile',
        },
      },
      { idempotencyKey: `connect-account:${creator.id}` }
    );
    accountId = account.id;

    await ctx.supabase
      .from('creator_profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', creator.id);
  }

  const accountLink = await stripeInstance.accountLinks.create(
    {
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    },
    {
      idempotencyKey: `mobile-account-link:${accountId}:${Math.floor(Date.now() / 60000)}`,
    }
  );

  return {
    success: true,
    url: accountLink.url,
    account_id: accountId,
    expires_at: accountLink.expires_at,
  };
}

// ------------------------------------------------------------------
// transferPendingEarnings — migrate from lib/modules/creator/actions.ts
// ------------------------------------------------------------------

export async function transferPendingEarnings(
  ctx: ServiceContext
): Promise<TransferPendingEarningsDto> {
  // Fail fast — rollback on `recordWithdrawal` failure writes to
  // `creator_transactions`, which RLS locks down. If a future caller forgets
  // to inject `elevatedSupabase`, the rollback would silently no-op while
  // the Stripe transfer has already moved money — a ledger/reality drift.
  if (!ctx.elevatedSupabase) {
    throw new ServiceError(
      'internal',
      'transferPendingEarnings requires an elevated Supabase client.'
    );
  }

  const { data: profile, error: profileError } = await ctx.supabase
    .from('creator_profiles')
    .select('id, stripe_account_id, stripe_payouts_enabled, currency, stripe_region')
    .eq('user_id', ctx.user.id)
    .single();

  if (profileError || !profile) {
    throw new ServiceError('not_found', 'Creator profile not found.');
  }

  if (!profile.stripe_account_id) {
    throw new ServiceError('bad_request', 'Please connect your Stripe account first.');
  }

  if (!profile.stripe_payouts_enabled) {
    throw new ServiceError(
      'bad_request',
      'Please complete your Stripe onboarding to receive payouts.'
    );
  }

  const pendingTxns = await getPendingStripeTransactions(profile.id);
  if (pendingTxns.length === 0) {
    throw new ServiceError('bad_request', 'No pending earnings to transfer.');
  }

  const pendingAmount = pendingTxns.reduce((sum, tx) => sum + tx.amount, 0);
  if (pendingAmount <= 0) {
    throw new ServiceError('bad_request', 'No pending earnings to transfer.');
  }

  // Always transfer in USD — Stripe auto-converts to creator's bank currency.
  const currency = 'USD';

  let transfer;
  try {
    transfer = await transferToCreator(
      profile.stripe_account_id,
      pendingAmount,
      'Pending earnings transfer',
      currency,
      {
        creator_profile_id: profile.id,
        transfer_type: 'pending_earnings',
        transaction_count: pendingTxns.length,
      },
      (profile.stripe_region as StripeRegion) || undefined
    );
  } catch (error) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      raw?: { message?: string };
    };
    console.error('[Transfer Pending] Stripe transfer failed:', {
      type: stripeError?.type,
      code: stripeError?.code,
      message: stripeError?.message,
      raw: error,
    });

    const errorMessage = (stripeError?.message || stripeError?.raw?.message || '').toLowerCase();
    const isAccountRestricted =
      stripeError?.code === 'transfers_not_allowed' ||
      stripeError?.code === 'account_invalid' ||
      errorMessage.includes('cannot currently make payouts') ||
      errorMessage.includes('payouts are not enabled') ||
      errorMessage.includes('transfers are not allowed') ||
      errorMessage.includes('account cannot currently receive') ||
      errorMessage.includes('destination account');

    if (isAccountRestricted) {
      throw new ServiceError(
        'bad_request',
        'Your Stripe account needs attention before you can receive transfers. Please resolve any outstanding issues.',
        { errorType: 'account_restricted' }
      );
    }
    throw new ServiceError('upstream_failure', 'Failed to transfer earnings. Please try again.');
  }

  const transactionIds = pendingTxns.map((tx) => tx.id);
  await markTransactionsTransferred(transactionIds, transfer.id);

  try {
    await recordWithdrawal({
      creatorProfileId: profile.id,
      amount: pendingAmount,
      description: `Transfer to Stripe - ${transfer.id}`,
    });
  } catch (withdrawalError) {
    // Rollback: unmark transactions to restore ledger consistency.
    console.error('[Transfer Pending] Withdrawal recording failed, rolling back:', {
      creatorProfileId: profile.id,
      transferId: transfer.id,
      transactionCount: transactionIds.length,
      error: withdrawalError,
    });

    // Non-null per the guard at the top of this function.
    const rollbackClient: ServiceSupabase = ctx.elevatedSupabase;
    await rollbackClient
      .from('creator_transactions')
      .update({
        stripe_transfer_status: 'pending',
        stripe_transfer_id: null,
      })
      .in('id', transactionIds);

    throw new ServiceError('upstream_failure', 'Failed to record withdrawal after transfer.');
  }

  console.log('[Transfer Pending] Successfully transferred pending earnings:', {
    creatorProfileId: profile.id,
    amount: pendingAmount,
    currency,
    transactionCount: pendingTxns.length,
    stripeTransferId: transfer.id,
  });

  return { success: true, amount: pendingAmount, currency };
}
