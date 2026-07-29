'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { notifyAdminTestVideosSubmitted } from '@/lib/notifications/admin-slack';
import { MC_STATUS, CONTENT_ACCESSIBLE_STATUSES } from '@/lib/modules/managed-creators/constants';

import { CONTRACT_VERSION, hasSignedMinimumContract } from './contract-template';
import { resolveJobIdForBrand, getManagedCreatorForBrand } from './queries';
import { getJobPaymentConfig } from '@/lib/modules/jobs/repository';
import { notify } from '@/lib/messaging/notify';
import { after } from 'next/server';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { notifyOnStatusTransition } from '@/lib/modules/managed-creators/notify-on-status-transition';
import type { Platform, ValidationError } from '@/lib/services/handle-validation';
import { applyPlatformHandle } from './handle-lifecycle';

const initOnboardingSchema = z.object({
  brandSlug: z.string().min(1),
  jobId: z.string().optional(),
});

export const initOnboarding = validatedActionWithUser(
  initOnboardingSchema,
  async (data, _formData, user) => {
    const db = createServiceRoleClient();

    // Only creators can start onboarding
    const { data: userData } = await db
      .from('users')
      .select('account_type, country')
      .eq('id', user.id)
      .single();
    if (userData?.account_type !== 'creator') {
      return { error: 'Only creators can apply through the portal' };
    }

    // Look up brand org
    const { data: org } = await db
      .from('brand_organizations')
      .select('id')
      .eq('organization_slug', data.brandSlug)
      .single();
    if (!org) return { error: 'Brand not found' };

    // Check for existing managed_creators row (workspace or portal-config job)
    // Use limit(1) instead of maybeSingle() since a creator can have multiple records per brand
    const { data: existingRows } = await db
      .from('managed_creators')
      .select('id, status, base_pay, cpm_rate')
      .eq('linked_user_id', user.id)
      .eq('brand_organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const existing = existingRows?.[0] ?? null;

    if (existing) {
      const updates: Record<string, unknown> = {};

      const shouldBackfillPayment =
        (existing.base_pay == null || Number(existing.base_pay) === 0) &&
        !existing.cpm_rate;

      if (shouldBackfillPayment) {
        const resolvedJobId = await resolveJobIdForBrand(org.id, data.jobId, userData?.country);
        if (resolvedJobId) {
          const config = await getJobPaymentConfig(db, resolvedJobId);
          updates.base_pay = config.cpm_base_pay ?? 0;
          updates.cpm_rate = config.cpm_rate;
          updates.max_pay_cents = config.max_pay_cents;
          updates.bonus_milestones = config.bonus_milestones;
        }
      }

      if (!existing.status || existing.status === 'applied') {
        updates.onboarding_started_at = new Date().toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await db
          .from('managed_creators')
          .update(updates)
          .eq('id', existing.id);
      }

      revalidatePath(`/dashboard/jobs/${data.brandSlug}`);
      return { success: 'Onboarding resumed', managedCreatorId: existing.id };
    }

    // Get creator profile
    const { data: profile } = await db
      .from('creator_profiles')
      .select('id, display_name')
      .eq('user_id', user.id)
      .maybeSingle();
    const creatorName = profile?.display_name || user.email || 'New Creator';

    const resolvedJobId = await resolveJobIdForBrand(org.id, data.jobId, userData?.country);

    // Fetch job-level payment config so new creators inherit defaults
    const jobPaymentConfig = resolvedJobId
      ? await getJobPaymentConfig(db, resolvedJobId)
      : { cpm_base_pay: null, cpm_rate: null, max_pay_cents: null, bonus_milestones: [] };

    // Create new managed_creators row
    const { data: created, error } = await db
      .from('managed_creators')
      .insert({
        linked_user_id: user.id,
        linked_creator_profile_id: profile?.id,
        brand_organization_id: org.id,
        name: creatorName,
        email: user.email?.toLowerCase(),
        status: MC_STATUS.APPLIED,
        sourced: 'portal',
        onboarding_started_at: new Date().toISOString(),
        job_id: resolvedJobId,
        base_pay: jobPaymentConfig.cpm_base_pay ?? 0,
        cpm_rate: jobPaymentConfig.cpm_rate,
        max_pay_cents: jobPaymentConfig.max_pay_cents,
        bonus_milestones: jobPaymentConfig.bonus_milestones,
      })
      .select('id')
      .single();

    if (error) return { error: 'Failed to initialize onboarding' };

    if (resolvedJobId) {
      const jobId = resolvedJobId;
      const orgId = org.id;
      const userId = user.id;
      after(async () => {
        try {
          const { data: job } = await db
            .from('jobs')
            .select('job_title')
            .eq('id', jobId)
            .maybeSingle();
          const jobTitle = job?.job_title ?? 'this campaign';
          await notify({
            userId,
            eventType: 'application_received',
            brandOrganizationId: orgId,
            body: `You've applied to ${jobTitle}. We'll get back to you soon.`,
            data: { job_id: jobId },
          });
        } catch (err) {
          captureFireAndForget('portal_application_received_notify')(err);
        }
      });
    }

    revalidatePath(`/dashboard/jobs/${data.brandSlug}`);
    return { success: 'Onboarding started', managedCreatorId: created.id };
  }
);

const submitApplicationSchema = z.object({
  brandSlug: z.string().min(1),
  forceSubmit: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()),
  notifMethods: z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return [v]; }
    },
    z.array(z.enum(['email', 'sms'])).optional()
  ),
});

