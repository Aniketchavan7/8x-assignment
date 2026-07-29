export const runtime = 'nodejs';

import { NextRequest, after } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { transferToCreator } from '@/lib/payments/stripe-connect';
import { captureDbError, captureStripeError } from '@/lib/analytics/capture-error';
import { getAdminRole } from '@/lib/modules/admin/queries';
import { PAYOUTS_ROLES, PAYOUT_RATE_LIMITS, hasAccess } from '@/lib/modules/admin/roles';
import { notifyPayoutTriggered } from '@/lib/notifications/slack/payouts';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

interface AddFundsRequest {
  amount_cents: number;
  description?: string;
}

/**
 * POST /api/admin/payouts/[creatorId]/add-funds
 *
 * Transfers money from platform to a creator's Stripe Connected Account.
 * This adds money to their Stripe balance (not their bank account directly).
 * Admin-only endpoint.
 *
 * Body:
 * - amount_cents: Amount to transfer in cents (e.g., 10000 = $100.00)
 * - description: Optional description for the transfer
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const { creatorId } = await params;
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type, email')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Verify admin role has payout access
    const adminRole = await getAdminRole(user.id);
    if (!adminRole || !hasAccess(adminRole, PAYOUTS_ROLES)) {
      return Response.json({ error: 'Forbidden: Your admin role does not have payout access' }, { status: 403 });
    }

    // Parse request body
    const body: AddFundsRequest = await req.json();
    const { amount_cents, description } = body;

    // Validate amount
    if (!amount_cents || !Number.isInteger(amount_cents) || amount_cents <= 0) {
      return Response.json(
        { error: 'Invalid amount. Must be a positive integer in cents.' },
        { status: 400 }
      );
    }

    // Rate limit check for roles with limits (e.g., account_manager: $500/creator/hour)
    const rateLimit = PAYOUT_RATE_LIMITS[adminRole];
    if (rateLimit) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentTxs } = await supabase
        .from('creator_transactions')
        .select('amount')
        .eq('triggered_by_admin_id', user.id)
        .eq('creator_profile_id', creatorId)
        .gte('created_at', oneHourAgo);

      const recentTotalCents = (recentTxs ?? []).reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );
      if (recentTotalCents + amount_cents > rateLimit.maxCentsPerCreatorPerHour) {
        const remainingCents = Math.max(0, rateLimit.maxCentsPerCreatorPerHour - recentTotalCents);
        return Response.json(
          {
            error: `Rate limit exceeded. You can transfer up to $${(rateLimit.maxCentsPerCreatorPerHour / 100).toFixed(2)} per creator per hour. Remaining: $${(remainingCents / 100).toFixed(2)}.`,
          },
          { status: 400 }
        );
      }
    }

    // Get creator profile with Stripe info
    const { data: creator, error: creatorError } = await supabase
      .from('creator_profiles')
      .select(
        `
        id,
        display_name,
        stripe_account_id,
        stripe_payouts_enabled,
        user_id
      `
      )
      .eq('id', creatorId)
      .single();

    if (creatorError || !creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Check if creator has a connected Stripe account
    if (!creator.stripe_account_id) {
      return Response.json(
        { error: 'Creator has not connected their Stripe account' },
        { status: 400 }
      );
    }

    // Transfer to creator's Stripe account (all transfers are USD)
    try {
      console.log('[ADMIN ADD FUNDS] Creating transfer:', {
        currency: 'USD',
        amount_cents,
        creator_id: creator.id,
        stripe_account_id: creator.stripe_account_id,
      });

      const transfer = await transferToCreator(
        creator.stripe_account_id,
        amount_cents,
        description || `Admin transfer to ${creator.display_name}`,
        'USD',
        {
          creator_id: creator.id,
          admin_id: user.id,
          admin_email: userData.email,
          transfer_type: 'admin_manual',
        }
      );

      // Record transaction in ledger
      // First, get or create the creator's wallet (for FK reference)
      let { data: wallet, error: walletError } = await supabase
        .from('creator_wallet')
        .select('id')
        .eq('creator_profile_id', creator.id)
        .maybeSingle();

      if (walletError && walletError.code !== 'PGRST116') {
        captureDbError(walletError, 'fetch_wallet_for_transfer', {
          userId: user.id,
          metadata: { creatorId },
        });
      }

      // Create wallet if it doesn't exist
      if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
          .from('creator_wallet')
          .insert({ creator_profile_id: creator.id })
          .select('id')
          .single();

        if (createError) {
          captureDbError(createError, 'create_wallet_for_transfer', {
            userId: user.id,
            metadata: { creatorId },
          });
        } else {
          wallet = newWallet;
        }
      }

      // Record earning in ledger (this goes directly to Stripe, so mark as completed)
      const { recordEarning } = await import('@/lib/modules/creator/ledger');

      try {
        const { transactionId } = await recordEarning({
          creatorProfileId: creator.id,
          walletId: wallet?.id,
          amount: amount_cents,
          type: 'bonus',
          description: description || `Admin transfer - ${transfer.id}`,
          stripeTransferStatus: 'completed', // Money already in Stripe
        });

        // Set admin audit trail
        await supabase
          .from('creator_transactions')
          .update({ triggered_by_admin_id: user.id })
          .eq('id', transactionId);
      } catch (txError) {
        captureDbError(txError, 'create_transfer_transaction', {
          userId: user.id,
          metadata: { creatorId, transferId: transfer.id },
        });
        // Don't fail the request - transfer was successful
      }

      console.log('[ADMIN ADD FUNDS] Transfer successful:', {
        admin_id: user.id,
        creator_id: creator.id,
        amount_cents,
        currency: 'USD',
        transfer_id: transfer.id,
      });

      // Send notifications after response (non-blocking).
      // Creator-facing email + push are already fired by `recordEarning` above
      // via `notify('payment_sent')`; we only need the Slack ping here.
      after(async () => {
        await notifyPayoutTriggered({
          adminEmail: userData.email,
          creatorName: creator.display_name || creatorId,
          amount: amount_cents,
          currency: 'usd',
          type: 'add_funds',
          description,
        }).catch(captureFireAndForget('payout_slack_notification'));
      });

      return Response.json({
        success: true,
        transfer: {
          id: transfer.id,
          amount: transfer.amount,
          currency: transfer.currency,
          destination: transfer.destination,
          created: transfer.created,
        },
      });
    } catch (stripeError) {
      captureStripeError(stripeError, 'admin_transfer_to_creator', {
        userId: user.id,
        metadata: { creatorId, amountCents: amount_cents },
      });

      const errorMessage = stripeError instanceof Error ? stripeError.message : 'Transfer failed';
      return Response.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    captureDbError(error, 'admin_add_funds_route', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
