/**
 * Applications service — shared between web `/api/jobs/[jobId]/apply` and
 * mobile `handleApplyToJob` / `handleGetApplications` / `handleGetApplicationVideo`.
 *
 * Side effects (Slack notifications, PostHog events, email) are fired from
 * the service since they're the same on both platforms. Callers inject a
 * Supabase client; for mobile that's service-role, for web that's the
 * cookie-authenticated client (RLS-scoped).
 */

import { z } from 'zod';
import { notifyApplicationEvent } from '@/lib/messaging/application-notifications';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { trackEvent } from '@/lib/analytics/posthog-server';
import { PostHogEvents } from '@/lib/analytics/events';
import { sendSlackMessage } from '@/lib/notifications/slack';
import { SLACK_CHANNELS } from '@/lib/notifications/slack/channels';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';
import { ServiceError, type ServiceContext, type ServiceSupabase } from './_types';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

export const applyToJobInputSchema = z.object({
  jobId: z.string().min(1),
  cover_letter: z.string().nullable().optional(),
  burner_account_id: z.string().nullable().optional(),
});
export type ApplyToJobInput = z.infer<typeof applyToJobInputSchema>;

// ------------------------------------------------------------------
// DTOs (preserve legacy JSON keys)
// ------------------------------------------------------------------

export interface ApplyToJobResult {
  success: true;
  application_id: string;
  job_type: string | null;
  job_slug: string | null;
  brand_slug?: string;
  auto_approved: boolean;
  onboarding_call_url?: string | null;
  message: string;
}

/**
 * Side-channel context the web wrapper uses to emit the `#applications`
 * Slack message and compute the onboarding-call URL. Returned separately
 * from `ApplyToJobResult` so it never leaks into the mobile response.
 */
export interface ApplyToJobBrandContext {
  jobTitle: string | null;
  brandName?: string;
  isEightXManaged: boolean;
  onboardingCallLink: string | null;
  creatorDisplayName: string | null;
  creatorLocation: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  creatorEmail: string | null;
}

export interface ApplicationListItem {
  id: string;
  job_id: string;
  job_title: string;
  job_description: string | null;
  job_type: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  brand_organization_id: string | null;
  budget_per_creator: number | null;
  brand_user_id: string | null;
  application_status: string;
  applied_at: string;
  cover_letter: string | null;
  rejection_reason: string | null;
  media: Array<{ url: string; type: string }> | null;
  burner_account_id: string | null;
  burner_handle: string | null;
  contract_accepted_at: string | null;
  contract_version: string | null;
  contract_signer_name: string | null;
  warmup_checklist: Record<string, unknown>;
  warmup_tiktok_handle: string | null;
  warmup_instagram_handle: string | null;
  accounts_verified_at: string | null;
  warmup_completed_at: string | null;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

interface CreatorProfileForApply {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  email: string | null;
}

async function requireCreatorProfile(
  ctx: ServiceContext
): Promise<CreatorProfileForApply> {
  const { data, error } = await ctx.supabase
    .from('creator_profiles')
    .select('id, display_name, first_name, last_name, location, email')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) {
    throw new ServiceError('internal', 'Failed to load creator profile.');
  }
  if (!data) {
    throw new ServiceError(
      'bad_request',
      'Creator profile not found. Please complete onboarding first.'
    );
  }
  return data as CreatorProfileForApply;
}

// ------------------------------------------------------------------
// listMyApplications
// ------------------------------------------------------------------

