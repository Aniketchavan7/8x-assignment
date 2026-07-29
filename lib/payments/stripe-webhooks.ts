/**
 * Stripe Webhook Handlers
 *
 * Handlers for various Stripe webhook events including:
 * - Account updates (Connect)
 * - Transfers (platform -> connected account)
 * - Payouts (connected account -> bank)
 * - Invoices
 * - Deposits
 */
import Stripe from 'stripe';
import { stripe } from './stripe-client';
import { transferToCreator } from './stripe-connect';
import type { StripeRegion } from './stripe-router';
import { alertPaymentFailure } from '@/lib/notifications/system-alerts';
import { trackEvent } from '@/lib/analytics/posthog-server';
import { PostHogEvents } from '@/lib/analytics/events';

// ============================================================================
// Account Handlers (Stripe Connect)
// ============================================================================

/**
 * Handle Stripe Connect account updates.
 * Updates creator profile with latest account status.
 * When payouts_enabled becomes true, transfers any pending transactions to the creator.
 */
export async function handleAccountUpdate(account: Stripe.Account) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const { getPendingStripeTransactions, markTransactionsTransferred } = await import('@/lib/modules/creator/ledger');
  const supabase = createServiceRoleClient();

  let creatorId = account.metadata?.creator_id;

  // Fetch creator profile with current status for comparison
  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id, display_name, stripe_payouts_enabled, stripe_region, currency')
    .eq('stripe_account_id', account.id)
    .maybeSingle();

  if (creator) {
    creatorId = creator.id;
  } else if (!creatorId) {
    console.warn(`[Webhook Account] No creator found for account ${account.id}`);
    return;
  }

  // Check if payouts_enabled just became true (was false/null, now true)
  const payoutsJustEnabled =
    account.payouts_enabled === true && creator && creator.stripe_payouts_enabled !== true;

  // Check if payouts_enabled just became false (was true, now false) — account restricted
  const payoutsJustDisabled =
    account.payouts_enabled === false && creator && creator.stripe_payouts_enabled === true;

  // Update the creator profile with new account status
  const { error } = await supabase
    .from('creator_profiles')
    .update({
      stripe_onboarding_complete: account.charges_enabled && account.payouts_enabled,
      stripe_charges_enabled: account.charges_enabled || false,
      stripe_payouts_enabled: account.payouts_enabled || false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', creatorId);

  if (error) {
    console.error(`[Webhook Account] Failed to update creator ${creatorId}:`, error);
    return;
  }

  console.log(`[Webhook Account] Updated creator ${creatorId} account status`);

  // Alert admins when a creator's account becomes restricted
  if (payoutsJustDisabled) {
    const disabledReason = account.requirements?.disabled_reason || 'unknown';
    const currentlyDue = account.requirements?.currently_due || [];
    const pastDue = account.requirements?.past_due || [];

    console.warn(`[Webhook Account] PAYOUTS DISABLED for creator ${creatorId}:`, {
      stripe_account_id: account.id,
      display_name: creator?.display_name,
      disabled_reason: disabledReason,
      currently_due: currentlyDue,
      past_due: pastDue,
    });

    try {
      const { notifyAccountRestricted } = await import('@/lib/notifications/slack/payouts');
      await notifyAccountRestricted({
        creatorName: creator?.display_name || creatorId || 'Unknown',
        stripeAccountId: account.id,
        disabledReason,
        currentlyDue,
      });
    } catch {
      // Don't fail webhook if Slack notification fails
    }
  }

  // Transfer pending transactions if payouts just became enabled
  if (payoutsJustEnabled && creator) {
    // Get pending transactions from ledger
    const pendingTxns = await getPendingStripeTransactions(creator.id);

    if (pendingTxns.length > 0) {
      const pendingAmount = pendingTxns.reduce((sum, tx) => sum + tx.amount, 0);
      // Always transfer in USD - Stripe auto-converts to creator's bank currency
      const currency = 'USD';

      console.log(`[Webhook Account] Transferring pending transactions for creator ${creatorId}:`, {
        transactionCount: pendingTxns.length,
        totalAmount: pendingAmount,
        currency,
      });

      try {
        const transfer = await transferToCreator(
          account.id,
          pendingAmount,
          'Pending earnings transfer - Stripe onboarding completed',
          currency,
          {
            creator_profile_id: creatorId || '',
            transfer_type: 'pending_earnings',
            transaction_count: pendingTxns.length,
          },
          (creator.stripe_region as StripeRegion) || undefined
        );

        // Mark transactions as transferred in ledger
        await markTransactionsTransferred(
          pendingTxns.map(tx => tx.id),
          transfer.id
        );

        console.log(
          `[Webhook Account] Successfully transferred pending earnings for creator ${creatorId}:`,
          {
            amount: pendingAmount,
            currency,
            transactionCount: pendingTxns.length,
            stripe_transfer_id: transfer.id,
          }
        );
      } catch (transferError) {
        console.error(
          `[Webhook Account] Failed to transfer pending earnings for creator ${creatorId}:`,
          transferError
        );
        // Transactions stay pending - will retry next time
      }
    }
  }
}

// ============================================================================
// Transfer Handlers (Platform -> Connected Account)
// ============================================================================

/**
 * Handle transfer creation.
 * Transfers in Stripe Connect are instant - when transfer.created fires,
 * the money is already in the connected account's Stripe balance.
 * Note: transfer.paid and transfer.failed events do NOT exist in Stripe.
 */
export async function handleTransferCreated(transfer: Stripe.Transfer) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  const { data: transaction } = await supabase
    .from('creator_transactions')
    .select('id, status, stripe_transfer_id')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle();

  if (!transaction) {
    console.log(
      `[Webhook Transfer] Transfer ${transfer.id} created, but no matching transaction found`
    );
    return;
  }

  // Mark transaction as completed since transfers are instant
  if (transaction.status !== 'completed') {
    const { error } = await supabase
      .from('creator_transactions')
      .update({
        status: 'completed',
        stripe_transfer_status: 'paid',
        completed_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    if (error) {
      console.error(`[Webhook Transfer] Failed to update transaction ${transaction.id}:`, error);
    } else {
      console.log(`[Webhook Transfer] Marked transaction ${transaction.id} as completed`);

      // Track transfer completion for metrics
      const creatorId = transfer.metadata?.creator_profile_id;
      if (creatorId) {
        trackEvent(creatorId, PostHogEvents.TRANSFER_COMPLETED, {
          transaction_id: transaction.id,
          transfer_id: transfer.id,
          amount_cents: transfer.amount,
          currency: transfer.currency,
        });
      }
    }
  } else {
    console.log(
      `[Webhook Transfer] Transaction ${transaction.id} already completed for transfer ${transfer.id}`
    );
  }
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  const { data: transaction } = await supabase
    .from('creator_transactions')
    .select('id, status, stripe_transfer_status')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle();

  if (!transaction) {
    console.warn(`[Webhook Transfer] No transaction found for failed transfer ${transfer.id}`);
    return;
  }

  // Mark transaction as failed - balance will automatically adjust since it's derived from transactions
  const { error } = await supabase
    .from('creator_transactions')
    .update({
      status: 'failed',
      stripe_transfer_status: 'failed',
    })
    .eq('id', transaction.id);

  if (error) {
    console.error(`[Webhook Transfer] Failed to update transaction ${transaction.id}:`, error);
  } else {
    console.log(`[Webhook Transfer] Marked transaction ${transaction.id} as failed`);

    // Track transfer failure for metrics and alerting
    const creatorId = transfer.metadata?.creator_profile_id;
    if (creatorId) {
      trackEvent(creatorId, PostHogEvents.TRANSFER_FAILED, {
        transaction_id: transaction.id,
        transfer_id: transfer.id,
        amount_cents: transfer.amount,
        currency: transfer.currency,
      });
    }
  }
}

/**
 * Handle reversed transfer.
 */
export async function handleTransferReversed(transfer: Stripe.Transfer) {
  await handleTransferFailed(transfer);

  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  const { data: transaction } = await supabase
    .from('creator_transactions')
    .select('id')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle();

  if (transaction) {
    await supabase
      .from('creator_transactions')
      .update({
        status: 'failed',
        description: 'Transfer reversed by Stripe',
      })
      .eq('id', transaction.id);

    console.log(`[Webhook Transfer] Marked transaction ${transaction.id} as reversed`);
  }
}

// ============================================================================
// Payout Handlers (Connected Account -> Bank)
// ============================================================================

/**
 * Handle payout creation on a connected account.
 *
 * NOTE: We no longer create withdrawal transactions here. Withdrawals are now
 * recorded at transfer time (in USD) in transferPendingEarnings(), not at payout
 * time. This avoids currency mismatch issues when Stripe converts USD to the
 * creator's bank currency (e.g., EUR).
 *
 * This handler now only logs the payout for audit purposes.
 */
export async function handlePayoutCreated(payout: Stripe.Payout, stripeAccountId: string) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id, display_name')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  if (!creator) {
    console.log(`[Webhook Payout] No creator found for account ${stripeAccountId}`);
    return;
  }

  // Log the payout for audit purposes
  // Note: payout.amount is in the bank's currency (e.g., EUR), not necessarily USD
  console.log(`[Webhook Payout] Payout ${payout.id} created for ${creator.display_name}:`, {
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    stripeAccountId,
  });

  // We don't create a withdrawal transaction here anymore.
  // Withdrawals are recorded at transfer time in transferPendingEarnings()
  // to ensure the amount is in USD (platform currency) and matches the transfer.
}

