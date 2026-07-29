export type {
  CpmSubmission,
  CpmSubmissionInsert,
  CpmSubmissionUpdate,
  CpmSubmissionStatus,
  CpmJob,
  CpmSubmissionWithDetails,
  CpmEnrollmentStatus,
  CpmCampaignStats,
  CreatorCpmEarnings,
  SubmitCpmVideoInput,
  ReviewCpmSubmissionInput,
  CpmPayoutCalculation,
} from './types';

export { cpmKeys } from './types';

// URL Parser
export {
  parseVideoUrl,
  validateVideoUrlForPlatform,
  isSupportedPlatformUrl,
  getPlatformFromUrl,
  normalizeVideoUrl,
  getVideoIdFromUrl,
  type SupportedPlatform,
  type ParsedVideoUrl,
  type VideoUrlValidationResult,
} from './url-parser';

// Utilities
export {
  calculateCpmEarnings,
  calculateSubmissionPayout,
  formatEarnings,
  formatViews,
  formatCpmRate,
  hasReachedCap,
  getRemainingBeforeCap,
  viewsNeededForAmount,
  getSubmissionStatusInfo,
  isEligibleForPayout,
  getPayoutProgress,
} from './utils';

// Queries (server-side)
export {
  getCpmEnrollmentStatus,
  getAvailableCpmJobs,
  getBrandCpmJobs,
  getCpmJobById,
  getJobCpmSubmissions,
  getPendingCpmSubmissions,
  getCpmSubmissionById,
  getCpmCampaignStats,
} from './queries';

// Actions (server-side)
export {
  createCpmCampaign,
  submitCpmVideo,
  reviewCpmSubmission,
  approveAdditionalViews,
  applyToCpmJob,
  cancelCpmSubmission,
  type CreateCpmCampaignResult,
  type SubmitCpmVideoResult,
  type ReviewCpmSubmissionResult,
  type ApproveAdditionalViewsResult,
  type ApplyToCpmJobResult,
  type CancelCpmSubmissionResult,
} from './actions';

// Hooks (client-side)
export {
  useCpmEnrollmentStatus,
  useAvailableCpmCampaigns,
  useCpmCampaign,
  useSubmitCpmVideo,
  useApplyToCpmCampaign,
  useCancelCpmSubmission,
  useJobCpmSubmissions,
  usePendingCpmSubmissions,
  useReviewCpmSubmission,
  useApproveAdditionalViews,
  useCpmCampaignStats,
  useBrandCpmJobs,
} from './hooks';

// Payouts (server-side)
export {
  processCpmSubmissionPayout,
  getCpmPayoutHistory,
  getCreatorUnpaidCpmTotal,
  getUnpaidCpmSubmissions,
  type ProcessCpmPayoutResult,
  type CpmPayoutRecord,
  type CreatorUnpaidCpmSummary,
} from './payouts';

// Budget Actions (server-side)
export {
  getCpmCampaignBudget,
  fundCpmCampaign,
  withdrawCpmBudget,
  publishCpmCampaign,
  type CpmCampaignBudget,
  type GetCpmCampaignBudgetResult,
  type FundCpmCampaignResult,
  type WithdrawCpmBudgetResult,
  type PublishCpmCampaignResult,
} from './budget-actions';

// Constants & Budget Helpers
export {
  CPM_DEFAULTS,
  CPM_RATE_LIMITS,
  CPM_BUDGET,
  calculateDelistThreshold,
  wouldDelistCampaign,
} from './constants';
