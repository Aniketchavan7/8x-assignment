import { cache } from 'react';
import { createServiceRoleClient } from '@/lib/db/supabase';
import type { PortalConfig, BrandReferenceVideo } from './types';
import { resolvePortalConfig, isV3Config, DEFAULT_PORTAL_CONFIG } from './types';
import { countriesMatch } from '@/lib/utils/country-iso-mapping';
import { getOnboardingStorageUrl } from '@/lib/storage/url';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';

type PlatformId = 'tiktok' | 'instagram' | 'youtube';

/** For V3 configs, platforms come from the job row (cpm_platforms_allowed), not the JSONB. */
function injectJobPlatforms(config: PortalConfig, cpmPlatformsAllowed: string[] | null): PortalConfig {
  if (!isV3Config(config)) return config;
  const platforms = (cpmPlatformsAllowed ?? []).map(p => p.toLowerCase() as PlatformId);
  return { ...config, platforms };
}

export const getOrgBySlug = cache(async (slug: string) => {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('brand_organizations')
    .select('id, organization_name, organization_slug, website, company_logo')
    .eq('organization_slug', slug)
    .single();
  return data;
});

export const getPortalConfig = cache(async (brandOrgId: string) => {
  const result = await getPortalConfigWithJobId(brandOrgId);
  return result?.config ?? null;
});

export const getPortalConfigWithJobId = cache(async (brandOrgId: string) => {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('jobs')
    .select('id, portal_config, monthly_payout_cap, target_country, cpm_platforms_allowed')
    .eq('brand_organization_id', brandOrgId)
    .not('portal_config', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.portal_config) return null;
  const raw = injectJobPlatforms(data.portal_config as unknown as PortalConfig, data.cpm_platforms_allowed);
  return {
    config: resolvePortalConfig(raw),
    jobId: data.id,
    monthlyPayoutCap: data.monthly_payout_cap,
    targetCountry: data.target_country,
  };
});

/** Fetch portal config directly by job ID — used when MC already has job_id */
export const getPortalConfigByJobId = cache(async (jobId: string) => {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('jobs')
    .select('id, portal_config, monthly_payout_cap, target_country, cpm_platforms_allowed')
    .eq('id', jobId)
    .maybeSingle();

  if (!data?.portal_config) return null;
  const raw = injectJobPlatforms(data.portal_config as unknown as PortalConfig, data.cpm_platforms_allowed);
  return {
    config: resolvePortalConfig(raw),
    jobId: data.id,
    monthlyPayoutCap: data.monthly_payout_cap,
    targetCountry: data.target_country,
  };
});

/** Find portal config job for a brand matching a specific country */
export const getPortalConfigForCountry = cache(async (brandOrgId: string, countryCode: string) => {
  const db = createServiceRoleClient();
  const { data: jobs } = await db
    .from('jobs')
    .select('id, portal_config, monthly_payout_cap, target_country, cpm_platforms_allowed')
    .eq('brand_organization_id', brandOrgId)
    .not('portal_config', 'is', null)
    .not('target_country', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!jobs || jobs.length === 0) return null;

  const match = jobs.find(j => j.target_country && countriesMatch(j.target_country, countryCode));
  if (!match?.portal_config) return null;

  const raw = injectJobPlatforms(match.portal_config as unknown as PortalConfig, match.cpm_platforms_allowed);
  return {
    config: resolvePortalConfig(raw),
    jobId: match.id,
    monthlyPayoutCap: match.monthly_payout_cap,
    targetCountry: match.target_country,
  };
});

/** Get all available portal countries for a brand (for country picker) */
export const getAvailablePortalCountries = cache(async (brandOrgId: string) => {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('jobs')
    .select('id, job_title, target_country')
    .eq('brand_organization_id', brandOrgId)
    .not('portal_config', 'is', null)
    .not('target_country', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []).map(j => ({
    jobId: j.id,
    jobTitle: j.job_title,
    targetCountry: j.target_country,
  }));
});