/**
 * Handle successful payout to connected account's bank.
 *
 * Updates the most recent withdrawal transaction with the actual payout currency
 * and amount from Stripe. This captures what the creator actually received in
 * their bank currency (e.g., EUR) vs. the platform's USD.
 */
export async function handlePayoutPaid(payout: Stripe.Payout, stripeAccountId: string) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  // Find creator by stripe account
  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id, display_name')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  if (!creator) {
    console.log(`[Webhook Payout] No creator found for account ${stripeAccountId}`);
    return;
  }

  // Find the most recent withdrawal transaction without payout details
  // This links the payout to the corresponding withdrawal
  const { data: withdrawal, error: fetchError } = await supabase
    .from('creator_transactions')
    .select('id')
    .eq('creator_profile_id', creator.id)
    .eq('transaction_type', 'withdrawal')
    .is('payout_currency', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error(`[Webhook Payout] Error finding withdrawal for payout ${payout.id}:`, fetchError);
    return;
  }

  if (withdrawal) {
    // Update the withdrawal with the actual payout currency and amount
    const { error: updateError } = await supabase
      .from('creator_transactions')
      .update({
        payout_currency: payout.currency.toUpperCase(),
        payout_amount_cents: payout.amount,
        stripe_payout_id: payout.id,
      })
      .eq('id', withdrawal.id);

    if (updateError) {
      console.error(`[Webhook Payout] Failed to update withdrawal ${withdrawal.id}:`, updateError);
    } else {
      console.log(`[Webhook Payout] Updated withdrawal ${withdrawal.id} with payout details:`, {
        payoutId: payout.id,
        payoutCurrency: payout.currency.toUpperCase(),
        payoutAmountCents: payout.amount,
      });
    }
  } else {
    console.log(`[Webhook Payout] No pending withdrawal found to link payout ${payout.id}`);
  }

  // Log the successful payout for audit purposes
  console.log(`[Webhook Payout] Payout ${payout.id} paid to ${creator.display_name}:`, {
    amount: payout.amount,
    currency: payout.currency,
    stripeAccountId,
  });

  // Track payout completion for metrics
  trackEvent(creator.id, PostHogEvents.PAYOUT_COMPLETED, {
    payout_id: payout.id,
    amount_cents: payout.amount,
    currency: payout.currency,
    stripe_account_id: stripeAccountId,
  });
}

