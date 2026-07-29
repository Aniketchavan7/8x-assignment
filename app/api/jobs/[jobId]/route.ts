import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { CreateJobRequest, JobWithDetails } from '../route';
import { validateOrigin } from '@/lib/utils/origin-validation';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type UpdateJobResponse = {
  success: boolean;
  error?: string;
  message?: string;
};

/**
 * Fetches a single job by ID with all details.
 * For brand members, returns jobs they own regardless of status.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  try {
    const { jobId } = await params;
    const supabase = await createAuthenticatedSupabaseClient();

    // Get authenticated user (optional for public jobs)
    const user = await getUser();

    // Fetch job - RLS allows viewing all jobs
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Business logic: Only show public/open jobs to non-brand-members
    // Brand members and admins can view jobs regardless of status
    let hasAccess = false;
    if (user) {
      // Check if user is admin
      const { data: userData } = await supabase
        .from('users')
        .select('account_type')
        .eq('id', user.id)
        .single();

      if (userData?.account_type === 'admin') {
        hasAccess = true;
      } else {
        const { data: brandMember } = await supabase
          .from('brand_members')
          .select('brand_organization_id')
          .eq('user_id', user.id)
          .eq('brand_organization_id', job.brand_organization_id)
          .maybeSingle();

        hasAccess = !!brandMember;
      }
    }

    // If not a brand member or admin, only show public/open jobs
    if (
      !hasAccess &&
      ((job.status !== 'open' && job.status !== 'in_progress') || job.visibility !== 'public')
    ) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Fetch job requirements
    const { data: requirements } = await supabase
      .from('job_requirements')
      .select('preferred_locations, platforms_required')
      .eq('job_id', jobId)
      .single();

    const requirementsData = requirements || {
      preferred_locations: [],
      platforms_required: [],
    };

    const jobWithDetails = {
      id: job.id,
      job_slug: job.job_slug,
      job_title: job.job_title,
      description: job.description,
      industry: job.industry,
      job_type: job.job_type,
      budget_per_creator: job.budget_per_creator ? Number(job.budget_per_creator) : null,
      total_budget: job.total_budget ? Number(job.total_budget) : null,
      estimated_duration: job.estimated_duration,
      payment_frequency: (job.payment_frequency as JobWithDetails['payment_frequency']) || null,
      start_date: job.start_date,
      end_date: job.end_date,
      status: (job.status || 'draft') as JobWithDetails['status'],
      visibility: (job.visibility || 'public') as JobWithDetails['visibility'],
      published_at: job.published_at,
      application_deadline: job.application_deadline,
      currency: (job.currency as 'EUR' | 'USD' | 'GBP') || 'USD',
      target_country: job.target_country,
      transcript: job.transcript,
      priority: job.priority,
      cpm_rate: job.cpm_rate,
      cpm_cap: job.cpm_cap,
      cpm_base_pay: job.cpm_base_pay,
      cpm_payout_threshold: job.cpm_payout_threshold,
      cpm_platforms_allowed: job.cpm_platforms_allowed,
      auto_approve_applications: job.auto_approve_applications,
      monthly_payout_cap: job.monthly_payout_cap,
      tags: [],
      preferred_locations: (requirementsData.preferred_locations || []) as string[],
      platforms_required: (requirementsData.platforms_required || []) as string[],
      ...(job.content_guidelines ? { content_guidelines: job.content_guidelines } : {}),
      ...(job.usage_rights ? { usage_rights: job.usage_rights } : {}),
      ...(job.exclusivity_terms ? { exclusivity_terms: job.exclusivity_terms } : {}),
      media: ((job as any).media as Array<{ url: string; type: 'image' | 'video' }>) || undefined,
    };

    return Response.json(jobWithDetails);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/jobs/[jobId]',
      method: 'GET',
    });
  }
}

/**
 * Updates an existing job posting for the authenticated brand.
 * Requires the user to be a brand member and own the job.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  try {
    const { jobId } = await params;

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createAuthenticatedSupabaseClient();

    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.account_type === 'admin';

    // Fetch existing job first (needed for both admin and non-admin paths)
    const { data: existingJob, error: jobFetchError } = await supabase
      .from('jobs')
      .select('id, brand_organization_id, job_slug, status, job_title')
      .eq('id', jobId)
      .single();

    if (jobFetchError || !existingJob) {
      return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    // If not admin, verify user is a brand member with access to this job
    if (!isAdmin) {
      const { data: brandMember } = await supabase
        .from('brand_members')
        .select('brand_organization_id')
        .eq('user_id', user.id)
        .single();

      if (!brandMember) {
        return Response.json(
          { success: false, error: 'User is not a brand member or admin' },
          { status: 403 }
        );
      }

      if (existingJob.brand_organization_id !== brandMember.brand_organization_id) {
        return Response.json(
          { success: false, error: 'Unauthorized to update this job' },
          { status: 403 }
        );
      }
    }

    // Parse request body - simplified without language-related fields
    const body: Partial<CreateJobRequest> & {
      industry?: string;
      content_guidelines?: string;
      usage_rights?: string;
      exclusivity_terms?: string;
      estimated_duration?: string;
      start_date?: string;
      end_date?: string;
      application_deadline?: string;
      preferred_locations?: string[];
      // Legacy fields for backward compatibility with existing standard jobs
      budget_per_creator?: number;
      total_budget?: number;
      payment_frequency?: 'post' | 'week' | 'month' | 'year';
      // CPM fields
      cpm_rate?: number | null;
      cpm_cap?: number | null;
      cpm_base_pay?: number | null;
      cpm_payout_threshold?: number | null;
      cpm_platforms_allowed?: string[] | null;
      auto_approve_applications?: boolean;
      monthly_payout_cap?: number | null;
      // Additional fields
      target_country?: string | null;
      transcript?: string | null;
      priority?: number;
      currency?: string;
    } = await request.json();
    const {
      job_title,
      description,
      industry,
      content_guidelines,
      usage_rights,
      exclusivity_terms,
      budget_per_creator,
      total_budget,
      estimated_duration,
      payment_frequency,
      start_date,
      end_date,
      status,
      visibility,
      application_deadline,
      preferred_locations,
      platforms_required,
      faqs,
      media,
      cpm_rate,
      cpm_cap,
      cpm_base_pay,
      cpm_payout_threshold,
      cpm_platforms_allowed,
      auto_approve_applications,
      monthly_payout_cap,
      target_country,
      transcript,
      priority,
      currency,
    } = body;

    // Build update object (only include fields that are provided)
    const updateData: Record<string, any> = {};

    if (job_title !== undefined) updateData.job_title = job_title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (industry !== undefined) updateData.industry = industry?.trim() || null;

    // Handle FAQs - convert to JSON and store in content_guidelines (if FAQs are provided)
    if (faqs !== undefined) {
      const faqsJson = faqs && faqs.length > 0 ? JSON.stringify(faqs) : null;
      updateData.content_guidelines = faqsJson;
    } else if (content_guidelines !== undefined) {
      // If content_guidelines is provided directly (not as FAQs), use it as-is
      updateData.content_guidelines = content_guidelines?.trim() || null;
    }

    // Handle media - store in dedicated media column (if media is provided)
    if (media !== undefined) {
      updateData.media = media && media.length > 0 ? media : null;
    }
    // Handle usage_rights separately (actual usage rights text, not media)
    if (usage_rights !== undefined) {
      updateData.usage_rights = usage_rights?.trim() || null;
    }
    if (exclusivity_terms !== undefined)
      updateData.exclusivity_terms = exclusivity_terms?.trim() || null;
    if (budget_per_creator !== undefined)
      updateData.budget_per_creator = budget_per_creator || null;
    if (total_budget !== undefined) updateData.total_budget = total_budget || null;
    if (estimated_duration !== undefined)
      updateData.estimated_duration = estimated_duration?.trim() || null;
    if (payment_frequency !== undefined) updateData.payment_frequency = payment_frequency || null;
    if (start_date !== undefined) updateData.start_date = start_date || null;
    if (end_date !== undefined) updateData.end_date = end_date || null;
    if (status !== undefined) {
      updateData.status = status;
      // Update published_at if status changes to 'open'
      if (status === 'open' && existingJob.status !== 'open') {
        updateData.published_at = new Date().toISOString();
      }
    }
    if (visibility !== undefined) updateData.visibility = visibility;
    if (application_deadline !== undefined)
      updateData.application_deadline = application_deadline || null;
    if (currency !== undefined) updateData.currency = currency;
    if (target_country !== undefined) updateData.target_country = target_country || null;
    if (transcript !== undefined) updateData.transcript = transcript || null;
    if (priority !== undefined) updateData.priority = priority;
    if (cpm_rate !== undefined) updateData.cpm_rate = cpm_rate;
    if (cpm_cap !== undefined) updateData.cpm_cap = cpm_cap;
    if (cpm_base_pay !== undefined) updateData.cpm_base_pay = cpm_base_pay;
    if (cpm_payout_threshold !== undefined) updateData.cpm_payout_threshold = cpm_payout_threshold;
    if (cpm_platforms_allowed !== undefined) updateData.cpm_platforms_allowed = cpm_platforms_allowed;
    if (auto_approve_applications !== undefined)
      updateData.auto_approve_applications = auto_approve_applications;
    if (monthly_payout_cap !== undefined) updateData.monthly_payout_cap = monthly_payout_cap;

    // Update job
    const { error: jobError } = await supabase.from('jobs').update(updateData).eq('id', jobId);

    if (jobError) {
      console.error('Error updating job:', jobError);
      return Response.json(
        { success: false, error: 'Failed to update job. Please try again.' },
        { status: 500 }
      );
    }

    // Update job requirements if provided (simplified - no languages or content types)
    if (
      preferred_locations !== undefined ||
      platforms_required !== undefined
    ) {
      const reqUpdateData: Record<string, any> = {};
      if (preferred_locations !== undefined)
        reqUpdateData.preferred_locations = preferred_locations;
      if (platforms_required !== undefined) reqUpdateData.platforms_required = platforms_required;

      const { error: reqError } = await supabase
        .from('job_requirements')
        .update(reqUpdateData)
        .eq('job_id', jobId);

      if (reqError) {
        console.error('Error updating job requirements:', reqError);
        // Non-fatal, continue
      }
    }

    return Response.json({
      success: true,
      message: 'Job updated successfully',
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/jobs/[jobId]',
      method: 'PUT',
    });
  }
}

/**
 * Deletes a job and all related data.
 * Requires the user to be a brand member and own the job.
 *
 * This will cascade delete:
 * - job_applications
 * - job_requirements
 * - contracts (and their deliverables, payments, etc.)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  const originError = validateOrigin(request);
  if (originError) return originError;

  try {
    const { jobId } = await params;

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is a brand member
    const supabase = await createAuthenticatedSupabaseClient();
    const { data: brandMember } = await supabase
      .from('brand_members')
      .select('brand_organization_id')
      .eq('user_id', user.id)
      .single();

    if (!brandMember) {
      return Response.json(
        { success: false, error: 'User is not a brand member' },
        { status: 403 }
      );
    }

    // Verify the job exists and belongs to the brand
    const { data: existingJob, error: jobFetchError } = await supabase
      .from('jobs')
      .select('id, brand_organization_id, job_title')
      .eq('id', jobId)
      .single();

    if (jobFetchError || !existingJob) {
      return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (existingJob.brand_organization_id !== brandMember.brand_organization_id) {
      return Response.json(
        { success: false, error: 'Unauthorized to delete this job' },
        { status: 403 }
      );
    }

    // Delete the job - cascade will handle most related data, but we'll be explicit for clarity
    // Note: Due to foreign key constraints with ON DELETE CASCADE, deleting the job will automatically delete:
    // - job_requirements
    // - job_applications
    // - contracts (and their related data)

    // However, we'll delete explicitly to ensure everything is cleaned up
    const deleteOperations = [
      // Delete job applications
      supabase.from('job_applications').delete().eq('job_id', jobId),
      // Delete job requirements
      supabase.from('job_requirements').delete().eq('job_id', jobId),
    ];

    // Execute all delete operations
    await Promise.all(
      deleteOperations.map(async (op) => {
        try {
          await op;
        } catch (err) {
          console.error('Error deleting related data:', err);
          // Continue even if some deletions fail (cascade will handle it)
        }
      })
    );

    // Finally, delete the job itself
    const { error: deleteError } = await supabase.from('jobs').delete().eq('id', jobId);

    if (deleteError) {
      console.error('Error deleting job:', deleteError);
      return Response.json(
        { success: false, error: 'Failed to delete job. Please try again.' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/jobs/[jobId]',
      method: 'DELETE',
    });
  }
}
