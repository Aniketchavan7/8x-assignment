'use server';

import { z } from 'zod';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { parseVideoUrl, isShortTikTokUrl } from './url-parser';
import { calculateSubmissionPayout } from './utils';
import { triggerCpmPostFetch } from './post-fetch';
import { CPM_RATE_LIMITS } from './constants';
import { CPM_ERROR_CODES, type CpmErrorCode } from './error-codes';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories, ErrorSeverity, PostHogEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/posthog-server';
import { transferToCreator } from '@/lib/payments/stripe-connect';
import type { StripeRegion } from '@/lib/payments/stripe-router';
import { recordEarning, markTransactionsTransferred, getEarningsForSubmission } from '@/lib/modules/creator/ledger';
import { notifyOnVideoReview } from '@/lib/messaging/notify-on-video-review';

/**
 * In-memory rate limiting for video submissions.
 * Key: user ID, Value: timestamp of last submission
 */
const submissionRateLimitMap = new Map<string, number>();

/**
 * Check if user is rate limited for video submissions.
 * Returns true if the user should be blocked, false otherwise.
 */
function isRateLimited(userId: string): boolean {
  const lastSubmission = submissionRateLimitMap.get(userId);
  const now = Date.now();
  const cooldownMs = CPM_RATE_LIMITS.SUBMISSION_COOLDOWN_SECONDS * 1000;

  if (lastSubmission && now - lastSubmission < cooldownMs) {
    return true;
  }

  // Update the timestamp
  submissionRateLimitMap.set(userId, now);

  // Clean up old entries periodically (keep map from growing indefinitely)
  if (submissionRateLimitMap.size > 10000) {
    const cutoff = now - cooldownMs * 10;
    for (const [key, timestamp] of submissionRateLimitMap.entries()) {
      if (timestamp < cutoff) {
        submissionRateLimitMap.delete(key);
      }
    }
  }

  return false;
}

const createCpmCampaignSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional().default(''),
  cpmRate: z.coerce.number().min(0.01, 'CPM rate must be at least $0.01'),
  cpmCap: z.coerce.number().min(1, 'Cap must be at least $1'),
  basePay: z.coerce.number().min(0).default(0),
  minViews: z.coerce.number().min(0).default(1000),
  country: z.string().default('Global'),
  platforms: z.string().transform((val) => {
    try {
      return JSON.parse(val) as string[];
    } catch {
      return ['tiktok', 'instagram'];
    }
  }),
  autoApprove: z.string().transform((val) => val === 'true').default('true'),
});

export type CreateCpmCampaignResult =
  | { success: true; jobId: string }
  | { error: string };

export const createCpmCampaign = validatedActionWithUser<
  typeof createCpmCampaignSchema,
  CreateCpmCampaignResult