/**
 * Handle failed payout to connected account's bank.
 *
 * NOTE: A failed payout does NOT mean the transfer to Stripe Connect failed.
 * The money is still in the creator's Stripe Connect balance and they can
 * retry the payout. We log this for audit purposes but don't modify the ledger
 * since the transfer (withdrawal) was successful.
 */
export async function handlePayoutFailed(payout: Stripe.Payout, stripeAccountId: string) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  // Find creator by stripe account
  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id, display_name')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  if (!creator) {
    console.log(`[Webhook Payout] No creator found for account ${stripeAccountId}`);
    return;
  }

  const failureMessage = payout.failure_message || 'Unknown failure';

  // Log the failed payout for audit/alerting purposes
  // The money is still in the creator's Stripe Connect balance
  console.error(`[Webhook Payout] Payout ${payout.id} FAILED for ${creator.display_name}:`, {
    amount: payout.amount,
    currency: payout.currency,
    failureCode: payout.failure_code,
    failureMessage,
    stripeAccountId,
  });

  // Track payout failure for metrics
  trackEvent(creator.id, PostHogEvents.PAYOUT_FAILED, {
    payout_id: payout.id,
    amount_cents: payout.amount,
    currency: payout.currency,
    failure_code: payout.failure_code,
    failure_message: failureMessage,
    stripe_account_id: stripeAccountId,
  });

  // Send critical alert to Slack (if configured)
  await alertPaymentFailure({
    type: 'payout',
    amount: payout.amount,
    currency: payout.currency,
    userId: creator.id,
    error: failureMessage,
    metadata: {
      payout_id: payout.id,
      failure_code: payout.failure_code,
      stripe_account_id: stripeAccountId,
      creator_name: creator.display_name,
    },
  });
}

