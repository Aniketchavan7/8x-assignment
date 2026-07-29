import {
  createAuthenticatedSupabaseClient,
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { JobWithDetails } from '../../route';
import { isValidSlug } from '@/lib/utils/security';
import { validateOrigin } from '@/lib/utils/origin-validation';
import { handleApiError } from '@/lib/utils/api-error';
import { getOnboardingStorageUrl } from '@/lib/storage/url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fetches a single job by slug with all details.
 * For brand members, returns jobs they own regardless of status.
 * For unauthenticated users, returns only public/open jobs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  try {
    const { slug } = await params;

    // Security: Prevent directory traversal in slug
    if (!isValidSlug(slug)) {
      return Response.json({ error: 'Invalid slug' }, { status: 400 });
    }

    // Get authenticated user (optional for public jobs)
    const user = await getUser();

    // Use authenticated client for logged-in users (allows access to their own jobs)
    // Use anon client for unauthenticated users (RLS allows viewing public jobs)
    let supabase;
    if (user) {
      try {
        supabase = await createAuthenticatedSupabaseClient();
      } catch {
        // Fall back to anon client if auth fails
        supabase = createServerSupabaseClient();
      }
    } else {
      supabase = createServerSupabaseClient();
    }

    // Fetch job by slug - RLS allows viewing all jobs
    // Explicit column list to avoid leaking internal fields (portal_config, etc.)
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(
        'id, job_title, job_slug, description, job_type, status, visibility, brand_organization_id, created_by, created_at, updated_at, approved_at, published_at, closed_at, start_date, end_date, application_deadline, estimated_duration, content_guidelines, exclusivity_terms, usage_rights, budget_per_creator, total_budget, budget_cents, budget_spent_cents, cpm_rate, cpm_cap, cpm_base_pay, cpm_payout_threshold, cpm_platforms_allowed, currency, payment_frequency, payout_status, industry, priority, media, transcript, auto_approve_applications, target_country, monthly_payout_cap, bonus_milestones, max_pay_cents, slack_channel_id'
      )
      .eq('job_slug', slug)
      .single();

    if (jobError || !job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Business logic: Only show public/open jobs to non-brand-members
    // Brand members can view their own jobs regardless of status (RLS handles access)
    let isBrandMember = false;
    if (user) {
      const { data: brandMember } = await supabase
        .from('brand_members')
        .select('brand_organization_id')
        .eq('user_id', user.id)
        .eq('brand_organization_id', job.brand_organization_id)
        .maybeSingle();

      isBrandMember = !!brandMember;
    }

    // If not a brand member, only show public/open jobs
    // Note: pending_funding jobs are only visible to brand members who own them
    const publicStatuses = ['open', 'in_progress'];
    if (
      !isBrandMember &&
      (!job.status || !publicStatuses.includes(job.status) || job.visibility !== 'public')
    ) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch job requirements
    const { data: requirements } = await supabase
      .from('job_requirements')
      .select('preferred_locations, platforms_required')
      .eq('job_id', job.id)
      .single();

    // Fetch brand organization details using service role client
    // Security: We use service role here because brand_organizations contains sensitive data
    // (billing_email, stripe_customer_id, etc.) and we only want to expose safe public fields.
    // This provides column-level security at the API layer.
    const serviceClient = createServiceRoleClient();
    const { data: brandOrg } = await serviceClient
      .from('brand_organizations')
      .select(
        'id, organization_name, organization_slug, company_logo, description, industry, website'
      )
      .eq('id', job.brand_organization_id)
      .maybeSingle();

    // Fetch promoted reference videos for job listing, filtered by job assignment
    const { data: refVideos } = await serviceClient
      .from('brand_reference_videos')
      .select('id, storage_path, job_ids')
      .eq('brand_organization_id', job.brand_organization_id)
      .eq('promoted_job_listing', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    const referenceMedia = (refVideos || [])
      .filter((v) => {
        if (!v.storage_path) return false;
        const ids = (v as any).job_ids as string[] | null;
        return !ids || ids.length === 0 || ids.includes(job.id);
      })
      .map((v) => ({
        url: getOnboardingStorageUrl(v.storage_path!),
        type: 'video' as const,
      }));

    // Fetch application count (only for brand members who own this job)
    let applicationCount = 0;
    if (isBrandMember) {
      const { count } = await supabase
        .from('job_applications')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', job.id);
      applicationCount = count || 0;
    }

    const requirementsData = requirements || {
      preferred_locations: [],
      platforms_required: [],
    };

    const jobWithDetails: JobWithDetails = {
      ...job,
      slack_channel_id: null,
      portal_config: null,
      monthly_payout_cap: isBrandMember ? job.monthly_payout_cap : null,
      budget_per_creator: job.budget_per_creator ? Number(job.budget_per_creator) : null,
      total_budget: job.total_budget ? Number(job.total_budget) : null,
      payment_frequency: (job.payment_frequency as JobWithDetails['payment_frequency']) || null,
      status: (job.status || 'draft') as JobWithDetails['status'],
      visibility: (job.visibility || 'public') as JobWithDetails['visibility'],
      tags: [],
      preferred_locations: (requirementsData.preferred_locations || []) as string[],
      platforms_required: (requirementsData.platforms_required || []) as string[],
    };

    const response = {
      ...jobWithDetails,
      brand_organization: brandOrg,
      application_count: isBrandMember ? applicationCount : undefined,
      reference_media: referenceMedia.length > 0 ? referenceMedia : undefined,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/jobs/by-slug/[slug]',
      method: 'GET',
    });
  }
}
