'use server';

import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories, ErrorSeverity } from '@/lib/analytics/events';
import { getUser } from '@/lib/modules/auth/queries';
import { getCreatorCountry } from '@/lib/modules/creator/queries';
import { CPM_DEFAULTS } from './constants';
import type { CpmSubmissionStatus } from '@/lib/db/types';
import type {
  CpmEnrollmentStatus,
  CpmCampaignStats,
  CpmSubmissionWithDetails,
  CpmJob,
} from './types';

/**
 * Database row types for transformation
 */
interface DbJobRow {
  id: string;
  job_title: string;
  cpm_rate: number | null;
  cpm_cap: number | null;
  cpm_base_pay: number | null;
  cpm_payout_threshold: number | null;
  brand_organization: { organization_name: string; company_logo: string | null } | null;
}

interface DbCreatorRow {
  id: string;
  display_name: string;
  profile_picture: string | null;
}

interface DbPostRow {
  id: string;
  thumbnail_url: string | null;
}

interface DbSubmissionRow {
  id: string;
  job_id: string;
  creator_profile_id: string;
  job_application_id: string;
  video_url: string;
  platform: string;
  post_id: string | null;
  views_at_submission: number;
  views_current: number;
  views_approved: number;
  base_pay_earned: number;
  cpm_earnings: number;
  earnings_total: number;
  earnings_paid: number;
  status: CpmSubmissionStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  submitted_at: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  fetch_attempts: number;
  fetched_at: string | null;
  ineligibility_reason: string | null;
  last_fetch_error: string | null;
  job: DbJobRow;
  creator_profile: DbCreatorRow | null;
  post: DbPostRow | null;
}

/**
 * Transform a database submission row into the CpmSubmissionWithDetails type.
 * Centralizes transformation logic to avoid duplication across query functions.
 */
function transformSubmission(submission: DbSubmissionRow): CpmSubmissionWithDetails {
  const job = submission.job;
  const creator = submission.creator_profile;
  const post = submission.post;

  // Get thumbnail from linked post
  const thumbnailUrl = post?.thumbnail_url ?? null;

  return {
    ...submission,
    thumbnail_url: thumbnailUrl,
    job: {
      id: job.id,
      job_title: job.job_title,
      cpm_rate: job.cpm_rate ?? CPM_DEFAULTS.RATE_CENTS,
      cpm_cap: job.cpm_cap ?? CPM_DEFAULTS.CAP_CENTS,
      cpm_base_pay: job.cpm_base_pay ?? CPM_DEFAULTS.BASE_PAY_CENTS,
      cpm_payout_threshold: job.cpm_payout_threshold ?? CPM_DEFAULTS.PAYOUT_THRESHOLD,
      brand_organization: job.brand_organization
        ? {
            name: job.brand_organization.organization_name,
            logo_url: job.brand_organization.company_logo,
          }
        : { name: 'Brand', logo_url: null },
    },
    creator_profile: creator
      ? {
          id: creator.id,
          display_name: creator.display_name,
          avatar_url: creator.profile_picture,
        }
      : undefined,
  };
}

