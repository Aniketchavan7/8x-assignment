export interface StatusBadgeConfig {
  label: string;
  bg: string;
  text: string;
  dot: string;
  /** Combined className for flat Badge usage (bg + text) */
  className: string;
}

export const REVIEW_STATUS_CONFIG: Record<string, StatusBadgeConfig> = {
  pending: { label: 'Pending', bg: 'bg-gray-50 dark:bg-gray-950/40', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-400', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  approved: { label: 'Approved', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400', className: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  needs_changes: { label: 'Needs Changes', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-400', className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};


// ============================================================================
// API Response Types
// ============================================================================

export interface PostReview {
  id: string;
  reviewer_type: string;
  reviewer_id: string | null;
  status: string;
  feedback: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users?: { email: string } | null;
}

export interface VideoReviewPost {
  id: string;
  managed_creator_id: string;
  post_id: string;
  review_status: string;
  review_status_updated_at: string | null;
  base_pay_cents: number;
  bonus_cents: number;
  total_owed_cents: number;
  total_paid_cents: number;
  payment_status: string;
  created_at: string;
  managed_creators: {
    id: string;
    name: string;
    slack_user_id: string | null;
    linked_user_id: string | null;
    job_id: string | null;
    brand_organization_id: string;
    brand_organizations: {
      id: string;
      organization_name: string;
    };
    jobs: {
      id: string;
      job_title: string;
      slack_channel_id: string | null;
    } | null;
  };
  posts: {
    id: string;
    platform: string;
    post_url: string;
    thumbnail_url: string | null;
    video_storage_url: string | null;
    caption: string | null;
    hashtags: string[] | string | null;
    posted_at: string | null;
    latest_views: number | null;
    latest_likes: number | null;
    latest_comments: number | null;
  };
  post_reviews: PostReview[];
}

export interface VideoReviewFeedbackItem {
  id: string;
  managed_creator_post_id: string;
  reviewer_type: string;
  reviewer_id: string | null;
  status: string;
  feedback: string | null;
  created_at: string;
  managed_creator_posts: {
    id: string;
    post_id: string;
    review_status: string;
    managed_creators: {
      id: string;
      name: string;
      job_id: string | null;
      brand_organization_id: string;
      brand_organizations: { organization_name: string };
      jobs: { job_title: string } | null;
    };
    posts: {
      id: string;
      platform: string;
      post_url: string;
      thumbnail_url: string | null;
      caption: string | null;
    };
  };
  users: { email: string } | null;
}
