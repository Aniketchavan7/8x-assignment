'use server';

/**
 * Server action for creators to join a brand as a managed creator.
 * Used when an already-onboarded creator visits /join/[brandSlug].
 */

import { z } from 'zod';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { trackEvent } from '@/lib/analytics/posthog-server';
import { autoLinkManagedCreatorByEmail } from './auto-link';
import { resolveJobIdForBrand } from '@/lib/modules/portal/queries';
import { MC_STATUS } from './constants';
import { getJobPaymentConfig } from '@/lib/modules/jobs/repository';
import { notify } from '@/lib/messaging/notify';
import { after } from 'next/server';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

const joinBrandSchema = z.object({
  brandId: z.string().uuid(),
});

export type JoinBrandResult =
  | { success: true; redirectTo: string }
  | { error: string };

/**
 * Join a brand as a managed creator.
 * Only works for users who are already onboarded as creators.
 */
export const joinBrandAsManagedCreator = validatedActionWithUser<
  typeof joinBrandSchema,
  JoinBrandResult
>(joinBrandSchema, async (data, _, user) => {
  const supabase = await createAuthenticatedSupabaseClient();

  // Check user is a creator
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_type, email, country')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    return { error: 'User not found.' };
  }

  if (userData.account_type !== 'creator') {
    trackEvent(user.id, 'creator_join_brand_error', {
      brand_id: data.brandId,
      error: 'not_creator',
      account_type: userData.account_type,
    });
    return { error: 'Only creators can join brands as managed creators.' };
  }

  // Check creator profile exists and is onboarded
  const { data: profile, error: profileError } = await supabase
    .from('creator_profiles')
    .select('id, display_name, onboarding_status')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: 'Creator profile not found. Please complete onboarding first.' };
  }

  if (profile.onboarding_status !== 'completed') {
    trackEvent(user.id, 'creator_join_brand_error', {
      brand_id: data.brandId,
      error: 'onboarding_incomplete',
      onboarding_status: profile.onboarding_status,
    });
    return { error: 'Please complete onboarding before joining a brand.' };
  }

  // Check brand exists and get slug for redirect
  const { data: brand, error: brandError } = await supabase
    .from('brand_organizations')
    .select('id, organization_slug')
    .eq('id', data.brandId)
    .single();

  if (brandError || !brand) {
    return { error: 'Brand not found.' };
  }

  // Use service role to bypass RLS for managed_creators operations
  const serviceSupabase = createServiceRoleClient();

  // Check if relationship already exists
  const { data: existing } = await serviceSupabase
    .from('managed_creators')
    .select('id')
    .eq('linked_user_id', user.id)
    .eq('brand_organization_id', data.brandId)
    .maybeSingle();

  if (existing) {
    // Already a managed creator for this brand - just redirect
    trackEvent(user.id, 'creator_join_brand_already_member', {
      brand_id: data.brandId,
      brand_slug: brand.organization_slug,
    });
    return { success: true, redirectTo: `/dashboard/jobs/${brand.organization_slug}?welcome=true` };
  }

  // Check for an unlinked ghost record for this brand (e.g., admin pre-created).
  // Note: ghost records keep their existing payment config (admin may have set custom rates).
  const creatorEmail = userData.email || user.email;
  if (creatorEmail) {
    const { linkedCount, error: linkError } = await autoLinkManagedCreatorByEmail(
      serviceSupabase, creatorEmail, {
        userId: user.id,
        creatorProfileId: profile.id,
        brandOrganizationId: data.brandId,
        extraFields: {
          onboarded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    );

    if (linkError) {
      console.error('[joinBrandAsManagedCreator] Failed to link ghost record:', linkError);
      return { error: 'Failed to join brand. Please try again.' };
    }

    if (linkedCount > 0) {
      trackEvent(user.id, 'creator_join_brand_success', {
        brand_id: data.brandId,
        brand_slug: brand.organization_slug,
        creator_name: profile.display_name,
        linked_ghost: true,
      });

      return { success: true, redirectTo: `/dashboard/jobs/${brand.organization_slug}?welcome=true` };
    }
  }

  // Use job_referral_source (set during sign-up from portal ?jobId= param) if available,
  // otherwise fall back to the newest portal job for the brand
  const { data: userJobRef } = await serviceSupabase
    .from('users')
    .select('job_referral_source')
    .eq('id', user.id)
    .single();
  const jobId = await resolveJobIdForBrand(data.brandId, userJobRef?.job_referral_source, userData.country);

  // Fetch job-level payment config so new creators inherit defaults
  const jobPaymentConfig = jobId
    ? await getJobPaymentConfig(serviceSupabase, jobId)
    : { cpm_base_pay: null, cpm_rate: null, max_pay_cents: null, bonus_milestones: [] };

  // Create managed_creators relationship
  const { error: insertError } = await serviceSupabase.from('managed_creators').insert({
    brand_organization_id: data.brandId,
    linked_user_id: user.id,
    linked_creator_profile_id: profile.id,
    name: profile.display_name || 'Creator',
    email: (userData.email || user.email)?.toLowerCase(),
    sourced: 'public_link',
    status: MC_STATUS.APPLIED,
    onboarded_at: new Date().toISOString(),
    job_id: jobId,
    base_pay: jobPaymentConfig.cpm_base_pay ?? 0,
    cpm_rate: jobPaymentConfig.cpm_rate,
    max_pay_cents: jobPaymentConfig.max_pay_cents,
    bonus_milestones: jobPaymentConfig.bonus_milestones,
  });

  if (insertError) {
    console.error('[joinBrandAsManagedCreator] Failed to create relationship:', insertError);
    trackEvent(user.id, 'creator_join_brand_error', {
      brand_id: data.brandId,
      brand_slug: brand.organization_slug,
      error: 'insert_failed',
      error_message: insertError.message,
    });
    return { error: 'Failed to join brand. Please try again.' };
  }

  // Track successful join
  trackEvent(user.id, 'creator_join_brand_success', {
    brand_id: data.brandId,
    brand_slug: brand.organization_slug,
    creator_name: profile.display_name,
  });

  if (jobId) {
    const resolvedJobId = jobId;
    const brandId = data.brandId;
    const userId = user.id;
    after(async () => {
      try {
        const { data: job } = await serviceSupabase
          .from('jobs')
          .select('job_title')
          .eq('id', resolvedJobId)
          .maybeSingle();
        const jobTitle = job?.job_title ?? 'this campaign';
        await notify({
          userId,
          eventType: 'application_received',
          brandOrganizationId: brandId,
          body: `You've applied to ${jobTitle}. We'll get back to you soon.`,
          data: { job_id: resolvedJobId },
        });
      } catch (err) {
        captureFireAndForget('join_application_received_notify')(err);
      }
    });
  }

  return { success: true, redirectTo: `/dashboard/jobs/${brand.organization_slug}?welcome=true` };
});
