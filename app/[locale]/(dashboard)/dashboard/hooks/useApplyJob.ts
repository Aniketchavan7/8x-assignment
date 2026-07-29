import { useMutation, useQueryClient } from '@tanstack/react-query';

export type ApplyJobRequest = {
  cover_letter?: string | null;
};

export type ApplyJobResponse = {
  success: boolean;
  application_id?: string;
  job_type?: string | null;
  job_slug?: string;
  brand_slug?: string;
  auto_approved?: boolean;
  onboarding_call_url?: string | null;
  error?: string;
  message?: string;
};

/**
 * Hook to submit a job application.
 * Uses React Query mutation for handling the API call.
 * Invalidates applications query on success to update the UI.
 * For CPM jobs with auto-approve, also invalidates managed creator status.
 */
export function useApplyJob() {
  const queryClient = useQueryClient();

  return useMutation<ApplyJobResponse, Error, { jobId: string; data: ApplyJobRequest }>({
    mutationFn: async ({ jobId, data }) => {
      const response = await fetch(`/api/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit application');
      }

      return result;
    },
    onSuccess: (result) => {
      // Invalidate applications query so the UI updates to show "Applied" status
      queryClient.invalidateQueries({ queryKey: ['/api/applications'] });

      // For CPM jobs with auto-approve, the user becomes a managed creator
      // Invalidate managed creator status so the jobs page knows they have access
      if (result.auto_approved) {
        queryClient.invalidateQueries({ queryKey: ['managed-creator-status'] });
        queryClient.invalidateQueries({ queryKey: ['managed-creators'] });
      }
    },
  });
}