/**
 * Handle payout status updates.
 * Note: Uses description matching since stripe_payout_id doesn't exist in schema.
 */
export async function handlePayoutUpdated(payout: Stripe.Payout, stripeAccountId: string) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  // Find creator by stripe account
  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  if (!creator) {
    console.log(`[Webhook Payout] No creator found for account ${stripeAccountId}`);
    return;
  }

  // Match by description pattern containing the payout ID
  const { data: transaction, error: fetchError } = await supabase
    .from('creator_transactions')
    .select('id, status')
    .eq('creator_profile_id', creator.id)
    .like('description', `%${payout.id}%`)
    .maybeSingle();

  if (fetchError || !transaction) {
    console.log(`[Webhook Payout] No transaction found for updated payout ${payout.id}`);
    return;
  }

  // Map Stripe payout status to our transaction status
  type TransactionStatus = 'pending' | 'completed' | 'failed';
  let newStatus: TransactionStatus = 'pending';
  if (payout.status === 'paid') {
    newStatus = 'completed';
  } else if (payout.status === 'failed' || payout.status === 'canceled') {
    newStatus = 'failed';
  }

  // Only update if status actually changed
  if (transaction.status === newStatus) {
    console.log(`[Webhook Payout] Transaction ${transaction.id} already has status ${newStatus}`);
    return;
  }

  // Build update object with proper typing
  const { error } = await supabase
    .from('creator_transactions')
    .update(
      newStatus === 'completed'
        ? { status: newStatus, completed_at: new Date().toISOString() }
        : { status: newStatus }
    )
    .eq('id', transaction.id);

  if (error) {
    console.error(`[Webhook Payout] Failed to update transaction ${transaction.id}:`, error);
  } else {
    console.log(
      `[Webhook Payout] Updated transaction ${transaction.id} status to ${newStatus} (payout ${payout.id})`
    );
  }
}