export async function listMyApplications(
  ctx: ServiceContext
): Promise<ApplicationListItem[]> {
  const { data: profile } = await ctx.supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (!profile) return [];

  const warmupCols =
    'warmup_checklist, warmup_tiktok_handle, warmup_instagram_handle, accounts_verified_at, warmup_completed_at,';
  const baseCols = `id, job_id, application_status, applied_at, cover_letter, rejection_reason, media, burner_account_id,
      contract_accepted_at, contract_version, contract_signer_name,`;
  const joins = `jobs (job_title, description, job_type, budget_per_creator, created_by, brand_organization_id, brand_organizations (organization_name, organization_slug)),
      burner_accounts (id, handle)`;

  type ApplicationRow = Record<string, unknown> & {
    id: string;
    job_id: string;
    application_status: string | null;
    applied_at: string | null;
    cover_letter: string | null;
    rejection_reason: string | null;
    media: unknown;
    burner_account_id: string | null;
    contract_accepted_at: string | null;
    contract_version: string | null;
    contract_signer_name: string | null;
    jobs: Record<string, unknown> | Record<string, unknown>[] | null;
    burner_accounts: { id: string; handle: string } | null;
  };

  const result1 = await ctx.supabase
    .from('job_applications')
    .select(`${baseCols} ${warmupCols} ${joins}`)
    .eq('creator_profile_id', profile.id)
    .order('applied_at', { ascending: false });

  let applications: ApplicationRow[] | null = null;
  if (
    result1.error &&
    (result1.error as { code?: string }).code === '42703'
  ) {
    // Column missing (42703) → retry without warmup columns. This handles
    // envs where the schema hasn't been migrated yet.
    const result2 = await ctx.supabase
      .from('job_applications')
      .select(`${baseCols} ${joins}`)
      .eq('creator_profile_id', profile.id)
      .order('applied_at', { ascending: false });
    if (result2.error) {
      console.error('[services/applications] listMyApplications fallback error:', result2.error);
      return [];
    }
    applications = (result2.data as unknown as ApplicationRow[]) ?? null;
  } else if (result1.error) {
    // Non-42703 errors (network, RLS, etc.) — log so we can tell empty-list
    // from crashed-query in production.
    console.error('[services/applications] listMyApplications error:', result1.error);
    return [];
  } else {
    applications = (result1.data as unknown as ApplicationRow[]) ?? null;
  }

  const appIds = (applications ?? []).map((a) => a.id);
  const videoMap = new Map<string, number>();
  if (appIds.length > 0) {
    const { data: videoCounts } = await ctx.supabase
      .from('applications_videos')
      .select('application_id')
      .in('application_id', appIds);
    for (const v of videoCounts ?? []) {
      videoMap.set(v.application_id, (videoMap.get(v.application_id) ?? 0) + 1);
    }
  }

  return (applications ?? []).map((app) => {
    const jobData =
      app.jobs && typeof app.jobs === 'object' && 'job_title' in (app.jobs as Record<string, unknown>)
        ? (app.jobs as {
            job_title: string;
            description?: string | null;
            job_type?: string | null;
            budget_per_creator?: number | null;
            created_by?: string | null;
            brand_organization_id?: string | null;
            brand_organizations?: {
              organization_name?: string | null;
              organization_slug?: string | null;
            } | null;
          })
        : null;

    let media = Array.isArray(app.media) && app.media.length > 0 ? (app.media as Array<{ url: string; type: string }>) : null;
    if (!media && (videoMap.get(app.id) ?? 0) > 0) {
      media = [{ url: 'uploaded', type: 'video/mp4' }];
    }

    const burnerData = app.burner_accounts;

    return {
      id: app.id,
      job_id: app.job_id,
      job_title: jobData?.job_title ?? 'Unknown Job',
      job_description: jobData?.description ?? null,
      job_type: jobData?.job_type ?? null,
      brand_name: jobData?.brand_organizations?.organization_name ?? null,
      brand_slug: jobData?.brand_organizations?.organization_slug ?? null,
      brand_organization_id: jobData?.brand_organization_id ?? null,
      budget_per_creator: jobData?.budget_per_creator ? Number(jobData.budget_per_creator) : null,
      brand_user_id: jobData?.created_by ?? null,
      application_status: app.application_status ?? 'pending',
      applied_at: app.applied_at ?? new Date().toISOString(),
      cover_letter: app.cover_letter,
      rejection_reason: app.rejection_reason,
      media,
      burner_account_id: app.burner_account_id ?? null,
      burner_handle: burnerData?.handle ?? null,
      contract_accepted_at: app.contract_accepted_at ?? null,
      contract_version: app.contract_version ?? null,
      contract_signer_name: app.contract_signer_name ?? null,
      warmup_checklist: (app.warmup_checklist as Record<string, unknown>) ?? {},
      warmup_tiktok_handle: (app.warmup_tiktok_handle as string | null) ?? null,
      warmup_instagram_handle: (app.warmup_instagram_handle as string | null) ?? null,
      accounts_verified_at: (app.accounts_verified_at as string | null) ?? null,
      warmup_completed_at: (app.warmup_completed_at as string | null) ?? null,
    };
  });
}

// ------------------------------------------------------------------
// getApplicationVideo
// ------------------------------------------------------------------

export interface ApplicationVideoDto {
  id: string;
  job_id: string;
  application_status: string;
  job: {
    id: string;
    job_title: string;
    description: string | null;
    brand_name: string;
  };
  videos: Array<{ id: string; url: string; filename: string; created_at: string | null }>;
}

