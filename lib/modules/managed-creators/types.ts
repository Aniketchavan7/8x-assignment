import type { Database } from '@/types/supabase';

type ManagedCreatorRow = Database['public']['Tables']['managed_creators']['Row'];

export interface ManagedCreator extends ManagedCreatorRow {
  /** @deprecated Use tiktok_username instead */
  collected_tiktok_url: string | null;
  /** @deprecated Use instagram_username instead */
  collected_instagram_url: string | null;
  /** @deprecated Manual field — will be replaced by computed analytics */
  tiktok_performance: number | null;
  /** @deprecated Manual field — will be replaced by computed analytics */
  instagram_performance: number | null;
}

/**
 * One row in a managed creator's account-replacement history. Sourced from
 * `social_accounts` rows where `status = 'replaced'` and account_type is
 * 'personal' or 'brand_owned', joined to the platform table for the username.
 *
 * Lives here (not in hooks.ts) because the workspace API route needs to
 * import this type, and hooks.ts is a client-only module.
 */
export interface PreviousAccount {
  id: string;
  username: string;
  endedAt: string | null;
  endedReason: string | null;
}
