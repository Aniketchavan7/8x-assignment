'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFetchWithContext } from '@/lib/utils/fetch-with-context';
import { useViewAsContext } from '@/lib/contexts/AdminViewAsContext';
import { cpmKeys, type CpmEnrollmentStatus, type CpmSubmissionWithDetails, type CpmJob, type CpmCampaignStats } from './types';
import { submitCpmVideo, reviewCpmSubmission, approveAdditionalViews, applyToCpmJob, cancelCpmSubmission, createCpmCampaign } from './actions';
import { fundCpmCampaign, publishCpmCampaign, unpublishCpmCampaign } from './budget-actions';

export function useCpmEnrollmentStatus() {
  const fetchWithContext = useFetchWithContext();

  return useQuery({
    queryKey: cpmKeys.enrollment(),
    queryFn: async () => {
      const response = await fetchWithContext('/api/cpm/enrollment');
      if (!response.ok) {
        if (response.status === 404) {
          // Not enrolled - return default status
          return {
            isEnrolled: false,
            activeJobCount: 0,
            totalEarnings: 0,
            pendingEarnings: 0,
            activeCampaigns: [],
          } as CpmEnrollmentStatus;
        }
        throw new Error('Failed to fetch CPM enrollment status');
      }
      return response.json() as Promise<CpmEnrollmentStatus>;
    },
  });
}

export function useAvailableCpmCampaigns() {
  const fetchWithContext = useFetchWithContext();

  return useQuery({
    queryKey: cpmKeys.campaigns(),
    queryFn: async () => {
      const response = await fetchWithContext('/api/cpm/campaigns');
      if (!response.ok) {
        throw new Error('Failed to fetch CPM campaigns');
      }
      return response.json() as Promise<CpmJob[]>;
    },
  });
}

export function useCpmCampaign(jobId: string | null) {
  const fetchWithContext = useFetchWithContext();

  return useQuery({
    queryKey: cpmKeys.campaign(jobId || ''),
    queryFn: async () => {
      if (!jobId) return null;
      const response = await fetchWithContext(`/api/cpm/campaigns/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch CPM campaign');
      }
      return response.json() as Promise<CpmJob>;
    },
    enabled: !!jobId,
  });
}

export function useSubmitCpmVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { jobApplicationId: string; videoUrl: string }) => {
      const formData = new FormData();
      formData.append('jobApplicationId', data.jobApplicationId);
      formData.append('videoUrl', data.videoUrl);
      const result = await submitCpmVideo({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.enrollment() });
    },
  });
}

export function useApplyToCpmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const formData = new FormData();
      formData.append('jobId', jobId);
      const result = await applyToCpmJob({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.enrollment() });
    },
  });
}

export function useCancelCpmSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submissionId: string) => {
      const formData = new FormData();
      formData.append('submissionId', submissionId);
      const result = await cancelCpmSubmission({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
    },
  });
}

export function useJobCpmSubmissions(jobId: string | null) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: [...cpmKeys.submissionsByJob(jobId || ''), brandId],
    queryFn: async () => {
      if (!jobId) return [];
      const response = await fetchWithContext(`/api/cpm/jobs/${jobId}/submissions`);
      if (!response.ok) {
        throw new Error('Failed to fetch job CPM submissions');
      }
      return response.json() as Promise<CpmSubmissionWithDetails[]>;
    },
    enabled: !!jobId,
  });
}

export function usePendingCpmSubmissions() {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: [...cpmKeys.submissions(), 'pending', brandId],
    queryFn: async () => {
      const response = await fetchWithContext('/api/cpm/submissions/pending');
      if (!response.ok) {
        throw new Error('Failed to fetch pending CPM submissions');
      }
      return response.json() as Promise<CpmSubmissionWithDetails[]>;
    },
  });
}

export function useReviewCpmSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      submissionId: string;
      action: 'approve' | 'reject';
      rejectionReason?: string;
    }) => {
      const formData = new FormData();
      formData.append('submissionId', data.submissionId);
      formData.append('action', data.action);
      if (data.rejectionReason) {
        formData.append('rejectionReason', data.rejectionReason);
      }
      const result = await reviewCpmSubmission({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.stats() });
    },
  });
}

export function useApproveAdditionalViews() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submissionId: string) => {
      const formData = new FormData();
      formData.append('submissionId', submissionId);
      const result = await approveAdditionalViews({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.stats() });
    },
  });
}

export function useCpmCampaignStats() {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: [...cpmKeys.stats(), brandId],
    queryFn: async () => {
      const response = await fetchWithContext('/api/cpm/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch CPM campaign stats');
      }
      return response.json() as Promise<CpmCampaignStats[]>;
    },
  });
}

export function useBrandCpmJobs() {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: [...cpmKeys.campaigns(), 'brand', brandId],
    queryFn: async () => {
      const response = await fetchWithContext('/api/cpm/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch brand CPM jobs');
      }
      return response.json() as Promise<CpmJob[]>;
    },
  });
}

export function useCreateCpmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      cpmRate: number;
      cpmCap: number;
      basePay: number;
      minViews?: number;
      country: string;
      platforms: string[];
      autoApprove: boolean;
    }) => {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description || '');
      formData.append('cpmRate', data.cpmRate.toString());
      formData.append('cpmCap', data.cpmCap.toString());
      formData.append('basePay', data.basePay.toString());
      formData.append('minViews', (data.minViews ?? 1000).toString());
      formData.append('country', data.country);
      formData.append('platforms', JSON.stringify(data.platforms));
      formData.append('autoApprove', data.autoApprove.toString());
      const result = await createCpmCampaign({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.campaigns() });
    },
  });
}

export function useFundCpmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { jobId: string; amountCents: number }) => {
      const formData = new FormData();
      formData.append('jobId', data.jobId);
      formData.append('amountCents', data.amountCents.toString());
      const result = await fundCpmCampaign(data, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.stats() });
      queryClient.invalidateQueries({ queryKey: ['/api/brand/settings'] });
    },
  });
}

export function usePublishCpmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const formData = new FormData();
      formData.append('jobId', jobId);
      const result = await publishCpmCampaign({ jobId }, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.stats() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
    },
  });
}

export function useUnpublishCpmCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const formData = new FormData();
      formData.append('jobId', jobId);
      const result = await unpublishCpmCampaign({ jobId }, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cpmKeys.campaigns() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.stats() });
      queryClient.invalidateQueries({ queryKey: cpmKeys.submissions() });
    },
  });
}