export async function getApplicationVideo(
  ctx: ServiceContext,
  applicationId: string
): Promise<ApplicationVideoDto> {
  const { data: application, error: appError } = await ctx.supabase
    .from('job_applications')
    .select(
      `id, job_id, application_status, creator_profile_id,
       creator_profiles!inner(user_id),
       jobs!inner(id, job_title, description, brand_organization_id)`
    )
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    throw new ServiceError('not_found', 'Application not found');
  }

  const cp = application.creator_profiles as { user_id: string } | null;
  if (!cp || cp.user_id !== ctx.user.id) {
    throw new ServiceError('forbidden', 'Unauthorized');
  }

  const job = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;
  const jobRecord = job as Record<string, unknown>;

  const { data: brand } = await ctx.supabase
    .from('brand_organizations')
    .select('organization_name')
    .eq('id', jobRecord.brand_organization_id as string)
    .single();

  const { data: videos } = await ctx.supabase
    .from('applications_videos')
    .select('id, video_url, filename, created_at')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });

  return {
    id: application.id,
    job_id: application.job_id,
    application_status: application.application_status ?? 'pending',
    job: {
      id: jobRecord.id as string,
      job_title: jobRecord.job_title as string,
      description: (jobRecord.description as string | null) ?? null,
      brand_name: brand?.organization_name ?? 'Unknown Brand',
    },
    videos: (videos ?? []).map((v) => ({
      id: v.id,
      url: v.video_url,
      filename: v.filename,
      created_at: v.created_at,
    })),
  };
}

// ------------------------------------------------------------------
// applyToJob — unified web + mobile flow.
// Web wrappers can pass `ctx.elevatedSupabase` for RLS-bypassed brand reads;
// mobile wrappers already have a service-role `ctx.supabase`, so the fallback
// covers them.
// ------------------------------------------------------------------

export interface ApplyToJobOptions {
  /**
   * When true (default), fires the email + in-app notifier via
   * `notifyApplicationEvent`. Web wrapper overrides to `false` — pre-refactor
   * web only sent Slack + PostHog, so consolidating with mobile's notifier
   * would be a net-new user-visible side effect. Mobile wrapper uses default.
   */
  sendUserNotifications?: boolean;
  /**
   * When true, only auto-approve CPM jobs that also have a `portal_config`
   * (i.e. brand-configured featured jobs). Mobile wrapper sets this to
   * preserve pre-refactor mobile behaviour where random CPM jobs in the
   * feed don't auto-approve. Web default is `false` — web has never had
   * this gate and all CPM+auto_approve jobs auto-approve.
   */
  requirePortalConfigForAutoApprove?: boolean;
}

export interface ApplyToJobResponse {
  result: ApplyToJobResult;
  brandContext: ApplyToJobBrandContext;
}

