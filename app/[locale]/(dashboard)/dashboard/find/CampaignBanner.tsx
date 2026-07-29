import { cache } from 'react';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { resolvePortalConfig, resolvePortalConfigV3, isV3Config } from '@/lib/modules/portal/types';
import type { PortalConfig, PortalConfigV3 } from '@/lib/modules/portal/types';

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, '');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

export interface CampaignCardData {
  brandName: string;
  brandSlug: string;
  aboutText: string | null;
  compensation: { currency: string; baseFee: number; maxBaseFee?: number } | null;
  /** Per-country compensation for multi-country brands */
  compensationByCountry: Record<string, { currency: string; baseFee: number; maxBaseFee?: number }>;
  countries: string[];
}

export const getAvailableCampaigns = cache(async (): Promise<CampaignCardData[]> => {
  const db = createServiceRoleClient();
  const { data } = await db
    .from('jobs')
    .select('id, target_country, portal_config, cpm_base_pay, currency, brand_organization_id, brand_organizations!inner(organization_name, organization_slug)')
    .not('portal_config', 'is', null)
    .in('status', ['open', 'in_progress']);

  if (!data) return [];

  // Process each job into per-job data
  const perJob = data
    .map(job => {
      const raw = job.portal_config as unknown as PortalConfig | PortalConfigV3;
      const org = job.brand_organizations as unknown as { organization_name: string; organization_slug: string };

      let aboutText: string | null = null;
      let compensation: CampaignCardData['compensation'] = null;
      let listed = true;

      if (isV3Config(raw)) {
        const config = resolvePortalConfigV3(raw as PortalConfigV3);
        const content = config.content[config.defaultLang];
        aboutText = content?.job_description?.aboutMd ? stripMarkdown(content.job_description.aboutMd) : null;
        listed = config.visibility.listed;
        const basePay = (job as { cpm_base_pay?: number | null }).cpm_base_pay;
        const currency = (job as { currency?: string }).currency || 'USD';
        if (basePay && basePay > 0) {
          compensation = { currency, baseFee: basePay / 100 };
        }
      } else {
        const config = resolvePortalConfig(raw as PortalConfig);
        const content = config.content[config.defaultLang];
        aboutText = content?.about?.[0] ? stripHtml(content.about[0]) : null;
        compensation = content?.compensation && config.visibility.portalPricing
          ? { currency: content.compensation.currency, baseFee: content.compensation.baseFee, maxBaseFee: content.compensation.maxBaseFee }
          : null;
        listed = config.visibility.listed;
      }

      const country = job.target_country || null;
      return { brandName: org.organization_name, brandSlug: org.organization_slug, aboutText, compensation, country, listed };
    })
    .filter(c => c.listed);

  // Group by brand slug so multi-country brands get one card
  const brandMap = new Map<string, CampaignCardData>();
  for (const job of perJob) {
    const existing = brandMap.get(job.brandSlug);
    if (existing) {
      if (job.country && !existing.countries.includes(job.country)) {
        existing.countries.push(job.country);
      }
      if (job.compensation) {
        // Store per-country compensation
        if (job.country) {
          existing.compensationByCountry[job.country] = { ...job.compensation };
        }
        // Keep the first non-null compensation as fallback
        if (!existing.compensation) {
          existing.compensation = { ...job.compensation };
        }
      }
    } else {
      const compensationByCountry: Record<string, { currency: string; baseFee: number; maxBaseFee?: number }> = {};
      if (job.compensation && job.country) {
        compensationByCountry[job.country] = { ...job.compensation };
      }
      brandMap.set(job.brandSlug, {
        brandName: job.brandName,
        brandSlug: job.brandSlug,
        aboutText: job.aboutText,
        compensation: job.compensation ? { ...job.compensation } : null,
        compensationByCountry,
        countries: job.country ? [job.country] : [],
      });
    }
  }

  return Array.from(brandMap.values());
});