/**
 * Handle canceled payout on connected account.
 * Note: Uses description matching since stripe_payout_id doesn't exist in schema.
 */
export async function handlePayoutCanceled(payout: Stripe.Payout, stripeAccountId: string) {
  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  // Find creator by stripe account
  const { data: creator } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();

  if (!creator) {
    console.log(`[Webhook Payout] No creator found for account ${stripeAccountId}`);
    return;
  }

  // Match by description pattern containing the payout ID
  const { data: transaction, error: fetchError } = await supabase
    .from('creator_transactions')
    .select('id')
    .eq('creator_profile_id', creator.id)
    .like('description', `%${payout.id}%`)
    .maybeSingle();

  if (fetchError || !transaction) {
    console.log(`[Webhook Payout] No transaction found for canceled payout ${payout.id}`);
    return;
  }

  const { error } = await supabase
    .from('creator_transactions')
    .update({
      status: 'failed',
      description: `Payout canceled - ${payout.id}`,
    })
    .eq('id', transaction.id);

  if (error) {
    console.error(`[Webhook Payout] Failed to update transaction ${transaction.id}:`, error);
  } else {
    console.log(
      `[Webhook Payout] Marked transaction ${transaction.id} as canceled (payout ${payout.id})`
    );
  }
}

// ============================================================================
// Invoice Handlers
// ============================================================================

/**
 * Handle failed invoice payment.
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) {
    console.warn(`[Webhook Invoice] No customer ID in failed invoice ${invoice.id}`);
    return;
  }

  const { getTeamByStripeCustomerId } = await import('@/lib/modules/team/queries');
  const brandOrg = await getTeamByStripeCustomerId(customerId);

  if (!brandOrg) {
    console.warn(`[Webhook Invoice] No brand org found for customer ${customerId}`);
    return;
  }

  console.log(`[Webhook Invoice] Payment failed for brand ${brandOrg.id}, invoice ${invoice.id}`);
}

/**
 * Handle successful invoice payment.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!customerId) {
    console.warn(`[Webhook Invoice] No customer ID in paid invoice ${invoice.id}`);
    return;
  }

  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | { id?: string } }).subscription ===
    'string'
      ? (invoice as unknown as { subscription: string }).subscription
      : (invoice as unknown as { subscription?: { id?: string } }).subscription?.id;

  if (subscriptionId) {
    console.log(`[Webhook Invoice] Invoice ${invoice.id} paid for subscription ${subscriptionId}`);
  }
}

// ============================================================================
// Deposit Handler
// ============================================================================

/**
 * Handle wallet deposit payment completion.
 */