export async function applyToJob(
  ctx: ServiceContext,
  input: ApplyToJobInput,
  options: ApplyToJobOptions = {}
): Promise<ApplyToJobResponse> {
  const sendUserNotifications = options.sendUserNotifications !== false;
  const { jobId, cover_letter, burner_account_id } = input;
  const coverLetter = cover_letter && cover_letter.trim() ? cover_letter.trim() : null;
  const profile = await requireCreatorProfile(ctx);

  // Fetch the job. We deliberately avoid joining brand_organizations here —
  // RLS blocks the join for non-managed creators on the web side. Brand info
  // is fetched below via an elevated client.
  const { data: job, error: jobError } = await ctx.supabase
    .from('jobs')
    .select(
      'id, status, visibility, application_deadline, job_type, job_title, job_slug, auto_approve_applications, portal_config, brand_organization_id'
    )
    .eq('id', jobId.trim())
    .single();

  if (jobError || !job) {
    throw new ServiceError('not_found', 'Job not found');
  }

  if (job.status !== 'open' && job.status !== 'in_progress') {
    throw new ServiceError('bad_request', 'This job is not currently accepting applications');
  }

  if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
    throw new ServiceError('bad_request', 'Application deadline has passed');
  }

  const { data: existingApplication } = await ctx.supabase
    .from('job_applications')
    .select('id, application_status')
    .eq('job_id', jobId)
    .eq('creator_profile_id', profile.id)
    .maybeSingle();

  if (existingApplication) {
    throw new ServiceError('bad_request', 'You have already applied to this job', {
      message: `Your application status: ${existingApplication.application_status}`,
    });
  }

  // Elevated client for brand_organizations + managed_creators — both RLS-
  // blocked for creators on the web side. Mobile's ctx.supabase is already
  // service-role, so fallback there is safe.
  const elevated: ServiceSupabase = ctx.elevatedSupabase ?? ctx.supabase;

  let brandSlug: string | undefined;
  let brandName: string | undefined;
  let isEightXManaged = false;
  let onboardingCallLink: string | null = null;
  if (job.brand_organization_id) {
    const { data: brandOrg } = await elevated
      .from('brand_organizations')
      .select('organization_slug, organization_name, eight_x_managed, onboarding_call_link')
      .eq('id', job.brand_organization_id)
      .maybeSingle();
    if (brandOrg) {
      brandSlug = brandOrg.organization_slug ?? undefined;
      brandName = brandOrg.organization_name ?? undefined;
      isEightXManaged = !!brandOrg.eight_x_managed;
      onboardingCallLink = brandOrg.onboarding_call_link ?? null;
    }
  }

  // One managed_creators row per brand/creator — preserved from pre-refactor
  // web behaviour. Prevents a creator from applying to a second campaign at a
  // brand they already have an active engagement with. Mirrors
  // `app/api/jobs/[jobId]/apply/route.ts` on main.
  if (job.brand_organization_id) {
    const { data: existingMcForOrg } = await elevated
      .from('managed_creators')
      .select('id')
      .eq('brand_organization_id', job.brand_organization_id)
      .eq('linked_user_id', ctx.user.id)
      .not('job_id', 'is', null)
      .limit(1)
      .maybeSingle();

    if (existingMcForOrg) {
      throw new ServiceError(
        'bad_request',
        "You've already applied to a campaign for this brand"
      );
    }
  }

  // CPM jobs with auto-approve → immediately accepted. Mobile additionally
  // requires `portal_config` (featured/brand-configured jobs only) —
  // matches pre-refactor mobile behaviour. Web has never had this gate.
  const isCpmJob = job.job_type === 'cpm';
  const isFeatured = job.portal_config != null;
  const autoApprove = !!(
    isCpmJob &&
    job.auto_approve_applications &&
    (!options.requirePortalConfigForAutoApprove || isFeatured)
  );
  const appStatus: 'accepted' | 'pending' = autoApprove ? 'accepted' : 'pending';

  const insertPayload = {
    job_id: jobId,
    creator_profile_id: profile.id,
    cover_letter: coverLetter,
    application_status: appStatus,
    ...(burner_account_id ? { burner_account_id } : {}),
  };

  const { data: application, error: insertError } = await ctx.supabase
    .from('job_applications')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError || !application) {
    throw new ServiceError('internal', 'Failed to submit application. Please try again.');
  }

  // managed_creators record — link to jobless record if present, else create.
  if (job.brand_organization_id) {
    const orgId = job.brand_organization_id;
    const { data: existingForJob } = await elevated
      .from('managed_creators')
      .select('id')
      .eq('brand_organization_id', orgId)
      .eq('linked_user_id', ctx.user.id)
      .eq('job_id', jobId)
      .maybeSingle();

    if (!existingForJob) {
      const { data: existingRecord } = await elevated
        .from('managed_creators')
        .select('id, job_id')
        .eq('brand_organization_id', orgId)
        .eq('linked_user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRecord && existingRecord.job_id == null) {
        // Only update job_id — never touch status. The admin may have already
        // advanced this row beyond APPLIED (e.g. shortlisted_onboarded), and
        // apply is an intent declaration, not a state reset.
        const { error: updateError } = await elevated
          .from('managed_creators')
          .update({ job_id: jobId })
          .eq('id', existingRecord.id);
        if (updateError) {
          // Log but don't fail — the job_application already succeeded. Matches
          // pre-refactor behaviour; a missing MC row breaks content brief /
          // BTSA tracking but doesn't block the apply UX.
          console.error('Error linking managed_creator to job:', updateError, {
            managedCreatorId: existingRecord.id,
            jobId,
          });
        }
      } else if (!existingRecord) {
        const { error: managedCreatorError } = await elevated
          .from('managed_creators')
          .insert({
            name: profile.display_name || ctx.user.email || 'Creator',
            email: ctx.user.email,
            linked_user_id: ctx.user.id,
            linked_creator_profile_id: profile.id,
            brand_organization_id: orgId,
            job_id: jobId,
            sourced: '8x_feed',
            status: MC_STATUS.APPLIED,
          });
        if (managedCreatorError) {
          // Matches pre-refactor behaviour — log and continue, don't fail the
          // apply. Without this log, a DB error leaves the creator with a
          // job_application but no managed_creators row and zero signal.
          console.error('Error creating managed_creators record:', managedCreatorError, {
            applicationId: application.id,
            userId: ctx.user.id,
            jobId,
            brandOrgId: orgId,
          });
        }
      }
    }
  }

  trackEvent(ctx.user.id, PostHogEvents.JOB_APPLICATION_SUBMITTED, {
    application_id: application.id,
    job_id: jobId,
    job_type: job.job_type,
    job_slug: job.job_slug,
    brand_organization_id: job.brand_organization_id,
    has_cover_letter: !!coverLetter,
    auto_approved: autoApprove,
  });

  if (autoApprove) {
    trackEvent(ctx.user.id, PostHogEvents.JOB_APPLICATION_AUTO_APPROVED, {
      application_id: application.id,
      job_id: jobId,
      job_type: job.job_type,
      brand_organization_id: job.brand_organization_id,
    });
  }

  // Email / in-app notifications — opt-in via `sendUserNotifications`.
  if (sendUserNotifications) {
    notifyApplicationEvent({
      type: 'application_submitted',
      userId: ctx.user.id,
      applicationId: application.id,
      jobTitle: job.job_title || 'Untitled Gig',
      jobSlug: job.job_slug ?? undefined,
      jobId,
      brandName,
      brandSlug: brandSlug ?? undefined,
    }).catch(captureFireAndForget('application_notification'));

    if (autoApprove) {
      notifyApplicationEvent({
        type: 'application_accepted',
        userId: ctx.user.id,
        applicationId: application.id,
        jobTitle: job.job_title || 'Untitled Gig',
        jobSlug: job.job_slug ?? undefined,
        jobId,
        brandName,
        brandSlug: brandSlug ?? undefined,
      }).catch(captureFireAndForget('application_notification'));
    }
  }

  return {
    result: {
      success: true,
      application_id: application.id,
      job_type: job.job_type,
      job_slug: job.job_slug,
      brand_slug: brandSlug,
      auto_approved: autoApprove,
      message: autoApprove
        ? 'Application approved! You can now submit videos for this campaign.'
        : 'Application submitted successfully!',
    },
    brandContext: {
      jobTitle: job.job_title ?? null,
      brandName,
      isEightXManaged,
      onboardingCallLink,
      creatorDisplayName: profile.display_name,
      creatorLocation: profile.location,
      creatorFirstName: profile.first_name,
      creatorLastName: profile.last_name,
      creatorEmail: profile.email ?? ctx.user.email ?? null,
    },
  };
}