export async function getCpmEnrollmentStatus(
  creatorProfileId: string
): Promise<CpmEnrollmentStatus> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: submissions, error } = await supabase
    .from('cpm_submissions')
    .select(
      `
      id,
      job_id,
      status,
      views_at_submission,
      views_current,
      views_approved,
      earnings_total,
      earnings_paid,
      job:jobs!inner(
        id,
        job_title,
        status
      )
    `
    )
    .eq('creator_profile_id', creatorProfileId);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_enrollment_status',
      severity: ErrorSeverity.WARNING,
      metadata: { creatorProfileId },
    });
    return {
      isEnrolled: false,
      activeJobCount: 0,
      totalEarnings: 0,
      pendingEarnings: 0,
      activeCampaigns: [],
    };
  }

  if (!submissions || submissions.length === 0) {
    return {
      isEnrolled: false,
      activeJobCount: 0,
      totalEarnings: 0,
      pendingEarnings: 0,
      activeCampaigns: [],
    };
  }

  const campaignMap = new Map<
    string,
    {
      jobId: string;
      jobTitle: string;
      submissionCount: number;
      totalViews: number;
      earnings: number;
    }
  >();

  let totalEarnings = 0;
  let pendingEarnings = 0;

  for (const submission of submissions) {
    const job = submission.job as unknown as { id: string; job_title: string; status: string };
    const jobId = job.id;
    // Use views_approved for earnings calculation
    const viewsApproved = submission.views_approved ?? 0;

    totalEarnings += submission.earnings_total ?? 0;
    pendingEarnings += (submission.earnings_total ?? 0) - (submission.earnings_paid ?? 0);

    const existing = campaignMap.get(jobId);
    if (existing) {
      existing.submissionCount += 1;
      existing.totalViews += viewsApproved;
      existing.earnings += submission.earnings_total ?? 0;
    } else {
      campaignMap.set(jobId, {
        jobId,
        jobTitle: job.job_title,
        submissionCount: 1,
        totalViews: viewsApproved,
        earnings: submission.earnings_total ?? 0,
      });
    }
  }

  return {
    isEnrolled: true,
    activeJobCount: campaignMap.size,
    totalEarnings,
    pendingEarnings,
    activeCampaigns: Array.from(campaignMap.values()),
  };
}

export async function getAvailableCpmJobs(): Promise<CpmJob[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  // Get creator's country for country_restricted job filtering
  let creatorCountry: string | null = null;
  try {
    const user = await getUser();
    if (user) {
      creatorCountry = await getCreatorCountry(user.id);
    }
  } catch {
    // Ignore - no user context
  }

  // Note: pending_funding jobs are excluded - they're not visible to creators
  const { data, error } = await supabase
    .from('jobs')
    .select(
      `
      id,
      job_title,
      job_type,
      status,
      visibility,
      cpm_rate,
      cpm_cap,
      cpm_base_pay,
      cpm_payout_threshold,
      cpm_platforms_allowed,
      target_country,
      auto_approve_applications,
      brand_organization_id,
      budget_cents,
      budget_spent_cents,
      created_at,
      updated_at,
      brand_organization:brand_organizations(
        organization_name,
        company_logo
      )
    `
    )
    .eq('job_type', 'cpm')
    .in('status', ['open', 'in_progress'])
    .in('visibility', ['public', 'country_restricted'])
    .order('created_at', { ascending: false });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_available_cpm_jobs',
      severity: ErrorSeverity.WARNING,
    });
    return [];
  }

  // Filter country_restricted jobs based on creator's country
  const filteredJobs = (data || []).filter((job) => {
    if (job.visibility === 'public') return true;

    if (job.visibility === 'country_restricted') {
      // Only show if creator's country matches job's target_country
      return creatorCountry?.toLowerCase() === job.target_country?.toLowerCase();
    }

    return false;
  });

  return filteredJobs.map((job) => {
    const brand = job.brand_organization as { organization_name: string; company_logo: string | null } | null;
    return {
      ...job,
      job_type: 'cpm' as const,
      status: job.status || 'open',
      cpm_rate: job.cpm_rate ?? CPM_DEFAULTS.RATE_CENTS,
      cpm_cap: job.cpm_cap ?? CPM_DEFAULTS.CAP_CENTS,
      cpm_base_pay: job.cpm_base_pay ?? CPM_DEFAULTS.BASE_PAY_CENTS,
      cpm_payout_threshold: job.cpm_payout_threshold ?? CPM_DEFAULTS.PAYOUT_THRESHOLD,
      cpm_platforms_allowed: job.cpm_platforms_allowed ?? [...CPM_DEFAULTS.PLATFORMS],
      budget_cents: job.budget_cents ?? 0,
      budget_spent_cents: job.budget_spent_cents ?? 0,
      brand_organization: brand ? { name: brand.organization_name, logo_url: brand.company_logo } : undefined,
    };
  });
}

