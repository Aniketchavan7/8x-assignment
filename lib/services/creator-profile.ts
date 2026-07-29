/**
 * Creator profile service — shared business logic for web + mobile.
 *
 * Callers (web server actions / mobile handlers) inject a Supabase client
 * and a user via ServiceContext. Services throw ServiceError for expected
 * failures; wrappers translate to their response envelope.
 *
 * File-upload wrappers (profile photo, intro video) handle the storage
 * write themselves and then call `setProfilePicture` / `setIntroVideoUrl`
 * here to persist the resulting URL.
 */

import { z } from 'zod';
import {
  findOrCreatePlatformAccountWithConnector,
  getCreatorSocialAccounts,
} from '@/lib/db/social-accounts';
import {
  validateAndExtractUsername,
  buildProfileUrl,
} from '@/lib/utils/social-username';
import type { Database } from '@/types/supabase';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';
import { ServiceError, type ServiceContext, type ServiceSupabase } from './_types';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

export const updateCreatorProfileInputSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  social_links: z.unknown().optional(),
});

export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileInputSchema>;

export const updateLanguagesInputSchema = z.object({
  languages: z.array(z.string().min(1)).min(1).max(10),
});

export const SOCIAL_PLATFORM_VALUES = [
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORM_VALUES)[number];

export const addSocialLinkInputSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORM_VALUES),
  username: z.string().optional(),
  profileUrl: z.string().optional(),
});

export const deleteSocialLinkInputSchema = z.object({
  socialAccountId: z.string().uuid(),
});

export const updateInterestsInputSchema = z.object({
  interests: z.array(z.string()).max(10),
});

export const updateNotificationPreferencesInputSchema = z.object({
  message_notifications_consent: z.boolean(),
  sms_notifications_consent: z.boolean(),
});

// ------------------------------------------------------------------
// Response types
// ------------------------------------------------------------------

export interface CreatorProfileDto {
  id: string | null;
  profile_picture: string | null;
  intro_video_url: string | null;
  is_8x_employee: boolean;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  location: string | null;
  date_of_birth: string | null;
  social_links: unknown;
  email: string | null;
  share_code: string | null;
  account_status: string | null;
  currency: string;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  total_jobs_active: number;
  total_jobs_completed: number;
  average_rating: number | null;
  trust_gate_completed_at: string | null;
}

export interface ManagedStatusBrand {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  status: string;
  videosComplete: boolean;
  sourced: string | null;
}

export interface ManagedStatusCampaign {
  id: string;
  jobId: string;
  jobSlug: string;
  jobTitle: string;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogo: string | null;
  cpmRate: number;
  cpmCap: number;
  status: string;
}

export interface ManagedStatusDto {
  isManagedCreator: boolean;
  brands: ManagedStatusBrand[];
  campaigns: ManagedStatusCampaign[];
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

async function requireCreatorProfileId(
  ctx: ServiceContext,
  select: string = 'id'
): Promise<{ id: string } & Record<string, unknown>> {
  const { data, error } = await ctx.supabase
    .from('creator_profiles')
    .select(select)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) {
    throw new ServiceError('internal', 'Failed to load creator profile.');
  }
  if (!data) {
    throw new ServiceError('not_found', 'Creator profile not found.');
  }
  return data as unknown as { id: string } & Record<string, unknown>;
}

// ------------------------------------------------------------------
// getCreatorProfile
// ------------------------------------------------------------------

