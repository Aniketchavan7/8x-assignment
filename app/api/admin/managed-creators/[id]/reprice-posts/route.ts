import { after } from 'next/server';
import { verifyAdmin } from '@/lib/modules/admin/api-middleware';
import { logAdminAction } from '@/lib/modules/admin/audit-log';
import { handleApiError } from '@/lib/utils/api-error';
import { notify } from '@/lib/messaging/notify';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const { id } = await params;
    const { supabase, user } = auth;

    const { data: mc, error: mcErr } = await supabase
      .from('managed_creators')
      .select('id, base_pay, bonus_milestones, job_id, jobs ( cpm_platforms_allowed )')
      .eq('id', id)
      .single();
    if (mcErr || !mc) {
      return Response.json({ error: 'Managed creator not found' }, { status: 404 });
    }

    const job = mc.jobs as { cpm_platforms_allowed: string[] | null } | null;
    const platformCount = job?.cpm_platforms_allowed?.length || 2;
    const rawBase = mc.base_pay == null ? 0 : Number(mc.base_pay);
    const expectedBasePayCents = Math.round(rawBase / Math.max(platformCount, 1));
    const expectedMilestones = mc.bonus_milestones ?? null;
    const expectedMilestonesKey = JSON.stringify(expectedMilestones);

    const { data: posts, error: postsErr } = await supabase
      .from('managed_creator_posts')
      .select('id, base_pay_cents, bonus_cents, bonus_milestones, payment_status')
      .eq('managed_creator_id', id)
      .in('payment_status', ['unpaid', 'excluded']);
    if (postsErr) throw postsErr;

    const toReprice = (posts ?? []).filter((p) => {
      const milestonesDiff = JSON.stringify(p.bonus_milestones ?? null) !== expectedMilestonesKey;
      return p.base_pay_cents !== expectedBasePayCents || milestonesDiff;
    });

    let updated = 0;
    for (const p of toReprice) {
      const newBase = expectedBasePayCents;
      const newBonus = p.bonus_cents ?? 0;
      const newTotalOwed = newBase + newBonus;

      const { error: upErr } = await supabase
        .from('managed_creator_posts')
        .update({
          base_pay_cents: newBase,
          bonus_milestones: expectedMilestones,
          total_owed_cents: newTotalOwed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id);
      if (!upErr) updated += 1;
    }

    after(async () => {
      await logAdminAction(user.id, 'managed_creator_posts_reprice', {
        managed_creator_id: id,
        updated_count: updated,
      });

      if (updated === 0) return;
      try {
        const { data: mcRow } = await supabase
          .from('managed_creators')
          .select('linked_user_id, brand_organization_id, job_id')
          .eq('id', id)
          .maybeSingle();
        if (!mcRow?.linked_user_id) return;

        await notify({
          userId: mcRow.linked_user_id,
          eventType: 'payment_terms_changed',
          brandOrganizationId: mcRow.brand_organization_id ?? null,
          body: `Your payment terms have been updated for upcoming posts. Open the app to review the new base pay and milestones.`,
          data: { managed_creator_id: id, job_id: mcRow.job_id, repriced_count: updated },
        });
      } catch (err) {
        captureFireAndForget('managed_creator_reprice_notify')(err);
      }
    });

    return Response.json({ updated });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/reprice-posts',
      method: 'POST',
    });
  }
}
