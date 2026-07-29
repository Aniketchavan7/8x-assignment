import { useQuery } from '@tanstack/react-query';
import type {
  JobsApiResponse,
  JobWithDetails,
} from '@/app/api/jobs/route';
import { CACHE_TIMES } from '@/lib/modules/cache-constants';
import { useFetchWithContext } from '@/lib/utils/fetch-with-context';

export type JobBySlugApiResponse = JobWithDetails & {
  brand_organization: {
    id: string;
    organization_name: string;
    organization_slug: string;
    company_logo: string | null;
    description: string | null;
    industry: string | null;
    website: string | null;
  } | null;
  application_count?: number;
  content_guidelines?: string;
  usage_rights?: string;
  exclusivity_terms?: string;
  media?: Array<{ url: string; type: 'image' | 'video' }> | null;
  reference_media?: Array<{ url: string; type: 'video' }>;
};

/**
 * Options for filtering jobs
 */
export interface JobFilterOptions {
  languages?: string[];
  countries?: string[];
  page?: number;
  limit?: number;
}

/**
 * Response type for paginated jobs
 */
export type PaginatedJobsResponse = {
  data: JobWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * Fetcher function for jobs data.
 * Fetches all available jobs with optional filters and pagination.
 *
 * @param filters - Optional filters for languages, countries, page, and limit
 * @param fetchFn - Optional fetch function to use (for admin view-as context)
 * @returns Array of job data or paginated response with metadata
 */
async function fetchJobs(
  filters?: JobFilterOptions,
  fetchFn: typeof fetch = fetch
): Promise<JobsApiResponse> {
  try {
    const params = new URLSearchParams();
    if (filters?.languages && filters.languages.length > 0) {
      params.append('languages', filters.languages.join(','));
    }
    if (filters?.countries && filters.countries.length > 0) {
      params.append('countries', filters.countries.join(','));
    }
    if (filters?.page !== undefined) {
      params.append('page', filters.page.toString());
    }
    if (filters?.limit !== undefined) {
      params.append('limit', filters.limit.toString());
    }

    // Use absolute URL starting with /api to avoid locale prefix issues
    const url = `/api/jobs${params.toString() ? `?${params.toString()}` : ''}`;
    // Ensure we're using an absolute URL that Next.js will resolve correctly
    const absoluteUrl = url.startsWith('/') ? url : `/${url}`;
    const res = await fetchFn(absoluteUrl, { cache: 'no-store' });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('Jobs API error:', res.status, errorData);
      // Return empty array for non-paginated, empty paginated response for paginated
      if (filters?.page !== undefined) {
        return { data: [], total: 0, page: 1, limit: filters.limit || 12, totalPages: 0 };
      }
      return [];
    }
    const data: JobsApiResponse = await res.json();
    return (
      data ||
      (filters?.page !== undefined
        ? { data: [], total: 0, page: 1, limit: filters.limit || 12, totalPages: 0 }
        : [])
    );
  } catch (error) {
    console.error('Fetch jobs error:', error);
    // Return empty array for non-paginated, empty paginated response for paginated
    if (filters?.page !== undefined) {
      return { data: [], total: 0, page: 1, limit: filters.limit || 12, totalPages: 0 };
    }
    return [];
  }
}

/**
 * Hook to fetch and manage jobs data.
 * Uses React Query for caching and automatic refetching.
 * Supports admin view-as mode via fetch context.
 *
 * @param filters - Optional filters for languages and countries
 * @returns Query result with jobs array, loading state, and error state
 */
export function useJobs(filters?: JobFilterOptions) {
  const fetchWithContext = useFetchWithContext();
  // Include filters in query key so cache is invalidated when filters change
  const queryKey = ['/api/jobs', filters] as const;

  return useQuery<JobsApiResponse>({
    queryKey,
    queryFn: () => fetchJobs(filters, fetchWithContext),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: CACHE_TIMES.JOBS,
  });
}

/**
 * Fetcher function for job by slug.
 *
 * @param slug - The job slug to fetch
 * @param fetchFn - Optional fetch function to use (for admin view-as context)
 */
async function fetchJobBySlug(
  slug: string,
  fetchFn: typeof fetch = fetch
): Promise<JobBySlugApiResponse | null> {
  try {
    const res = await fetchFn(`/api/jobs/by-slug/${slug}`, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch job');
    }
    const data: JobBySlugApiResponse = await res.json();
    return data;
  } catch (error) {
    console.error('Fetch job by slug error:', error);
    return null;
  }
}

/**
 * Hook to fetch and manage job data by slug.
 * Uses React Query for caching and automatic refetching.
 * Supports admin view-as mode via fetch context.
 *
 * Cache configuration:
 * - staleTime: 5 minutes (data is considered fresh for 5 minutes)
 * - refetchOnWindowFocus: false (prevents unnecessary refetches)
 * - refetchOnMount: false (uses cached data if fresh)
 *
 * @param slug - The job slug to fetch data for
 * @returns Query result with job data, loading state, and error state
 */
export function useJobBySlug(slug: string) {
  const fetchWithContext = useFetchWithContext();
  const queryKey = [`/api/jobs/by-slug/${slug}`] as const;

  return useQuery<JobBySlugApiResponse | null>({
    queryKey,
    queryFn: () => fetchJobBySlug(slug, fetchWithContext),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: CACHE_TIMES.JOBS,
    enabled: !!slug, // Only fetch if slug is provided
  });
}
