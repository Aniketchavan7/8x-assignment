'use server';

/**
 * Repository functions for job data access.
 *
 * Standardizes Supabase client usage and provides consistent error handling
 * for job-related queries.
 *
 * Note: Uses authenticated client with Supabase Auth JWT to enforce RLS policies.
 */

import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobStatus } from '@/lib/db/types';
import type { Json } from '@/types/supabase';

export interface JobPaymentConfig {
  cpm_base_pay: number | null;
  cpm_rate: number | null;
  max_pay_cents: number | null;
  bonus_milestones: Json | null;
}

const DEFAULT_PAYMENT_CONFIG: JobPaymentConfig = {
  cpm_base_pay: null, cpm_rate: null, max_pay_cents: null, bonus_milestones: [],
};

export async function getJobPaymentConfig(supabase: SupabaseClient, jobId: string): Promise<JobPaymentConfig> {
  const { data } = await supabase
    .from('jobs')
    .select('cpm_base_pay, cpm_rate, max_pay_cents, bonus_milestones')
    .eq('id', jobId)
    .single();
  return data ?? DEFAULT_PAYMENT_CONFIG;
}

/**
 * Job summary with application count.
 */
export type JobSummary = Pick<
  Job,
  | 'id'
  | 'job_title'
  | 'job_slug'
  | 'description'
  | 'budget_per_creator'
  | 'total_budget'
  | 'application_deadline'
  | 'created_at'
  | 'published_at'
> & {
  status: JobStatus;
  applicationCount: number;
};

/**
 * Get all jobs for a brand organization.
 *
 * Uses authenticated client with Supabase Auth JWT. RLS policies will
 * automatically filter results based on the authenticated user's permissions.
 *
 * Args:
 *   brandOrgId: The brand organization ID
 *
 * Returns:
 *   Array of job rows
 *   Throws error if query fails
 */
export async function getJobsByBrandOrg(brandOrgId: string): Promise<Job[]> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('brand_organization_id', brandOrgId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return jobs || [];
}

/**
 * Get application counts for a list of job IDs.
 *
 * Uses authenticated client with Supabase Auth JWT. RLS policies will
 * automatically filter results based on the authenticated user's permissions.
 *
 * Args:
 *   jobIds: Array of job IDs to get counts for
 *
 * Returns:
 *   Map of job ID to application count
 *   Returns empty map if query fails (non-fatal)
 */
export async function getApplicationCounts(jobIds: string[]): Promise<Map<string, number>> {
  if (jobIds.length === 0) {
    return new Map();
  }

  const supabase = await createAuthenticatedSupabaseClient();

  const { data: applications, error } = await supabase
    .from('job_applications')
    .select('job_id')
    .in('job_id', jobIds);

  if (error) {
    console.error('Error fetching application counts:', error);
    // Return empty map rather than throwing - counts are non-critical
    return new Map();
  }

  // Create a map of job_id -> count
  const countsMap = new Map<string, number>();
  if (applications) {
    applications.forEach((app) => {
      const currentCount = countsMap.get(app.job_id) || 0;
      countsMap.set(app.job_id, currentCount + 1);
    });
  }

  return countsMap;
}
