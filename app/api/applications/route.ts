import { NextRequest } from 'next/server';
import type { Json } from '@/types/supabase';
import { validateOrigin } from '@/lib/utils/origin-validation';
import { captureDbError } from '@/lib/analytics/capture-error';
import { getCreatorContext } from '@/lib/modules/context';
import { createServiceRoleClient } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';
// Force Node.js runtime for Supabase cookie handling
export const runtime = 'nodejs';

/**
 * Parses media from Json type to the expected array format
 */
function parseMedia(media: Json | null | undefined): Array<{ url: string; type: string }> | null {
  if (!media) return null;
  if (!Array.isArray(media)) return null;

  return media.filter(
    (item): item is { url: string; type: string } =>
      typeof item === 'object' &&
      item !== null &&
      'url' in item &&
      'type' in item &&
      typeof item.url === 'string' &&
      typeof item.type === 'string'
  );
}

import type { JobApplication, ApplicationStatus } from '@/lib/db/types';

// Extended JobApplication type with job details
export type UserApplication = Pick<
  JobApplication,
  'id' | 'job_id' | 'applied_at' | 'cover_letter' | 'rejection_reason'
> & {
  job_title: string;
  job_description?: string | null;
  job_type?: string | null;
  application_status: ApplicationStatus;
  media?: Array<{ url: string; type: string }> | null;
  onboarding_call_url?: string | null;
};

export type ApplicationsApiResponse = UserApplication[];

/**
 * Fetches the current user's job applications with full details.
 * Returns a list of applications with job information and application details.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const originError = validateOrigin(request);
    if (originError) {
      return originError;
    }

    // Get creator context (handles auth and creator profile lookup)
    const ctx = await getCreatorContext(request);
    if (!ctx.ok) {
      // Return empty array instead of error for missing auth/profile (matches original behavior)
      return Response.json([], { status: 200 });
    }

    const { creatorProfile, supabase, user } = ctx;
    const creatorProfileId = creatorProfile.id;

    const { data: applications, error } = await supabase
      .from('job_applications')
      .select(
        `
        id,
        job_id,
        application_status,
        applied_at,
        cover_letter,
        rejection_reason,
        media,
        jobs (
          job_title,
          description,
          job_type,
          brand_organization_id
        )
      `
      )
      .eq('creator_profile_id', creatorProfileId)
      .order('applied_at', { ascending: false });

    if (error) {
      captureDbError(error, 'fetch_applications', {
        userId: user.id,
        metadata: { creatorProfileId },
      });
      return Response.json([], { status: 200 });
    }

    // Collect brand org IDs for 8x-managed brand lookup
    const brandOrgIds = new Set<string>();
    for (const app of applications || []) {
      const jobData = app.jobs as { brand_organization_id?: string } | null;
      if (jobData?.brand_organization_id) brandOrgIds.add(jobData.brand_organization_id);
    }

    // Fetch brand org details (eight_x_managed, onboarding_call_link) via service role
    let brandOrgMap = new Map<string, { eight_x_managed: boolean; onboarding_call_link: string | null; organization_name: string | null }>();
    if (brandOrgIds.size > 0) {
      const serviceClient = createServiceRoleClient();
      const { data: brandOrgs } = await serviceClient
        .from('brand_organizations')
        .select('id, eight_x_managed, onboarding_call_link, organization_name')
        .in('id', Array.from(brandOrgIds));
      if (brandOrgs) {
        brandOrgMap = new Map(brandOrgs.map((bo) => [bo.id, {
          eight_x_managed: bo.eight_x_managed ?? false,
          onboarding_call_link: bo.onboarding_call_link ?? null,
          organization_name: bo.organization_name,
        }]));
      }
    }

    // Fetch creator location + email for cal.com notes (only if there are 8x-managed brands)
    const has8xManagedBrands = Array.from(brandOrgMap.values()).some((bo) => bo.eight_x_managed);
    let creatorLocation: string | null = null;
    let creatorEmail: string | null = user.email ?? null;
    if (has8xManagedBrands) {
      const { data: fullProfile } = await supabase
        .from('creator_profiles')
        .select('location, email')
        .eq('id', creatorProfileId)
        .single();
      creatorLocation = fullProfile?.location ?? null;
      if (fullProfile?.email) creatorEmail = fullProfile.email;
    }

    // Build cal.com URL helper — only when the brand has a configured link
    const buildOnboardingCallUrl = (brandOrg: { onboarding_call_link: string | null; organization_name: string | null }, jobTitle: string) => {
      if (!brandOrg.onboarding_call_link) return null;
      const callLink = brandOrg.onboarding_call_link;
      const noteLines: string[] = [];
      const name = [creatorProfile.firstName, creatorProfile.lastName].filter(Boolean).join(' ') || creatorProfile.displayName;
      if (name) noteLines.push(`Creator: ${name}`);
      if (creatorLocation) noteLines.push(`Country: ${creatorLocation}`);
      if (creatorEmail) noteLines.push(`Email: ${creatorEmail}`);
      if (jobTitle) noteLines.push(`Job: ${jobTitle}`);
      if (brandOrg.organization_name) noteLines.push(`Brand: ${brandOrg.organization_name}`);
      const separator = callLink.includes('?') ? '&' : '?';
      return `${callLink}${separator}notes=${encodeURIComponent(noteLines.join('\n'))}`;
    };

    const userApplications: UserApplication[] = (applications || []).map((app) => {
      // Get job title, description, and type from the joined job data
      let jobTitle = 'Unknown Job';
      let jobDescription: string | null = null;
      let jobType: string | null = null;
      let brandOrgId: string | null = null;

      if (app.jobs && Array.isArray(app.jobs) && app.jobs.length > 0) {
        jobTitle = app.jobs[0].job_title;
        jobDescription = app.jobs[0].description || null;
        jobType = app.jobs[0].job_type || null;
        brandOrgId = app.jobs[0].brand_organization_id || null;
      } else if (app.jobs && typeof app.jobs === 'object' && 'job_title' in app.jobs) {
        const jobData = app.jobs as { job_title: string; description?: string | null; job_type?: string | null; brand_organization_id?: string | null };
        jobTitle = jobData.job_title;
        jobDescription = jobData.description || null;
        jobType = jobData.job_type || null;
        brandOrgId = jobData.brand_organization_id || null;
      }

      // Build onboarding call URL for 8x-managed brands
      let onboardingCallUrl: string | null = null;
      if (brandOrgId) {
        const brandOrg = brandOrgMap.get(brandOrgId);
        if (brandOrg?.eight_x_managed) {
          onboardingCallUrl = buildOnboardingCallUrl(brandOrg, jobTitle);
        }
      }

      return {
        id: app.id,
        job_id: app.job_id,
        job_title: jobTitle,
        job_description: jobDescription,
        job_type: jobType,
        application_status: (app.application_status ||
          'pending') as UserApplication['application_status'],
        applied_at: app.applied_at || new Date().toISOString(),
        cover_letter: app.cover_letter,
        rejection_reason: app.rejection_reason,
        media: parseMedia(app.media),
        onboarding_call_url: onboardingCallUrl,
      };
    });

    return Response.json(userApplications);
  } catch (error) {
    captureDbError(error, 'applications_api_route', {
      url: request.url,
      method: request.method,
    });
    return Response.json([], { status: 200 });
  }
}