export async function handleDepositPayment(session: Stripe.Checkout.Session) {
  const brandOrganizationId = session.metadata?.brand_organization_id;
  const userId = session.client_reference_id;
  const currency = (session.metadata?.currency || session.currency || 'usd').toLowerCase();

  if (!brandOrganizationId || !userId) {
    console.error('Missing required metadata from checkout session');
    return;
  }

  const walletAmountCents = session.metadata?.wallet_amount
    ? parseInt(session.metadata.wallet_amount, 10)
    : session.amount_total;

  if (!walletAmountCents) {
    console.error('No wallet amount found in checkout session');
    return;
  }

  const customerPaidCents = session.amount_total || 0;

  // Retrieve Stripe fee from balance transaction
  let stripeFee: number | null = null;
  try {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });

      if (paymentIntent.latest_charge) {
        const charge =
          typeof paymentIntent.latest_charge === 'string'
            ? await stripe.charges.retrieve(paymentIntent.latest_charge, {
                expand: ['balance_transaction'],
              })
            : paymentIntent.latest_charge;

        if (charge.balance_transaction) {
          const balanceTransaction =
            typeof charge.balance_transaction === 'string'
              ? await stripe.balanceTransactions.retrieve(charge.balance_transaction)
              : charge.balance_transaction;

          if (balanceTransaction?.fee) {
            stripeFee = balanceTransaction.fee / 100;
          }
        }
      }
    }
  } catch (error) {
    console.error('[Webhook Deposit] Error retrieving Stripe fee:', error);
  }

  const { createServiceRoleClient } = await import('@/lib/db/supabase');
  const supabase = createServiceRoleClient();

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const { data: wallet, error: walletError } = await supabase
    .from('brand_wallet')
    .select('id, available_balance, total_deposited')
    .eq('brand_organization_id', brandOrganizationId)
    .single();

  if (walletError || !wallet) {
    console.error(`Failed to fetch wallet: ${walletError?.message || 'Wallet not found'}`);
    return;
  }

  const currentBalance = parseFloat(wallet.available_balance?.toString() || '0');
  const newBalance = currentBalance + walletAmountCents;

  const stripeFeeInCents = stripeFee ? Math.round(stripeFee * 100) : null;
  const actualReceivedCents = customerPaidCents - (stripeFeeInCents || 0);
  const platformSurplusCents = actualReceivedCents - walletAmountCents;

  // Atomic idempotency: INSERT the transaction record first.
  // The partial unique index on (stripe_payment_intent_id) WHERE transaction_type = 'deposit'
  // ensures only one deposit per payment intent. If this INSERT fails with a conflict,
  // the webhook was already processed — skip the wallet credit.
  const { error: transactionError } = await supabase.from('brand_transactions').insert({
    brand_wallet_id: wallet.id,
    brand_organization_id: brandOrganizationId,
    transaction_type: 'deposit',
    amount: walletAmountCents,
    balance_after: newBalance,
    customer_paid: customerPaidCents,
    platform_surplus: platformSurplusCents,
    stripe_payment_intent_id: paymentIntentId,
    stripe_fee: stripeFeeInCents,
    description: `Wallet deposit via Stripe (charged ${(customerPaidCents / 100).toFixed(2)} ${currency.toUpperCase()}, credited ${(walletAmountCents / 100).toFixed(2)} ${currency.toUpperCase()})`,
    created_by: userId,
  });

  if (transactionError) {
    if (transactionError.code === '23505') {
      console.log(
        `[Webhook Deposit] Already processed payment intent ${paymentIntentId}, skipping`
      );
      return;
    }
    console.error('[Webhook Deposit] Failed to create transaction record:', transactionError);
    return;
  }

  const { error: updateWalletError } = await supabase.rpc('atomic_wallet_deposit', {
    p_wallet_id: wallet.id,
    p_amount: walletAmountCents,
    p_currency: currency.toUpperCase(),
  });

  if (updateWalletError) {
    console.error(`Failed to update wallet: ${updateWalletError.message}`);
    return;
  }

  if (platformSurplusCents > 0) {
    const surplus = (platformSurplusCents / 100).toFixed(2);
    const paid = (customerPaidCents / 100).toFixed(2);
    const fee = ((stripeFeeInCents || 0) / 100).toFixed(2);
    const credited = (walletAmountCents / 100).toFixed(2);
    console.log(
      `[Webhook Deposit] Platform surplus: ${surplus} ${currency.toUpperCase()} (Customer paid: ${paid}, Stripe fee: ${fee}, Wallet credited: ${credited})`
    );
  }

  // Track deposit completed event
  trackEvent(userId, PostHogEvents.DEPOSIT_COMPLETED, {
    brand_organization_id: brandOrganizationId,
    wallet_amount_cents: walletAmountCents,
    customer_paid_cents: customerPaidCents,
    stripe_fee_cents: stripeFeeInCents,
    platform_surplus_cents: platformSurplusCents,
    session_id: session.id,
    payment_intent_id:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null,
  });
}
