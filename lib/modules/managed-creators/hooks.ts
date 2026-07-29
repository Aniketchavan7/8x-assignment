'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFetchWithContext } from '@/lib/utils/fetch-with-context';
import { useViewAsContext } from '@/lib/contexts/AdminViewAsContext';
import { trackedAccountsKeys } from '@/lib/tracked-accounts/queryKeys';
import type { ManagedCreator, PreviousAccount } from './types';
import type { ManagedCreatorStatus } from './constants';
import type { PortalConfig, BrandReferenceVideo } from '@/lib/modules/portal/types';

export interface PreviousOwnershipMeta {
  previouslyOwnedByCreator: {
    tiktok?: boolean;
    instagram?: boolean;
  };
}

export type ManagedCreatorWithMeta = ManagedCreator & {
  _meta?: PreviousOwnershipMeta;
};

// Query keys - include brandId to ensure cache invalidates when switching brands
export const managedCreatorsKeys = {
  all: ['managed-creators'] as const,
  list: (brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'list', brandId ?? 'all'] as const,
  detail: (id: string, brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'detail', id, brandId ?? 'all'] as const,
  transcripts: (id: string, brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'transcripts', id, brandId ?? 'all'] as const,
  videos: (id: string, brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'videos', id, brandId ?? 'all'] as const,
  analytics: (id: string, brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'analytics', id, brandId ?? 'all'] as const,
  aggregateStats: (brandId?: string | null) =>
    [...managedCreatorsKeys.all, 'aggregate-stats', brandId ?? 'all'] as const,
};

/**
 * Hook to fetch all managed creators (scoped by brand context)
 * @param options.platform - Filter stats (views/CPM) by platform: 'all' | 'tiktok' | 'instagram'
 */
export function useManagedCreators(options?: { platform?: 'all' | 'tiktok' | 'instagram' }) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();
  const platform = options?.platform || 'all';

  return useQuery({
    queryKey: [...managedCreatorsKeys.list(brandId), platform],
    queryFn: async () => {
      const url =
        platform !== 'all' ? `/api/managed-creators?platform=${platform}` : '/api/managed-creators';
      const response = await fetchWithContext(url);
      if (!response.ok) {
        throw new Error('Failed to fetch managed creators');
      }
      return response.json() as Promise<ManagedCreator[]>;
    },
  });
}

/**
 * Hook to fetch a single managed creator
 */
