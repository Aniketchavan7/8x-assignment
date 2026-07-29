import { cache } from 'react';
import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import { getCreatorSocialAccounts as getCreatorSocialAccountsFromConnector } from '@/lib/db/social-accounts';

/**
 * Get complete creator profile data including all related information.
 * Returns null if the user is not a creator or profile doesn't exist.
 *
 * Includes:
 * - Basic profile information (name, bio, photo, etc.)
 * - Social accounts (Instagram, TikTok, YouTube, LinkedIn)
 * - Interests
 * - Top posts (including intro video)
 */
export const getCreatorProfile = cache(async function getCreatorProfile(userId: string) {
  // Use authenticated client to respect RLS policies
  const supabase = await createAuthenticatedSupabaseClient();

  // Get creator profile
  const { data: profile, error: profileError } = await supabase
    .from('creator_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  // Get social accounts from new connector table, filtered by personal accounts
  const unifiedAccounts = await getCreatorSocialAccountsFromConnector(supabase, profile.id);
  const personalAccounts = unifiedAccounts.filter((acc) => acc.accountType === 'personal');

  // Map to legacy format for backwards compatibility
  const socialAccounts = personalAccounts.map((acc) => ({
    id: acc.id,
    creator_profile_id: profile.id,
    platform: acc.platform,
    username: acc.username,
    profile_url: acc.profileUrl ?? '',
    account_type: 'personal' as const,
    account_status: (acc.isActive ? 'active' : 'inactive') as
      | 'active'
      | 'suspended'
      | 'inactive'
      | 'deleted'
      | null,
    is_business_account: false,
    job_id: null,
    last_synced_at: null,
    is_verified: acc.isVerified ?? false,
    created_at: acc.createdAt ?? null,
    updated_at: acc.updatedAt ?? null,
  }));

  // Interests are now stored as an enum array in creator_profiles, not in a separate table
  // Map the interests array to the expected format
  const interests = (profile.interests || []).map((interest) => ({
    interest: interest as string,
  }));
  const profileWithTypes = {
    ...profile,
    intro_video_url: (profile as { intro_video_url?: string | null }).intro_video_url ?? null,
    social_links:
      (profile.social_links as Array<{
        platform: string;
        username?: string | null;
        profile_url?: string | null;
      }> | null) ?? null,
  };

  return {
    profile: profileWithTypes,
    socialAccounts: socialAccounts || [],
    interests,
  };
});

/**
 * Get creator's social accounts.
 */
export async function getCreatorSocialAccounts(creatorProfileId: string) {
  const supabase = await createAuthenticatedSupabaseClient();

  // Get social accounts from new connector table
  const unifiedAccounts = await getCreatorSocialAccountsFromConnector(supabase, creatorProfileId);

  // Filter to personal, active accounts and map to legacy format
  return unifiedAccounts
    .filter((acc) => acc.accountType === 'personal' && acc.isActive)
    .map((acc) => ({
      id: acc.id,
      creator_profile_id: acc.creatorProfileId,
      platform: acc.platform,
      username: acc.username,
      profile_url: acc.profileUrl,
      account_type: acc.accountType,
      account_status: acc.isActive ? 'active' : 'inactive',
      is_business_account: false,
      job_id: null,
      last_synced_at: null,
      is_verified: acc.isVerified ?? false,
      created_at: acc.createdAt,
      updated_at: acc.updatedAt,
    }));
}

/**
 * Get creator's country for job filtering.
 * Uses creator_profiles.location as primary, falls back to users.country.
 * Returns null if no country can be determined.
 */
export async function getCreatorCountry(userId: string): Promise<string | null> {
  const supabase = await createAuthenticatedSupabaseClient();

  const { data: profile, error } = await supabase
    .from('creator_profiles')
    .select('location, users!user_id(country)')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected for non-creators)
    console.error('[getCreatorCountry] Failed to fetch creator profile:', error);
  }

  if (!profile) return null;

  const userRecord = profile.users as { country: string | null } | null;
  return profile.location || userRecord?.country || null;
}