export async function getCpmJobById(jobId: string): Promise<CpmJob | null> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('jobs')
    .select(
      `
      id,
      job_title,
      job_type,
      status,
      cpm_rate,
      cpm_cap,
      cpm_base_pay,
      cpm_payout_threshold,
      cpm_platforms_allowed,
      target_country,
      auto_approve_applications,
      brand_organization_id,
      budget_cents,
      budget_spent_cents,
      created_at,
      updated_at,
      brand_organization:brand_organizations(
        organization_name,
        company_logo
      )
    `
    )
    .eq('id', jobId)
    .eq('job_type', 'cpm')
    .single();

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_job_by_id',
      severity: ErrorSeverity.WARNING,
      metadata: { jobId },
    });
    return null;
  }

  const brand = data.brand_organization as { organization_name: string; company_logo: string | null } | null;
  return {
    ...data,
    job_type: 'cpm' as const,
    status: data.status || 'open',
    cpm_rate: data.cpm_rate ?? CPM_DEFAULTS.RATE_CENTS,
    cpm_cap: data.cpm_cap ?? CPM_DEFAULTS.CAP_CENTS,
    cpm_base_pay: data.cpm_base_pay ?? CPM_DEFAULTS.BASE_PAY_CENTS,
    cpm_payout_threshold: data.cpm_payout_threshold ?? CPM_DEFAULTS.PAYOUT_THRESHOLD,
    cpm_platforms_allowed: data.cpm_platforms_allowed ?? [...CPM_DEFAULTS.PLATFORMS],
    budget_cents: data.budget_cents ?? 0,
    budget_spent_cents: data.budget_spent_cents ?? 0,
    brand_organization: brand ? { name: brand.organization_name, logo_url: brand.company_logo } : undefined,
  };
}

/**
 * Get CPM jobs for brand dashboard.
 * Includes pending_funding jobs (unlike getAvailableCpmJobs which is for creators).
 */
export async function getBrandCpmJobs(brandOrgId: string): Promise<CpmJob[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('jobs')
    .select(
      `
      id,
      job_title,
      job_type,
      status,
      cpm_rate,
      cpm_cap,
      cpm_base_pay,
      cpm_payout_threshold,
      cpm_platforms_allowed,
      target_country,
      auto_approve_applications,
      brand_organization_id,
      budget_cents,
      budget_spent_cents,
      created_at,
      updated_at,
      brand_organization:brand_organizations(
        organization_name,
        company_logo
      )
    `
    )
    .eq('job_type', 'cpm')
    .eq('brand_organization_id', brandOrgId)
    .in('status', ['pending_funding', 'open', 'in_progress', 'completed'])
    .order('created_at', { ascending: false });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_brand_cpm_jobs',
      severity: ErrorSeverity.WARNING,
      metadata: { brandOrgId },
    });
    return [];
  }

  return (data || []).map((job) => {
    const brand = job.brand_organization as { organization_name: string; company_logo: string | null } | null;
    return {
      ...job,
      job_type: 'cpm' as const,
      status: job.status || 'pending_funding',
      cpm_rate: job.cpm_rate ?? CPM_DEFAULTS.RATE_CENTS,
      cpm_cap: job.cpm_cap ?? CPM_DEFAULTS.CAP_CENTS,
      cpm_base_pay: job.cpm_base_pay ?? CPM_DEFAULTS.BASE_PAY_CENTS,
      cpm_payout_threshold: job.cpm_payout_threshold ?? CPM_DEFAULTS.PAYOUT_THRESHOLD,
      cpm_platforms_allowed: job.cpm_platforms_allowed ?? [...CPM_DEFAULTS.PLATFORMS],
      budget_cents: job.budget_cents ?? 0,
      budget_spent_cents: job.budget_spent_cents ?? 0,
      brand_organization: brand ? { name: brand.organization_name, logo_url: brand.company_logo } : undefined,
    };
  });
}

