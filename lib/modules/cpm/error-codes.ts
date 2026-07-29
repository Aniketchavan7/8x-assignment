/**
 * Error codes for CPM video submission.
 * These codes are returned from server actions and translated on the client.
 */
export const CPM_ERROR_CODES = {
  // Submission errors
  RATE_LIMITED: 'rate_limited',
  INVALID_VIDEO_URL: 'invalid_video_url',
  CAMPAIGN_NOT_FOUND: 'campaign_not_found',
  NOT_CPM_CAMPAIGN: 'not_cpm_campaign',
  CAMPAIGN_NOT_PUBLISHED: 'campaign_not_published',
  BUDGET_EXHAUSTED: 'budget_exhausted',
  PROFILE_NOT_FOUND: 'profile_not_found',
  NOT_ENROLLED: 'not_enrolled',
  WRONG_PLATFORM: 'wrong_platform',
  VIDEO_ALREADY_SUBMITTED_GLOBAL: 'video_already_submitted_global',
  VIDEO_ALREADY_SUBMITTED_CAMPAIGN: 'video_already_submitted_campaign',
  SUBMISSION_FAILED: 'submission_failed',

  // Ineligibility reasons
  VIDEO_TOO_OLD: 'video_too_old',
  VIDEO_INELIGIBLE: 'video_ineligible',
} as const;

export type CpmErrorCode = typeof CPM_ERROR_CODES[keyof typeof CPM_ERROR_CODES];

/**
 * Error response from CPM actions that uses error codes.
 * The errorCode can be translated on the client side.
 * The error field contains a fallback English message.
 */
export interface CpmErrorResponse {
  error: string;
  errorCode: CpmErrorCode;
  errorParams?: Record<string, string | number>;
}

/**
 * Check if an error response has an error code.
 */
export function hasCpmErrorCode(
  result: { error?: string; errorCode?: CpmErrorCode }
): result is CpmErrorResponse {
  return 'errorCode' in result && result.errorCode !== undefined;
}