export async function getCreatorProfile(ctx: ServiceContext): Promise<CreatorProfileDto> {
  const { data: profile, error } = await ctx.supabase
    .from('creator_profiles')
    .select(
      'id, profile_picture, intro_video_url, is_8x_employee, display_name, first_name, last_name, bio, location, date_of_birth, social_links, email, account_status, currency, stripe_charges_enabled, stripe_payouts_enabled, total_jobs_active, total_jobs_completed, average_rating, trust_gate_completed_at'
    )
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      id: null,
      profile_picture: null,
      intro_video_url: null,
      is_8x_employee: false,
      display_name: null,
      first_name: null,
      last_name: null,
      bio: null,
      location: null,
      date_of_birth: null,
      social_links: null,
      email: ctx.user.email ?? null,
      share_code: ctx.user.share_code ?? null,
      account_status: null,
      currency: 'USD',
      stripe_charges_enabled: null,
      stripe_payouts_enabled: null,
      total_jobs_active: 0,
      total_jobs_completed: 0,
      average_rating: null,
      trust_gate_completed_at: null,
    };
  }

  return {
    id: profile.id ?? null,
    profile_picture: profile.profile_picture ?? null,
    intro_video_url: (profile as { intro_video_url?: string | null }).intro_video_url ?? null,
    is_8x_employee: profile.is_8x_employee ?? false,
    display_name: profile.display_name ?? null,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    date_of_birth: profile.date_of_birth ?? null,
    social_links: profile.social_links ?? null,
    email: profile.email ?? ctx.user.email ?? null,
    share_code: ctx.user.share_code ?? null,
    account_status: profile.account_status ?? null,
    currency: profile.currency ?? 'USD',
    stripe_charges_enabled: profile.stripe_charges_enabled ?? null,
    stripe_payouts_enabled: profile.stripe_payouts_enabled ?? null,
    total_jobs_active: profile.total_jobs_active ?? 0,
    total_jobs_completed: profile.total_jobs_completed ?? 0,
    average_rating: profile.average_rating ?? null,
    trust_gate_completed_at:
      (profile as { trust_gate_completed_at?: string | null }).trust_gate_completed_at ?? null,
  };
}

// ------------------------------------------------------------------
// updateCreatorProfile (web: basic info only; mobile: broader upsert)
// ------------------------------------------------------------------

export interface UpdateCreatorProfileOptions {
  /** When true (mobile), create a creator_profiles row if none exists. */
  upsert?: boolean;
}

export async function updateCreatorProfile(
  ctx: ServiceContext,
  input: UpdateCreatorProfileInput,
  options: UpdateCreatorProfileOptions = {}
): Promise<void> {
  const { data: existing, error: fetchError } = await ctx.supabase
    .from('creator_profiles')
    .select('id, display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (fetchError) {
    throw new ServiceError('internal', 'Failed to load creator profile.');
  }

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (
      input.display_name != null &&
      typeof input.display_name === 'string' &&
      input.display_name.length >= 1 &&
      input.display_name.length <= 100
    ) {
      updates.display_name = input.display_name;
    }
    if (input.first_name !== undefined) updates.first_name = input.first_name ?? null;
    if (input.last_name !== undefined) updates.last_name = input.last_name ?? null;
    if (input.bio !== undefined) updates.bio = input.bio ?? null;
    if (input.location !== undefined) updates.location = input.location ?? null;
    if (input.date_of_birth !== undefined) updates.date_of_birth = input.date_of_birth ?? null;
    if (input.social_links !== undefined) updates.social_links = input.social_links ?? null;

    if (Object.keys(updates).length === 0) return;

    const { error } = await ctx.supabase
      .from('creator_profiles')
      .update(updates)
      .eq('user_id', ctx.user.id);

    if (error) {
      console.error('[services/creator-profile] update error:', error);
      throw new ServiceError('internal', 'Failed to update profile. Please try again.');
    }
    return;
  }

  // No existing row
  if (!options.upsert) {
    throw new ServiceError('not_found', 'Creator profile not found.');
  }

  if (
    !input.display_name ||
    typeof input.display_name !== 'string' ||
    input.display_name.length < 1 ||
    input.display_name.length > 100
  ) {
    throw new ServiceError('validation', 'display_name is required (1-100 chars).');
  }

  const { error } = await ctx.supabase.from('creator_profiles').insert({
    user_id: ctx.user.id,
    display_name: input.display_name,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    bio: input.bio ?? null,
    location: input.location ?? null,
    date_of_birth: input.date_of_birth ?? null,
    social_links: (input.social_links as Database['public']['Tables']['creator_profiles']['Insert']['social_links']) ?? null,
    email: ctx.user.email,
    onboarding_status: 'started',
  });

  if (error) {
    console.error('[services/creator-profile] insert error:', error);
    throw new ServiceError('internal', 'Failed to create profile.');
  }
}