export async function getJobCpmSubmissions(
  jobId: string
): Promise<CpmSubmissionWithDetails[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('cpm_submissions')
    .select(
      `
      *,
      job:jobs!inner(
        id,
        job_title,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        cpm_payout_threshold,
        brand_organization:brand_organizations(
          organization_name,
          company_logo
        )
      ),
      creator_profile:creator_profiles(
        id,
        display_name,
        profile_picture
      ),
      post:posts(
        id,
        thumbnail_url
      )
    `
    )
    .eq('job_id', jobId)
    .order('submitted_at', { ascending: false });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_job_cpm_submissions',
      severity: ErrorSeverity.WARNING,
      metadata: { jobId },
    });
    return [];
  }

  return (data || []).map((submission) => transformSubmission(submission as DbSubmissionRow));
}

export async function getPendingCpmSubmissions(
  brandOrgId: string
): Promise<CpmSubmissionWithDetails[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('cpm_submissions')
    .select(
      `
      *,
      job:jobs!inner(
        id,
        job_title,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        cpm_payout_threshold,
        brand_organization_id,
        brand_organization:brand_organizations(
          organization_name,
          company_logo
        )
      ),
      creator_profile:creator_profiles(
        id,
        display_name,
        profile_picture
      ),
      post:posts(
        id,
        thumbnail_url
      )
    `
    )
    .eq('status', 'pending_approval')
    .eq('job.brand_organization_id', brandOrgId)
    .order('submitted_at', { ascending: true });

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_pending_cpm_submissions',
      severity: ErrorSeverity.WARNING,
      metadata: { brandOrgId },
    });
    return [];
  }

  return (data || []).map((submission) => transformSubmission(submission as DbSubmissionRow));
}

export async function getCpmSubmissionById(
  submissionId: string
): Promise<CpmSubmissionWithDetails | null> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('cpm_submissions')
    .select(
      `
      *,
      job:jobs!inner(
        id,
        job_title,
        cpm_rate,
        cpm_cap,
        cpm_base_pay,
        cpm_payout_threshold,
        brand_organization:brand_organizations(
          organization_name,
          company_logo
        )
      ),
      creator_profile:creator_profiles(
        id,
        display_name,
        profile_picture
      ),
      post:posts(
        id,
        thumbnail_url
      )
    `
    )
    .eq('id', submissionId)
    .single();

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_submission_by_id',
      severity: ErrorSeverity.WARNING,
      metadata: { submissionId },
    });
    return null;
  }

  return transformSubmission(data as DbSubmissionRow);
}

export async function getCpmCampaignStats(
  brandOrgId: string
): Promise<CpmCampaignStats[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('cpm_campaign_stats')
    .select('*')
    .eq('brand_organization_id', brandOrgId);

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'get_cpm_campaign_stats',
      severity: ErrorSeverity.WARNING,
      metadata: { brandOrgId },
    });
    return [];
  }

  return (data || [])
    .filter((stat) => stat.job_id !== null && stat.job_title !== null)
    .map((stat) => ({
      jobId: stat.job_id!,
      jobTitle: stat.job_title!,
      totalCreators: stat.total_creators ?? 0,
      totalSubmissions: stat.total_submissions ?? 0,
      pendingSubmissions: stat.pending_submissions ?? 0,
      activeSubmissions: stat.active_submissions ?? 0,
      totalViewsEarned: stat.total_views_earned ?? 0,
      totalEarnings: Number(stat.total_earnings ?? 0),
      totalPaid: Number(stat.total_paid ?? 0),
    }));
}

/**
 * Check if a video URL has already been submitted to ANY campaign.
 * Each video can only be attributed to one campaign globally.
 */
export async function checkGlobalVideoDuplicate(
  videoUrl: string
): Promise<{ isDuplicate: boolean; existingJobTitle?: string }> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('cpm_submissions')
    .select('id, job:jobs(job_title)')
    .eq('video_url', videoUrl)
    .maybeSingle();

  if (error) {
    captureError(error, {
      category: ErrorCategories.DATABASE,
      operation: 'check_global_video_duplicate',
      severity: ErrorSeverity.WARNING,
      metadata: { videoUrl },
    });
    return { isDuplicate: false };
  }

  if (data) {
    const job = data.job as { job_title: string } | null;
    return { isDuplicate: true, existingJobTitle: job?.job_title };
  }

  return { isDuplicate: false };
}

