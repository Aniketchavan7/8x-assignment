import { createAuthenticatedSupabaseClient, createServerSupabaseClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { getCreatorCountry } from '@/lib/modules/creator/queries';
import { withErrorTracking } from '@/lib/analytics/with-error-tracking';
import { validateOrigin } from '@/lib/utils/origin-validation';
import type { Job } from '@/lib/db/types';
import { handleApiError } from '@/lib/utils/api-error';
import { listJobs } from '@/lib/services/jobs';
import { isServiceError } from '@/lib/services/_types';

export const dynamic = 'force-dynamic';
// Force Node.js runtime for better compatibility
export const runtime = 'nodejs';

/**
 * Extended Job type with additional fields from API responses.
 * Simplified model: Each job has one title, one description, and targets countries (no translations).
 */
export type JobWithDetails = Omit<
  Job,
  'tags' | 'preferred_locations' | 'platforms_required'
> & {
  // Fields from job_requirements table
  tags: string[];
  preferred_locations: string[];
  platforms_required: string[];
};

export type JobsApiResponse =
  | JobWithDetails[]
  | {
      data: JobWithDetails[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };

/**
 * Fetches all public jobs with their requirements and tags.
 * Returns jobs that are visible to the current user based on visibility settings.
 *
 * Query parameters:
 * - countries: comma-separated list of country names to filter by
 */
export const GET = withErrorTracking(
  async (request: Request): Promise<Response> => {
    const originError = validateOrigin(request);
    if (originError) return originError;

    try {
      // Authenticated client when possible (for country_restricted filtering),
      // anon otherwise — RLS still allows public/open jobs.
      let supabase;
      let userId: string = '';
      let userEmail: string | null = null;
      let creatorCountry: string | null = null;

      try {
        supabase = await createAuthenticatedSupabaseClient();
        const user = await getUser();
        if (user) {
          userId = user.id;
          userEmail = user.email ?? null;
          creatorCountry = await getCreatorCountry(user.id);
        }
      } catch {
        supabase = createServerSupabaseClient();
      }

      const { searchParams } = new URL(request.url);
      const filterCountries =
        searchParams
          .get('countries')
          ?.split(',')
          .map((c) => c.trim())
          .filter(Boolean) || [];
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '12', 10)));
      const usePagination = searchParams.get('page') !== null;

      const result = await listJobs(
        { user: { id: userId, email: userEmail }, supabase },
        {
          page,
          limit,
          usePagination,
          filterCountries,
          creatorCountry,
        }
      );
      return Response.json(result);
    } catch (error) {
      if (isServiceError(error)) {
        if (error.status >= 500) {
          // Server-side errors still need to reach Sentry, but the client only
          // sees the curated message — never the raw Postgres details.
          console.error('[GET /api/jobs] ServiceError:', error.message, error.details);
        }
        return Response.json({ error: error.message }, { status: error.status });
      }
      return handleApiError(error, {
        route: '/api/jobs',
        method: 'GET',
      });
    }
  },
  {
    getUserId: null,
  }
);

// Re-export type from schema
export type { CreateJobRequest } from '@/components/Brand/JobForm/schemas/jobForm';

export type CreateJobResponse = {
  success: boolean;
  job_id?: string;
  job_slug?: string;
  error?: string;
  message?: string;
};