// ------------------------------------------------------------------
// setProfilePicture (called by both web + mobile after upload)
// ------------------------------------------------------------------

export async function setProfilePicture(
  ctx: ServiceContext,
  profilePictureUrl: string
): Promise<void> {
  const profile = await requireCreatorProfileId(ctx);
  const { error } = await ctx.supabase
    .from('creator_profiles')
    .update({ profile_picture: profilePictureUrl })
    .eq('id', profile.id);
  if (error) {
    console.error('[services/creator-profile] set picture error:', error);
    throw new ServiceError('internal', 'Failed to save profile picture.');
  }
}

export async function setIntroVideoUrl(
  ctx: ServiceContext,
  introVideoUrl: string
): Promise<{ display_name: string | null }> {
  const profile = (await requireCreatorProfileId(ctx, 'id, display_name')) as {
    id: string;
    display_name: string | null;
  };

  const { error } = await ctx.supabase
    .from('creator_profiles')
    .update({ intro_video_url: introVideoUrl } as Record<string, unknown>)
    .eq('id', profile.id);

  if (error) {
    console.error('[services/creator-profile] set intro video error:', error);
    throw new ServiceError('internal', 'Failed to save intro video.');
  }
  return { display_name: profile.display_name };
}

// ------------------------------------------------------------------
// updateLanguages
// ------------------------------------------------------------------

export async function updateLanguages(
  ctx: ServiceContext,
  languages: string[]
): Promise<void> {
  if (languages.length < 1) {
    throw new ServiceError('validation', 'Please select at least one language.');
  }
  if (languages.length > 10) {
    throw new ServiceError('validation', 'Maximum 10 languages allowed.');
  }

  const sanitized = languages
    .filter((lang): lang is string => typeof lang === 'string' && lang.trim().length > 0)
    .map((lang) => lang.trim());

  const { error } = await ctx.supabase
    .from('creator_profiles')
    .update({
      languages_spoken:
        sanitized.length > 0
          ? (sanitized as Database['public']['Enums']['language'][])
          : null,
    })
    .eq('user_id', ctx.user.id);

  if (error) {
    console.error('[services/creator-profile] update languages error:', error);
    throw new ServiceError('internal', 'Failed to update languages.');
  }
}

// ------------------------------------------------------------------
// addSocialLink (TikTok/Instagram create connector; LinkedIn/YouTube no-op at the connector layer)
// ------------------------------------------------------------------

export async function addSocialLink(
  ctx: ServiceContext,
  input: z.infer<typeof addSocialLinkInputSchema>
): Promise<{ creatorProfileId: string }> {
  const profile = await requireCreatorProfileId(ctx);
  const { platform, username, profileUrl } = input;

  let accountUsername = '';
  let accountProfileUrl = '';

  if (platform === 'linkedin' || platform === 'youtube') {
    accountProfileUrl = profileUrl || '';
    accountUsername = profileUrl ? profileUrl.split('/').pop() || '' : '';
    if (!accountProfileUrl) {
      throw new ServiceError(
        'validation',
        'Profile URL is required for LinkedIn and YouTube.'
      );
    }
  } else {
    const validation = validateAndExtractUsername(username || '', platform);
    if ('error' in validation) {
      throw new ServiceError('validation', validation.error);
    }
    accountUsername = validation.username;
    accountProfileUrl = buildProfileUrl(platform, accountUsername);
  }

  if (platform === 'tiktok' || platform === 'instagram') {
    const existingAccounts = await getCreatorSocialAccounts(ctx.supabase, profile.id);
    const hasExactAccount = existingAccounts.some(
      (acc) =>
        acc.platform === platform &&
        acc.username.toLowerCase() === accountUsername.toLowerCase()
    );
    if (hasExactAccount) {
      throw new ServiceError('conflict', 'This social account is already linked.');
    }
    const result = await findOrCreatePlatformAccountWithConnector(ctx.supabase, {
      platform,
      username: accountUsername,
      profileUrl: accountProfileUrl,
      source: 'profile_edit',
      accountType: 'personal',
      creatorProfileId: profile.id,
    });
    if (!result) {
      throw new ServiceError(
        'internal',
        'Failed to add social account. Please try again.'
      );
    }
  }

  return { creatorProfileId: profile.id };
}

