import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { logAdminAction } from '@/lib/modules/admin/audit-log';
import { notifyAdvanceBalanceUpdated } from '@/lib/notifications/slack/payouts';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import type { ManagedCreatorListItem } from '../route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const [user, { id }] = await Promise.all([getUser(), params]);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { data: creator, error } = await supabase
      .from('managed_creators')
      .select(`
        id,
        name,
        email,
        phone,
        location,
        status,
        tiktok_username,
        instagram_username,
        youtube_username,
        collected_tiktok_url,
        collected_instagram_url,
        tiktok_performance,
        instagram_performance,
        base_pay,
        payment,
        total_paid,
        pending_payout,
        payment_outstanding,
        payment_method,
        payout_frequency,
        last_payment_date,
        onboarding_call_complete,
        handles_complete,
        videos_complete,
        is_active,
        sourced,
        notes,
        brand_organization_id,
        linked_creator_profile_id,
        linked_user_id,
        job_id,
        created_at,
        updated_at,
        onboarding_started_at,
        onboarded_at,
        onboarding_call_completed_at,
        read_about_company_completed_at,
        base_course_status,
        tiktok_handle_completed_at,
        instagram_handle_completed_at,
        warmup_day_1_completed_at,
        warmup_day_2_completed_at,
        warmup_day_3_completed_at,
        warmup_day_4_completed_at,
        first_post_completed_at,
        contract_accepted_at,
        accepted_at,
        status_changed_at,
        country,
        video_urls,
        advance_balance_cents,
        slack_user_id,
        brand_organizations (
          organization_name
        ),
        jobs (
          job_title,
          cpm_rate,
          target_country
        )
      `)
      .eq('id', id)
      .single();

    if (error || !creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    const brandOrg = creator.brand_organizations as { organization_name: string } | null;
    const job = creator.jobs as { job_title: string; cpm_rate: number | null; target_country: string | null } | null;

    const result: ManagedCreatorListItem = {
      id: creator.id,
      name: creator.name,
      email: creator.email,
      phone: creator.phone,
      location: creator.location,
      status: creator.status,
      tiktok_username: creator.tiktok_username,
      instagram_username: creator.instagram_username,
      youtube_username: creator.youtube_username,
      collected_tiktok_url: creator.collected_tiktok_url,
      collected_instagram_url: creator.collected_instagram_url,
      tiktok_performance: creator.tiktok_performance,
      instagram_performance: creator.instagram_performance,
      base_pay: creator.base_pay,
      payment: creator.payment,
      total_paid: creator.total_paid,
      pending_payout: creator.pending_payout,
      payment_outstanding: creator.payment_outstanding,
      payment_method: creator.payment_method,
      payout_frequency: creator.payout_frequency,
      last_payment_date: creator.last_payment_date,
      onboarding_call_complete: creator.onboarding_call_complete,
      handles_complete: creator.handles_complete,
      videos_complete: creator.videos_complete,
      is_active: creator.is_active,
      sourced: creator.sourced,
      notes: creator.notes,
      brand_organization_id: creator.brand_organization_id,
      brand_name: brandOrg?.organization_name || null,
      linked_creator_profile_id: creator.linked_creator_profile_id,
      linked_user_id: creator.linked_user_id,
      job_id: creator.job_id,
      created_at: creator.created_at,
      updated_at: creator.updated_at,
      onboarding_started_at: creator.onboarding_started_at,
      onboarded_at: creator.onboarded_at,
      onboarding_call_completed_at: creator.onboarding_call_completed_at,
      read_about_company_completed_at: creator.read_about_company_completed_at,
      base_course_status: creator.base_course_status,
      tiktok_handle_completed_at: creator.tiktok_handle_completed_at,
      instagram_handle_completed_at: creator.instagram_handle_completed_at,
      warmup_day_1_completed_at: creator.warmup_day_1_completed_at,
      warmup_day_2_completed_at: creator.warmup_day_2_completed_at,
      warmup_day_3_completed_at: creator.warmup_day_3_completed_at,
      warmup_day_4_completed_at: creator.warmup_day_4_completed_at,
      first_post_completed_at: creator.first_post_completed_at,
      contract_accepted_at: creator.contract_accepted_at,
      accepted_at: creator.accepted_at ?? null,
      status_changed_at: creator.status_changed_at ?? null,
      job_title: job?.job_title || null,
      job_cpm: job?.cpm_rate ?? null,
      job_country: job?.target_country || null,
      country: creator.country,
      video_urls: creator.video_urls,
      advance_balance_cents: creator.advance_balance_cents,
      slack_user_id: creator.slack_user_id || null,
    };

    return Response.json(result);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]',
      method: 'GET',
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const [user, { id }] = await Promise.all([getUser(), params]);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { advance_balance_cents, slack_user_id, notes, job_id } = body;

    // At least one field must be provided
    if (
      advance_balance_cents == null &&
      slack_user_id === undefined &&
      notes === undefined &&
      job_id === undefined
    ) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Validate advance_balance_cents if provided
    if (advance_balance_cents != null && (!Number.isInteger(advance_balance_cents) || advance_balance_cents < 0)) {
      return Response.json({ error: 'advance_balance_cents must be a non-negative integer' }, { status: 400 });
    }

    // Build update data
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (advance_balance_cents != null) updateData.advance_balance_cents = advance_balance_cents;
    if (slack_user_id !== undefined) updateData.slack_user_id = slack_user_id || null;
    if (notes !== undefined) updateData.notes = notes || null;

    // Resolve job change (same-brand guard). If null, clear job link without touching pay fields.
    //
    // NOTE: This is the legacy path used by CreatorHubCampaignsGrid's ChangeJobDialog.
    // It only snapshots base_pay and bonus_milestones (not cpm_rate/max_pay_cents) and
    // does NOT re-price existing posts or update BTSA. The pipeline grid's ReassignJobModal
    // uses reassign_managed_creator_job() RPC, which handles all five MC fields + MCP
    // re-pricing + BTSA campaign updates atomically. Keeping both for now; consolidate
    // when the campaigns-grid flow is migrated.
    if (job_id !== undefined) {
      if (job_id !== null) {
        const { data: mc } = await supabase
          .from('managed_creators')
          .select('brand_organization_id')
          .eq('id', id)
          .single();
        if (!mc) {
          return Response.json({ error: 'Managed creator not found' }, { status: 404 });
        }

        const { data: job } = await supabase
          .from('jobs')
          .select('id, brand_organization_id, cpm_base_pay, bonus_milestones')
          .eq('id', job_id)
          .single();
        if (!job) {
          return Response.json({ error: 'Job not found' }, { status: 404 });
        }

        if (job.brand_organization_id !== mc.brand_organization_id) {
          return Response.json(
            { error: 'Target job belongs to a different brand' },
            { status: 400 }
          );
        }

        updateData.base_pay = job.cpm_base_pay;
        updateData.bonus_milestones = job.bonus_milestones;
      }
      updateData.job_id = job_id;
    }

    // Fetch current state for Slack notification (only if advance is changing)
    let mcBefore: any = null;
    let previousAmount = 0;
    if (advance_balance_cents != null) {
      const { data } = await supabase
        .from('managed_creators')
        .select('name, advance_balance_cents, brand_organizations(organization_name)')
        .eq('id', id)
        .single();
      mcBefore = data;
      previousAmount = mcBefore?.advance_balance_cents ?? 0;
    }

    const { data, error } = await supabase
      .from('managed_creators')
      .update(updateData)
      .eq('id', id)
      .select('id, advance_balance_cents, slack_user_id, job_id, base_pay')
      .single();

    if (error || !data) {
      return Response.json({ error: 'Failed to update managed creator' }, { status: 500 });
    }

    if (advance_balance_cents != null) {
      after(async () => {
        await logAdminAction(user.id, 'advance_balance_update', {
          managed_creator_id: id,
          advance_balance_cents,
        });

        const brandOrg = mcBefore?.brand_organizations as { organization_name: string } | null;
        await notifyAdvanceBalanceUpdated({
          adminEmail: user.email || user.id,
          creatorName: mcBefore?.name || id,
          brandName: brandOrg?.organization_name || 'Unknown',
          previousAmount,
          newAmount: advance_balance_cents,
        }).catch(captureFireAndForget('advance_slack_notification'));
      });
    }

    if (job_id !== undefined) {
      after(async () => {
        await logAdminAction(user.id, 'managed_creator_job_change', {
          managed_creator_id: id,
          new_job_id: job_id,
        });
      });
    }

    return Response.json(data);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]',
      method: 'PATCH',
    });
  }
}
