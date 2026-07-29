/**
 * POST /api/creator/report-post — Creator submits a posted content URL
 *
 * Used by the mobile Report Post screen after a creator posts content
 * for a campaign. Creates a cpm_submissions record linking the post
 * to the creator's job application.
 *
 * Body: { post_url: string; platform?: string; notes?: string; job_application_id?: string }
 */

import { validatedRouteWithUser } from '@/lib/api/route-helpers';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ReportPostResponse {
  success: boolean;
  data?: { id: string; status: string };
  error?: string;
}

function detectPlatform(url: string): 'tiktok' | 'instagram' {
  if (url.includes('tiktok.com') || url.includes('tiktok')) return 'tiktok';
  return 'instagram';
}

const reportPostSchema = z.object({
  post_url: z.string().min(1, 'post_url is required').regex(/^https?:\/\/.+/i, 'Invalid URL format. Must start with http:// or https://'),
  platform: z.enum(['tiktok', 'instagram']).optional(),
  notes: z.string().optional(),
  job_application_id: z.string().optional(),
});

export const POST = validatedRouteWithUser(reportPostSchema, async (data, user) => {
  const { post_url, job_application_id } = data;
  const platform = data.platform ?? detectPlatform(post_url);
  const supabase = await createAuthenticatedSupabaseClient();
  // Service role client bypasses RLS for inserts
  const adminSupabase = createServiceRoleClient();

  // Resolve creator profile
  const { data: creatorProfile } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!creatorProfile) {
    return { success: false, error: 'Creator profile not found', statusCode: 404 };
  }

  // If job_application_id provided, validate and use it for CPM submission
  if (job_application_id) {
    const { data: application } = await supabase
      .from('job_applications')
      .select('id, job_id')
      .eq('id', job_application_id)
      .eq('creator_profile_id', creatorProfile.id)
      .single();

    if (application) {
      // Create CPM submission (service role bypasses RLS)
      const { data: submission, error: subError } = await adminSupabase
        .from('cpm_submissions')
        .insert({
          job_application_id: application.id,
          creator_profile_id: creatorProfile.id,
          job_id: application.job_id,
          video_url: post_url.trim(),
          platform,
          status: 'pending_approval',
          views_at_submission: 0,
          views_current: 0,
          views_approved: 0,
          base_pay_earned: 0,
          cpm_earnings: 0,
          earnings_total: 0,
          earnings_paid: 0,
          submitted_at: new Date().toISOString(),
        })
        .select('id, status')
        .single();

      if (subError) {
        console.error('[report-post] CPM submission error:', subError);
        return { success: false, error: 'Failed to create submission', statusCode: 500 };
      }

      return {
        success: true,
        data: { id: submission.id, status: submission.status },
      };
    }
  }

  // No application context — require job_application_id for post reporting
  return {
    success: false,
    error: 'A valid job_application_id is required to report a post',
    statusCode: 400,
  };
}, { name: 'creator/report-post' });