// ------------------------------------------------------------------
// deleteSocialLink
// ------------------------------------------------------------------

export async function deleteSocialLink(
  ctx: ServiceContext,
  input: z.infer<typeof deleteSocialLinkInputSchema>
): Promise<void> {
  const { data: profile, error: fetchError } = await ctx.supabase
    .from('creator_profiles')
    .select('id, social_links')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (fetchError || !profile) {
    throw new ServiceError('not_found', 'Creator profile not found.');
  }

  const { data: socialAccount, error: accountError } = await ctx.supabase
    .from('social_accounts')
    .select(
      `
        id,
        creator_profile_id,
        tiktok_accounts(tiktok_username),
        instagram_accounts(instagram_username)
      `
    )
    .eq('id', input.socialAccountId)
    .eq('creator_profile_id', profile.id)
    .single();

  if (accountError || !socialAccount) {
    throw new ServiceError('not_found', 'Social account not found.');
  }

  const tiktok = socialAccount.tiktok_accounts as { tiktok_username: string } | null;
  const instagram = socialAccount.instagram_accounts as { instagram_username: string } | null;
  const platform = tiktok ? 'tiktok' : instagram ? 'instagram' : null;

  const { error: deleteError } = await ctx.supabase
    .from('social_accounts')
    .update({ is_active: false })
    .eq('id', input.socialAccountId)
    .eq('creator_profile_id', profile.id);

  if (deleteError) {
    console.error('[services/creator-profile] delete social link error:', deleteError);
    throw new ServiceError('internal', 'Failed to delete social account.');
  }

  if (platform) {
    const currentSocialLinks =
      (profile.social_links as Array<{
        platform: string;
        username: string;
        profileUrl: string;
      }>) || [];
    const updatedSocialLinks = currentSocialLinks.filter((link) => link.platform !== platform);
    await ctx.supabase
      .from('creator_profiles')
      .update({ social_links: updatedSocialLinks })
      .eq('id', profile.id);
  }
}

// ------------------------------------------------------------------
// updateInterests
// ------------------------------------------------------------------

const ALLOWED_INTERESTS = [
  'Fitness',
  'Tech',
  'Fashion',
  'Food',
  'Travel',
  'Education',
  'Sports',
  'Art',
  'Gaming',
  'Music',
] as const;

export async function updateInterests(
  ctx: ServiceContext,
  interests: string[]
): Promise<void> {
  // Precedence matters: "Creator profile not found" must fire before
  // "Maximum 10 interests" so the user fixes onboarding first (matches main).
  const profile = await requireCreatorProfileId(ctx);

  if (interests.length > 10) {
    throw new ServiceError('validation', 'Maximum 10 interests allowed.');
  }

  const sanitized = interests
    .map((interest: unknown) => {
      if (typeof interest !== 'string') return null;
      const trimmed = interest.trim();
      return (ALLOWED_INTERESTS as readonly string[]).includes(trimmed) ? trimmed : null;
    })
    .filter((interest): interest is string => interest !== null);

  if (sanitized.length === 0 && interests.length > 0) {
    throw new ServiceError(
      'validation',
      'Please select valid interests from the available options.'
    );
  }

  const { error } = await ctx.supabase
    .from('creator_profiles')
    .update({
      interests:
        sanitized.length > 0
          ? (sanitized as Database['public']['Enums']['interest'][])
          : null,
    })
    .eq('id', profile.id);

  if (error) {
    console.error('[services/creator-profile] update interests error:', error);
    throw new ServiceError('internal', 'Failed to update interests.');
  }
}

