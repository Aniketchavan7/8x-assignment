import { createServiceRoleClient } from '@/lib/db/supabase';
import { resolvePortalConfig } from '@/lib/modules/portal/types';
import type { PortalConfig } from '@/lib/modules/portal/types';
import type { JobStatus, PaymentFrequency } from '@/lib/db/types';

function isSupportedCurrency(value: string): value is 'EUR' | 'USD' | 'GBP' {
  return value === 'EUR' || value === 'USD' || value === 'GBP';
}

function normalizeCurrency(value: string | null): 'EUR' | 'USD' | 'GBP' | null {
  return value && isSupportedCurrency(value) ? value : null;
}

export interface FeaturedJob {
  id: string;
  job_slug: string;
  job_title: string;
  description: string;
  industry: string | null;
  budget_per_creator: number | null;
  payment_frequency: PaymentFrequency | null;
  status: JobStatus | null;
  platforms_required: string[];
  target_country: string | null;
  cpm_platforms_allowed: string[] | null;
  currency: 'EUR' | 'USD' | 'GBP' | null;
  job_type: string | null;
  cpm_rate: number | null;
  cpm_cap: number | null;
  cpm_base_pay: number | null;
  portal_config_version: number | null;
  brand_name: string;
  brand_slug: string;
}

/**
 * Get featured jobs matching a creator's country.
 * Returns up to 3 jobs that have portal configs, are listed, and target the
 * creator's country.
 */
export async function getFeaturedJobsForCountry(country: string): Promise<FeaturedJob[]> {
  // Service role: RLS on brand_organizations blocks anon/server clients from
  // joining org data. This only reads public portal listings — no user data.
  const db = createServiceRoleClient();

  const { data } = await db
    .from('jobs')
    .select(
      `
        id,
        job_slug,
        job_title,
        description,
        industry,
        budget_per_creator,
        payment_frequency,
        status,
        target_country,
        cpm_platforms_allowed,
        currency,
        job_type,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        portal_config,
        brand_organizations!inner (
          organization_name,
          organization_slug
        )
      `
    )
    .not('portal_config', 'is', null)
    .in('status', ['open', 'in_progress'])
    .order('published_at', { ascending: false })
    .limit(50);

  if (!data) return [];

  const results: FeaturedJob[] = [];

  for (const job of data) {
    if (results.length >= 3) break;

    // portal_config is stored as Json in Postgres; resolvePortalConfig is
    // tolerant of partial shapes and the writers always emit a PortalConfig.
    // Validating with a Zod schema here would be the next step if we ever
    // start ingesting third-party configs.
    const config = resolvePortalConfig(job.portal_config as unknown as PortalConfig);
    if (!config.content || !config.defaultLang) continue;
    if (!config.visibility.listed) continue;

    const targetCountryMatch =
      job.target_country && country.toLowerCase() === job.target_country.toLowerCase();
    if (!targetCountryMatch) continue;

    const org = job.brand_organizations;
    const rawConfig = job.portal_config;
    const portalVersion =
      rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) &&
      'version' in rawConfig && typeof rawConfig.version === 'number'
        ? rawConfig.version
        : null;

    results.push({
      id: job.id,
      job_slug: job.job_slug,
      job_title: job.job_title,
      description: job.description ?? '',
      industry: job.industry ?? null,
      budget_per_creator: job.budget_per_creator ?? null,
      payment_frequency: job.payment_frequency ?? null,
      status: job.status ?? null,
      platforms_required: [],
      target_country: job.target_country ?? null,
      cpm_platforms_allowed: job.cpm_platforms_allowed ?? null,
      currency: normalizeCurrency(job.currency ?? null),
      job_type: job.job_type ?? null,
      cpm_rate: job.cpm_rate ?? null,
      cpm_cap: job.cpm_cap ?? null,
      cpm_base_pay: job.cpm_base_pay ?? null,
      portal_config_version: portalVersion,
      brand_name: org.organization_name,
      brand_slug: org.organization_slug,
    });
  }

  return results;
}