// ------------------------------------------------------------------
// enrichWebApplyResult — web-only post-apply side effects (Slack + onboarding URL).
// Kept separate from applyToJob so the core service stays platform-agnostic.
// ------------------------------------------------------------------

export function enrichWebApplyResult(
  result: ApplyToJobResult,
  brandCtx: ApplyToJobBrandContext
): { onboarding_call_url: string | null } {
  const creatorName =
    brandCtx.creatorDisplayName || brandCtx.creatorEmail || 'Unknown creator';

  if (brandCtx.isEightXManaged) {
    const parts = [creatorName];
    if (brandCtx.jobTitle) parts.push(brandCtx.jobTitle);
    if (brandCtx.brandName) parts.push(brandCtx.brandName);
    if (brandCtx.creatorLocation) parts.push(brandCtx.creatorLocation);
    sendSlackMessage({
      channelId: SLACK_CHANNELS.APPLICATIONS,
      text: `📋 ${parts.join(' · ')}${result.auto_approved ? ' (auto-approved)' : ''}`,
    }).catch(() => {});
  } else {
    sendSlackMessage({
      channelId: SLACK_CHANNELS.APPLICATIONS,
      text: `📋 Application pending · ${creatorName}${
        brandCtx.brandName ? ` · ${brandCtx.brandName}` : ''
      }`,
    }).catch(() => {});
  }

  let onboardingCallUrl: string | null = null;
  if (brandCtx.isEightXManaged && brandCtx.onboardingCallLink) {
    const noteLines: string[] = [];
    const name =
      [brandCtx.creatorFirstName, brandCtx.creatorLastName].filter(Boolean).join(' ') ||
      brandCtx.creatorDisplayName ||
      '';
    if (name) noteLines.push(`Creator: ${name}`);
    if (brandCtx.creatorLocation) noteLines.push(`Country: ${brandCtx.creatorLocation}`);
    if (brandCtx.creatorEmail) noteLines.push(`Email: ${brandCtx.creatorEmail}`);
    if (brandCtx.jobTitle) noteLines.push(`Job: ${brandCtx.jobTitle}`);
    if (brandCtx.brandName) noteLines.push(`Brand: ${brandCtx.brandName}`);
    const separator = brandCtx.onboardingCallLink.includes('?') ? '&' : '?';
    onboardingCallUrl = `${brandCtx.onboardingCallLink}${separator}notes=${encodeURIComponent(
      noteLines.join('\n')
    )}`;
  }

  return { onboarding_call_url: onboardingCallUrl };
}