// ------------------------------------------------------------------
// updateNotificationPreferences
// ------------------------------------------------------------------

export async function updateNotificationPreferences(
  ctx: ServiceContext,
  input: z.infer<typeof updateNotificationPreferencesInputSchema>
): Promise<void> {
  const { error } = await ctx.supabase
    .from('users')
    .update({
      message_notifications_consent: input.message_notifications_consent,
      sms_notifications_consent: input.sms_notifications_consent,
    })
    .eq('id', ctx.user.id);
  if (error) {
    console.error('[services/creator-profile] update notif prefs error:', error);
    throw new ServiceError('internal', 'Failed to update notification preferences.');
  }
}

// ------------------------------------------------------------------
// getManagedStatus — returns the superset of fields both surfaces use.
// Wrappers trim `campaigns` if they historically returned [].
// ------------------------------------------------------------------

export interface GetManagedStatusOptions {
  /**
   * When false (web wrapper default), skip the CPM jobs query — the web
   * `/api/creator/managed-status` route historically returned
   * `campaigns: []` and does not surface them. Mobile uses `true`.
   */
  includeCampaigns?: boolean;
}

export async function getManagedStatus(
  ctx: ServiceContext,
  options: GetManagedStatusOptions = {}
): Promise<ManagedStatusDto> {
  const includeCampaigns = options.includeCampaigns !== false;
  const { data: managedRecords, error } = await ctx.supabase
    .from('managed_creators')
    .select(
      `
        id,
        brand_organization_id,
        job_id,
        status,
        videos_complete,
        sourced,
        is_active,
        jobs (
          id,
          job_title,
          job_slug,
          job_type,
          portal_config
        ),
        brand_organizations!inner (
          id,
          organization_name,
          organization_slug,
          company_logo
        )
      `
    )
    .eq('linked_user_id', ctx.user.id)
    // Include portal-sourced creators regardless of `is_active` — they may
    // not be marked active until admin verifies them, but they still need
    // the portal workspace visible during onboarding. Matches the web
    // managed-status route on main (pre-refactor mobile was stricter —
    // `is_active = true` only — which dropped portal onboardees mid-flow).
    .or('is_active.eq.true,sourced.eq.portal');

  if (error) {
    throw new ServiceError('internal', 'Failed to fetch managed status.');
  }

  const brands: ManagedStatusBrand[] = [];
  const seenBrands = new Set<string>();
  for (const record of managedRecords ?? []) {
    const isBrandRow =
      !record.job_id ||
      ((record.jobs as unknown as { portal_config: unknown } | null)?.portal_config != null);
    if (!isBrandRow) continue;

    const org = record.brand_organizations as unknown as {
      id: string;
      organization_name: string;
      organization_slug: string;
      company_logo: string | null;
    } | null;
    if (!org || seenBrands.has(org.id)) continue;
    seenBrands.add(org.id);
    brands.push({
      id: org.id,
      name: org.organization_name,
      slug: org.organization_slug,
      logo: org.company_logo,
      status: record.status ?? MC_STATUS.APPLIED,
      videosComplete: record.videos_complete ?? false,
      sourced: record.sourced as string | null,
    });
  }

  // Campaigns — CPM jobs (job_id set, no portal_config). Skipped on web
  // (see GetManagedStatusOptions.includeCampaigns) since the route discards
  // the result anyway — avoids a wasted jobs query per dashboard load.
  let campaigns: ManagedStatusCampaign[] = [];
  const campaignCandidates = includeCampaigns
    ? (managedRecords ?? []).filter((r) => {
        if (!r.job_id) return false;
        const job = r.jobs as unknown as { portal_config: unknown } | null;
        return job?.portal_config == null;
      })
    : [];
  if (campaignCandidates.length > 0) {
    const jobIds = campaignCandidates
      .map((r) => r.job_id)
      .filter((id): id is string => !!id);

    const { data: cpmJobs } = await ctx.supabase
      .from('jobs')
      .select(
        `
          id, job_slug, job_title, job_type, cpm_rate, cpm_cap,
          brand_organization_id,
          brand_organizations (
            id, organization_name, organization_slug, company_logo
          )
        `
      )
      .in('id', jobIds)
      .eq('job_type', 'cpm');

    if (cpmJobs) {
      campaigns = cpmJobs.map((job) => {
        const org = job.brand_organizations as unknown as {
          id: string;
          organization_name: string;
          organization_slug: string;
          company_logo: string | null;
        } | null;
        const mc = campaignCandidates.find((m) => m.job_id === job.id);
        return {
          id: mc?.id ?? '',
          jobId: job.id,
          jobSlug: job.job_slug ?? '',
          jobTitle: job.job_title,
          brandId: org?.id ?? '',
          brandSlug: org?.organization_slug ?? '',
          brandName: org?.organization_name ?? '',
          brandLogo: org?.company_logo ?? null,
          cpmRate: job.cpm_rate ?? 100,
          cpmCap: job.cpm_cap ?? 100000,
          status: mc?.status ?? MC_STATUS.APPLIED,
        };
      });
    }
  }

  return {
    isManagedCreator: brands.length > 0 || campaigns.length > 0,
    brands,
    campaigns,
  };
}

