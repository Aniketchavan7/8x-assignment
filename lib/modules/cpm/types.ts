import { Database } from '@/types/supabase';

export type CpmSubmission = Database['public']['Tables']['cpm_submissions']['Row'];
export type CpmSubmissionInsert = Database['public']['Tables']['cpm_submissions']['Insert'];
export type CpmSubmissionUpdate = Database['public']['Tables']['cpm_submissions']['Update'];
export type CpmSubmissionStatus = Database['public']['Enums']['cpm_submission_status'];

export interface CpmJob {
  id: string;
  job_title: string;
  job_type: 'cpm';
  status: string;
  cpm_rate: number;
  cpm_cap: number;
  cpm_base_pay: number;
  cpm_payout_threshold: number;
  cpm_platforms_allowed: string[];
  target_country: string | null;
  auto_approve_applications: boolean;
  brand_organization_id: string;
  brand_organization?: {
    name: string;
    logo_url: string | null;
  };
  /** Total budget allocated to this campaign in cents */
  budget_cents: number;
  /** Amount of budget spent on approved videos in cents */
  budget_spent_cents: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CpmSubmissionWithDetails extends CpmSubmission {
  /** Thumbnail URL from linked post */
  thumbnail_url: string | null;
  job: {
    id: string;
    job_title: string;
    cpm_rate: number;
    cpm_cap: number;
    cpm_base_pay: number;
    cpm_payout_threshold: number;
    brand_organization: {
      name: string;
      logo_url: string | null;
    };
  };
  creator_profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface CpmEnrollmentStatus {
  isEnrolled: boolean;
  activeJobCount: number;
  totalEarnings: number;
  pendingEarnings: number;
  activeCampaigns: Array<{
    jobId: string;
    jobTitle: string;
    submissionCount: number;
    totalViews: number;
    earnings: number;
  }>;
}

export interface CpmCampaignStats {
  jobId: string;
  jobTitle: string;
  totalCreators: number;
  totalSubmissions: number;
  pendingSubmissions: number;
  activeSubmissions: number;
  totalViewsEarned: number;
  totalEarnings: number;
  totalPaid: number;
}

export interface CreatorCpmEarnings {
  creatorProfileId: string;
  displayName: string;
  jobId: string;
  jobTitle: string;
  submissionCount: number;
  totalViews: number;
  totalEarned: number;
  totalPaid: number;
  unpaidBalance: number;
}

export interface SubmitCpmVideoInput {
  jobApplicationId: string;
  videoUrl: string;
  platform: 'tiktok' | 'instagram';
}

export interface ReviewCpmSubmissionInput {
  submissionId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
}

export interface CpmPayoutCalculation {
  submissionId: string;
  /** @deprecated Use viewsApproved instead */
  viewsCurrent: number;
  /** Total views approved by the brand - earnings are based on this */
  viewsEarned: number;
  cpmRate: number;
  cpmEarnings: number;
  basePay: number;
  totalEarnings: number;
  capReached: boolean;
  capAmount: number;
}

export const cpmKeys = {
  all: ['cpm'] as const,
  enrollment: () => [...cpmKeys.all, 'enrollment'] as const,
  campaigns: () => [...cpmKeys.all, 'campaigns'] as const,
  campaign: (jobId: string) => [...cpmKeys.campaigns(), jobId] as const,
  submissions: () => [...cpmKeys.all, 'submissions'] as const,
  submissionsByJob: (jobId: string) => [...cpmKeys.submissions(), 'job', jobId] as const,
  submissionsByCreator: (creatorId: string) =>
    [...cpmKeys.submissions(), 'creator', creatorId] as const,
  submission: (submissionId: string) => [...cpmKeys.submissions(), submissionId] as const,
  stats: () => [...cpmKeys.all, 'stats'] as const,
  statsByJob: (jobId: string) => [...cpmKeys.stats(), jobId] as const,
  earnings: () => [...cpmKeys.all, 'earnings'] as const,
  earningsByCreator: (creatorId: string) => [...cpmKeys.earnings(), creatorId] as const,
} as const;