export function useManagedCreator(id: string | null) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: managedCreatorsKeys.detail(id || '', brandId),
    queryFn: async () => {
      if (!id) return null;
      const response = await fetchWithContext(`/api/managed-creators/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch managed creator');
      }
      return response.json() as Promise<ManagedCreator>;
    },
    enabled: !!id,
  });
}

// Types for analytics
export type CalculationMode = 'days' | 'posts';

interface AccountAnalytics {
  platform: 'tiktok' | 'instagram';
  username: string;
  views: number;
  posts: number;
  cpm: number | null;
}

interface VideoAnalytics {
  id: string;
  postUrl: string | null;
  views: number;
  postedAt: string | null;
  cpm: number | null;
  platform: 'tiktok' | 'instagram';
  included: boolean;
}

interface AnalyticsMeta {
  firstPostDate: string | null;
  lastPostDate: string | null;
  daysInRange: number;
  effectivePay: number;
  calculationMode: CalculationMode;
  includedPostCount: number;
  excludedPostCount: number;
  totalPostCount: number;
  platforms: ('tiktok' | 'instagram')[] | null;
}

export interface CreatorAnalyticsData {
  creator: {
    id: string;
    name: string;
    basePay: number;
  };
  totals: {
    views: number;
    posts: number;
    cpm: number | null;
  };
  byAccount: AccountAnalytics[];
  byVideo: VideoAnalytics[];
  meta: AnalyticsMeta;
}

export interface CreatorAnalyticsParams {
  startDate?: string;
  endDate?: string;
  mode?: CalculationMode;
  excludedPostIds?: string[];
  platforms?: ('tiktok' | 'instagram' | 'youtube')[];
}

/**
 * Hook to fetch analytics for a managed creator (CPM, views, etc.)
 * Supports filtering by date range, calculation mode, and excluded posts.
 */
export function useCreatorAnalytics(
  managedCreatorId: string | null,
  params?: CreatorAnalyticsParams
) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  // Build query key including params for proper cache invalidation
  const queryKey = [
    ...managedCreatorsKeys.analytics(managedCreatorId || '', brandId),
    params?.startDate,
    params?.endDate,
    params?.mode,
    params?.excludedPostIds?.join(','),
    params?.platforms?.join(','),
  ];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!managedCreatorId) return null;

      // Build URL with query parameters
      const url = new URL(
        `/api/managed-creators/${managedCreatorId}/analytics`,
        window.location.origin
      );
      if (params?.startDate) {
        url.searchParams.set('startDate', params.startDate);
      }
      if (params?.endDate) {
        url.searchParams.set('endDate', params.endDate);
      }
      if (params?.mode) {
        url.searchParams.set('mode', params.mode);
      }
      if (params?.excludedPostIds && params.excludedPostIds.length > 0) {
        url.searchParams.set('excludedPostIds', params.excludedPostIds.join(','));
      }
      if (params?.platforms && params.platforms.length > 0) {
        url.searchParams.set('platforms', params.platforms.join(','));
      }

      const response = await fetchWithContext(url.pathname + url.search);
      if (!response.ok) {
        throw new Error('Failed to fetch creator analytics');
      }
      return response.json() as Promise<CreatorAnalyticsData>;
    },
    enabled: !!managedCreatorId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Types for mutation payloads
export interface CreateManagedCreatorPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  tiktok_username?: string | null;
  instagram_username?: string | null;
  tiktok_added_at?: string | null;
  instagram_added_at?: string | null;
  status?: ManagedCreatorStatus;
  base_pay?: number;
  payment?: string | null;
  payment_method?:
    | 'stripe_connect'
    | 'sideshift'
    | 'whop'
    | 'binance'
    | 'paypal'
    | 'bank_transfer'
    | 'pending';
  payout_frequency?: 'weekly' | 'biweekly' | 'monthly';
  sourced?: string | null;
  notes?: string | null;
  linked_creator_profile_id?: string | null;
}

export interface UpdateManagedCreatorPayload extends Partial<CreateManagedCreatorPayload> {
  id: string;
  onboarding_call_complete?: boolean;
  handles_complete?: boolean;
  videos_complete?: boolean;
  collected_tiktok_url?: string | null;
  collected_instagram_url?: string | null;
  video_urls?: string[];
  // Financial fields
  payment_outstanding?: number;
  total_paid?: number;
  pending_payout?: number;
  tiktok_performance?: number | null;
  instagram_performance?: number | null;
  // Status fields
  is_active?: boolean;
}

/**
 * Hook to create a managed creator
 */
export function useCreateManagedCreator() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: CreateManagedCreatorPayload): Promise<ManagedCreatorWithMeta> => {
      const response = await fetchWithContext('/api/managed-creators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create creator' }));
        throw new Error(error.error || 'Failed to create creator');
      }
      return response.json();
    },
    onSuccess: (creator) => {
      // Invalidate managed creators list
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });

      // If creator has social handles, also invalidate tracked accounts and posts
      // (the edge function syncs data in the background)
      if (creator.tiktok_username || creator.instagram_username) {
        // Invalidate tracked accounts cache so new accounts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.accounts });
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.admin.accounts });
        if (brandId) {
          queryClient.invalidateQueries({
            queryKey: trackedAccountsKeys.admin.brandAccounts(brandId),
          });
        }

        // Invalidate posts cache so new posts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.posts });
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });
}

/**
 * Hook to update a managed creator
 */
export function useUpdateManagedCreator() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: UpdateManagedCreatorPayload): Promise<ManagedCreatorWithMeta> => {
      const { id, ...updateData } = data;
      const response = await fetchWithContext(`/api/managed-creators/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update creator' }));
        throw new Error(error.error || 'Failed to update creator');
      }
      return response.json();
    },
    onSuccess: (creator) => {
      // Invalidate managed creators list and update detail cache
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });
      if (creator) {
        queryClient.setQueryData(managedCreatorsKeys.detail(creator.id, brandId), creator);
      }

      // If creator has social handles, also invalidate tracked accounts and posts
      // (the edge function syncs data in the background when handles are added)
      if (creator.tiktok_username || creator.instagram_username) {
        // Invalidate tracked accounts cache so new accounts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.accounts });
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.admin.accounts });
        if (brandId) {
          queryClient.invalidateQueries({
            queryKey: trackedAccountsKeys.admin.brandAccounts(brandId),
          });
        }

        // Invalidate posts cache so new posts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.posts });
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });
}

/**
 * Hook to delete a managed creator
 */
export function useDeleteManagedCreator() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetchWithContext(`/api/managed-creators/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete creator' }));
        throw new Error(error.error || 'Failed to delete creator');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });
    },
  });
}

/**
 * Hook to save a transcript
 */
export function useSaveTranscript() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: {
      managedCreatorId: string;
      transcript: string;
      callDate?: string;
    }): Promise<string> => {
      const response = await fetchWithContext(
        `/api/managed-creators/${data.managedCreatorId}/transcripts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: data.transcript,
            callDate: data.callDate,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save transcript' }));
        throw new Error(error.error || 'Failed to save transcript');
      }
      const result = await response.json();
      return result.id;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.transcripts(variables.managedCreatorId, brandId),
      });
    },
  });
}

