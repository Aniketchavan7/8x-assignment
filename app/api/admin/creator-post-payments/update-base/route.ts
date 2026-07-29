export const runtime = 'nodejs';

import { NextRequest, after } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureDbError } from '@/lib/analytics/capture-error';
import { getAdminRole } from '@/lib/modules/admin/queries';
import { PAYOUTS_ROLES, hasAccess } from '@/lib/modules/admin/roles';
import { logAdminAction } from '@/lib/modules/admin/audit-log';

interface Body {
  managed_creator_post_ids: string[];
  /** Optional override; when omitted base pay is preserved. */
  base_pay_cents?: number;
  /** Optional override; when omitted bonuses are preserved. */
  bonus_cents?: number;
}

interface Result {
  mcp_id: string;
  success: boolean;
  error?: string;
}

/**
 * POST /api/admin/creator-post-payments/update-base
 *
 * Overwrites base_pay_cents on a batch of managed_creator_posts and recomputes
 * total_owed_cents and payment_status. Bonus and paid amounts are preserved.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const adminRole = await getAdminRole(user.id);
    if (!adminRole || !hasAccess(adminRole, PAYOUTS_ROLES)) {
      return Response.json({ error: 'Forbidden: Your admin role does not have payout access' }, { status: 403 });
    }

    const body: Body = await req.json();
    const ids = body.managed_creator_post_ids;
    const basePayOverride = body.base_pay_cents;
    const bonusOverride = body.bonus_cents;
    const hasBaseOverride = basePayOverride !== undefined;
    const hasBonusOverride = bonusOverride !== undefined;

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'managed_creator_post_ids is required' }, { status: 400 });
    }
    if (ids.length > 500) {
      return Response.json({ error: 'Maximum 500 posts per batch' }, { status: 400 });
    }
    if (!hasBaseOverride && !hasBonusOverride) {
      return Response.json({ error: 'At least one of base_pay_cents or bonus_cents is required' }, { status: 400 });
    }
    if (hasBaseOverride && (!Number.isInteger(basePayOverride) || basePayOverride < 0)) {
      return Response.json({ error: 'base_pay_cents must be a non-negative integer' }, { status: 400 });
    }
    if (hasBonusOverride && (!Number.isInteger(bonusOverride) || bonusOverride < 0)) {
      return Response.json({ error: 'bonus_cents must be a non-negative integer' }, { status: 400 });
    }

    // Fetch existing rows so we can recompute owed/status.
    const { data: existing, error: fetchError } = await supabase
      .from('managed_creator_posts')
      .select('id, base_pay_cents, bonus_cents, total_paid_cents')
      .in('id', ids);

    if (fetchError) {
      captureDbError(fetchError, 'update_base_fetch', { userId: user.id });
      return Response.json({ error: fetchError.message }, { status: 500 });
    }

    const existingMap = new Map<string, { base_pay_cents: number; bonus_cents: number; total_paid_cents: number }>();
    for (const row of existing ?? []) {
      existingMap.set(row.id, {
        base_pay_cents: row.base_pay_cents ?? 0,
        bonus_cents: row.bonus_cents ?? 0,
        total_paid_cents: row.total_paid_cents ?? 0,
      });
    }

    const results: Result[] = [];

    for (const id of ids) {
      const prev = existingMap.get(id);
      if (!prev) {
        results.push({ mcp_id: id, success: false, error: 'Post not found' });
        continue;
      }
      const newBase = hasBaseOverride ? basePayOverride! : prev.base_pay_cents;
      const newBonus = hasBonusOverride ? bonusOverride! : prev.bonus_cents;
      const newOwed = newBase + newBonus;
      const paidCents = prev.total_paid_cents;
      const status: 'paid' | 'partially_paid' | 'unpaid' =
        paidCents >= newOwed ? 'paid' : paidCents > 0 ? 'partially_paid' : 'unpaid';

      const { error: updateError } = await supabase
        .from('managed_creator_posts')
        .update({
          ...(hasBaseOverride ? { base_pay_cents: newBase } : {}),
          ...(hasBonusOverride ? { bonus_cents: newBonus } : {}),
          total_owed_cents: newOwed,
          payment_status: status,
        })
        .eq('id', id);

      if (updateError) {
        results.push({ mcp_id: id, success: false, error: updateError.message });
      } else {
        results.push({ mcp_id: id, success: true });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    after(async () => {
      await logAdminAction(user.id, 'post_payment_update_base', {
        managed_creator_post_ids: ids,
        ...(hasBaseOverride ? { base_pay_cents: basePayOverride } : {}),
        ...(hasBonusOverride ? { bonus_cents: bonusOverride } : {}),
        succeeded,
        failed,
      });
    });

    return Response.json({
      success: true,
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    captureDbError(error, 'admin_creator_post_payments_update_base', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
