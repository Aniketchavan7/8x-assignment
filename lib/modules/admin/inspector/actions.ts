import { createServiceRoleClient } from '@/lib/db/supabase';
import { SUPABASE_URL, EDGE_AUTH_KEY } from '@/lib/env';
import type { DryRunPreview, InspectorActionType, Platform } from './types';
import { platformAccountsTable, platformFkColumn, resolveAccount } from './queries';

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

export async function logInspectorAction(
  supabase: SupabaseClient,
  params: {
    adminUserId: string;
    actionType: InspectorActionType;
    targetTable: string;
    targetIds: string[];
    previewPayload: unknown;
    executionResult: unknown;
  }
) {
  // Using `any` because types/supabase.ts hasn't been regenerated for inspector_actions yet.
  // MANUAL: regenerate after migration
  const { error } = await (supabase as any).from('inspector_actions').insert({
    admin_user_id: params.adminUserId,
    action_type: params.actionType,
    target_table: params.targetTable,
    target_ids: params.targetIds,
    preview_payload: params.previewPayload,
    execution_result: params.executionResult,
  });
  if (error) {
    console.warn('[inspector] failed to write audit log', error.message);
  }
}

// ───────────────────────── Account-level actions ─────────────────────────

export async function forceResync(
  supabase: SupabaseClient,
  accountId: string,
  dryRun: boolean
): Promise<DryRunPreview | { ok: true; response: unknown }> {
  const account = await resolveAccount(supabase, accountId);
  if (!account) throw new Error('Account not found');

  if (dryRun) {
    return {
      count: 1,
      sample: [{ platform: account.platform, username: account.username }],
      summary: `Invoke sync edge function for ${account.platform} @${account.username}`,
    };
  }

  const map: Record<Platform, string> = {
    tiktok: 'fetch-accounts-and-35-posts',
    instagram: 'fetch-instagram-account-reels',
    youtube: 'fetch-youtube-account-shorts',
  };
  const fn = map[account.platform];
  if (!EDGE_AUTH_KEY) throw new Error('EDGE_AUTH_KEY not configured');
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${fn}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_AUTH_KEY}`,
      },
      body: JSON.stringify({
        username: account.username,
        source: 'inspector',
        tracked_account_id: account.id,
        ...(account.platform === 'tiktok' ? { provider: 'scraptik' } : {}),
      }),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { ok: true, response: { status: res.status, body } };
  } finally {
    clearTimeout(timeout);
  }
}

export async function toggleTracking(
  supabase: SupabaseClient,
  accountId: string,
  disabled: boolean,
  dryRun: boolean
): Promise<DryRunPreview | { ok: true }> {
  const account = await resolveAccount(supabase, accountId);
  if (!account) throw new Error('Account not found');
  if (dryRun) {
    return {
      count: 1,
      sample: [{ current: account.trackingDisabled, next: disabled }],
      summary: `Set tracking_disabled = ${disabled} on ${account.platform}_accounts row`,
    };
  }
  const table = platformAccountsTable(account.platform);
  const { error } = await supabase.from(table).update({ tracking_disabled: disabled }).eq('id', accountId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function resetSyncState(
  supabase: SupabaseClient,
  accountId: string,
  dryRun: boolean
): Promise<DryRunPreview | { ok: true }> {
  const account = await resolveAccount(supabase, accountId);
  if (!account) throw new Error('Account not found');
  if (dryRun) {
    return {
      count: 1,
      sample: [
        {
          failures: account.consecutiveSyncFailures,
          error: account.syncError,
          backfillCursor: account.backfillCursor,
        },
      ],
      summary: 'Clear consecutive_sync_failures, sync_error, backfill_cursor; sync_status → pending',
    };
  }
  const table = platformAccountsTable(account.platform);
  const { error } = await supabase
    .from(table)
    .update({
      consecutive_sync_failures: 0,
      sync_error: null,
      sync_status: 'pending',
      backfill_cursor: null,
    })
    .eq('id', accountId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function linkManagedCreator(
  supabase: SupabaseClient,
  args: { accountId: string; managedCreatorId: string; dryRun: boolean }
): Promise<DryRunPreview | { ok: true }> {
  const account = await resolveAccount(supabase, args.accountId);
  if (!account) throw new Error('Account not found');

  const fkCol = platformFkColumn(account.platform);
  const { data: mc } = await supabase
    .from('managed_creators')
    .select(`id, name, status, ${fkCol}`)
    .eq('id', args.managedCreatorId)
    .maybeSingle();
  if (!mc) throw new Error('Managed creator not found');

  if (args.dryRun) {
    const { data: orphanConnectors } = await supabase
      .from('social_accounts')
      .select('id, account_type')
      .eq(fkCol, args.accountId)
      .is('managed_creator_id', null)
      .is('creator_profile_id', null);

    const connectorCount = orphanConnectors?.length ?? 0;
    return {
      count: 1 + connectorCount,
      sample: [
        {
          mc: mc.name,
          currentFk: (mc as any)[fkCol],
          newFk: args.accountId,
        },
        ...(orphanConnectors ?? []).map((sa) => ({
          connector_id: sa.id,
          account_type: sa.account_type,
          newOwner: `managed_creator ${args.managedCreatorId}`,
        })),
      ],
      summary:
        connectorCount > 0
          ? `Set managed_creators.${fkCol}; backfill managed_creator_id on ${connectorCount} orphan connector(s).`
          : `Set managed_creators.${fkCol} = ${args.accountId}`,
    };
  }
  const { error } = await supabase
    .from('managed_creators')
    .update({ [fkCol]: args.accountId })
    .eq('id', args.managedCreatorId);
  if (error) throw new Error(error.message);

  // Only backfill fully-orphan connectors; don't steal one already owned by
  // a different managed_creator or by a creator_profile. Non-atomic with
  // the UPDATE above — if this throws, the MC FK is already set and the
  // admin must retry (retry is idempotent since the connector is still
  // NULL/NULL).
  const { error: saErr } = await supabase
    .from('social_accounts')
    .update({ managed_creator_id: args.managedCreatorId })
    .eq(fkCol, args.accountId)
    .is('managed_creator_id', null)
    .is('creator_profile_id', null);
  if (saErr) throw new Error(saErr.message);

  return { ok: true };
}

export async function mergeDuplicateAccount(
  supabase: SupabaseClient,
  args: { fromAccountId: string; intoAccountId: string; dryRun: boolean }
): Promise<DryRunPreview | { ok: true; movedPosts: number }> {
  const from = await resolveAccount(supabase, args.fromAccountId);
  const into = await resolveAccount(supabase, args.intoAccountId);
  if (!from || !into) throw new Error('Account not found');
  if (from.platform !== into.platform)
    throw new Error('Accounts must be on the same platform');

  const fkCol = platformFkColumn(from.platform);
  const { data: postsToMove, count: postCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact' })
    .eq(fkCol, from.id)
    .is('deleted_at', null);

  const postIds = (postsToMove ?? []).map((p) => p.id);

  if (args.dryRun) {
    return {
      count: postCount ?? 0,
      sample: (postsToMove ?? []).slice(0, 5),
      summary: `Reassign ${postCount ?? 0} posts from @${from.username} → @${into.username}, disable tracking on source. MCPs follow posts automatically.`,
    };
  }

  if (postIds.length > 0) {
    const { error: postsErr } = await supabase
      .from('posts')
      .update({ [fkCol]: into.id })
      .in('id', postIds);
    if (postsErr) throw new Error(postsErr.message);
  }

  const table = platformAccountsTable(from.platform);
  const { error: disableErr } = await supabase
    .from(table)
    .update({ tracking_disabled: true })
    .eq('id', from.id);
  if (disableErr) throw new Error(disableErr.message);

  return { ok: true, movedPosts: postIds.length };
}

// ───────────────────────── Per-post actions ─────────────────────────

export async function reassignMcps(
  supabase: SupabaseClient,
  args: { postIds: string[]; toManagedCreatorId: string; dryRun: boolean }
): Promise<DryRunPreview | { ok: true; updated: number }> {
  const toManagedCreatorId = args.toManagedCreatorId.trim();

  const { data: mc } = await supabase
    .from('managed_creators')
    .select('id')
    .eq('id', toManagedCreatorId)
    .maybeSingle();
  if (!mc) throw new Error(`Managed creator ${toManagedCreatorId} not found`);

  const { data: current } = await supabase
    .from('managed_creator_posts')
    .select('id, post_id, managed_creator_id, total_owed_cents')
    .in('post_id', args.postIds);

  if (args.dryRun) {
    const totalOwed = (current ?? []).reduce(
      (sum, r) => sum + (r.total_owed_cents ?? 0),
      0
    );
    return {
      count: current?.length ?? 0,
      sample: (current ?? []).slice(0, 5),
      summary: `${current?.length ?? 0} MCPs → mc ${toManagedCreatorId}, $${(totalOwed / 100).toFixed(2)} total owed`,
    };
  }

  const { data, error } = await supabase
    .from('managed_creator_posts')
    .update({ managed_creator_id: toManagedCreatorId })
    .in('post_id', args.postIds)
    .select('id');
  if (error) throw new Error(error.message);
  return { ok: true, updated: data?.length ?? 0 };
}

export async function createMissingMcps(
  supabase: SupabaseClient,
  args: { postIds: string[]; managedCreatorId: string; dryRun: boolean }
): Promise<DryRunPreview | { ok: true; created: number }> {
  const managedCreatorId = args.managedCreatorId.trim();

  // base_pay on managed_creators is legacy DECIMAL but stores cents
  const { data: mc } = await supabase
    .from('managed_creators')
    .select('id, base_pay, job_id, jobs(cpm_platforms_allowed)')
    .eq('id', managedCreatorId)
    .maybeSingle();
  if (!mc) throw new Error(`Managed creator ${managedCreatorId} not found`);

  const { data: existing } = await supabase
    .from('managed_creator_posts')
    .select('post_id')
    .in('post_id', args.postIds);
  const existingSet = new Set((existing ?? []).map((r) => r.post_id));
  const missing = args.postIds.filter((id) => !existingSet.has(id));

  if (args.dryRun) {
    return {
      count: missing.length,
      sample: missing.slice(0, 5),
      summary: `Create ${missing.length} MCPs → mc ${managedCreatorId}`,
    };
  }

  if (missing.length === 0) return { ok: true, created: 0 };

  const basePayTotal = mc.base_pay != null ? Number(mc.base_pay) : 0;
  const platforms = ((mc as any)?.jobs?.cpm_platforms_allowed ?? []) as string[];
  const platformCount = Math.max(1, platforms.length || 1);
  const basePayPerPost = Math.round(basePayTotal / platformCount);

  const rows = missing.map((postId) => ({
    post_id: postId,
    managed_creator_id: managedCreatorId,
    base_pay_cents: basePayPerPost,
    platform_count: platformCount,
  }));

  const { data, error } = await supabase
    .from('managed_creator_posts')
    .insert(rows)
    .select('id');
  if (error) throw new Error(error.message);
  return { ok: true, created: data?.length ?? 0 };
}

export async function togglePostExcluded(
  supabase: SupabaseClient,
  args: { postIds: string[]; excluded: boolean; dryRun: boolean }
): Promise<DryRunPreview | { ok: true; updated: number }> {
  if (args.dryRun) {
    return {
      count: args.postIds.length,
      sample: args.postIds.slice(0, 5),
      summary: `Set is_excluded = ${args.excluded} on ${args.postIds.length} posts`,
    };
  }
  const { data, error } = await supabase
    .from('posts')
    .update({ is_excluded: args.excluded })
    .in('id', args.postIds)
    .select('id');
  if (error) throw new Error(error.message);
  return { ok: true, updated: data?.length ?? 0 };
}

export async function editMcpPay(
  supabase: SupabaseClient,
  args: {
    mcpId: string;
    basePayCents?: number;
    bonusCents?: number;
    totalOwedCents?: number;
    dryRun: boolean;
  }
): Promise<DryRunPreview | { ok: true }> {
  const { data: current } = await supabase
    .from('managed_creator_posts')
    .select('id, base_pay_cents, bonus_cents, total_owed_cents')
    .eq('id', args.mcpId)
    .maybeSingle();

  if (args.dryRun) {
    return {
      count: 1,
      sample: [{ current, next: args }],
      summary: 'Edit MCP pay values',
    };
  }

  const update: Record<string, number> = {};
  if (args.basePayCents != null) update.base_pay_cents = args.basePayCents;
  if (args.bonusCents != null) update.bonus_cents = args.bonusCents;
  if (args.totalOwedCents != null) update.total_owed_cents = args.totalOwedCents;

  const { error } = await supabase
    .from('managed_creator_posts')
    .update(update)
    .eq('id', args.mcpId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ───────────────────────── BTSA ─────────────────────────

export async function freezeBtsa(
  supabase: SupabaseClient,
  args: { btsaId: string; frozen: boolean; dryRun: boolean }
): Promise<DryRunPreview | { ok: true }> {
  if (args.dryRun) {
    return {
      count: 1,
      sample: [{ btsaId: args.btsaId, frozen: args.frozen }],
      summary: `Set brand_tracked_social_accounts.frozen = ${args.frozen}`,
    };
  }
  const { error } = await supabase
    .from('brand_tracked_social_accounts')
    .update({ frozen: args.frozen })
    .eq('id', args.btsaId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
