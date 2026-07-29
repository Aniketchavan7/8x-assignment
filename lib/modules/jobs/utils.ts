import type { JobBySlugApiResponse } from './hooks';
import type { JobDetailsData, ApplicationStatusTranslations } from './types';
import type { Job } from '@/lib/db/types';

/**
 * Maps a JobBySlugApiResponse to JobDetailsData for the shared JobDetails component.
 * Eliminates the need to manually map every property in each content file.
 */
export function mapJobToDetailsData(job: JobBySlugApiResponse): JobDetailsData {
  return {
    id: job.id,
    job_title: job.job_title,
    description: job.description,
    status: job.status,
    visibility: job.visibility,
    budget_per_creator: job.budget_per_creator,
    total_budget: job.total_budget,
    payment_frequency: job.payment_frequency,
    estimated_duration: job.estimated_duration,
    start_date: job.start_date,
    end_date: job.end_date,
    application_deadline: job.application_deadline,
    industry: job.industry,
    platforms_required: job.platforms_required,
    preferred_locations: job.preferred_locations,
    content_guidelines: job.content_guidelines,
    usage_rights: job.usage_rights,
    exclusivity_terms: job.exclusivity_terms,
    media: [...(job.media || []), ...(job.reference_media || [])],
    published_at: job.published_at,
    currency: job.currency,
    // CPM-specific fields
    job_type: job.job_type,
    cpm_rate: job.cpm_rate,
    cpm_cap: job.cpm_cap,
    cpm_base_pay: job.cpm_base_pay,
    cpm_platforms_allowed: job.cpm_platforms_allowed,
    target_country: job.target_country,
  };
}

/**
 * Maps a JobBySlugApiResponse to the minimal Job type needed for JobApplyModal.
 */
export function mapJobToApplyModalData(job: JobBySlugApiResponse): Job {
  return {
    id: job.id,
    job_title: job.job_title,
    description: job.description,
    industry: job.industry,
    budget_per_creator: job.budget_per_creator,
    estimated_duration: job.estimated_duration,
    payment_frequency: job.payment_frequency,
    start_date: job.start_date,
    end_date: job.end_date,
    status: job.status,
    visibility: job.visibility,
    published_at: job.published_at,
    application_deadline: job.application_deadline,
  } as Job;
}

/**
 * Gets the display text for an application status.
 */
export function getApplicationStatusText(
  status: string | undefined,
  translations?: ApplicationStatusTranslations
): string {
  if (!status) return translations?.applied || 'Applied';

  switch (status) {
    case 'accepted':
      return translations?.applicationAccepted || 'Application Accepted';
    case 'pending':
      return translations?.submitted || 'Submitted';
    case 'under_review':
      return translations?.underReview || 'Under Review';
    case 'rejected':
      return translations?.applicationRejected || 'Application Rejected';
    case 'withdrawn':
      return translations?.applicationWithdrawn || 'Application Withdrawn';
    default:
      return translations?.submitted || 'Submitted';
  }
}

/**
 * Checks if the application deadline has passed.
 */
export function isDeadlinePassed(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

/**
 * Checks if a job can accept applications.
 */
export function canApplyToJob(job: { status?: string | null; application_deadline?: string | null }): boolean {
  return job.status === 'open' && !isDeadlinePassed(job.application_deadline);
}
