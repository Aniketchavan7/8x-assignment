import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type ManagedCreatorDropState = Pick<
  Database['public']['Tables']['managed_creators']['Row'],
  | 'brand_organization_id'
  | 'tiktok_account_id'
  | 'instagram_account_id'
  | 'youtube_account_id'
>;

type DropErrorStep = 'resolve_connectors' | 'query_btsa' | 'freeze_btsa';

export type ApplyManagedCreatorDropSideEffectsResult =
  | { success: true }
  | { success: false; step: DropErrorStep; error: PostgrestError };

function resolveConnectorIds(
  connectors: Array<{
    id: string;
    tiktok_account_id: string | null;
    instagram_account_id: string | null;
    youtube_account_id: string | null;
  }>,
  creator: ManagedCreatorDropState
): string[] {
  const connectorIds = new Set<string>();

  for (const connector of connectors) {
    if (connector.tiktok_account_id && connector.tiktok_account_id === creator.tiktok_account_id) {
      connectorIds.add(connector.id);
    }
    if (
      connector.instagram_account_id &&
      connector.instagram_account_id === creator.instagram_account_id
    ) {
      connectorIds.add(connector.id);
    }
    if (
      connector.youtube_account_id &&
      connector.youtube_account_id === creator.youtube_account_id
    ) {
      connectorIds.add(connector.id);
    }
  }

  return [...connectorIds];
}

async function resolveTrackedConnectorIds(
  supabase: SupabaseClient<Database>,
  creator: ManagedCreatorDropState
): Promise<
  | { connectorIds: string[] }
  | { error: PostgrestError; step: DropErrorStep }
> {
  const connectorConditions: string[] = [];

  if (creator.tiktok_account_id) {
    connectorConditions.push(`tiktok_account_id.eq.${creator.tiktok_account_id}`);
  }
  if (creator.instagram_account_id) {
    connectorConditions.push(`instagram_account_id.eq.${creator.instagram_account_id}`);
  }
  if (creator.youtube_account_id) {
    connectorConditions.push(`youtube_account_id.eq.${creator.youtube_account_id}`);
  }

  if (connectorConditions.length === 0 || !creator.brand_organization_id) {
    return { connectorIds: [] };
  }

  const { data: connectors, error: connectorError } = await supabase
    .from('social_accounts')
    .select('id, tiktok_account_id, instagram_account_id, youtube_account_id')
    .or(connectorConditions.join(','))
    .eq('status', 'active');

  if (connectorError) {
    return { error: connectorError, step: 'resolve_connectors' };
  }

  const allConnectorIds = resolveConnectorIds(connectors ?? [], creator);

  if (allConnectorIds.length === 0) {
    return { connectorIds: [] };
  }

  const { data: trackedEntries, error: trackingError } = await supabase
    .from('brand_tracked_social_accounts')
    .select('social_account_connector_id')
    .eq('brand_organization_id', creator.brand_organization_id)
    .in('social_account_connector_id', allConnectorIds);

  if (trackingError) {
    return { error: trackingError, step: 'query_btsa' };
  }

  return {
    connectorIds: (trackedEntries ?? []).map((e) => e.social_account_connector_id),
  };
}

export async function applyManagedCreatorDropSideEffects(
  supabase: SupabaseClient<Database>,
  _managedCreatorId: string,
  creator: ManagedCreatorDropState
): Promise<ApplyManagedCreatorDropSideEffectsResult> {
  const result = await resolveTrackedConnectorIds(supabase, creator);

  if ('error' in result) {
    return { success: false, step: result.step, error: result.error };
  }

  if (result.connectorIds.length > 0) {
    const { error: freezeError } = await supabase
      .from('brand_tracked_social_accounts')
      .update({ frozen: true })
      .eq('brand_organization_id', creator.brand_organization_id!)
      .in('social_account_connector_id', result.connectorIds);

    if (freezeError) {
      return { success: false, step: 'freeze_btsa', error: freezeError };
    }
  }

  // Write tracking_status directly to platform tables (dual-write)
  if (creator.tiktok_account_id) {
    const { error } = await supabase
      .from('tiktok_accounts')
      .update({ tracking_status: 'reduced', tracking_disabled: true })
      .eq('id', creator.tiktok_account_id);
    if (error) console.error('Failed to dual-write tiktok_accounts tracking_status on drop:', error);
  }
  if (creator.instagram_account_id) {
    const { error } = await supabase
      .from('instagram_accounts')
      .update({ tracking_status: 'reduced', tracking_disabled: true })
      .eq('id', creator.instagram_account_id);
    if (error) console.error('Failed to dual-write instagram_accounts tracking_status on drop:', error);
  }
  if (creator.youtube_account_id) {
    const { error } = await supabase
      .from('youtube_accounts')
      .update({ tracking_status: 'reduced', tracking_disabled: true })
      .eq('id', creator.youtube_account_id);
    if (error) console.error('Failed to dual-write youtube_accounts tracking_status on drop:', error);
  }

  return { success: true };
}

export async function reverseManagedCreatorDropSideEffects(
  supabase: SupabaseClient<Database>,
  _managedCreatorId: string,
  creator: ManagedCreatorDropState
): Promise<ApplyManagedCreatorDropSideEffectsResult> {
  const result = await resolveTrackedConnectorIds(supabase, creator);

  if ('error' in result) {
    return { success: false, step: result.step, error: result.error };
  }

  if (result.connectorIds.length > 0) {
    const { error: unfreezeError } = await supabase
      .from('brand_tracked_social_accounts')
      .update({ frozen: false })
      .eq('brand_organization_id', creator.brand_organization_id!)
      .in('social_account_connector_id', result.connectorIds);

    if (unfreezeError) {
      return { success: false, step: 'freeze_btsa', error: unfreezeError };
    }
  }

  // Write tracking_status directly to platform tables (dual-write)
  if (creator.tiktok_account_id) {
    const { error } = await supabase
      .from('tiktok_accounts')
      .update({ tracking_status: 'active', tracking_disabled: false })
      .eq('id', creator.tiktok_account_id);
    if (error) console.error('Failed to dual-write tiktok_accounts tracking_status on undrop:', error);
  }
  if (creator.instagram_account_id) {
    const { error } = await supabase
      .from('instagram_accounts')
      .update({ tracking_status: 'active', tracking_disabled: false })
      .eq('id', creator.instagram_account_id);
    if (error) console.error('Failed to dual-write instagram_accounts tracking_status on undrop:', error);
  }
  if (creator.youtube_account_id) {
    const { error } = await supabase
      .from('youtube_accounts')
      .update({ tracking_status: 'active', tracking_disabled: false })
      .eq('id', creator.youtube_account_id);
    if (error) console.error('Failed to dual-write youtube_accounts tracking_status on undrop:', error);
  }

  return { success: true };
}
