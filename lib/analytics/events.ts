/**
 * PostHog Event Names
 *
 * Centralized event naming for consistency across the application.
 */

/**
 * Error categories for structured error tracking.
 * Helps filter and analyze errors by system/domain.
 */
export const ErrorCategories = {
  /** Database/Supabase errors */
  DATABASE: 'database',
  /** Stripe payment errors */
  STRIPE: 'stripe',
  /** TikTok API errors */
  TIKTOK_API: 'tiktok_api',
  /** Instagram API errors */
  INSTAGRAM_API: 'instagram_api',
  /** Authentication/authorization errors */
  AUTH: 'auth',
  /** File/media upload errors */
  UPLOAD: 'upload',
  /** Input validation errors */
  VALIDATION: 'validation',
  /** Other external API errors */
  EXTERNAL_API: 'external_api',
  /** Uncategorized errors */
  UNKNOWN: 'unknown',
} as const;

export type ErrorCategory = (typeof ErrorCategories)[keyof typeof ErrorCategories];

/**
 * Error severity levels.
 * Helps prioritize errors and filter noise.
 */
export const ErrorSeverity = {
  /** Something broke - action required */
  ERROR: 'error',
  /** Degraded but working - monitor */
  WARNING: 'warning',
  /** Notable but not a problem - informational */
  INFO: 'info',
} as const;

export type ErrorSeverityLevel = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

export const PostHogEvents = {
  // Auth Events
  USER_SIGNED_IN: 'user_signed_in',
  USER_SIGNED_UP: 'user_signed_up',
  USER_SIGNED_OUT: 'user_signed_out',

  // Team Events
  TEAM_CREATED: 'team_created',
  TEAM_MEMBER_INVITED: 'team_member_invited',
  INVITATION_ACCEPTED: 'invitation_accepted',

  // Checkout Events
  CHECKOUT_INITIATED: 'checkout_initiated',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_CANCELLED: 'checkout_cancelled',

  // Navigation Events
  PAGE_VIEWED: 'page_viewed',
  LINK_CLICKED: 'link_clicked',
  BUTTON_CLICKED: 'button_clicked',
  NAVIGATION_TOGGLE: 'navigation_toggled',

  // Form Events
  FORM_STARTED: 'form_started',
  FORM_SUBMITTED: 'form_submitted',
  FORM_FIELD_FOCUSED: 'form_field_focused',

  // Dashboard Events
  DASHBOARD_VIEWED: 'dashboard_viewed',
  DASHBOARD_SECTION_VIEWED: 'dashboard_section_viewed',

  // Pricing Events
  PRICING_PAGE_VIEWED: 'pricing_page_viewed',
  PRICING_PLAN_VIEWED: 'pricing_plan_viewed',
  PRICING_CTA_CLICKED: 'pricing_cta_clicked',

  // Language Events
  LANGUAGE_CHANGED: 'language_changed',

  // User Menu Events
  USER_MENU_OPENED: 'user_menu_opened',
  USER_MENU_CLICKED: 'user_menu_clicked',

  // Error Events
  CLIENT_ERROR: 'client_error',
  SERVER_ERROR: 'server_error',
  ERROR_CAPTURED: 'error_captured', // New unified error event with categories
  PAGE_NOT_FOUND: 'page_not_found',

  // CPM FAQ Events
  CPM_FAQ_SCROLL_BUTTON_CLICKED: 'cpm_faq_scroll_button_clicked',
  CPM_FAQ_ITEM_EXPANDED: 'cpm_faq_item_expanded',
  CPM_FAQ_ITEM_COLLAPSED: 'cpm_faq_item_collapsed',

  // Upload Events (videos and photos)
  UPLOAD_STARTED: 'upload_started',
  UPLOAD_PROGRESS: 'upload_progress',
  UPLOAD_COMPLETED: 'upload_completed',
  UPLOAD_FAILED: 'upload_failed',
  UPLOAD_RETRYING: 'upload_retrying',
  UPLOAD_ABORTED: 'upload_aborted',
  UPLOAD_CACHE_HIT: 'upload_cache_hit',
  UPLOAD_TUS_STARTED: 'upload_tus_started',
  UPLOAD_TUS_RESUMED: 'upload_tus_resumed',
  UPLOAD_VALIDATION_FAILED: 'upload_validation_failed',

  // Job Application Events
  JOB_APPLICATION_SUBMITTED: 'job_application_submitted',
  JOB_APPLICATION_AUTO_APPROVED: 'job_application_auto_approved',

  // Payment Transaction Events (for dashboard metrics)
  DEPOSIT_COMPLETED: 'deposit_completed',
  TRANSFER_COMPLETED: 'transfer_completed',
  TRANSFER_FAILED: 'transfer_failed',
  PAYOUT_COMPLETED: 'payout_completed',
  PAYOUT_FAILED: 'payout_failed',

  // Business Flow Events (for metrics dashboard)
  JOB_CREATED: 'job_created',
  JOB_APPLICATION_STATUS_CHANGED: 'job_application_status_changed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  MESSAGE_SENT: 'message_sent',
  SOCIAL_ACCOUNT_CONNECTED: 'social_account_connected',
} as const;

export type PostHogEventName = (typeof PostHogEvents)[keyof typeof PostHogEvents];