// Types for transcripts and videos
export interface TranscriptRecord {
  id: string;
  call_date: string;
  storage_path: string | null;
  created_at: string;
}

export interface VideoRecord {
  id: string;
  slotNumber: number;
  path: string;
  url: string | null;
  filename: string;
  createdAt: string;
  isReplaced?: boolean;
  replacedAt?: string | null;
}

export interface AdminVideosData {
  videos: VideoRecord[];
  replacedVideos: VideoRecord[];
  requiredCount: number;
}

/**
 * Hook to fetch transcripts for a managed creator
 */
export function useCreatorTranscripts(managedCreatorId: string | null) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: managedCreatorsKeys.transcripts(managedCreatorId || '', brandId),
    queryFn: async () => {
      if (!managedCreatorId) return [];
      const response = await fetchWithContext(
        `/api/managed-creators/${managedCreatorId}/transcripts`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch transcripts');
      }
      return response.json() as Promise<TranscriptRecord[]>;
    },
    enabled: !!managedCreatorId,
  });
}

/**
 * Hook to fetch videos for a managed creator (admin view)
 * Includes both active videos and replaced videos for full history
 */
export function useCreatorVideos(managedCreatorId: string | null) {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: managedCreatorsKeys.videos(managedCreatorId || '', brandId),
    queryFn: async () => {
      if (!managedCreatorId) return { videos: [], replacedVideos: [], requiredCount: 3 };
      const response = await fetchWithContext(`/api/managed-creators/${managedCreatorId}/videos`);
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }
      return response.json() as Promise<AdminVideosData>;
    },
    enabled: !!managedCreatorId,
  });
}

export interface AdminUploadVideoResult {
  id: string;
  slotNumber: number;
  path: string;
  url: string | null;
  filename: string;
  totalVideos: number;
  isComplete: boolean;
  replacedVideoPath: string | null;
}

/**
 * Hook to upload or replace a video in a specific slot (admin)
 */
export function useUploadVideo() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: {
      managedCreatorId: string;
      file: File;
      slotNumber: number;
    }): Promise<AdminUploadVideoResult> => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('slotNumber', String(data.slotNumber));

      const response = await fetchWithContext(
        `/api/managed-creators/${data.managedCreatorId}/videos`,
        {
          method: 'POST',
          body: formData,
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to upload video' }));
        throw new Error(error.error || 'Failed to upload video');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.videos(variables.managedCreatorId, brandId),
      });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });
    },
  });
}

/**
 * Hook to delete a video
 */
export function useDeleteVideo() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: { managedCreatorId: string; path: string }): Promise<void> => {
      const response = await fetchWithContext(
        `/api/managed-creators/${data.managedCreatorId}/videos`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: data.path }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete video' }));
        throw new Error(error.error || 'Failed to delete video');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.videos(variables.managedCreatorId, brandId),
      });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });
    },
  });
}

// Types for batch operations
export interface BatchUpdateRequest {
  updates: Array<{ id: string; changes: Record<string, unknown> }>;
  creates: Array<Record<string, unknown>>;
}

export interface BatchUpdateResponse {
  success: boolean;
  updated: ManagedCreator[];
  created: ManagedCreator[];
  auditBatchId: string;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Hook to batch update/create managed creators
 */
export function useBatchUpdateCreators() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: BatchUpdateRequest): Promise<BatchUpdateResponse> => {
      const response = await fetchWithContext('/api/managed-creators/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Batch update failed' }));
        throw new Error(error.error || 'Batch update failed');
      }
      return response.json();
    },
    onSuccess: (result) => {
      // Invalidate managed creators list
      queryClient.invalidateQueries({ queryKey: managedCreatorsKeys.list(brandId) });

      // Check if any created/updated creators have social handles
      const allCreators = [...result.created, ...result.updated];
      const hasSocialHandles = allCreators.some((c) => c.tiktok_username || c.instagram_username);

      if (hasSocialHandles) {
        // Invalidate tracked accounts cache so new accounts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.accounts });
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.admin.accounts });
        if (brandId) {
          queryClient.invalidateQueries({
            queryKey: trackedAccountsKeys.admin.brandAccounts(brandId),
          });
        }

        // Invalidate posts cache so new posts appear
        queryClient.invalidateQueries({ queryKey: trackedAccountsKeys.analytics.posts });
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });
}

