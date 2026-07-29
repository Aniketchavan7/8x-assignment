/**
 * Shared module for reading and writing to brand_tracked_social_accounts
 * This is the unified table that supports both TikTok and Instagram accounts.
 *
 * All routes should use these functions instead of directly querying the table
 * to ensure consistent behavior.
 *
 * NOTE: This module is being migrated to use social_accounts connector table.
 * New links will populate social_account_connector_id in addition to legacy columns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@/lib/analytics/types';
import { getSocialAccountByPlatformId, createSocialAccountLink } from '@/lib/db/social-accounts';

// =====================================================
// TYPES
// =====================================================

/**
 * Input for linking a social account to a brand
 */
export type LinkSocialAccountInput = {
  brandOrganizationId: string;
  socialAccountId: string;
  platform: SocialPlatform;
  campaign?: string;
  /** Account type for the social_accounts connector. Defaults to 'tracked_only'. */
  accountType?: SocialAccountType;
};

/**
 * Result of a link operation
 */
export type LinkResult = {
  success: boolean;
  isNewLink: boolean;
  error?: string;
  connectorId?: string;
};

/**
 * Social account ownership type from social_accounts connector
 * Named "SocialAccountType" to distinguish from user account_type ('creator' | 'brand_member' | 'admin')
 */
export type SocialAccountType = 'personal' | 'brand_owned' | 'tracked_only' | 'listening_passive';

/**
 * Tracked account info from the unified table
 */
export type TrackedSocialAccountInfo = {
  id: string;
  socialAccountId: string;
  platform: SocialPlatform;
  campaign: string;
  brandOrganizationId: string;
  createdAt: string | null;
  socialAccountType?: SocialAccountType;
};

/**
 * Options for fetching tracked accounts
 */
export type FetchTrackedAccountsOptions = {
  brandOrganizationId?: string;
  platform?: SocialPlatform;
  campaign?: string;
};

// =====================================================
// WRITE OPERATIONS
// =====================================================

/**
 * Links a social account to a brand via the connector table.
 *
 * @param supabase - Supabase client (authenticated or service role)
 * @param input - Link parameters
 * @returns Result indicating success/failure and whether it's a new link
 */
