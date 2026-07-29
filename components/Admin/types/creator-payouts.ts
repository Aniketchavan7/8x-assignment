// Platform is USD-only (single US Stripe account).
export interface CreatorPayoutData {
  id: string;
  display_name: string;
  profile_picture: string | null;
  user_id: string;
  email: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  stripe_payouts_enabled: boolean;
  stripe_balance: {
    available: number;
    pending: number;
  } | null;
  wallet_balance: number;
  wallet_pending: number;
}

export interface PayoutsResponse {
  creators: CreatorPayoutData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type StatusFilter = 'all' | 'connected' | 'not_connected' | 'payouts_enabled';