>(createCpmCampaignSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: membership, error: memberError } = await supabase
    .from('brand_members')
    .select('brand_organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (memberError || !membership) {
    return { error: 'You must be a brand member to create campaigns' };
  }

  if (!membership.role || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'You do not have permission to create campaigns' };
  }

  const baseSlug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const finalDescription =
    data.description ||
    `Earn $${data.cpmRate} per 1,000 views on your videos. Maximum earnings: $${data.cpmCap} per creator.`;

  const cpmRateCents = Math.round(data.cpmRate * 100);
  const cpmCapCents = Math.round(data.cpmCap * 100);
  const basePayCents = Math.round(data.basePay * 100);

  // New CPM campaigns start in pending_funding status
  // They must be funded with at least $50 before being published
  const { data: job, error: insertError } = await supabase
    .from('jobs')
    .insert({
      brand_organization_id: membership.brand_organization_id,
      created_by: user.id,
      job_title: data.title,
      job_slug: slug,
      description: finalDescription,
      job_type: 'cpm',
      cpm_rate: cpmRateCents,
      cpm_cap: cpmCapCents,
      cpm_base_pay: basePayCents,
      cpm_payout_threshold: data.minViews,
      cpm_platforms_allowed: data.platforms,
      target_country: data.country === 'Global' ? null : data.country,
      auto_approve_applications: data.autoApprove,
      status: 'pending_funding',
      visibility: 'public',
      budget_cents: 0,
      budget_spent_cents: 0,
      // published_at will be set when the campaign is funded and published
    })
    .select('id')
    .single();

  if (insertError || !job) {
    captureError(insertError, {
      category: ErrorCategories.DATABASE,
      operation: 'create_cpm_campaign',
      userId: user.id,
      metadata: { title: data.title },
    });
    return { error: 'Failed to create campaign. Please try again.' };
  }

  const { error: reqError } = await supabase.from('job_requirements').insert({
    job_id: job.id,
    platforms_required: data.platforms,
    preferred_locations: [],
  });

  if (reqError) {
    captureError(reqError, {
      category: ErrorCategories.DATABASE,
      operation: 'create_cpm_campaign_requirements',
      severity: ErrorSeverity.WARNING,
      userId: user.id,
      metadata: { jobId: job.id },
    });
  }

  trackEvent(user.id, PostHogEvents.JOB_CREATED, {
    job_id: job.id,
    job_type: 'cpm',
    brand_organization_id: membership.brand_organization_id,
    cpm_rate_cents: cpmRateCents,
    cpm_cap_cents: cpmCapCents,
    auto_approve: data.autoApprove,
  });

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/find');
  return { success: true, jobId: job.id };
});

const submitCpmVideoSchema = z.object({
  jobId: z.string().uuid(),
  videoUrl: z.string().url(),
});

export type SubmitCpmVideoResult =
  | { success: true; submissionId: string }
  | { error: string; errorCode?: CpmErrorCode; errorParams?: Record<string, string | number> };

export const submitCpmVideo = validatedActionWithUser<
  typeof submitCpmVideoSchema,
  SubmitCpmVideoResult
>(submitCpmVideoSchema, async () => {
  // CPM submissions are disabled — the feature is being deprecated
  return { error: 'CPM submissions are no longer accepted.' };
});

const reviewCpmSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().optional(),
});

export type ReviewCpmSubmissionResult =
  | { success: true }
  | { error: string };

export const reviewCpmSubmission = validatedActionWithUser<
  typeof reviewCpmSubmissionSchema,
  ReviewCpmSubmissionResult
