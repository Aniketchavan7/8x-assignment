/**
 * Slack Channel IDs
 *
 * Centralized registry of all hardcoded Slack channel IDs.
 * For env-var-based channels (dev, users, messages), see client.ts.
 */

export const SLACK_CHANNELS = {
  /** #payments — payment triggers, payouts, add funds, post payments */
  PAYMENTS: 'C0AMT7729T5',
  /** #applications — creator applications and test video submissions */
  APPLICATIONS: 'C0AFDPX3XUK',
  /** #new-videos-to-review — managed creator post review notifications */
  VIDEO_REVIEWS: 'C0AMSTA1NDR',
  /** #messages — creator message replies (fallback for env var) */
  MESSAGES: 'C0ALY6R96EM',
  /** Admin OTP verification codes */
  ADMIN_OTP: 'C0A72T58R9P',
} as const;
