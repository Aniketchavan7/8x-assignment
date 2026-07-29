import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { z } from 'zod';
import { handleApiError } from '@/lib/utils/api-error';
import { sanitizeSearchFilter } from '@/lib/utils';
import type { JobInsert } from '@/lib/db/types';
import type { AdminJobListItem } from '@/lib/types/admin-jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type { AdminJobListItem, AdminJobsApiResponse } from '@/lib/types/admin-jobs';

/**
 * Fetches jobs with pagination (admin-only).
 * Requires admin account_type to access.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 12)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const availableCountriesOnly = searchParams.get('available_countries') === 'true';
    const availableBrandsOnly = searchParams.get('available_brands') === 'true';

    // If requesting available brands for filter dropdown
    if (availableBrandsOnly) {
      // Only fetch brands that have at least one job, using distinct brand_organization_ids
      const { data: jobBrandIds, error: idsError } = await supabase
        .from('jobs')
        .select('brand_organization_id');

      if (idsError) {
        console.error('Error fetching job brand IDs:', idsError);
        return Response.json({ error: 'Failed to fetch available brands' }, { status: 500 });
      }

      const uniqueBrandIds = [...new Set((jobBrandIds || []).map((j) => j.brand_organization_id))];
      if (uniqueBrandIds.length === 0) {
        return Response.json({ brands: [] });
      }

      const { data: brands, error } = await supabase
        .from('brand_organizations')
        .select('id, organization_name, organization_slug')
        .in('id', uniqueBrandIds)
        .order('organization_name');

      if (error) {
        console.error('Error fetching brands:', error);
        return Response.json({ error: 'Failed to fetch available brands' }, { status: 500 });
      }

      return Response.json({ brands: brands || [] });
    }

    // If only requesting available countries, return them
    if (availableCountriesOnly) {
      const { data: jobCountries, error } = await supabase
        .from('jobs')
        .select('target_country')
        .not('target_country', 'is', null);

      if (error) {
        console.error('Error fetching job countries:', error);
        return Response.json({ error: 'Failed to fetch available countries' }, { status: 500 });
      }

      // Extract unique countries
      const countries = new Set<string>();
      (jobCountries || []).forEach((job: any) => {
        if (job.target_country) {
          countries.add(job.target_country);
        }
      });

      return Response.json({
        countries: Array.from(countries).sort(),
      });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '12', 10)));
    const offset = (page - 1) * limit;

    // Parse filter parameters - support comma-separated values for multi-select
    const brandIds = searchParams.get('brands')?.split(',').filter(Boolean) || [];
    const countries = searchParams.get('countries')?.split(',').filter(Boolean) || [];
    const search = searchParams.get('search') || null;

    // Build count query with filters
    let countQuery = supabase.from('jobs').select('*', { count: 'exact', head: true });

    // Apply country filter directly on jobs.target_country
    if (countries.length > 0) {
      countQuery = countQuery.in('target_country', countries);
    }

    // Apply brand filter
    if (brandIds.length > 0) {
      countQuery = countQuery.in('brand_organization_id', brandIds);
    }

    // Apply search filter if provided (searches job title and slug)
    if (search) {
      const sanitized = sanitizeSearchFilter(search);
      countQuery = countQuery.or(`job_title.ilike.%${sanitized}%,job_slug.ilike.%${sanitized}%`);
    }

    // Build data query with brand organization info and applicant count
    let dataQuery = supabase.from('jobs').select(`
        id,
        job_title,
        job_slug,
        job_type,
        status,
        brand_organization_id,
        visibility,
        target_country,
        created_at,
        brand_organizations (
          id,
          organization_name,
          organization_slug,
          eight_x_managed
        ),
        job_applications (count)
      `);

    // Apply same filters to data query
    if (countries.length > 0) {
      dataQuery = dataQuery.in('target_country', countries);
    }

    // Apply brand filter
    if (brandIds.length > 0) {
      dataQuery = dataQuery.in('brand_organization_id', brandIds);
    }

    // Apply search filter if provided
    if (search) {
      const sanitized = sanitizeSearchFilter(search);
      dataQuery = dataQuery.or(`job_title.ilike.%${sanitized}%,job_slug.ilike.%${sanitized}%`);
    }

    // Execute count and data queries in parallel for better performance
    const [countResult, dataResult] = await Promise.all([
      countQuery,
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
    ]);

    const { count, error: countError } = countResult;
    const { data: jobs, error } = dataResult;

    if (countError) {
      console.error('Error counting jobs:', countError);
      return Response.json({ error: 'Failed to count jobs' }, { status: 500 });
    }

    if (error) {
      console.error('Error fetching jobs:', error);
      return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    // Transform the data to match the expected format
    const jobsList: AdminJobListItem[] = (jobs || []).map((job: any) => {
      const brandOrg = Array.isArray(job.brand_organizations)
        ? job.brand_organizations[0]
        : job.brand_organizations;

      // Extract applicant count from the aggregated result
      const applicantCount = job.job_applications?.[0]?.count ?? 0;

      return {
        id: job.id,
        job_title: job.job_title,
        job_slug: job.job_slug,
        job_type: job.job_type || 'standard',
        status: job.status || 'draft',
        brand_organization_id: job.brand_organization_id,
        visibility: job.visibility || 'public',
        target_country: job.target_country || null,
        created_at: job.created_at,
        applicant_count: applicantCount,
        brand_organization: brandOrg
          ? {
              id: brandOrg.id,
              organization_name: brandOrg.organization_name,
              organization_slug: brandOrg.organization_slug,
              eight_x_managed: brandOrg.eight_x_managed ?? false,
            }
          : null,
      };
    });

    return Response.json(
      {
        data: jobsList,
        total,
        page,
        limit,
        totalPages,
      },
      {
        headers: {
          'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/jobs',
      method: 'GET',
    });
  }
}

// Schema for admin job creation with CPM support
const PlatformSchema = z.enum(['instagram', 'tiktok', 'youtube', 'twitter']);
const JobVisibilitySchema = z.enum(['public', 'private', 'invite_only']);

const AdminCreateJobRequestSchema = z.object({
  brand_organization_id: z.string().uuid('Invalid brand organization ID'),
  job_title: z.string().min(1),
  description: z.string().min(1),
  job_type: z.enum(['standard', 'cpm']).default('cpm'),
  currency: z.enum(['USD', 'GBP', 'EUR']).default('USD'),
  platforms_required: z.array(PlatformSchema).default([]),
  status: z.enum(['draft', 'open', 'in_progress', 'closed', 'completed', 'cancelled']).optional(),
  visibility: JobVisibilitySchema.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  application_deadline: z.string().optional(),
  // CPM job fields (values in cents) — always required for new jobs
  cpm_rate: z.number({ required_error: 'CPM rate is required' }),
  cpm_cap: z.number({ required_error: 'CPM cap is required' }),
  cpm_base_pay: z.number().optional(),
  cpm_payout_threshold: z.number().optional(),
  cpm_platforms_allowed: z.array(z.string()).optional(),
  auto_approve_applications: z.boolean().optional(),
  monthly_payout_cap: z.number().nullable().optional(),
  target_country: z.string().nullable().default(null),
  transcript: z.string().optional(),
  // Optional extras
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  media: z.array(z.object({ url: z.string(), type: z.enum(['image', 'video']) })).optional(),
});

export type AdminCreateJobRequest = z.infer<typeof AdminCreateJobRequestSchema>;
export type AdminCreateJobInput = z.input<typeof AdminCreateJobRequestSchema>;

export type AdminCreateJobResponse = {
  success: boolean;
  job_id?: string;
  job_slug?: string;
  error?: string;
  message?: string;
};

/**
 * Creates a new job posting for a brand (admin-only).
 * Supports both standard and CPM job types.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    const rawBody = await request.json();
    const parseResult = AdminCreateJobRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return Response.json(
        {
          success: false,
          error: 'Invalid request data',
          details: parseResult.error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const body = parseResult.data;

    // Verify brand organization exists
    const { data: brandOrg, error: brandError } = await supabase
      .from('brand_organizations')
      .select('id')
      .eq('id', body.brand_organization_id)
      .single();

    if (brandError || !brandOrg) {
      return Response.json(
        { success: false, error: 'Brand organization not found' },
        { status: 404 }
      );
    }

    const faqsJson =
      body.faqs && body.faqs.length > 0 ? JSON.stringify(body.faqs) : null;
    const mediaJson = body.media && body.media.length > 0 ? body.media : null;

    // Generate unique slug
    const baseSlug = body.job_title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);

    // Always append a short random suffix to prevent race conditions
    // when creating multiple jobs in parallel (e.g., one per country)
    const suffix = Math.random().toString(36).substring(2, 8);
    const slug = `${baseSlug}-${suffix}`;

    const status = body.status || 'open';

    // Build insert object — always CPM
    const jobInsert: JobInsert = {
      brand_organization_id: body.brand_organization_id,
      created_by: user.id,
      job_title: body.job_title.trim(),
      job_slug: slug,
      description: body.description.trim(),
      job_type: 'cpm',
      status,
      visibility: body.visibility || 'public',
      content_guidelines: faqsJson,
      media: mediaJson,
      published_at: status === 'open' ? new Date().toISOString() : null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      application_deadline: body.application_deadline || null,
      target_country: body.target_country || null,
      transcript: body.transcript || null,
      budget_per_creator: null,
      payment_frequency: null,
      total_budget: null,
      cpm_rate: body.cpm_rate,
      cpm_cap: body.cpm_cap,
      cpm_base_pay: body.cpm_base_pay ?? 0,
      cpm_payout_threshold: body.cpm_payout_threshold ?? 1000,
      cpm_platforms_allowed: body.cpm_platforms_allowed ?? ['tiktok', 'instagram'],
      auto_approve_applications: body.auto_approve_applications ?? true,
      monthly_payout_cap: body.monthly_payout_cap ?? null,
    };

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(jobInsert)
      .select('id')
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      return Response.json(
        { success: false, error: 'Failed to create job. Please try again.' },
        { status: 500 }
      );
    }

    const jobId = job.id;

    // Create job requirements
    const { error: reqError } = await supabase.from('job_requirements').insert({
      job_id: jobId,
      platforms_required: body.platforms_required,
    });

    if (reqError) {
      console.error('Error creating job requirements:', reqError);
      await supabase.from('jobs').delete().eq('id', jobId);
      return Response.json(
        { success: false, error: 'Failed to create job requirements.' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      job_id: jobId,
      job_slug: slug,
      message: 'Job created successfully',
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/jobs',
      method: 'POST',
    });
  }
}