>(reviewCpmSubmissionSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: submission, error: subError } = await supabase
    .from('cpm_submissions')
    .select(
      `
      id,
      status,
      views_at_submission,
      views_current,
      creator_profile_id,
      creator_profile:creator_profiles(
        id,
        stripe_account_id,
        stripe_region,
        stripe_payouts_enabled,
        display_name,
        currency
      ),
      job:jobs!inner(
        id,
        brand_organization_id,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        cpm_payout_threshold,
        budget_cents,
        budget_spent_cents
      )
    `
    )
    .eq('id', data.submissionId)
    .single();

  if (subError || !submission) {
    return { error: 'Submission not found' };
  }

  const creatorProfile = submission.creator_profile as {
    id: string;
    stripe_account_id: string | null;
    stripe_region: string | null;
    stripe_payouts_enabled: boolean | null;
    display_name: string | null;
    currency: string | null;
  } | null;

  const job = submission.job as {
    id: string;
    brand_organization_id: string;
    cpm_rate: number;
    cpm_cap: number;
    cpm_base_pay: number;
    cpm_payout_threshold: number | null;
    budget_cents: number | null;
    budget_spent_cents: number | null;
  };

  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { error: 'Unauthorized' };
  }

  if (submission.status !== 'pending_approval') {
    return { error: 'This submission has already been reviewed' };
  }

  if (data.action === 'approve') {
    // Check if views meet the minimum threshold
    const threshold = job.cpm_payout_threshold ?? 1000;
    if (submission.views_current < threshold) {
      return {
        error: `Video must have at least ${threshold.toLocaleString()} views before it can be approved. Current views: ${submission.views_current.toLocaleString()}`
      };
    }

    // Check campaign budget
    const remainingBudget = (job.budget_cents || 0) - (job.budget_spent_cents || 0);
    if (remainingBudget <= 0) {
      return { error: 'Campaign budget exhausted. Please add more budget before approving submissions.' };
    }

    // When approving, set views_approved = views_current
    // This marks the current views as approved for payout
    // Earnings are calculated based on views_approved
    const viewsToApprove = submission.views_current;
    // Base pay is now per-creator on managed_creators.base_pay, paid on schedule separately
    const basePay = 0;

    // Calculate full earnings based on approved views
    const fullPayout = calculateSubmissionPayout(
      { views_approved: viewsToApprove },
      job.cpm_rate,
      basePay,
      job.cpm_cap
    );

    const fullEarnings = Math.round(fullPayout.totalEarnings);

    // Determine actual payout (may be partial if budget insufficient)
    let actualEarnings: number;
    let isPartialPayout = false;
    let viewsPaid: number;

    if (fullEarnings <= remainingBudget) {
      // Full payout - budget is sufficient
      actualEarnings = fullEarnings;
      viewsPaid = viewsToApprove;
    } else {
      // Partial payout - pay what budget allows
      actualEarnings = remainingBudget;
      isPartialPayout = true;
      // Calculate pro-rata views: views_paid = views * (amount_paid / full_earnings)
      viewsPaid = Math.floor(viewsToApprove * (actualEarnings / fullEarnings));
      console.log('[CPM APPROVAL] Partial payout:', {
        submissionId: data.submissionId,
        fullEarnings,
        actualEarnings,
        remainingBudget,
        viewsToApprove,
        viewsPaid,
      });
    }

    // Deduct from campaign budget atomically
    const { data: budgetResult, error: budgetError } = await supabase.rpc('deduct_cpm_campaign_budget', {
      p_job_id: job.id,
      p_amount_cents: actualEarnings,
      p_submission_id: data.submissionId,
      p_user_id: user.id,
    });

    if (budgetError) {
      captureError(budgetError, {
        category: ErrorCategories.DATABASE,
        operation: 'deduct_cpm_campaign_budget',
        userId: user.id,
        metadata: { submissionId: data.submissionId, jobId: job.id, amount: actualEarnings },
      });
      return { error: 'Failed to deduct budget. Please try again.' };
    }

    const deductResult = budgetResult as {
      success: boolean;
      error?: string;
      actual_deduction_cents?: number;
      is_partial?: boolean;
    };

    if (!deductResult.success) {
      return { error: deductResult.error || 'Failed to deduct budget. Please try again.' };
    }

    // Use actual deduction from RPC (in case of race condition)
    const finalEarnings = deductResult.actual_deduction_cents || actualEarnings;

    // Calculate pro-rata views based on actual earnings vs full earnings
    // This ensures views_approved reflects only the views we actually paid for
    const actualViewsPaid = (isPartialPayout && fullEarnings > 0)
      ? Math.floor(viewsToApprove * (finalEarnings / fullEarnings))
      : viewsToApprove;

    // Calculate pro-rata CPM earnings (excluding base pay)
    const actualCpmEarnings = (isPartialPayout && fullEarnings > 0)
      ? Math.max(0, finalEarnings - basePay)
      : Math.round(fullPayout.cpmEarnings);

    const { error: updateError } = await supabase
      .from('cpm_submissions')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        base_pay_earned: basePay,
        views_approved: actualViewsPaid, // Only views we paid for (pro-rata if partial)
        cpm_earnings: actualCpmEarnings, // Proportional CPM earnings
        earnings_total: finalEarnings, // Actual amount paid (may be partial)
      })
      .eq('id', data.submissionId);

    if (updateError) {
      // Rollback: refund the campaign budget since submission update failed
      const { error: refundError } = await supabase.rpc('refund_cpm_campaign_budget', {
        p_job_id: job.id,
        p_amount_cents: finalEarnings,
        p_submission_id: data.submissionId,
        p_user_id: user.id,
      });

      if (refundError) {
        // Critical: budget deducted but refund failed - needs manual intervention
        captureError(refundError, {
          category: ErrorCategories.DATABASE,
          severity: ErrorSeverity.ERROR,
          operation: 'refund_cpm_campaign_budget_after_update_failure',
          userId: user.id,
          metadata: {
            submissionId: data.submissionId,
            jobId: job.id,
            amountCents: finalEarnings,
            originalError: updateError.message,
          },
        });
      }

      captureError(updateError, {
        category: ErrorCategories.DATABASE,
        operation: 'approve_cpm_submission',
        userId: user.id,
        metadata: { submissionId: data.submissionId, budgetRefunded: !refundError },
      });
      return { error: 'Failed to approve submission. Please try again.' };
    }

    // Record earnings in the ledger and attempt Stripe transfer if possible
    const earningsAmount = finalEarnings;
    // Always pay in USD - Stripe auto-converts to creator's bank currency
    const currency = 'USD';
    const canReceivePayouts = creatorProfile?.stripe_account_id && creatorProfile?.stripe_payouts_enabled;

    if (earningsAmount > 0 && creatorProfile) {
      // Idempotency check: verify no earnings already recorded for this submission
      const existingEarnings = await getEarningsForSubmission(data.submissionId);
      if (existingEarnings > 0) {
        console.log('[CPM APPROVAL] Earnings already recorded, skipping duplicate:', {
          submissionId: data.submissionId,
          existingEarnings,
          requestedAmount: earningsAmount,
        });
        // Still proceed to Stripe transfer if needed (in case previous attempt failed)
        revalidatePath('/dashboard/jobs');
        return { success: true };
      }

      // Always record the earning first - this is the source of truth
      const { transactionId } = await recordEarning({
        creatorProfileId: creatorProfile.id,
        amount: earningsAmount,
        type: 'cpm_earning',
        jobId: job.id,
        cpmSubmissionId: data.submissionId,
        description: `CPM payout for video submission`,
        stripeTransferStatus: 'pending', // Will be updated if transfer succeeds
      });

      if (canReceivePayouts) {
        try {
          const transfer = await transferToCreator(
            creatorProfile.stripe_account_id!,
            earningsAmount,
            `CPM payout for video submission`,
            currency,
            {
              submission_id: data.submissionId,
              creator_profile_id: creatorProfile.id,
              job_id: job.id,
              transfer_type: 'cpm_approval',
            },
            creatorProfile.stripe_region as StripeRegion | undefined
          );

          // Mark transaction as transferred to Stripe
          await markTransactionsTransferred([transactionId], transfer.id);

          console.log('[CPM APPROVAL] Stripe transfer successful:', {
            submissionId: data.submissionId,
            creatorProfileId: creatorProfile.id,
            amount: earningsAmount,
            currency,
            transferId: transfer.id,
            transactionId,
          });
        } catch (stripeError) {
          // Log the error but don't fail - transaction is recorded with pending status
          captureError(stripeError, {
            category: ErrorCategories.STRIPE,
            operation: 'cpm_approval_stripe_transfer',
            userId: user.id,
            severity: ErrorSeverity.ERROR,
            metadata: {
              submissionId: data.submissionId,
              creatorProfileId: creatorProfile.id,
              amount: earningsAmount,
              stripeAccountId: creatorProfile.stripe_account_id,
              transactionId,
            },
          });
          console.error('[CPM APPROVAL] Stripe transfer failed, transaction remains pending:', stripeError);
          // Transaction stays with stripe_transfer_status: 'pending'
          // Will be transferred when creator clicks "Transfer to Stripe"
        }
      } else {
        console.log('[CPM APPROVAL] Creator cannot receive payouts, transaction pending Stripe setup:', {
          submissionId: data.submissionId,
          creatorProfileId: creatorProfile.id,
          amount: earningsAmount,
          hasStripeAccount: !!creatorProfile.stripe_account_id,
          payoutsEnabled: creatorProfile.stripe_payouts_enabled,
          transactionId,
        });
      }
    }
  } else {
    if (!data.rejectionReason) {
      return { error: 'Please provide a reason for rejection' };
    }

    const { error: updateError } = await supabase
      .from('cpm_submissions')
      .update({
        status: 'rejected',
        rejection_reason: data.rejectionReason,
      })
      .eq('id', data.submissionId);

    if (updateError) {
      captureError(updateError, {
        category: ErrorCategories.DATABASE,
        operation: 'reject_cpm_submission',
        userId: user.id,
        metadata: { submissionId: data.submissionId },
      });
      return { error: 'Failed to reject submission. Please try again.' };
    }

    const submissionId = data.submissionId;
    const brandOrgId = job.brand_organization_id;
    const rejectionReason = data.rejectionReason;
    after(async () => {
      await notifyOnVideoReview(createServiceRoleClient(), {
        reviewStatus: 'rejected',
        cpmSubmissionId: submissionId,
        brandOrganizationId: brandOrgId,
        feedback: rejectionReason,
        reviewerType: 'brand',
      });
    });
  }

  revalidatePath('/dashboard/jobs');
  return { success: true };
});

