import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type ManagedCreatorPostAccess = {
  tiktok_account_id: string | null;
  instagram_account_id: string | null;
  youtube_account_id: string | null;
  tiktok_username: string | null;
  instagram_username: string | null;
  youtube_username: string | null;
};

export type ResolvedManagedCreatorPostAccess = {
  connectorIds: string[];
  tiktokUsername: string | null;
  instagramUsername: string | null;
  youtubeUsername: string | null;
};

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Resolves managed creator platform accounts → social_accounts connector IDs,
 * then builds PostgREST OR filters against `posts.social_account_connector_id`.
 *
 * Falls back to username columns on `posts` for legacy rows that have no connector link.
 */
export async function resolveManagedCreatorPostAccess(
  supabase: SupabaseClient<Database>,
  managedCreator: ManagedCreatorPostAccess
): Promise<ResolvedManagedCreatorPostAccess> {
  // Step 1: Resolve platform account IDs (from managed_creator or by username lookup)
  const tiktokAccountIds = new Set<string>();
  const instagramAccountIds = new Set<string>();
  const youtubeAccountIds = new Set<string>();

  if (managedCreator.tiktok_account_id) tiktokAccountIds.add(managedCreator.tiktok_account_id);
  if (managedCreator.instagram_account_id) instagramAccountIds.add(managedCreator.instagram_account_id);
  if (managedCreator.youtube_account_id) youtubeAccountIds.add(managedCreator.youtube_account_id);

  // Look up account IDs by username when the managed_creator doesn't have a direct link
  const [tiktokLookup, instagramLookup, youtubeLookup] = await Promise.all([
    managedCreator.tiktok_account_id == null && managedCreator.tiktok_username
      ? supabase
          .from('tiktok_accounts')
          .select('id')
          .eq('tiktok_username', managedCreator.tiktok_username)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    managedCreator.instagram_account_id == null && managedCreator.instagram_username
      ? supabase
          .from('instagram_accounts')
          .select('id')
          .eq('instagram_username', managedCreator.instagram_username)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    managedCreator.youtube_account_id == null && managedCreator.youtube_username
      ? supabase
          .from('youtube_accounts')
          .select('id')
          .eq('youtube_username', managedCreator.youtube_username)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (tiktokLookup.error) throw tiktokLookup.error;
  if (instagramLookup.error) throw instagramLookup.error;
  if (youtubeLookup.error) throw youtubeLookup.error;

  if (tiktokLookup.data?.id) tiktokAccountIds.add(tiktokLookup.data.id);
  if (instagramLookup.data?.id) instagramAccountIds.add(instagramLookup.data.id);
  if (youtubeLookup.data?.id) youtubeAccountIds.add(youtubeLookup.data.id);

  // Step 2: Resolve platform account IDs → social_accounts connector IDs
  const connectorIds = new Set<string>();
  const allAccountIds = [
    ...Array.from(tiktokAccountIds).map((id) => ({ id, platform: 'tiktok' as const })),
    ...Array.from(instagramAccountIds).map((id) => ({ id, platform: 'instagram' as const })),
    ...Array.from(youtubeAccountIds).map((id) => ({ id, platform: 'youtube' as const })),
  ];

  if (allAccountIds.length > 0) {
    const orConditions = allAccountIds.map(({ id, platform }) => {
      if (!SAFE_ID_PATTERN.test(id)) {
        throw new Error(`Invalid ${platform} account ID when building post ownership filter`);
      }
      switch (platform) {
        case 'tiktok': return `tiktok_account_id.eq.${id}`;
        case 'instagram': return `instagram_account_id.eq.${id}`;
        case 'youtube': return `youtube_account_id.eq.${id}`;
      }
    });

    const { data: connectors, error: connectorError } = await supabase
      .from('social_accounts')
      .select('id')
      .or(orConditions.join(','))
      .eq('status', 'active');

    if (connectorError) throw connectorError;

    for (const c of connectors ?? []) {
      connectorIds.add(c.id);
    }
  }

  const ids = Array.from(connectorIds);
  if (!ids.every((id) => SAFE_ID_PATTERN.test(id))) {
    throw new Error('Invalid connector ID when building post ownership filter');
  }

  return {
    connectorIds: ids,
    tiktokUsername: managedCreator.tiktok_username,
    instagramUsername: managedCreator.instagram_username,
    youtubeUsername: managedCreator.youtube_username,
  };
}

export async function buildManagedCreatorPostFilters(
  supabase: SupabaseClient<Database>,
  managedCreator: ManagedCreatorPostAccess
) {
  const access = await resolveManagedCreatorPostAccess(supabase, managedCreator);

  // Step 3: Build filters
  const filters: string[] = [];

  // Primary filter: social_account_connector_id (unified FK on posts)
  if (access.connectorIds.length > 0) {
    filters.push(`social_account_connector_id.in.(${access.connectorIds.join(',')})`);
  }

  // Fallback: username columns for legacy posts without a connector link
  if (access.tiktokUsername) {
    filters.push(
      `and(social_account_connector_id.is.null,tiktok_username.eq.${JSON.stringify(access.tiktokUsername)})`
    );
  }
  if (access.instagramUsername) {
    filters.push(
      `and(social_account_connector_id.is.null,instagram_username.eq.${JSON.stringify(access.instagramUsername)})`
    );
  }
  if (access.youtubeUsername) {
    filters.push(
      `and(social_account_connector_id.is.null,youtube_username.eq.${JSON.stringify(access.youtubeUsername)})`
    );
  }

  return filters;
}