export const submitApplication = validatedActionWithUser(
  submitApplicationSchema,
  async (data, _formData, user) => {
    const db = createServiceRoleClient();

    const { data: org } = await db
      .from('brand_organizations')
      .select('id')
      .eq('organization_slug', data.brandSlug)
      .single();
    if (!org) return { error: 'Brand not found' };

    // Find the managed_creator record
    const mc = await getManagedCreatorForBrand(user.id, org.id);

    if (!mc) return { error: 'No application found for this brand' };

    // Parallel fetch: creator videos (merged count+hashes), reference videos, and creator profile
    const [{ data: creatorVideos }, { data: refVideos }, { data: profile }] = await Promise.all([
      db.from('managed_creator_videos')
        .select('id, file_hash')
        .eq('managed_creator_id', mc.id)
        .is('replaced_at', null),
      db.from('brand_reference_videos')
        .select('id, file_hash, job_ids')
        .eq('brand_organization_id', org.id)
        .not('file_hash', 'is', null),
      db.from('creator_profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    // Verify creator has at least one active video before marking complete
    const videoCount = creatorVideos?.length ?? 0;
    if (videoCount < 1) {
      return { error: 'Please upload at least one video before submitting' };
    }

    // --- Layer 1: Hash duplicate check (instant) ---
    const creatorHashes = new Set(
      (creatorVideos ?? []).map(v => v.file_hash).filter((h): h is string => !!h)
    );

    if (creatorHashes.size > 0) {
      const jobRefVideos = (refVideos ?? []).filter(v => {
        const ids = v.job_ids as string[] | null;
        return !ids || ids.length === 0 || (mc.job_id && ids.includes(mc.job_id));
      });

      const refHashes = new Set(
        jobRefVideos.map(v => v.file_hash).filter((h): h is string => !!h)
      );

      for (const hash of creatorHashes) {
        if (refHashes.has(hash)) {
          return { error: 'One of your videos is identical to a reference video. Please record your own original video.' };
        }
      }
    }

    // Don't regress creators who already have content access — merge all managed_creators updates into one query
    const skipStatusUpdate = (CONTENT_ACCESSIBLE_STATUSES as readonly string[]).includes(mc.status ?? '');
    const updatePayload: Record<string, unknown> = { videos_complete: true };
    if (!skipStatusUpdate) {
      updatePayload.status = MC_STATUS.TEST_VIDEOS_SUBMITTED;
      if (!data.forceSubmit) {
        updatePayload.screening_status = 'pending';
      }
    }
    if (data.forceSubmit) {
      updatePayload.screening_status = 'skipped';
    }

    const { error } = await db
      .from('managed_creators')
      .update(updatePayload)
      .eq('id', mc.id);

    if (error) return { error: 'Failed to submit application' };

    // --- Layer 2: Fire async AI screening (fire-and-forget) ---
    if (!skipStatusUpdate && !data.forceSubmit) {
      const hookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/hooks/screen-submission`;
      fetch(hookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ managed_creator_id: mc.id }),
        signal: AbortSignal.timeout(10_000),
      }).catch(captureFireAndForget('portal_screening_trigger'));
    }

    // Slack notification (fire-and-forget)
    const creatorName = profile?.display_name || user.email || 'Unknown Creator';
    notifyAdminTestVideosSubmitted(org.id, { creatorName, videoCount }).catch(captureFireAndForget('portal_test_videos_notification'));

    if (data.notifMethods) {
      await db.from('users').update({
        sms_notifications_consent: data.notifMethods.includes('sms'),
        email_updates_consent: data.notifMethods.includes('email'),
      }).eq('id', user.id);
    }

    revalidatePath(`/dashboard/jobs/${data.brandSlug}`);
    return { success: 'Application submitted' };
  }
);

const saveHandlesSchema = z.object({
  brandSlug: z.string().min(1),
  tiktokHandle: z.string().optional(),
  instagramHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  // JSON-encoded `{ tiktok?: true; instagram?: true; youtube?: true }`. Sent by the UI
  // after the user accepts the swap-confirmation modal.
  confirmedReplacement: z.string().optional(),
});

export type SaveHandlesResult =
  | { success: string }
  | { error: string }
  | { requiresConfirmation: Platform[]; currentHandles: Partial<Record<Platform, string>> }
  | { errors: Partial<Record<Platform, ValidationError | 'account_in_use' | 'db_error'>> };

export const saveHandles = validatedActionWithUser<typeof saveHandlesSchema, SaveHandlesResult>(
  saveHandlesSchema,
  async (data, _formData, user) => {
    const db = createServiceRoleClient();

    const { data: org } = await db
      .from('brand_organizations')
      .select('id')
      .eq('organization_slug', data.brandSlug)
      .single();
    if (!org) return { error: 'Brand not found' };

    const mc = await getManagedCreatorForBrand(user.id, org.id);
    if (!mc) return { error: 'Creator not found for this brand' };

    let confirmed: Partial<Record<Platform, boolean>> = {};
    if (data.confirmedReplacement) {
      try {
        const parsed = JSON.parse(data.confirmedReplacement) as Partial<Record<Platform, boolean>>;
        if (parsed && typeof parsed === 'object') confirmed = parsed;
      } catch {
        // Ignore malformed input — caller will get requiresConfirmation back.
      }
    }

    const requested: Array<{ platform: Platform; handle: string }> = [];
    if (data.tiktokHandle) requested.push({ platform: 'tiktok', handle: data.tiktokHandle });
    if (data.instagramHandle) requested.push({ platform: 'instagram', handle: data.instagramHandle });
    if (data.youtubeHandle) requested.push({ platform: 'youtube', handle: data.youtubeHandle });
    if (requested.length === 0) return { success: 'No handles submitted' };

    const requiresConfirmation: Platform[] = [];
    const currentHandles: Partial<Record<Platform, string>> = {};
    const errors: Partial<Record<Platform, ValidationError | 'account_in_use' | 'db_error'>> = {};
    const saved: Partial<Record<Platform, string>> = {};

    for (const { platform, handle } of requested) {
      const outcome = await applyPlatformHandle(db, mc, org.id, platform, handle, confirmed[platform] === true);
      if (outcome.kind === 'requires_confirmation') {
        requiresConfirmation.push(platform);
        if (outcome.currentHandle) currentHandles[platform] = outcome.currentHandle;
      } else if (outcome.kind === 'error') {
        errors[platform] = outcome.code;
      } else {
        saved[platform] = outcome.handleSaved;
      }
    }

    if (requiresConfirmation.length > 0) {
      return { requiresConfirmation, currentHandles };
    }
    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    // Auto-advance accepted → warming_up when a TikTok or Instagram handle is confirmed.
    // We DON'T compare against mc.tiktok_username / mc.instagram_username here: the
    // write-back trigger updates those columns synchronously when applyPlatformHandle
    // writes the lifecycle row, so on a retry after a partial-failure (handle saved
    // but the status transition below errored) the retried request sees the new
    // handle already mirrored onto mc and would skip the transition forever. The
    // outer ACCEPTED gate guarantees we only fire the transition once per creator,
    // so re-attempting on a same-handle no-op while still ACCEPTED is desired.
    const newTikTok = saved.tiktok != null;
    const newInstagram = saved.instagram != null;
    if (mc.status === MC_STATUS.ACCEPTED && (newTikTok || newInstagram)) {
      const now = new Date().toISOString();
      const handleTimestamps: Record<string, string> = {};
      if (newTikTok) handleTimestamps.tiktok_handle_completed_at = now;
      if (newInstagram) handleTimestamps.instagram_handle_completed_at = now;

      const { error: advanceError } = await db
        .from('managed_creators')
        .update({ status: MC_STATUS.WARMING_UP, ...handleTimestamps })
        .eq('id', mc.id);

      if (advanceError) {
        console.error('[saveHandles] Failed to advance ACCEPTED → WARMING_UP:', advanceError);
      } else {
        const mcId = mc.id;
        const brandId = org.id;
        after(() =>
          notifyOnStatusTransition(db, MC_STATUS.ACCEPTED, MC_STATUS.WARMING_UP, {
            managedCreatorId: mcId,
            brandOrganizationId: brandId,
            linkedUserId: user.id,
          }),
        );
      }
    }

    revalidatePath(`/dashboard/jobs/${data.brandSlug}`);
    return { success: 'Handles saved' };
  },
);

const signContractSchema = z.object({
  brandSlug: z.string().min(1),
  signerName: z.string().min(1),
});

export const signContract = validatedActionWithUser(
  signContractSchema,
  async (data, _formData, user) => {
    const db = createServiceRoleClient();

    const { data: org } = await db
      .from('brand_organizations')
      .select('id, organization_name')
      .eq('organization_slug', data.brandSlug)
      .single();
    if (!org) return { error: 'Brand not found' };

    const mc = await getManagedCreatorForBrand(user.id, org.id);

    if (!mc) return { error: 'Your account is not linked to this brand yet. Please complete onboarding first or contact your campaign manager.' };
    if (mc.status !== MC_STATUS.ACTIVE && mc.status !== MC_STATUS.WARMING_UP && mc.status !== MC_STATUS.ACCEPTED) return { error: 'Your account needs to be accepted before you can sign the contract. Please add your social handles or contact your campaign manager for next steps.' };
    if (mc.contract_accepted_at && hasSignedMinimumContract(mc.contract_version)) {
      return { error: 'This contract has already been signed. You can download a copy using the button above.' };
    }

    const { error } = await db
      .from('managed_creators')
      .update({
        contract_accepted_at: new Date().toISOString(),
        contract_version: CONTRACT_VERSION,
        contract_signer_name: data.signerName,
      })
      .eq('id', mc.id);

    if (error) return { error: 'Failed to sign contract' };

    revalidatePath(`/dashboard/jobs/${data.brandSlug}`);
    return { success: 'Contract signed' };
  }
);