const applyToCpmJobSchema = z.object({
  jobId: z.string().uuid(),
});

export type ApplyToCpmJobResult =
  | { success: true; applicationId: string }
  | { error: string };

export const applyToCpmJob = validatedActionWithUser<
  typeof applyToCpmJobSchema,
  ApplyToCpmJobResult
>(applyToCpmJobSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Get creator profile
  const { data: profile, error: profileError } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: 'Creator profile not found' };
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, job_type, auto_approve_applications, status')
    .eq('id', data.jobId)
    .single();

  if (jobError || !job) {
    return { error: 'Job not found' };
  }

  if (job.job_type !== 'cpm') {
    return { error: 'This is not a CPM campaign' };
  }

  if (job.status !== 'open' && job.status !== 'in_progress') {
    return { error: 'This campaign is not accepting applications' };
  }

  const { data: existingApp } = await supabase
    .from('job_applications')
    .select('id')
    .eq('job_id', data.jobId)
    .eq('creator_profile_id', profile.id)
    .maybeSingle();

  if (existingApp) {
    return { error: 'You have already applied to this campaign' };
  }

  const applicationStatus = job.auto_approve_applications ? 'accepted' : 'pending';

  const { data: application, error: insertError } = await supabase
    .from('job_applications')
    .insert({
      job_id: data.jobId,
      creator_profile_id: profile.id,
      application_status: applicationStatus,
    })
    .select('id')
    .single();

  if (insertError || !application) {
    captureError(insertError, {
      category: ErrorCategories.DATABASE,
      operation: 'apply_to_cpm_job',
      userId: user.id,
      metadata: { jobId: data.jobId },
    });
    return { error: 'Failed to apply to campaign. Please try again.' };
  }

  revalidatePath('/dashboard/jobs');
  return { success: true, applicationId: application.id };
});

const cancelCpmSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
});

export type CancelCpmSubmissionResult =
  | { success: true }
  | { error: string };

export const cancelCpmSubmission = validatedActionWithUser<
  typeof cancelCpmSubmissionSchema,
  CancelCpmSubmissionResult
>(cancelCpmSubmissionSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: submission, error: fetchError } = await supabase
    .from('cpm_submissions')
    .select(
      `
      id,
      status,
      creator_profile:creator_profiles!inner(
        user_id
      )
    `
    )
    .eq('id', data.submissionId)
    .single();

  if (fetchError || !submission) {
    return { error: 'Submission not found' };
  }

  const creatorProfile = submission.creator_profile as { user_id: string };

  if (creatorProfile.user_id !== user.id) {
    return { error: 'Unauthorized' };
  }

  const cancellableStatuses = ['pending_fetch', 'fetch_failed', 'pending_approval', 'ineligible'];
  if (!cancellableStatuses.includes(submission.status)) {
    return { error: 'Only pending submissions can be cancelled' };
  }

  const { error: deleteError } = await supabase
    .from('cpm_submissions')
    .delete()
    .eq('id', data.submissionId);

  if (deleteError) {
    captureError(deleteError, {
      category: ErrorCategories.DATABASE,
      operation: 'cancel_cpm_submission',
      userId: user.id,
      metadata: { submissionId: data.submissionId },
    });
    return { error: 'Failed to cancel submission. Please try again.' };
  }

  revalidatePath('/dashboard/jobs');
  return { success: true };
});

