export const runtime = 'nodejs';

import { NextRequest, after } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { getAdminRole } from '@/lib/modules/admin/queries';
import { PAYOUTS_ROLES, PAYOUT_RATE_LIMITS, hasAccess } from '@/lib/modules/admin/roles';
import { recordEarning } from '@/lib/modules/creator/ledger';
import { notifyPayoutTriggered } from '@/lib/notifications/slack/payouts';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

interface BonusRequest {
  amount_cents: number;
  description: string;
  offplatform_method?: string;
}

/**
 * POST /api/admin/creators/[id]/bonus
 *
 * Records a bonus earning in the creator's ledger (pending Stripe transfer).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: creatorProfileId } = await params;
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (!userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminRole = await getAdminRole(user.id);
    if (!adminRole || !hasAccess(adminRole, PAYOUTS_ROLES)) {
      return Response.json({ error: 'Forbidden: payout access required' }, { status: 403 });
    }

    const body: BonusRequest = await req.json();
    const { amount_cents, description, offplatform_method } = body;

    if (!amount_cents || !Number.isInteger(amount_cents) || amount_cents <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!description || description.trim().length === 0) {
      return Response.json({ error: 'Description required' }, { status: 400 });
    }
    if (description.trim().length > 200) {
      return Response.json({ error: 'Description too long (max 200 characters)' }, { status: 400 });
    }

    if (offplatform_method != null && offplatform_method.trim().length > 100) {
      return Response.json({ error: 'Payment method too long (max 100 characters)' }, { status: 400 });
    }

    // Rate limit check for roles with limits (matches add-funds endpoint)
    const rateLimit = PAYOUT_RATE_LIMITS[adminRole];
    if (rateLimit) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentTxs } = await supabase
        .from('creator_transactions')
        .select('amount')
        .eq('triggered_by_admin_id', user.id)
        .eq('creator_profile_id', creatorProfileId)
        .gte('created_at', oneHourAgo);

      const recentTotalCents = (recentTxs ?? []).reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );
      if (recentTotalCents + amount_cents > rateLimit.maxCentsPerCreatorPerHour) {
        const remainingCents = Math.max(0, rateLimit.maxCentsPerCreatorPerHour - recentTotalCents);
        return Response.json(
          { error: `Rate limit exceeded. Remaining: $${(remainingCents / 100).toFixed(2)}.` },
          { status: 400 }
        );
      }
    }

    // Verify creator exists
    const { data: creator } = await supabase
      .from('creator_profiles')
      .select('id, display_name')
      .eq('id', creatorProfileId)
      .single();

    if (!creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Get or create wallet for FK reference
    let { data: wallet } = await supabase
      .from('creator_wallet')
      .select('id')
      .eq('creator_profile_id', creatorProfileId)
      .maybeSingle();

    if (!wallet) {
      const { data: newWallet } = await supabase
        .from('creator_wallet')
        .insert({ creator_profile_id: creatorProfileId })
        .select('id')
        .single();
      wallet = newWallet;
    }

    // Record bonus in ledger
    const { transactionId } = await recordEarning({
      creatorProfileId,
      walletId: wallet?.id,
      amount: amount_cents,
      type: 'bonus',
      description: description.trim(),
      stripeTransferStatus: offplatform_method?.trim() ? 'not_applicable' : 'pending',
    });

    // Set admin audit trail and off-platform method
    const updateFields: Record<string, unknown> = { triggered_by_admin_id: user.id };
    if (offplatform_method?.trim()) {
      updateFields.offplatform_method = offplatform_method.trim();
    }
    const { error: updateError } = await supabase
      .from('creator_transactions')
      .update(updateFields)
      .eq('id', transactionId);
    if (updateError) {
      console.error('[ADMIN BONUS] Failed to set audit/offplatform fields:', updateError);
    }

    after(async () => {
      await notifyPayoutTriggered({
        adminEmail: user.email,
        creatorName: creator.display_name || creatorProfileId,
        amount: amount_cents,
        currency: 'usd',
        type: 'bonus',
        method: offplatform_method?.trim() || undefined,
        description: description.trim(),
      }).catch(captureFireAndForget('bonus_slack_notification'));
    });

    return Response.json({ success: true, transactionId });
  } catch (error) {
    console.error('[ADMIN BONUS] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: message }, { status: 500 });
  }
}
