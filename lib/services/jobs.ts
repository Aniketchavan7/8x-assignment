/**
 * Jobs service — shared between `/api/jobs` (web) and `/api/mobile/jobs`.
 *
 * One list + one detail function; input shape (creatorCountry vs countryIso)
 * drives the filter path so no Web|Mobile suffixes leak into the API surface.
 */

import { ServiceError, type ServiceContext } from './_types';

// ------------------------------------------------------------------
// Shared shapes
// ------------------------------------------------------------------

export interface JobSummaryDto {
  id: string;
  job_title: string;
  job_slug?: string | null;
  description: string | null;
  job_type: string | null;
  status: string;
  budget_per_creator: number | null;
  total_budget: number | null;
  cpm_rate: number | null;
  cpm_base_pay: number | null;
  cpm_cap: number | null;
  auto_approve_applications: boolean;
  application_deadline: string | null;
  start_date: string | null;
  currency: string;
  media: Array<{ url: string; type: string }>;
  industry: string | null;
  content_guidelines: string | null;
  brand: {
    id: string | null;
    name: string;
    slug: string | null;
    logo: string | null;
    industry: string | null;
    description: string | null;
  };
  requirements:
    | {
        platforms_required: string[];
        preferred_locations: string[];
        min_followers: null;
        min_engagement_rate: number | null;
        content_format: null;
        video_duration_min: null;
        video_duration_max: null;
        face_required: boolean;
        audio_type: null;
        disclosure_required: null;
        max_revisions: null;
        submission_deadline_days: null;
      }
    | null;
  milestones: unknown[];
  script?: null;
  talking_points?: null;
}

const ISO_TO_COUNTRY: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom',
  AU: 'Australia', DE: 'Germany', FR: 'France', IN: 'India',
  NG: 'Nigeria', BR: 'Brazil', MX: 'Mexico', JP: 'Japan',
  ZA: 'South Africa', KR: 'South Korea', ES: 'Spain', IT: 'Italy',
  NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', CH: 'Switzerland', AT: 'Austria', BE: 'Belgium',
  PT: 'Portugal', IE: 'Ireland', PL: 'Poland', TR: 'Turkey',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru',
  PH: 'Philippines', ID: 'Indonesia', TH: 'Thailand', VN: 'Vietnam',
  MY: 'Malaysia', SG: 'Singapore', NZ: 'New Zealand', EG: 'Egypt',
  KE: 'Kenya', SA: 'Saudi Arabia', AE: 'United Arab Emirates',
  IL: 'Israel', PK: 'Pakistan', BD: 'Bangladesh', TW: 'Taiwan',
  HK: 'Hong Kong', CZ: 'Czech Republic', RO: 'Romania', HU: 'Hungary',
  GR: 'Greece', UA: 'Ukraine', RS: 'Serbia', HR: 'Croatia',
};

export interface ListJobsInput {
  page: number;
  limit: number;
  usePagination: boolean;
  /** Raw country filters from query string. */
  filterCountries?: string[];
  /** ISO country code (mobile). If set and `filterCountries` empty, expanded to full name. */
  countryIso?: string | null;
  /** Already-resolved creator country (web passes this in). */
  creatorCountry?: string | null;
}

export interface JobsListItemDto {
  id: string;
  tags: string[];
  preferred_locations: string[];
  platforms_required: string[];
  brand_name: string | null;
  brand_logo: string | null;
  [key: string]: unknown;
}

export interface PaginatedJobsListDto {
  data: JobsListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function listJobs(
  ctx: ServiceContext,
  input: ListJobsInput
): Promise<JobsListItemDto[] | PaginatedJobsListDto> {
  const { page, limit, usePagination } = input;
  const filterCountries = [...(input.filterCountries ?? [])];
  const iso = input.countryIso?.toUpperCase();
  if (iso && ISO_TO_COUNTRY[iso] && filterCountries.length === 0) {
    filterCountries.push(ISO_TO_COUNTRY[iso]);
  }

  let query = ctx.supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .in('status', ['open', 'in_progress']);

  if (filterCountries.length > 0) {
    // Match pre-refactor web behaviour: filter both public and
    // country_restricted by target_country; do NOT require the creator's
    // profile country to match. Consumers use `filterCountries` to opt
    // into a country subset explicitly (e.g. portal jobs feed by country).
    query = query
      .in('visibility', ['public', 'country_restricted'])
      .in('target_country', filterCountries);
  } else if (input.creatorCountry) {
    const { COUNTRIES } = await import('@/lib/constants/countries');
    const validated = COUNTRIES.find(
      (c) => c.toLowerCase() === input.creatorCountry!.toLowerCase()
    );
    if (validated) {
      // `validated` is looked up from the COUNTRIES allow-list, which
      // contains no commas or `)`, so raw interpolation inside the
      // `and(…)` group is safe. If the allow-list source ever changes,
      // apply quoting here too.
      query = query
        .in('visibility', ['public', 'country_restricted'])
        .or(
          `visibility.eq.public,and(visibility.eq.country_restricted,target_country.ilike.${validated})`
        );
    } else {
      query = query.eq('visibility', 'public');
    }
  } else {
    query = query.eq('visibility', 'public');
  }

  const offset = (page - 1) * limit;
  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data: jobs, count: totalCount, error } = await query;

