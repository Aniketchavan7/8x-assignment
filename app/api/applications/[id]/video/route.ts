import type { JobApplication, ApplicationStatus, ApplicationVideo } from '@/lib/db/types';
import { validateOrigin } from '@/lib/utils/origin-validation';
import { getCreatorContext } from '@/lib/modules/context';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Extended type with job details and videos
export type ApplicationVideoData = Pick<JobApplication, 'id' | 'job_id'> & {
  application_status: ApplicationStatus;
  job: {
    id: string;
    job_title: string;
    description: string;
    brand_name: string;
    job_type: string | null;
    cpm_platforms_allowed: string[] | null;
  };
  videos: Array<
    Pick<ApplicationVideo, 'video_url' | 'filename' | 'created_at'> & {
      url: string; // alias for video_url for backward compatibility
      video_url: string; // actual property name from database
    }
  >;
};

export type ApplicationVideoApiResponse = ApplicationVideoData | null;

/**
 * Fetches application details with job info and videos for the video upload page.
 * GET /api/applications/[id]/video
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Validate origin - prevent direct API calls from terminal/scripts
    const originError = validateOrigin(request);
    if (originError) {
      return originError;
    }

    const { id: applicationId } = await params;

    // Get creator context (handles auth and creator profile lookup)
    const ctx = await getCreatorContext(request);
    if (!ctx.ok) {
      return Response.json(null, { status: ctx.error.status });
    }

    const { creatorProfile, supabase } = ctx;

    // Fetch application with job details
    // Filter by creator_profile_id to ensure proper access control
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select(
        `
        id,
        job_id,
        application_status,
        creator_profile_id,
        jobs!inner (
          id,
          job_title,
          description,
          brand_organization_id,
          job_type,
          cpm_platforms_allowed
        )
      `
      )
      .eq('id', applicationId)
      .eq('creator_profile_id', creatorProfile.id)
      .single();

    if (appError || !application) {
      console.error('Error fetching application:', appError);
      return Response.json(null, { status: 404 });
    }

    // Get job data
    const job = Array.isArray(application.jobs) ? application.jobs[0] : application.jobs;

    if (!job) {
      return Response.json(null, { status: 404 });
    }

    // Fetch brand organization
    const { data: brand } = await supabase
      .from('brand_organizations')
      .select('id, organization_name')
      .eq('id', job.brand_organization_id)
      .single();

    // Fetch videos from applications_videos table
    const { data: videos, error: videosError } = await supabase
      .from('applications_videos')
      .select('video_url, filename, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });

    if (videosError) {
      console.error('Error fetching application videos:', videosError);
    }

    const responseData: ApplicationVideoData = {
      id: application.id,
      job_id: application.job_id,
      application_status: application.application_status || 'pending',
      job: {
        id: job.id,
        job_title: job.job_title,
        description: job.description,
        brand_name: brand?.organization_name || 'Unknown Brand',
        job_type: job.job_type || null,
        cpm_platforms_allowed: job.cpm_platforms_allowed || null,
      },
      videos: (videos || []).map((v) => ({
        url: v.video_url,
        video_url: v.video_url,
        filename: v.filename,
        created_at: v.created_at,
      })),
    };

    return Response.json(responseData);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/applications/[id]/video',
      method: 'GET',
    });
  }
}