export async function linkSocialAccountToBrand(
  supabase: SupabaseClient,
  input: LinkSocialAccountInput
): Promise<LinkResult> {
  const { brandOrganizationId, socialAccountId, platform, campaign = 'general', accountType = 'tracked_only' } = input;
  const normalizedCampaign = campaign.trim().toLowerCase() || 'general';

  try {
    // Look up the social_accounts connector entry for this platform account
    let connectorEntry = await getSocialAccountByPlatformId(
      supabase,
      platform as 'tiktok' | 'instagram' | 'youtube',
      socialAccountId
    );

    // If connector exists but is 'personal', upgrade it so the account isn't
    // filtered out of the brand's tracked accounts grid.
    if (connectorEntry && connectorEntry.account_type === 'personal' && accountType !== 'personal') {
      await supabase
        .from('social_accounts')
        .update({ account_type: accountType })
        .eq('id', connectorEntry.id);
    }

    // Auto-create connector if it doesn't exist (handles legacy accounts and new accounts
    // that were created directly in platform tables without a connector entry)
    if (!connectorEntry) {
      console.log('[TrackedSocialAccounts] No connector found, creating one for:', socialAccountId);
      connectorEntry = await createSocialAccountLink(supabase, {
        platform: platform as 'tiktok' | 'instagram' | 'youtube',
        platformAccountId: socialAccountId,
        accountType,
      });

      if (!connectorEntry) {
        console.error(
          '[TrackedSocialAccounts] Failed to create connector for platform account:',
          socialAccountId
        );
        return {
          success: false,
          isNewLink: false,
          error: 'Failed to create connector entry for platform account',
        };
      }
    }

    // Check if link already exists via connector (one row per brand+connector)
    const { data: existingLink } = await supabase
      .from('brand_tracked_social_accounts')
      .select('id')
      .eq('brand_organization_id', brandOrganizationId)
      .eq('social_account_connector_id', connectorEntry.id)
      .maybeSingle();

    if (existingLink) {
      return { success: true, isNewLink: false, connectorId: connectorEntry.id };
    }

    // Insert new link using connector FK only
    // Explicitly set frozen: false to ensure new accounts are always unfrozen
    const { error: insertError } = await supabase.from('brand_tracked_social_accounts').insert({
      brand_organization_id: brandOrganizationId,
      social_account_connector_id: connectorEntry.id,
      campaign: normalizedCampaign,
      frozen: false,
    });

    if (insertError && insertError.code !== '23505') {
      console.error('[TrackedSocialAccounts] Error inserting link:', insertError);
      return {
        success: false,
        isNewLink: false,
        error: 'Failed to link account to brand',
      };
    }

    return { success: true, isNewLink: true, connectorId: connectorEntry.id };
  } catch (error) {
    console.error('[TrackedSocialAccounts] Unexpected error linking account:', error);
    return {
      success: false,
      isNewLink: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * After tracking an account for a brand, check if it matches a managed creator's
 * username and link the platform FK + connector managed_creator_id if so.
 * This ensures the create_managed_creator_post DB trigger can match new posts
 * to managed creators for payment tracking.
 *
 * Fire-and-forget: logs errors but never throws.
 */
export async function linkTrackedAccountToManagedCreator(
  supabase: SupabaseClient,
  opts: {
    brandOrganizationId: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    platformAccountId: string;
    username: string;
    socialAccountConnectorId: string;
  }
): Promise<void> {
  const { brandOrganizationId, platform, platformAccountId, username, socialAccountConnectorId } = opts;

  const usernameColumn = platform === 'tiktok'
    ? 'tiktok_username'
    : platform === 'instagram'
      ? 'instagram_username'
      : 'youtube_username';

  const fkColumn = platform === 'tiktok'
    ? 'tiktok_account_id'
    : platform === 'instagram'
      ? 'instagram_account_id'
      : 'youtube_account_id';

  try {
    // Find a managed creator for this brand with matching username and no existing FK
    const { data: mc, error: mcError } = await supabase
      .from('managed_creators')
      .select('id, job_id')
      .eq('brand_organization_id', brandOrganizationId)
      .ilike(usernameColumn, username)
      .is(fkColumn, null)
      .not('status', 'in', '("dropped","rejected")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mcError) {
      console.error('[linkTrackedAccountToMC] Error finding managed creator:', mcError);
      return;
    }

    if (!mc) return;

    // Set the platform FK on managed_creators
    const { error: mcUpdateError } = await supabase
      .from('managed_creators')
      .update({ [fkColumn]: platformAccountId })
      .eq('id', mc.id);

    if (mcUpdateError) {
      console.error('[linkTrackedAccountToMC] Error updating managed creator FK:', mcUpdateError);
      return;
    }

    // Set managed_creator_id and account_type on the social_accounts connector
    const { error: connectorError } = await supabase
      .from('social_accounts')
      .update({ managed_creator_id: mc.id, account_type: 'brand_owned' })
      .eq('id', socialAccountConnectorId)
      .is('managed_creator_id', null);

    if (connectorError) {
      console.error('[linkTrackedAccountToMC] Error updating connector:', connectorError);
      return;
    }

    console.log('[linkTrackedAccountToMC] Linked', platform, 'account to MC:', mc.id);

    // Best-effort: resolve BTSA campaign from managed_creator → job → target_country
    // This handles the timing gap where the INSERT trigger couldn't resolve because
    // managed_creator_id wasn't set on the connector yet.
    try {
      if (mc.job_id) {
        const { data: job } = await supabase
          .from('jobs')
          .select('target_country')
          .eq('id', mc.job_id)
          .not('target_country', 'is', null)
          .maybeSingle();

        if (job?.target_country) {
          const { data: iso } = await supabase
            .from('country_iso_lookup')
            .select('iso_code')
            .eq('country_name', job.target_country)
            .maybeSingle();

          if (iso?.iso_code) {
            const { error: updateError } = await supabase
              .from('brand_tracked_social_accounts')
              .update({ campaign: iso.iso_code })
              .eq('social_account_connector_id', socialAccountConnectorId)
              .eq('brand_organization_id', brandOrganizationId)
              .eq('campaign', 'general');

            if (updateError) {
              console.error('[linkTrackedAccountToMC] Failed to update campaign:', updateError);
            } else {
              console.log(`[linkTrackedAccountToMC] Resolved campaign to ${iso.iso_code} for connector ${socialAccountConnectorId}`);
            }
          }
        }
      }
    } catch (campaignError) {
      console.error('[linkTrackedAccountToMC] Campaign resolution failed (non-fatal):', campaignError);
    }
  } catch (error) {
    console.error('[linkTrackedAccountToMC] Unexpected error:', error);
  }
}

/**
 * Removes a social account from brand tracking via connector.
 * Deletes the single BTSA row for this (brand, connector) pair.
 *
 * @param supabase - Supabase client (authenticated or service role)
 * @param brandOrganizationId - Brand organization ID
 * @param socialAccountId - Platform account ID to unlink
 * @param platform - Platform type
 * @returns Result indicating success/failure
 */
export async function unlinkSocialAccountFromBrand(
  supabase: SupabaseClient,
  brandOrganizationId: string,
  socialAccountId: string,
  platform: SocialPlatform
): Promise<{ success: boolean; error?: string }> {
  try {
    // Look up the connector entry for this platform account
    const connectorEntry = await getSocialAccountByPlatformId(supabase, platform, socialAccountId);

    if (!connectorEntry) {
      // No connector means nothing to unlink
      return { success: true };
    }

    // Delete the single BTSA row
    const { error: deleteError } = await supabase
      .from('brand_tracked_social_accounts')
      .delete()
      .eq('brand_organization_id', brandOrganizationId)
      .eq('social_account_connector_id', connectorEntry.id);

    if (deleteError) {
      console.error('[TrackedSocialAccounts] Error deleting link:', deleteError);
      return { success: false, error: 'Failed to unlink account' };
    }

    // Check if the platform account is now completely orphaned (no BTSA references remain)
    const { count, error: countError } = await supabase
      .from('brand_tracked_social_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('social_account_connector_id', connectorEntry.id);

    if (countError || count === null) {
      console.error('[TrackedSocialAccounts] Failed to check orphan status:', countError);
      return { success: true }; // BTSA deleted OK — orphan check is best-effort
    }

    if (count === 0) {
      // No brand tracks this account anymore — check managed_creators too
      const platformAccountId =
        platform === 'tiktok'
          ? connectorEntry.tiktok_account_id
          : platform === 'youtube'
            ? connectorEntry.youtube_account_id
            : connectorEntry.instagram_account_id;

      const mcColumn =
        platform === 'tiktok'
          ? 'tiktok_account_id'
          : platform === 'youtube'
            ? 'youtube_account_id'
            : 'instagram_account_id';

      const { count: mcCount, error: mcError } = await supabase
        .from('managed_creators')
        .select('id', { count: 'exact', head: true })
        .eq(mcColumn, platformAccountId);

      if (!mcError && mcCount === 0) {
        // Fully orphaned — disable sync (dual-write for column migration)
        const table =
          platform === 'tiktok'
            ? 'tiktok_accounts'
            : platform === 'youtube'
              ? 'youtube_accounts'
              : 'instagram_accounts';

        await supabase
          .from(table)
          .update({ tracking_status: 'disabled', tracking_disabled: true })
          .eq('id', platformAccountId);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[TrackedSocialAccounts] Unexpected error unlinking account:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// READ OPERATIONS
// =====================================================

/**
 * Fetches all tracked social accounts for a brand via the connector table.
 * One BTSA row per (brand, connector) — no grouping needed.
 *
 * @param supabase - Supabase client (authenticated or service role)
 * @param options - Filter options
 * @returns Map of account IDs to their tracking info, grouped by platform
 */
export async function fetchTrackedSocialAccounts(
  supabase: SupabaseClient,
  options: FetchTrackedAccountsOptions
): Promise<{
  accountsByPlatform: Map<SocialPlatform, Map<string, TrackedSocialAccountInfo>>;
  error?: string;
}> {
  const { brandOrganizationId, platform, campaign } = options;

  try {
    // Query via connector FK with join to social_accounts
    let query = supabase
      .from('brand_tracked_social_accounts')
      .select(
        `
        id,
        campaign,
        brand_organization_id,
        created_at,
        social_accounts!brand_tracked_social_accounts_social_account_connector_id_fkey (
          id,
          tiktok_account_id,
          instagram_account_id,
          youtube_account_id,
          account_type
        )
      `
      )
      .not('social_account_connector_id', 'is', null);

    if (brandOrganizationId) {
      query = query.eq('brand_organization_id', brandOrganizationId);
    }

    if (campaign) {
      query = query.eq('campaign', campaign.toLowerCase());
    }

    const { data: trackedAccounts, error: trackingError } = await query;

    if (trackingError) {
      console.error('[TrackedSocialAccounts] Error fetching tracked accounts:', trackingError);
      return {
        accountsByPlatform: new Map(),
        error: 'Failed to fetch tracked accounts',
      };
    }

    // Group by platform and account ID
    const accountsByPlatform = new Map<SocialPlatform, Map<string, TrackedSocialAccountInfo>>();

    if (trackedAccounts && trackedAccounts.length > 0) {
      for (const ta of trackedAccounts) {
        // Type assertion: FK relationship returns single object, not array
        const connector = ta.social_accounts as unknown as {
          id: string;
          tiktok_account_id: string | null;
          instagram_account_id: string | null;
          youtube_account_id: string | null;
          account_type: SocialAccountType | null;
        } | null;
        if (!connector) continue;

        // Exclude personal accounts — only tracked_only, brand_owned, and listening_passive
        if (connector.account_type === 'personal') continue;

        const plat: SocialPlatform = connector.tiktok_account_id
          ? 'tiktok'
          : connector.youtube_account_id
          ? 'youtube'
          : 'instagram';
        const socialAccountId = (
          connector.tiktok_account_id ||
          connector.youtube_account_id ||
          connector.instagram_account_id
        ) as string;

        // Skip if platform filter doesn't match
        if (platform && plat !== platform) continue;

        if (!accountsByPlatform.has(plat)) {
          accountsByPlatform.set(plat, new Map());
        }
        const platformMap = accountsByPlatform.get(plat)!;

        platformMap.set(socialAccountId, {
          id: ta.id,
          socialAccountId,
          platform: plat,
          campaign: ta.campaign || 'general',
          brandOrganizationId: ta.brand_organization_id,
          createdAt: ta.created_at,
          socialAccountType: connector.account_type || undefined,
        });
      }
    }

    return { accountsByPlatform };
  } catch (error) {
    console.error('[TrackedSocialAccounts] Unexpected error fetching accounts:', error);
    return {
      accountsByPlatform: new Map(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetches tracked platform account IDs for a brand via the connector.
 * Simpler helper for routes that just need account IDs grouped by platform.
 *
 * @param supabase - Supabase client
 * @param brandOrganizationId - Brand organization ID
 * @param options - Optional filters
 * @returns Platform account IDs grouped by platform, plus campaign mapping and frozen status
 */
export async function fetchTrackedPlatformAccountIds(
  supabase: SupabaseClient,
  brandOrganizationId: string,
  options?: { platform?: SocialPlatform; campaign?: string }
): Promise<{
  tiktokIds: string[];
  instagramIds: string[];
  youtubeIds: string[];
  accountCampaignMap: Map<string, string>;
  accountCreatedAtMap: Map<string, string | null>;
  error?: string;
}> {
  try {
    let query = supabase
      .from('brand_tracked_social_accounts')
      .select(
        `
        campaign,
        created_at,
        social_accounts!brand_tracked_social_accounts_social_account_connector_id_fkey (
          tiktok_account_id,
          instagram_account_id,
          youtube_account_id,
          account_type
        )
      `
      )
      .eq('brand_organization_id', brandOrganizationId)
      .not('social_account_connector_id', 'is', null);

    if (options?.campaign) {
      query = query.eq('campaign', options.campaign.toLowerCase());
    }

    const { data: trackedAccounts, error: trackingError } = await query;

    if (trackingError) {
      console.error('[TrackedSocialAccounts] Error fetching platform IDs:', trackingError);
      return {
        tiktokIds: [],
        instagramIds: [],
        youtubeIds: [],
        accountCampaignMap: new Map(),
        accountCreatedAtMap: new Map(),
        error: 'Failed to fetch tracked accounts',
      };
    }

    const tiktokIds: string[] = [];
    const instagramIds: string[] = [];
    const youtubeIds: string[] = [];
    const accountCampaignMap = new Map<string, string>();
    const accountCreatedAtMap = new Map<string, string | null>();
    if (trackedAccounts) {
      for (const ta of trackedAccounts) {
        // Type assertion: FK relationship returns single object, not array
        const connector = ta.social_accounts as unknown as {
          tiktok_account_id: string | null;
          instagram_account_id: string | null;
          youtube_account_id: string | null;
          account_type: SocialAccountType | null;
        } | null;
        if (!connector) continue;

        // Exclude personal accounts — only tracked_only, brand_owned, and listening_passive
        if (connector.account_type === 'personal') continue;

        const plat: SocialPlatform = connector.tiktok_account_id
          ? 'tiktok'
          : connector.youtube_account_id
          ? 'youtube'
          : 'instagram';
        const accountId = (
          connector.tiktok_account_id ||
          connector.youtube_account_id ||
          connector.instagram_account_id
        ) as string;

        // Apply platform filter
        if (options?.platform && plat !== options.platform) continue;

        // Add to platform arrays
        if (plat === 'tiktok') tiktokIds.push(accountId);
        else if (plat === 'youtube') youtubeIds.push(accountId);
        else if (plat === 'instagram') instagramIds.push(accountId);

        accountCampaignMap.set(accountId, (ta.campaign || 'general').toLowerCase());
        accountCreatedAtMap.set(accountId, ta.created_at);
      }
    }

    return { tiktokIds, instagramIds, youtubeIds, accountCampaignMap, accountCreatedAtMap };
  } catch (error) {
    console.error('[TrackedSocialAccounts] Unexpected error:', error);
    return {
      tiktokIds: [],
      instagramIds: [],
      youtubeIds: [],
      accountCampaignMap: new Map(),
      accountCreatedAtMap: new Map(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Checks if an account is tracked by a brand via connector.
 *
 * @param supabase - Supabase client
 * @param brandOrganizationId - Brand organization ID
 * @param socialAccountId - Platform account ID
 * @param platform - Platform to check
 * @returns Whether the account is tracked
 */
export async function isAccountTrackedByBrand(
  supabase: SupabaseClient,
  brandOrganizationId: string,
  socialAccountId: string,
  platform: SocialPlatform
): Promise<boolean> {
  // Look up connector for this platform account
  const connectorEntry = await getSocialAccountByPlatformId(supabase, platform, socialAccountId);

  if (!connectorEntry) {
    return false;
  }

  const { data } = await supabase
    .from('brand_tracked_social_accounts')
    .select('id')
    .eq('brand_organization_id', brandOrganizationId)
    .eq('social_account_connector_id', connectorEntry.id)
    .limit(1)
    .maybeSingle();

  return !!data;
}

/**
 * Gets the platform for a given social account ID by checking both account tables.
 *
 * @param supabase - Supabase client
 * @param accountId - Social account ID
 * @returns Platform and username, or null if not found
 */
export async function getAccountPlatform(
  supabase: SupabaseClient,
  accountId: string
): Promise<{ platform: SocialPlatform; username: string } | null> {
  // Check TikTok first
  const { data: tiktokAccount } = await supabase
    .from('tiktok_accounts')
    .select('id, tiktok_username')
    .eq('id', accountId)
    .maybeSingle();

  if (tiktokAccount) {
    return { platform: 'tiktok', username: tiktokAccount.tiktok_username };
  }

  // Check Instagram
  const { data: instagramAccount } = await supabase
    .from('instagram_accounts')
    .select('id, instagram_username')
    .eq('id', accountId)
    .maybeSingle();

  if (instagramAccount) {
    return { platform: 'instagram', username: instagramAccount.instagram_username };
  }

  // Check YouTube
  const { data: youtubeAccount } = await supabase
    .from('youtube_accounts')
    .select('id, youtube_username')
    .eq('id', accountId)
    .maybeSingle();

  if (youtubeAccount) {
    return { platform: 'youtube', username: youtubeAccount.youtube_username };
  }

  return null;
}