  if (error) {
    throw new ServiceError('internal', 'Failed to fetch jobs', {
      message: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  if (!jobs || jobs.length === 0) {
    return usePagination
      ? { data: [], total: 0, page, limit, totalPages: 0 }
      : [];
  }

  const jobIds = jobs.map((j) => j.id);
  const brandOrgIds = [
    ...new Set(
      jobs.map((j) => j.brand_organization_id).filter((id): id is string => !!id)
    ),
  ];

  const [{ data: requirements }, { data: brandOrgs }] = await Promise.all([
    ctx.supabase
      .from('job_requirements')
      .select('job_id, preferred_locations, platforms_required')
      .in('job_id', jobIds),
    brandOrgIds.length > 0
      ? ctx.supabase
          .from('brand_organizations')
          .select('id, organization_name, company_logo')
          .in('id', brandOrgIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            organization_name: string | null;
            company_logo: string | null;
          }[],
        }),
  ]);

  const reqMap = new Map(
    (requirements ?? []).map((r) => [
      r.job_id,
      {
        preferred_locations: (r.preferred_locations as string[]) ?? [],
        platforms_required: (r.platforms_required as string[]) ?? [],
      },
    ])
  );

  const brandMap = new Map(
    (brandOrgs ?? []).map((b) => [
      b.id,
      { name: b.organization_name, logo: b.company_logo },
    ])
  );

  const items: JobsListItemDto[] = jobs.map((job) => {
    const brand = job.brand_organization_id
      ? brandMap.get(job.brand_organization_id) ?? null
      : null;
    return {
      ...job,
      budget_per_creator: job.budget_per_creator ? Number(job.budget_per_creator) : null,
      total_budget: job.total_budget ? Number(job.total_budget) : null,
      payment_frequency: job.payment_frequency ?? null,
      status: job.status ?? 'draft',
      visibility: job.visibility ?? 'public',
      tags: [],
      preferred_locations: reqMap.get(job.id)?.preferred_locations ?? [],
      platforms_required: reqMap.get(job.id)?.platforms_required ?? [],
      brand_name: brand?.name ?? null,
      brand_logo: brand?.logo ?? null,
    };
  });

  if (usePagination) {
    const total = totalCount ?? 0;
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  return items;
}

// ------------------------------------------------------------------
// getJobDetail — shared between web + mobile.
// ------------------------------------------------------------------

export async function getJobDetail(
  ctx: ServiceContext,
  jobId: string
): Promise<JobSummaryDto> {
  const { data: job, error } = await ctx.supabase
    .from('jobs')
    .select(
      `
        *,
        brand_organizations (
          id, organization_name, organization_slug, company_logo, industry, description
        )
      `
    )
    .eq('id', jobId.trim())
    .in('status', ['open', 'in_progress'])
    .in('visibility', ['public', 'country_restricted'])
    .single();

  if (error || !job) {
    throw new ServiceError('not_found', 'Job not found');
  }

  if (job.visibility === 'country_restricted') {
    if (!job.target_country) {
      throw new ServiceError('not_found', 'Job not found');
    }
    const { data: profile } = await ctx.supabase
      .from('creator_profiles')
      .select('location')
      .eq('user_id', ctx.user.id)
      .maybeSingle();

    if (!profile?.location || profile.location !== job.target_country) {
      throw new ServiceError('not_found', 'Job not found');
    }
  }

  const { data: requirements } = await ctx.supabase
    .from('job_requirements')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  const brand = Array.isArray(job.brand_organizations)
    ? job.brand_organizations[0]
    : job.brand_organizations;
  const brandRecord = brand as Record<string, unknown> | null;

  return {
    id: job.id,
    job_title: job.job_title,
    description: job.description,
    job_type: job.job_type,
    status: job.status ?? 'draft',
    budget_per_creator: job.budget_per_creator ? Number(job.budget_per_creator) : null,
    total_budget: job.total_budget ? Number(job.total_budget) : null,
    cpm_rate: job.cpm_rate,
    cpm_base_pay: job.cpm_base_pay,
    cpm_cap: job.cpm_cap,
    auto_approve_applications: !!job.auto_approve_applications,
    application_deadline: job.application_deadline,
    start_date: job.start_date,
    currency: job.currency ?? 'USD',
    media: ((job as unknown as { media?: Array<{ url: string; type: string }> }).media ?? []),
    industry: job.industry,
    script: null,
    talking_points: null,
    content_guidelines: job.content_guidelines ?? null,
    brand: {
      id: (brandRecord?.id as string | undefined) ?? null,
      name: (brandRecord?.organization_name as string | undefined) ?? 'Brand',
      slug: (brandRecord?.organization_slug as string | undefined) ?? null,
      logo: (brandRecord?.company_logo as string | undefined) ?? null,
      industry: (brandRecord?.industry as string | undefined) ?? null,
      description: (brandRecord?.description as string | undefined) ?? null,
    },
    requirements: requirements
      ? {
          platforms_required: (requirements.platforms_required ?? []) as string[],
          preferred_locations: (requirements.preferred_locations ?? []) as string[],
          min_followers: null,
          min_engagement_rate: requirements.min_engagement_rate ?? null,
          content_format: null,
          video_duration_min: null,
          video_duration_max: null,
          face_required: requirements.requires_face_showing ?? false,
          audio_type: null,
          disclosure_required: null,
          max_revisions: null,
          submission_deadline_days: null,
        }
      : null,
    milestones: [],
  };
}