// Types for aggregate stats
export interface PlatformStats {
  views: number;
  posts: number;
  cpm: number | null;
}

export interface AggregateStatsData {
  all: PlatformStats;
  tiktok: PlatformStats;
  instagram: PlatformStats;
  meta: {
    totalCreators: number;
    creatorsWithPosts: number;
    totalBasePay: number;
  };
}

/**
 * Hook to fetch aggregate stats across all managed creators
 * Returns views, posts, and CPM for All, TikTok, and Instagram
 */
export function useAggregateStats() {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery({
    queryKey: managedCreatorsKeys.aggregateStats(brandId),
    queryFn: async () => {
      const response = await fetchWithContext('/api/managed-creators/aggregate-stats');
      if (!response.ok) {
        throw new Error('Failed to fetch aggregate stats');
      }
      return response.json() as Promise<AggregateStatsData>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =====================================================
// Creator-side hooks (for managed creators viewing their workspace)
// =====================================================

export interface ManagedCreatorStatusData {
  isManagedCreator: boolean;
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    status: string;
    videosComplete: boolean;
    sourced: string | null;
  }>;
  campaigns: Array<{
    id: string;
    jobId: string;
    jobSlug: string;
    jobTitle: string;
    brandId: string;
    brandSlug: string;
    brandName: string;
    brandLogo: string | null;
    cpmRate: number;
    cpmCap: number;
    status: string;
  }>;
}

/**
 * Hook to check if the current user is a managed creator.
 * Used by creators to see if they should have access to the Jobs workspace.
 *
 *
 * Caches for 5 min. Refetches on mount only when stale (fast sidebar nav).
 * Explicit invalidation after applying to a CPM job ensures fresh data.
 */
export function useManagedCreatorStatus() {
  const fetchWithContext = useFetchWithContext();

  return useQuery<ManagedCreatorStatusData>({
    queryKey: ['managed-creator-status'],
    queryFn: async () => {
      const response = await fetchWithContext('/api/creator/managed-status');
      if (!response.ok) {
        throw new Error('Failed to fetch managed creator status');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true, // override global false; refetch when stale but not on every mount
    refetchOnWindowFocus: false,
  });
}

// =====================================================
// Portal Campaign Workspace Hook
// =====================================================

export interface CampaignWorkspaceData {
  managedCreator: {
    id: string;
    status: string;
    videosComplete: boolean;
    tiktokUsername: string | null;
    youtubeUsername: string | null;
    instagramUsername: string | null;
    contractAcceptedAt: string | null;
    contractSignerName: string | null;
    contractVersion: string | null;
    basePay: number | null;
    monthlyPayoutCap: number | null;
    onboardingStartedAt: string | null;
  };
  org: {
    name: string;
    slug: string;
    logo: string | null;
    website: string | null;
  };
  targetCountry: string | null;
  portalConfig: PortalConfig | null;
  referenceVideos: BrandReferenceVideo[];
  briefVideos: BrandReferenceVideo[];
  trackedPlatforms: {
    tiktok: boolean;
    instagram: boolean;
    youtube: boolean;
  };
  previousAccounts: {
    tiktok: PreviousAccount[];
    instagram: PreviousAccount[];
    youtube: PreviousAccount[];
  };
  currency: string;
  resources: string | { title: string; url: string; description?: string }[];
}

export type { PreviousAccount } from './types';

export function useCampaignWorkspace(brandSlug: string | undefined) {
  const fetchWithContext = useFetchWithContext();

  return useQuery<CampaignWorkspaceData>({
    queryKey: ['campaign-workspace', brandSlug],
    queryFn: async () => {
      const response = await fetchWithContext(`/api/creator/workspace/${brandSlug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workspace data');
      }
      return response.json();
    },
    enabled: !!brandSlug,
    staleTime: 5 * 1000,
    refetchOnWindowFocus: true,
  });
}

// =====================================================
// CPM Campaign Hooks (for creator workspace)
// =====================================================

export interface CpmSubmissionRecord {
  id: string;
  videoUrl: string;
  platform: string;
  status: string;
  viewsAtSubmission: number;
  viewsCurrent: number;
  /** Total views approved by the brand - earnings are based on this */
  viewsApproved: number;
  earningsTotal: number;
  createdAt: string;
  fetchedAt: string | null;
  ineligibilityReason: string | null;
  lastFetchError: string | null;
  rejectionReason: string | null;
  thumbnail: string | null;
  caption: string | null;
}

export interface CpmCampaignDetails {
  jobId: string;
  jobSlug: string;
  jobTitle: string;
  jobDescription: string | null;
  industry: string | null;
  cpmRate: number;
  cpmCap: number;
  cpmBasePay: number;
  cpmPayoutThreshold: number;
  platforms: string[];
  currency: string;
  targetCountry: string | null;
  startDate: string | null;
  endDate: string | null;
  exclusivityTerms: string | null;
  usageRights: string | null;
  createdAt: string;
  updatedAt: string | null;
  brand: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  contentGuidelines: string | null;
  contentLinks: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
  }>;
  creatorStats: {
    totalViews: number;
    totalEarnings: number;
    submittedVideos: number;
    approvedVideos: number;
  };
  submissions: CpmSubmissionRecord[];
  baseCourseStatus: 'requested' | 'started' | 'completed' | null;
}

export const cpmCampaignKeys = {
  all: ['cpm-campaign'] as const,
  bySlug: (jobSlug: string) => [...cpmCampaignKeys.all, jobSlug] as const,
};

/**
 * Hook to fetch full CPM campaign details for the creator workspace.
 */
export function useCpmCampaignDetails(jobSlug: string) {
  const fetchWithContext = useFetchWithContext();

  return useQuery<CpmCampaignDetails>({
    queryKey: cpmCampaignKeys.bySlug(jobSlug),
    queryFn: async () => {
      const response = await fetchWithContext(`/api/creator/cpm-campaign/${jobSlug}`);
      if (!response.ok) {
        throw new Error('Failed to fetch campaign details');
      }
      return response.json();
    },
    enabled: !!jobSlug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to request the base pay course for a CPM campaign.
 * Updates the creator's base_course_status to 'requested'.
 */
export function useRequestBaseCourse(jobSlug: string) {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();

  return useMutation({
    mutationFn: async () => {
      const response = await fetchWithContext(`/api/creator/cpm-campaign/${jobSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_base_course' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to request course' }));
        throw new Error(error.error || 'Failed to request course');
      }
      return response.json() as Promise<{ success: boolean; baseCourseStatus: string }>;
    },
    onSuccess: (data) => {
      const validStatuses = ['requested', 'started', 'completed'] as const;
      
      if (validStatuses.includes(data.baseCourseStatus as any)) {
        queryClient.setQueryData<CpmCampaignDetails>(
          cpmCampaignKeys.bySlug(jobSlug),
          (old) => old ? { ...old, baseCourseStatus: data.baseCourseStatus as 'requested' | 'started' | 'completed' } : old
        );
      }
    },
  });
}

// =====================================================
// Task Management Hooks (for managed creators)
// =====================================================

export interface ManagedCreatorTasksData {
  managedCreatorId: string;
  onboardingStartedAt: string | null;
  deadlineExtensions: Record<string, number>;
  completedTasks: Record<string, string | null>;
  handles: {
    tiktok: string | null;
    instagram: string | null;
  };
  guideUrls: Record<string, string | undefined>;
  onboardingCallLink: string | null;
}

export const creatorTasksKeys = {
  all: ['creator-tasks'] as const,
  byBrand: (brandSlug: string) => [...creatorTasksKeys.all, brandSlug] as const,
};

/**
 * Hook to fetch task completion state for the current managed creator.
 * Used in the Jobs workspace to display task checklist.
 * Only fetches when brandSlug is provided (not for CPM campaigns).
 */
export function useManagedCreatorTasks(brandSlug: string) {
  const fetchWithContext = useFetchWithContext();

  return useQuery<ManagedCreatorTasksData>({
    queryKey: creatorTasksKeys.byBrand(brandSlug),
    queryFn: async () => {
      const response = await fetchWithContext(`/api/creator/tasks?brandSlug=${encodeURIComponent(brandSlug)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch task state');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds - tasks can change frequently
    enabled: !!brandSlug, // Don't fetch for CPM campaigns (empty brandSlug)
  });
}

export interface ToggleTaskPayload {
  managedCreatorId: string;
  taskId: string;
  completed: boolean;
  brandSlug: string;
}

/**
 * Hook to toggle task completion.
 * Validates dependencies and timing constraints on the server.
 *
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();

  return useMutation({
    mutationFn: async (data: ToggleTaskPayload) => {
      const response = await fetchWithContext(`/api/creator/tasks/${data.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managedCreatorId: data.managedCreatorId,
          completed: data.completed,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update task');
      }

      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate task state to refetch
      queryClient.invalidateQueries({
        queryKey: creatorTasksKeys.byBrand(variables.brandSlug),
      });
    },
  });
}

// =====================================================
// Extension Request Hooks
// =====================================================

export interface RequestExtensionPayload {
  managedCreatorId: string;
  taskId: string;
  reason: string;
  brandSlug: string;
}

/**
 * Hook to request a deadline extension for a task.
 * Auto-grants 6 hours and sends Slack notification to admin.
 *
 */
export function useRequestExtension() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();

  return useMutation({
    mutationFn: async (data: RequestExtensionPayload) => {
      const response = await fetchWithContext('/api/creator/tasks/request-extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managedCreatorId: data.managedCreatorId,
          taskId: data.taskId,
          reason: data.reason,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to request extension');
      }

      return result as { success: true; extensionHours: number; totalExtension: number; message: string };
    },
    onSuccess: (_, variables) => {
      // Invalidate task state to refetch with new extension
      queryClient.invalidateQueries({
        queryKey: creatorTasksKeys.byBrand(variables.brandSlug),
      });
    },
  });
}

// =====================================================
// Handle Management Hooks
// =====================================================

export interface UpdateHandlesPayload {
  managedCreatorId: string;
  tiktokUsername?: string;
  instagramUsername?: string;
  brandSlug: string;
}

/**
 * Hook to update TikTok and Instagram handles.
 * Used in the "Create Accounts" task.
 *
 */
export function useUpdateHandles() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();

  return useMutation({
    mutationFn: async (data: UpdateHandlesPayload) => {
      const response = await fetchWithContext('/api/creator/handles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managedCreatorId: data.managedCreatorId,
          tiktokUsername: data.tiktokUsername,
          instagramUsername: data.instagramUsername,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update handles');
      }

      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate task state to refetch handles
      queryClient.invalidateQueries({
        queryKey: creatorTasksKeys.byBrand(variables.brandSlug),
      });
    },
  });
}

// =====================================================
// Creator Video Management Hooks
// =====================================================

export interface CreatorVideoRecord {
  id: string;
  slotNumber: number;
  path: string;
  url: string | null;
  filename: string;
  createdAt: string;
}

export interface CreatorVideosData {
  videos: CreatorVideoRecord[];
  requiredCount: number;
  maxCount: number;
  managedCreatorId: string;
}

export const creatorVideosKeys = {
  all: ['creator-videos'] as const,
  byBrand: (brandSlug: string) => [...creatorVideosKeys.all, brandSlug] as const,
};

/**
 * Hook to fetch test videos for the current managed creator.
 *
 */
export function useCreatorTestVideos(brandSlug: string) {
  const fetchWithContext = useFetchWithContext();

  return useQuery<CreatorVideosData>({
    queryKey: creatorVideosKeys.byBrand(brandSlug),
    queryFn: async () => {
      const response = await fetchWithContext(`/api/creator/videos?brandSlug=${encodeURIComponent(brandSlug)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch videos');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!brandSlug, // Don't fetch for CPM campaigns (empty brandSlug)
  });
}

export interface UploadCreatorVideoPayload {
  file: File;
  brandSlug: string;
  slotNumber: number;
  onProgress?: (progress: number) => void;
}

export interface UploadCreatorVideoResult {
  id: string;
  slotNumber: number;
  path: string;
  url: string | null;
  filename: string;
  totalVideos: number;
  isComplete: boolean;
  replacedVideoPath: string | null;
}

// Store the current upload ID for abort capability
let currentCreatorVideoUploadId: string | null = null;

/**
 * Get the current upload ID (for abort functionality).
 */
export function getCurrentCreatorVideoUploadId(): string | null {
  return currentCreatorVideoUploadId;
}

/**
 * Hook to upload or replace a test video in a specific slot.
 * Uses the uploadQueue for robust uploads with retry logic, progress tracking, and PostHog analytics.
 * Bypasses Vercel's body size limit by uploading directly to Supabase Storage via signed URLs.
 * If the slot already has a video, it will be soft-deleted and the new video takes its place.
 *
 */
export function useUploadCreatorVideo() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();

  return useMutation({
    mutationFn: async (data: UploadCreatorVideoPayload): Promise<UploadCreatorVideoResult> => {
      const { file, brandSlug, slotNumber, onProgress } = data;

      // Validate file type client-side
      const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Allowed: MP4, MOV, WebM');
      }

      // Import uploadQueue dynamically to avoid SSR issues
      const { getUploadQueue } = await import('@/lib/utils/uploadQueue');
      const uploadQueue = getUploadQueue();

      // Maximum file size (500MB)
      const maxFileSize = 500 * 1024 * 1024;

      // Variable to store the result from onUploadComplete
      let uploadResult: UploadCreatorVideoResult | null = null;

      // Create a SignedUrlProvider that fetches fresh URLs for each attempt
      const signedUrlProvider = {
        bucket: 'managed-creators',
        getSignedUrl: async () => {
          const response = await fetchWithContext('/api/creator/videos/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandSlug,
              slotNumber,
              contentType: file.type,
            }),
          });

          if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Failed to get upload URL' }));
            throw new Error(error.error || 'Failed to get upload URL');
          }

          const { uploadUrl, path } = await response.json();
          return { uploadUrl, storagePath: path };
        },
        onUploadComplete: async (storagePath: string) => {
          // Save the record via API after successful upload
          const saveResponse = await fetchWithContext('/api/creator/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brandSlug,
              slotNumber,
              path: storagePath,
            }),
          });

          if (!saveResponse.ok) {
            const error = await saveResponse.json().catch(() => ({ error: 'Failed to save video record' }));
            throw new Error(error.error || 'Failed to save video record');
          }

          uploadResult = await saveResponse.json();
        },
      };

      // Enqueue the upload with the uploadQueue for robust handling
      const { uploadId, storagePath } = await uploadQueue.enqueueSignedUrlUpload(
        file,
        signedUrlProvider,
        {
          maxFileSize,
          onProgress: (_, progress) => {
            onProgress?.(progress);
          },
        }
      );

      // Store upload ID for abort capability
      currentCreatorVideoUploadId = uploadId;

      try {
        // Wait for the upload to complete
        await uploadQueue.waitForCompletion(uploadId);

        // Clear upload ID
        currentCreatorVideoUploadId = null;

        // Return the result from onUploadComplete callback
        if (!uploadResult) {
          // Fallback if onUploadComplete didn't populate result (shouldn't happen)
          return {
            id: '',
            slotNumber,
            path: storagePath,
            url: null,
            filename: storagePath.split('/').pop() || storagePath,
            totalVideos: 0,
            isComplete: false,
            replacedVideoPath: null,
          };
        }

        return uploadResult;
      } catch (error) {
        // Clear upload ID on error
        currentCreatorVideoUploadId = null;
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: creatorVideosKeys.byBrand(variables.brandSlug),
      });
      queryClient.invalidateQueries({
        queryKey: creatorTasksKeys.byBrand(variables.brandSlug),
      });
    },
  });
}

/**
 * Abort the current creator video upload if one is in progress.
 */
export async function abortCurrentCreatorVideoUpload(): Promise<void> {
  if (currentCreatorVideoUploadId) {
    const { getUploadQueue } = await import('@/lib/utils/uploadQueue');
    const uploadQueue = getUploadQueue();
    uploadQueue.abort(currentCreatorVideoUploadId);
    currentCreatorVideoUploadId = null;
  }
}

// Note: useDeleteCreatorVideo removed. Videos can only be replaced, not deleted.
// Use useUploadCreatorVideo with the same slotNumber to replace an existing video.

// =====================================================
// Brand Resources Hooks (Creator-facing)
// =====================================================

export type ResourceSource = 'template' | 'brand' | 'customized';

export interface BrandResource {
  id: string;
  title: string;
  description: string | null;
  url: string;
  resource_type: string;
  icon: string | null;
  order_index: number;
  is_required: boolean;
  source: ResourceSource;
  template_id: string | null;
  locked: boolean;
  unlock_after_task: string | null;
}

export interface BrandResourcesData {
  resources: BrandResource[];
  brandId: string;
}

export const brandResourcesKeys = {
  all: ['brand-resources'] as const,
  byBrand: (brandSlug: string) => [...brandResourcesKeys.all, brandSlug] as const,
};

/**
 * Hook to fetch brand resources for a managed creator.
 *
 */
export function useBrandResources(brandSlug: string) {
  const fetchWithContext = useFetchWithContext();

  return useQuery<BrandResourcesData>({
    queryKey: brandResourcesKeys.byBrand(brandSlug),
    queryFn: async () => {
      const response = await fetchWithContext(`/api/creator/resources?brandSlug=${encodeURIComponent(brandSlug)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch resources');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - resources don't change often
    enabled: !!brandSlug, // Don't fetch for CPM campaigns (empty brandSlug)
  });
}

// =====================================================
// Brand Guide Override Hooks (Admin-facing)
// =====================================================

export interface GuideOverride {
  key: string;
  title: string;
  description: string;
  url: string;
  defaultUrl: string;
  isCustomized: boolean;
}

export interface GuideOverridesData {
  guides: GuideOverride[];
}

export const guideOverridesKeys = {
  all: ['guide-overrides'] as const,
  byBrand: (brandId?: string | null) => [...guideOverridesKeys.all, brandId ?? 'current'] as const,
};

export const exampleVideosKeys = {
  all: ['example-videos'] as const,
  byBrand: (brandId?: string | null) => [...exampleVideosKeys.all, brandId ?? 'all'] as const,
};

/**
 * Hook to fetch guide URL overrides for a brand.
 * Used by brand admins to see and edit guide URLs.
 */
export function useBrandGuideOverrides() {
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useQuery<GuideOverridesData>({
    queryKey: guideOverridesKeys.byBrand(brandId),
    queryFn: async () => {
      const response = await fetchWithContext('/api/brand/guide-overrides');
      if (!response.ok) {
        throw new Error('Failed to fetch guide overrides');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export interface UpdateGuideOverridePayload {
  guideKey: string;
  url: string | null; // null to reset to default
}

/**
 * Hook to update a guide URL override.
 * Pass null as url to reset to default.
 */
export function useUpdateGuideOverride() {
  const queryClient = useQueryClient();
  const fetchWithContext = useFetchWithContext();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: UpdateGuideOverridePayload) => {
      const response = await fetchWithContext('/api/brand/guide-overrides', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update guide URL');
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate guide overrides to refetch
      queryClient.invalidateQueries({
        queryKey: guideOverridesKeys.byBrand(brandId),
      });
    },
  });
}

// =====================================================
// Example Videos Hooks
// =====================================================

export interface ExampleVideo {
  id: string;
  title: string;
  description: string | null;
  url: string;
  slot_number: number;
  source: 'template' | 'brand';
}

/**
 * Hook to fetch example videos for the test-videos task.
 * Returns platform templates merged with brand overrides.
 */
export function useExampleVideos(brandOrganizationId: string | undefined) {
  const fetchWithContext = useFetchWithContext();
  const { brandId: contextBrandId } = useViewAsContext();
  const effectiveBrandId = brandOrganizationId || contextBrandId;

  return useQuery<ExampleVideo[]>({
    queryKey: exampleVideosKeys.byBrand(effectiveBrandId),
    queryFn: async () => {
      const url = effectiveBrandId
        ? `/api/example-videos?brandId=${encodeURIComponent(effectiveBrandId)}`
        : '/api/example-videos';
      const response = await fetchWithContext(url);
      if (!response.ok) {
        throw new Error('Failed to fetch example videos');
      }
      const data = await response.json();
      return data.videos;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - example videos don't change often
  });
}

// =====================================================
// Admin Task Management Hooks
// =====================================================

export interface AdminToggleTaskPayload {
  managedCreatorId: string;
  taskId: string;
  completed: boolean;
}

/**
 * Hook for brand admins to toggle task completion.
 * Uses the server action directly (not the creator API).
 */
export function useAdminToggleTask() {
  const queryClient = useQueryClient();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: AdminToggleTaskPayload) => {
      // Import the action dynamically to avoid server/client bundling issues
      const { toggleTaskCompletion } = await import('./actions');
      // Convert to FormData for validatedActionWithUser
      const formData = new FormData();
      formData.set('managedCreatorId', data.managedCreatorId);
      formData.set('taskId', data.taskId);
      formData.set('completed', String(data.completed));
      // validatedActionWithUser expects (prevState, formData)
      const result = await toggleTaskCompletion({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate managed creators list to refetch updated data
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.list(brandId),
      });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
    },
  });
}

export interface GrantExtensionPayload {
  managedCreatorId: string;
  taskId: string;
  extraHours: number;
}

/**
 * Hook for admins to grant deadline extensions.
 */
export function useGrantTaskExtension() {
  const queryClient = useQueryClient();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: GrantExtensionPayload) => {
      const { grantTaskExtension } = await import('./actions');
      // Convert to FormData for validatedActionWithUser
      const formData = new FormData();
      formData.set('managedCreatorId', data.managedCreatorId);
      formData.set('taskId', data.taskId);
      formData.set('extraHours', String(data.extraHours));
      // validatedActionWithUser expects (prevState, formData)
      const result = await grantTaskExtension({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.list(brandId),
      });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
    },
  });
}

export interface UnlockTaskPayload {
  managedCreatorId: string;
  taskId: string;
}

/**
 * Hook for admins to immediately unlock a timing-locked task.
 * This backdates the previous task's completion time to satisfy the timing constraint.
 */
export function useUnlockTask() {
  const queryClient = useQueryClient();
  const { brandId } = useViewAsContext();

  return useMutation({
    mutationFn: async (data: UnlockTaskPayload) => {
      const { unlockTaskImmediately } = await import('./actions');
      const formData = new FormData();
      formData.set('managedCreatorId', data.managedCreatorId);
      formData.set('taskId', data.taskId);
      const result = await unlockTaskImmediately({}, formData);
      if ('error' in result) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.list(brandId),
      });
      queryClient.invalidateQueries({
        queryKey: managedCreatorsKeys.detail(variables.managedCreatorId, brandId),
      });
    },
  });
}