const approveAdditionalViewsSchema = z.object({
  submissionId: z.string().uuid(),
});

export type ApproveAdditionalViewsResult =
  | { success: true; viewsApproved: number; newViewsApproved: number }
  | { error: string };

/**
 * Approve additional views for an already-approved CPM submission.
 * This is used when a video gains more views after initial approval.
 * Sets views_approved = views_current and recalculates earnings.
 */
export const approveAdditionalViews = validatedActionWithUser<
  typeof approveAdditionalViewsSchema,
  ApproveAdditionalViewsResult
>(approveAdditionalViewsSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: submission, error: subError } = await supabase
    .from('cpm_submissions')
    .select(
      `
      id,
      status,
      views_current,
      views_approved,
      base_pay_earned,
      earnings_total,
      earnings_paid,
      creator_profile_id,
      creator_profile:creator_profiles(
        id,
        stripe_account_id,
        stripe_region,
        stripe_payouts_enabled,
        display_name,
        currency
      ),
      job:jobs!inner(
        id,
        brand_organization_id,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        budget_cents,
        budget_spent_cents
      )
    `
    )
    .eq('id', data.submissionId)
    .single();

  if (subError || !submission) {
    return { error: 'Submission not found' };
  }

  const creatorProfile = submission.creator_profile as {
    id: string;
    stripe_account_id: string | null;
    stripe_region: string | null;
    stripe_payouts_enabled: boolean | null;
    display_name: string | null;
    currency: string | null;
  } | null;

  const job = submission.job as {
    id: string;
    brand_organization_id: string;
    cpm_rate: number;
    cpm_cap: number;
    cpm_base_pay: number;
    budget_cents: number | null;
    budget_spent_cents: number | null;
  };

  // Verify user is a brand member
  const { data: membership } = await supabase
    .from('brand_members')
    .select('id, role')
    .eq('brand_organization_id', job.brand_organization_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { error: 'Unauthorized' };
  }

  // Only allow re-approval for approved/tracking submissions
  const reapprovableStatuses = ['approved', 'tracking'];
  if (!reapprovableStatuses.includes(submission.status)) {
    return { error: 'This submission cannot have views re-approved' };
  }

  // Check if there are actually new views to approve
  const currentApproved = submission.views_approved ?? 0;
  const pendingViews = submission.views_current - currentApproved;

  if (pendingViews <= 0) {
    return { error: 'No new views to approve' };
  }

  // Check campaign budget
  const remainingBudget = (job.budget_cents || 0) - (job.budget_spent_cents || 0);
  if (remainingBudget <= 0) {
    return { error: 'Campaign budget exhausted. Please add more budget before approving additional views.' };
  }

  // Check if cap is already reached - if so, auto-approve views without payment
  const currentEarnings = submission.earnings_total ?? 0;
  if (currentEarnings >= job.cpm_cap) {
    // Cap already reached, just update views_approved to track the views
    const { error: updateError } = await supabase
      .from('cpm_submissions')
      .update({
        views_approved: submission.views_current,
      })
      .eq('id', data.submissionId);

    if (updateError) {
      captureError(updateError, {
        category: ErrorCategories.DATABASE,
        operation: 'approve_additional_views_cap_reached',
        userId: user.id,
        metadata: { submissionId: data.submissionId },
      });
      return { error: 'Failed to approve additional views. Please try again.' };
    }

    revalidatePath('/dashboard/brand-cpm');
    revalidatePath('/dashboard/jobs');
    return {
      success: true,
      viewsApproved: submission.views_current,
      newViewsApproved: pendingViews,
    };
  }

  // Calculate new earnings based on views_approved (the new total)
  const newViewsApproved = submission.views_current;
  const payout = calculateSubmissionPayout(
    { views_approved: newViewsApproved },
    job.cpm_rate,
    submission.base_pay_earned,
    job.cpm_cap
  );

  // Calculate the incremental earnings (new total - already recorded in ledger)
  const newTotalEarnings = Math.round(payout.totalEarnings);
  const alreadyRecorded = await getEarningsForSubmission(data.submissionId);
  let incrementalEarnings = newTotalEarnings - alreadyRecorded;

  // Handle partial payout if budget insufficient
  let actualIncremental = incrementalEarnings;
  if (incrementalEarnings > remainingBudget) {
    actualIncremental = remainingBudget;
    console.log('[CPM ADDITIONAL VIEWS] Partial payout:', {
      submissionId: data.submissionId,
      incrementalEarnings,
      actualIncremental,
      remainingBudget,
    });
  }

  // Deduct from campaign budget atomically (only if there are actual earnings)
  if (actualIncremental > 0) {
    const { data: budgetResult, error: budgetError } = await supabase.rpc('deduct_cpm_campaign_budget', {
      p_job_id: job.id,
      p_amount_cents: actualIncremental,
      p_submission_id: data.submissionId,
      p_user_id: user.id,
    });

    if (budgetError) {
      captureError(budgetError, {
        category: ErrorCategories.DATABASE,
        operation: 'deduct_cpm_campaign_budget_additional',
        userId: user.id,
        metadata: { submissionId: data.submissionId, jobId: job.id, amount: actualIncremental },
      });
      return { error: 'Failed to deduct budget. Please try again.' };
    }

    const deductResult = budgetResult as {
      success: boolean;
      error?: string;
      actual_deduction_cents?: number;
    };

    if (!deductResult.success) {
      return { error: deductResult.error || 'Failed to deduct budget. Please try again.' };
    }

    // Use actual deduction from RPC
    actualIncremental = deductResult.actual_deduction_cents || actualIncremental;
  }

  // Calculate final earnings total based on what was actually paid
  const finalEarningsTotal = alreadyRecorded + actualIncremental;

  // Calculate how many additional views this payment covers (pro-rata if partial)
  let actualAdditionalViews = pendingViews;
  if (actualIncremental < incrementalEarnings && incrementalEarnings > 0) {
    // Partial payout - only approve pro-rata views
    actualAdditionalViews = Math.floor(pendingViews * (actualIncremental / incrementalEarnings));
    console.log('[CPM ADDITIONAL VIEWS] Pro-rata views calculation:', {
      submissionId: data.submissionId,
      pendingViews,
      actualAdditionalViews,
      actualIncremental,
      incrementalEarnings,
    });
  }
  const finalViewsApproved = currentApproved + actualAdditionalViews;

  // Calculate pro-rata CPM earnings based on actual views approved
  const actualCpmEarnings = (actualIncremental < incrementalEarnings && incrementalEarnings > 0)
    ? Math.max(0, finalEarningsTotal - submission.base_pay_earned)
    : Math.round(payout.cpmEarnings);

  const { error: updateError } = await supabase
    .from('cpm_submissions')
    .update({
      views_approved: finalViewsApproved, // Only views we paid for (pro-rata if partial)
      cpm_earnings: actualCpmEarnings,
      earnings_total: finalEarningsTotal,
    })
    .eq('id', data.submissionId);

  if (updateError) {
    // Rollback: refund the campaign budget since submission update failed
    if (actualIncremental > 0) {
      const { error: refundError } = await supabase.rpc('refund_cpm_campaign_budget', {
        p_job_id: job.id,
        p_amount_cents: actualIncremental,
        p_submission_id: data.submissionId,
        p_user_id: user.id,
      });

      if (refundError) {
        // Critical: budget deducted but refund failed - needs manual intervention
        captureError(refundError, {
          category: ErrorCategories.DATABASE,
          severity: ErrorSeverity.ERROR,
          operation: 'refund_cpm_campaign_budget_after_additional_views_failure',
          userId: user.id,
          metadata: {
            submissionId: data.submissionId,
            jobId: job.id,
            amountCents: actualIncremental,
            originalError: updateError.message,
          },
        });
      }
    }

    captureError(updateError, {
      category: ErrorCategories.DATABASE,
      operation: 'approve_additional_views',
      userId: user.id,
      metadata: { submissionId: data.submissionId, budgetRefunded: actualIncremental > 0 },
    });
    return { error: 'Failed to approve additional views. Please try again.' };
  }

  // Always pay in USD - Stripe auto-converts to creator's bank currency
  const currency = 'USD';
  const canReceivePayouts = creatorProfile?.stripe_account_id && creatorProfile?.stripe_payouts_enabled;

  // Log when idempotency prevents duplicate recording
  if (actualIncremental <= 0) {
    console.log('[CPM ADDITIONAL VIEWS] No incremental earnings to record (idempotency):', {
      submissionId: data.submissionId,
      newTotalEarnings,
      alreadyRecorded,
      actualIncremental,
    });
  }

  // Record incremental earnings in ledger and attempt Stripe transfer if possible
  if (actualIncremental > 0 && creatorProfile) {
    // Record the earning - ledger is the source of truth
    const { transactionId } = await recordEarning({
      creatorProfileId: creatorProfile.id,
      amount: actualIncremental,
      type: 'cpm_earning',
      jobId: job.id,
      cpmSubmissionId: data.submissionId,
      description: `CPM payout for additional views (${pendingViews} new views)`,
      stripeTransferStatus: 'pending', // Will be updated if transfer succeeds
    });

    if (canReceivePayouts) {
      try {
        const transfer = await transferToCreator(
          creatorProfile.stripe_account_id!,
          actualIncremental,
          `CPM payout for additional views (${pendingViews} new views)`,
          currency,
          {
            submission_id: data.submissionId,
            creator_profile_id: creatorProfile.id,
            job_id: job.id,
            transfer_type: 'cpm_additional_views',
            new_views_approved: pendingViews,
          },
          creatorProfile.stripe_region as StripeRegion | undefined
        );

        // Mark transaction as transferred to Stripe
        await markTransactionsTransferred([transactionId], transfer.id);

        console.log('[CPM ADDITIONAL VIEWS] Stripe transfer successful:', {
          submissionId: data.submissionId,
          creatorProfileId: creatorProfile.id,
          incrementalAmount: actualIncremental,
          finalEarningsTotal,
          currency,
          transferId: transfer.id,
          transactionId,
        });
      } catch (stripeError) {
        // Log the error but don't fail - transaction is recorded with pending status
        captureError(stripeError, {
          category: ErrorCategories.STRIPE,
          operation: 'cpm_additional_views_stripe_transfer',
          userId: user.id,
          severity: ErrorSeverity.ERROR,
          metadata: {
            submissionId: data.submissionId,
            creatorProfileId: creatorProfile.id,
            incrementalAmount: actualIncremental,
            stripeAccountId: creatorProfile.stripe_account_id,
            transactionId,
          },
        });
        console.error('[CPM ADDITIONAL VIEWS] Stripe transfer failed, transaction remains pending:', stripeError);
        // Transaction stays with stripe_transfer_status: 'pending'
        // Will be transferred when creator clicks "Transfer to Stripe"
      }
    } else {
      console.log('[CPM ADDITIONAL VIEWS] Creator cannot receive payouts, transaction pending Stripe setup:', {
        submissionId: data.submissionId,
        creatorProfileId: creatorProfile.id,
        incrementalAmount: actualIncremental,
        hasStripeAccount: !!creatorProfile.stripe_account_id,
        payoutsEnabled: creatorProfile.stripe_payouts_enabled,
        transactionId,
      });
    }
  }

  revalidatePath('/dashboard/brand-cpm');
  revalidatePath('/dashboard/jobs');
  return {
    success: true,
    viewsApproved: finalViewsApproved, // Total views now approved
    newViewsApproved: actualAdditionalViews, // Additional views approved this time (may be pro-rata)
  };
});