export const getReferenceVideos = cache(async (
  brandOrgId: string,
  filter?: { promoted_onboarding?: boolean; promoted_brief?: boolean; promoted_job_listing?: boolean; jobId?: string }
) => {
  const db = createServiceRoleClient();
  let query = db
    .from('brand_reference_videos')
    .select('id, storage_path, pdf_storage_path, video_url, transcript, notes, music, onscreen_text, disclaimer, adaptation, promoted_onboarding, promoted_brief, promoted_job_listing, category, sort_order, job_ids')
    .eq('brand_organization_id', brandOrgId)
    .order('sort_order', { ascending: true });

  if (filter?.promoted_onboarding) query = query.eq('promoted_onboarding', true);
  if (filter?.promoted_brief) query = query.eq('promoted_brief', true);
  if (filter?.promoted_job_listing) query = query.eq('promoted_job_listing', true);

  const { data } = await query;
  let rows = data ?? [];

  // Filter by job: show videos with empty job_ids (visible everywhere) or containing the specific job
  if (filter?.jobId) {
    const jid = filter.jobId;
    rows = rows.filter((row) => {
      const ids = (row as any).job_ids as string[] | null;
      return !ids || ids.length === 0 || ids.includes(jid);
    });
  }

  return rows.map((row) => ({
    ...row,
    url: row.storage_path
      ? getOnboardingStorageUrl(row.storage_path)
      : null,
    pdf_url: row.pdf_storage_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/creator_v2_onboarding/${row.pdf_storage_path}`
      : null,
  })) as BrandReferenceVideo[];
});

export const getPortalConfigOrDefault = cache(async (brandOrgId: string) => {
  const config = await getPortalConfig(brandOrgId);
  return config ?? DEFAULT_PORTAL_CONFIG;
});

/** Default reference video for brands without their own */
export const DEFAULT_REFERENCE_VIDEOS: BrandReferenceVideo[] = [
  {
    id: 'default-1',
    url: getOnboardingStorageUrl('defaults/reference-1.mp4'),
    transcript: "this is how to study so fast it feels illegal and this video is on your page which probably means you're procrastinating studying for your finals so let me show you how I study in the littlest amount of time possible I'm talking maybe 1 hour? 2 or 3 max and this method you can do with weeks of content for me I needed to study for a mid term from weeks 4 to 8 so I just compiled all the lecture notes together I'm just gonna take those slides and upload it to a website called Turbo I used my professor's slides but you could use a YouTube video or even audio record a class now those lecture slides are compiled into one big document I could ask questions to the chatbot here but I would immediately go to the quiz section and test myself on what I already know for anything you get wrong you can just ask the AI to break it down for you I swear if you cram this way you're gonna be left with so much time on your hands because you're filling in gaps of knowledge by practicing how to apply those concepts",
    video_url: null,
    notes: null,
    music: null,
    onscreen_text: null,
    disclaimer: null,
    adaptation: null,
    promoted_onboarding: true,
    sort_order: 1,
  },
];

export const getReferenceVideosOrDefaults = cache(async (
  brandOrgId: string,
  filter?: { promoted_onboarding?: boolean; promoted_brief?: boolean; promoted_job_listing?: boolean; jobId?: string }
) => {
  const videos = await getReferenceVideos(brandOrgId, filter);
  return videos.length > 0 ? videos : DEFAULT_REFERENCE_VIDEOS;
});

export const getManagedCreatorForBrand = cache(async (userId: string, brandOrgId: string) => {
  const db = createServiceRoleClient();
  const { data: rows } = await db
    .from('managed_creators')
    .select('*, jobs(monthly_payout_cap, portal_config)')
    .eq('linked_user_id', userId)
    .eq('brand_organization_id', brandOrgId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  // Prefer: signed contract > active status > portal-config job > any job > fallback
  return rows.find(r => r.contract_accepted_at != null)
    ?? rows.find(r => r.status === MC_STATUS.ACTIVE || r.status === MC_STATUS.WARMING_UP || r.status === MC_STATUS.GHOSTED)
    ?? rows.find(r => r.jobs?.portal_config != null)
    ?? rows.find(r => r.job_id != null)
    ?? rows[0];
});

/** Resolve MC + portal config for a user in a brand org.
 *  Uses MC's job_id if available, falls back to newest portal job for the org. */
export const getPortalDataForUser = cache(async (userId: string, orgId: string) => {
  const mc = await getManagedCreatorForBrand(userId, orgId);
  const portalResult = mc?.job_id
    ? await getPortalConfigByJobId(mc.job_id)
    : await getPortalConfigWithJobId(orgId);
  return {
    mc,
    config: portalResult?.config ?? null,
    jobId: portalResult?.jobId ?? null,
    monthlyPayoutCap: portalResult?.monthlyPayoutCap ?? null,
    targetCountry: portalResult?.targetCountry ?? null,
  };
});

/** Resolve a job_id for creating a managed_creator record.
 *  Prefers an explicit jobId, then matches by creator country, falls back to newest portal job. */
export async function resolveJobIdForBrand(brandOrgId: string, preferredJobId?: string | null, creatorCountry?: string | null): Promise<string | null> {
  if (preferredJobId) {
    const db = createServiceRoleClient();
    const { count } = await db
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('id', preferredJobId)
      .eq('brand_organization_id', brandOrgId);
    if (count && count > 0) return preferredJobId;
  }
  if (creatorCountry) {
    const countryMatch = await getPortalConfigForCountry(brandOrgId, creatorCountry);
    if (countryMatch?.jobId) return countryMatch.jobId;
  }
  const result = await getPortalConfigWithJobId(brandOrgId);
  return result?.jobId ?? null;
}

export const getManagedCreatorByBrandSlug = cache(async (userId: string, brandSlug: string) => {
  const org = await getOrgBySlug(brandSlug);
  if (!org) return { org: null, mc: null };
  const mc = await getManagedCreatorForBrand(userId, org.id);
  return { org, mc };
});