// ------------------------------------------------------------------
// saveReferralCodeFromProfile — migrated from lib/modules/creator/actions.ts
// ------------------------------------------------------------------

export interface SaveReferralCodeInput {
  referralCode: string;
}

export async function saveReferralCodeFromProfile(
  ctx: ServiceContext,
  input: SaveReferralCodeInput
): Promise<void> {
  const trimmedCode = input.referralCode?.trim();
  if (!trimmedCode) {
    throw new ServiceError('validation', 'Please enter a referral code.');
  }

  const { data: currentUser, error: userError } = await ctx.supabase
    .from('users')
    .select('referrer_source')
    .eq('id', ctx.user.id)
    .single();

  if (userError) {
    throw new ServiceError('internal', 'Failed to save referral code. Please try again.', {
      pgError: userError,
    });
  }

  if (currentUser?.referrer_source) {
    throw new ServiceError('conflict', 'You already have a referral code saved.');
  }

  // Cross-RLS checks (reading other users' share_codes, checking applications_videos
  // across users): need elevated client. Wrapper injects it.
  const elevated: ServiceSupabase = ctx.elevatedSupabase ?? ctx.supabase;

  const { count: videoCount } = await elevated
    .from('applications_videos')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', ctx.user.id)
    .limit(1);

  if ((videoCount ?? 0) > 0) {
    throw new ServiceError(
      'bad_request',
      'Referral codes cannot be added after submitting a video for a campaign.'
    );
  }

  const { data: referrer } = await elevated
    .from('users')
    .select('id')
    .ilike('share_code', trimmedCode)
    .maybeSingle();

  if (!referrer) {
    throw new ServiceError(
      'validation',
      'Invalid referral code. Please check and try again.'
    );
  }

  if (referrer.id === ctx.user.id) {
    throw new ServiceError('validation', 'You cannot use your own referral code.');
  }

  const normalizedCode = trimmedCode.toLowerCase();
  const { error: updateError } = await ctx.supabase
    .from('users')
    .update({
      referrer_source: normalizedCode,
      referrer_source_set_at: new Date().toISOString(),
    })
    .eq('id', ctx.user.id);

  if (updateError) {
    throw new ServiceError('internal', 'Failed to save referral code. Please try again.', {
      pgError: updateError,
    });
  }
}

// ------------------------------------------------------------------
// dismissStripeMigrationBanner — migrated from lib/modules/creator/actions.ts
// ------------------------------------------------------------------

export async function dismissStripeMigrationBanner(ctx: ServiceContext): Promise<void> {
  const { error } = await ctx.supabase
    .from('creator_profiles')
    .update({ stripe_us_migration_required: false })
    .eq('user_id', ctx.user.id);

  if (error) {
    throw new ServiceError('internal', 'Failed to dismiss banner.', { pgError: error });
  }
}

// Re-export to keep MC_STATUS close at hand for web wrappers that need it.
export { MC_STATUS };
