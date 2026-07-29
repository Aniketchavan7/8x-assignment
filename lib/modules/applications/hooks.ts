import { useQuery } from '@tanstack/react-query';
import { ApplicationVideoApiResponse } from '@/app/api/applications/[id]/video/route';
import { ApplicationsApiResponse } from '@/app/api/applications/route';
import { CACHE_TIMES } from '@/lib/modules/cache-constants';
import { useFetchWithContext } from '@/lib/utils/fetch-with-context';

/**
 * Fetcher function for user applications data.
 * Fetches all job applications for the current user.
 *
 * @param fetchFn - Optional fetch function to use (for admin view-as context)
 * @returns Array of application data or empty array if none found
 */
async function fetchApplications(fetchFn: typeof fetch = fetch): Promise<ApplicationsApiResponse> {
  try {
    // Use absolute URL starting with /api to avoid locale prefix issues
    const res = await fetchFn('/api/applications', { cache: 'no-store' });
    if (!res.ok) return [];
    const data: ApplicationsApiResponse = await res.json();
    return data || [];
  } catch (error) {
    console.error('Fetch applications error:', error);
    return [];
  }
}

/**
 * Hook to fetch and manage user's job applications.
 * Uses React Query for caching and automatic refetching.
 * Supports admin view-as mode via fetch context.
 *
 * @returns Query result with applications array, loading state, and error state
 */
export function useApplications() {
  const fetchWithContext = useFetchWithContext();
  const queryKey = ['/api/applications'] as const;

  return useQuery<ApplicationsApiResponse>({
    queryKey,
    queryFn: () => fetchApplications(fetchWithContext),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: CACHE_TIMES.APPLICATIONS,
  });
}

/**
 * Fetcher function for application video data.
 * Fetches application details including job info and associated videos.
 *
 * @param applicationId - The application ID to fetch data for
 * @param fetchFn - Optional fetch function to use (for admin view-as context)
 * @returns Application video data or null if not found
 */
async function fetchApplicationVideo(
  applicationId: string,
  fetchFn: typeof fetch = fetch
): Promise<ApplicationVideoApiResponse> {
  try {
    const res = await fetchFn(`/api/applications/${applicationId}/video`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: ApplicationVideoApiResponse = await res.json();
    return data;
  } catch (error) {
    console.error('Fetch application video error:', error);
    return null;
  }
}

/**
 * Hook to fetch and manage application video data.
 * Uses React Query for caching and automatic refetching.
 * Supports admin view-as mode via fetch context.
 *
 * @param applicationId - The application ID to fetch data for
 * @returns Query result with application data, loading state, and error state
 */
export function useApplicationVideo(applicationId: string) {
  const fetchWithContext = useFetchWithContext();
  const queryKey = [`/api/applications/${applicationId}/video`] as const;

  return useQuery<ApplicationVideoApiResponse>({
    queryKey,
    queryFn: () => fetchApplicationVideo(applicationId, fetchWithContext),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: CACHE_TIMES.APPLICATIONS,
  });
}

