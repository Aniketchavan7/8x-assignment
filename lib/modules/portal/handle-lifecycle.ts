/**
 * Portal handle lifecycle helper.
 *
 * Pulled out of `actions.ts` so it can be unit-tested without the `'use server'`
 * directive turning every export into a server action.
 *
 * `applyPlatformHandle` is the one helper saveHandles calls per submitted
 * handle. It coordinates: scraper validation, swap detection, replacing the
 * old social_accounts row (and freezing its BTSA), creating the new
 * social_accounts row + BTSA row, and chaining replaced_by.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreatePlatformAccountWithConnector } from '@/lib/db/social-accounts';
import { validateNewHandle, type Platform, type ValidationError } from '@/lib/services/handle-validation';
import {
  extractTikTokUsername,
  extractInstagramUsername,
  extractYouTubeUsername,
} from '@/lib/utils/social-username';

type PlatformAccountIdField = `${Platform}_account_id`;
type PlatformAccountsTable = 'tiktok_accounts' | 'instagram_accounts' | 'youtube_accounts';
type PlatformUsernameColumn = 'tiktok_username' | 'instagram_username' | 'youtube_username';

const PLATFORM_ACCOUNTS_TABLE: Record<Platform, PlatformAccountsTable> = {
  tiktok: 'tiktok_accounts',
  instagram: 'instagram_accounts',
  youtube: 'youtube_accounts',
};

const PLATFORM_USERNAME_COL: Record<Platform, PlatformUsernameColumn> = {
  tiktok: 'tiktok_username',
  instagram: 'instagram_username',
  youtube: 'youtube_username',
};

const PLATFORM_PROFILE_URL: Record<Platform, (h: string) => string> = {
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
};

export type ApplyPlatformHandleOutcome =
  | { kind: 'ok'; handleSaved: string }
  | { kind: 'requires_confirmation'; currentHandle: string | null }
  | { kind: 'error'; code: ValidationError | 'account_in_use' | 'db_error' };

export interface ApplyPlatformHandleMC {
  id: string;
  tiktok_username: string | null;
  instagram_username: string | null;
  youtube_username: string | null;
}

function normalizeHandle(platform: Platform, input: string): string | null {
  return platform === 'tiktok'
    ? extractTikTokUsername(input)
    : platform === 'instagram'
      ? extractInstagramUsername(input)
      : extractYouTubeUsername(input);
}

/**
 * Per-platform lifecycle update for a creator-submitted handle.
 *
 * Returns one of three shapes:
 *   - `requires_confirmation`: MC already has an active handle that differs;
 *     caller must re-submit with `confirmedReplacement = true`.
 *   - `error`: validation or DB failure; nothing was written.
 *   - `ok`: new active social_accounts row + BTSA row in place. The
 *     write-back trigger mirrors the platform FK + username text into
 *     managed_creators.
 */
export async function applyPlatformHandle(
  db: SupabaseClient,
  mc: ApplyPlatformHandleMC,
  brandOrganizationId: string,
  platform: Platform,
  rawHandle: string,
  confirmedReplacement: boolean,
): Promise<ApplyPlatformHandleOutcome> {
  const normalized = normalizeHandle(platform, rawHandle);
  if (!normalized) return { kind: 'error', code: 'not_found' };

  const fkColumn: PlatformAccountIdField = `${platform}_account_id`;
  const platformTable = PLATFORM_ACCOUNTS_TABLE[platform];
  const usernameColumn = PLATFORM_USERNAME_COL[platform];

  const { data: oldActive } = await db
    .from('social_accounts')
    .select('id, tiktok_account_id, instagram_account_id, youtube_account_id')
    .eq('managed_creator_id', mc.id)
    .eq('status', 'active')
    .in('account_type', ['personal', 'brand_owned'])
    .not(fkColumn, 'is', null)
    .maybeSingle();

  const oldActiveFk = (sa: NonNullable<typeof oldActive>): string | null => {
    switch (platform) {
      case 'tiktok': return sa.tiktok_account_id;
      case 'instagram': return sa.instagram_account_id;
      case 'youtube': return sa.youtube_account_id;
    }
  };

  let currentHandle: string | null = null;
  if (oldActive) {
    const oldFk = oldActiveFk(oldActive);
    if (oldFk) {
      // PostgREST aliasing uses colon syntax (`alias:column`), not SQL `column as alias`.
      // The wrong syntax silently returns the row under the column's real name, which
      // makes the lookup miss and falls back to the legacy text column.
      const { data: oldRow } = await db
        .from(platformTable)
        .select(`username:${usernameColumn}`)
        .eq('id', oldFk)
        .maybeSingle<{ username: string | null }>();
      currentHandle = oldRow?.username ?? null;
    }
  }
  if (!currentHandle) {
    currentHandle =
      platform === 'tiktok'
        ? mc.tiktok_username
        : platform === 'instagram'
          ? mc.instagram_username
          : mc.youtube_username;
  }

  // Same handle as currently saved. Two cases:
  //   - oldActive present: the lifecycle row already exists, so this is a true
  //     no-op re-confirm — return ok and skip RapidAPI.
  //   - oldActive absent: the match is only against the legacy text column on
  //     managed_creators; no social_accounts / BTSA rows exist yet. Fall through
  //     to create them ("legacy bootstrap"), flagged so we skip the swap-
  //     confirmation gate and the scraper validation — that handle is the
  //     creator's own established account, which will have posts and would fail
  //     validateNewHandle's zero-posts check.
  const isSameHandle =
    currentHandle != null &&
    currentHandle.replace(/^@/, '').toLowerCase() === normalized.toLowerCase();
  if (isSameHandle && oldActive) {
    return { kind: 'ok', handleSaved: normalized };
  }
  const isLegacyBootstrap = isSameHandle && !oldActive;

  // Swap requires confirmation. "Swap" = MC already has any saved handle (either via
  // lifecycle row or legacy text column on managed_creators). The legacy-bootstrap
  // case is not a swap — same handle, just materializing missing rows — so it
  // bypasses the gate.
  if ((oldActive || currentHandle) && !confirmedReplacement && !isLegacyBootstrap) {
    return { kind: 'requires_confirmation', currentHandle };
  }

  // Capture the legacy state BEFORE any writes. If the MC has a saved handle in
  // the legacy text column but no lifecycle row (i.e. the handle pre-dates this
  // PR), we want to preserve it as a `replaced` row so the "Previously" history
  // works going forward. Snapshot the platform FK now — the write-back trigger
  // will overwrite it on managed_creators once we activate the new account.
  let legacyToReplace: { handle: string; platformAccountId: string | null } | null = null;
  if (!oldActive && !isLegacyBootstrap && currentHandle && currentHandle.toLowerCase() !== normalized.toLowerCase()) {
    const { data: mcRow } = await db
      .from('managed_creators')
      .select('tiktok_account_id, instagram_account_id, youtube_account_id')
      .eq('id', mc.id)
      .maybeSingle<{
        tiktok_account_id: string | null;
        instagram_account_id: string | null;
        youtube_account_id: string | null;
      }>();
    const legacyFk =
      platform === 'tiktok'
        ? mcRow?.tiktok_account_id
        : platform === 'instagram'
          ? mcRow?.instagram_account_id
          : mcRow?.youtube_account_id;
    // The legacy text column holds un-sanitized input — strip it through the
    // same extractor the rest of the flow uses before it can seed a placeholder
    // platform_accounts row. If it has an FK we use that directly; if it has
    // neither a usable handle nor an FK there is nothing clean to synthesize, so
    // skip the history row rather than create a malformed account.
    const legacyHandle = normalizeHandle(platform, currentHandle);
    if (legacyFk || legacyHandle) {
      legacyToReplace = {
        handle: legacyHandle ?? currentHandle,
        platformAccountId: legacyFk ?? null,
      };
    }
  }

  // Validate via scraper: account must exist with zero public posts. Skipped for
  // the legacy-bootstrap case — that handle is the creator's already-established
  // account (it will have posts); we are only materializing its lifecycle rows,
  // not onboarding a fresh account.
  if (!isLegacyBootstrap) {
    const validation = await validateNewHandle(platform, normalized);
    if (!validation.ok) return { kind: 'error', code: validation.error ?? 'api_error' };
  }

  const nowIso = new Date().toISOString();

  // Compensating rollback handlers — invoked if any step after this point fails.
  // We need this because Supabase JS doesn't expose multi-statement transactions
  // from the route handler. Until a server-side RPC wraps the swap atomically,
  // these handlers restore observable state when a later step errors out.
  const rollbackHandlers: Array<() => Promise<void>> = [];
  const rollback = async () => {
    for (const fn of rollbackHandlers.reverse()) {
      await fn().catch((e) =>
        console.error('[saveHandles] Rollback handler failed (non-fatal):', e),
      );
    }
  };

  // Mark the old row replaced and freeze its BTSA. status='replaced' drives is_active=false
  // via the sync trigger.
  if (oldActive) {
    const { error: replaceErr } = await db
      .from('social_accounts')
      .update({ status: 'replaced', ended_at: nowIso, ended_reason: 'user_replaced' })
      .eq('id', oldActive.id);
    if (replaceErr) {
      console.error('[saveHandles] Failed to mark old social_accounts row replaced:', replaceErr);
      return { kind: 'error', code: 'db_error' };
    }
    rollbackHandlers.push(async () => {
      await db
        .from('social_accounts')
        .update({ status: 'active', ended_at: null, ended_reason: null })
        .eq('id', oldActive.id);
    });

    // Only freeze BTSA rows we actually need to change, so the rollback path
    // doesn't unfreeze rows that were already frozen by another flow (e.g. an
    // MC-drop side-effect).
    const { data: frozenRows } = await db
      .from('brand_tracked_social_accounts')
      .update({ frozen: true })
      .eq('social_account_connector_id', oldActive.id)
      .eq('frozen', false)
      .select('id');
    const frozenIds = (frozenRows ?? []).map((r) => r.id);
    if (frozenIds.length > 0) {
      rollbackHandlers.push(async () => {
        await db
          .from('brand_tracked_social_accounts')
          .update({ frozen: false })
          .in('id', frozenIds);
      });
    }
  } else if (legacyToReplace) {
    // Synthesize a 'replaced' lifecycle row for the legacy handle so history is
    // preserved. We need a platform_accounts row for the FK — reuse the legacy
    // FK if managed_creators had one, otherwise create a placeholder.
    let legacyAccountId = legacyToReplace.platformAccountId;
    if (!legacyAccountId) {
      const profileUrl = PLATFORM_PROFILE_URL[platform](legacyToReplace.handle);

      // Re-use an existing platform_accounts row if one happens to exist for the
      // handle (e.g. previously tracked by an admin). Otherwise insert a
      // placeholder marked as inactive. ilike() to stay consistent with the
      // pre-flight check above and the downstream case-insensitive lookups —
      // otherwise a case-only mismatch would leak a duplicate placeholder.
      const { data: existing } = await db
        .from(platformTable)
        .select('id')
        .ilike(usernameColumn, legacyToReplace.handle)
        .maybeSingle<{ id: string }>();
      if (existing) {
        legacyAccountId = existing.id;
      } else {
        const { data: created } = await db
          .from(platformTable)
          .insert({
            [usernameColumn]: legacyToReplace.handle,
            profile_url: profileUrl,
            source: 'legacy_handle_backfill',
            backfill_status: 'in_progress',
            tracking_status: 'reduced',
            is_active: false,
          })
          .select('id')
          .single<{ id: string }>();
        legacyAccountId = created?.id ?? null;
        // Register a rollback for the placeholder platform_accounts row so a
        // later failure doesn't leak an orphan. The synth social_accounts row's
        // FK has ON DELETE CASCADE on this column, so deleting the platform
        // row would cascade it too — but we still register the synth rollback
        // separately because it runs first (LIFO) and is a no-op if cascade
        // already ran.
        if (created?.id) {
          const createdPlatformId = created.id;
          rollbackHandlers.push(async () => {
            await db.from(platformTable).delete().eq('id', createdPlatformId);
          });
        }
      }
    }

    if (legacyAccountId) {
      const { data: synthRow, error: synthErr } = await db
        .from('social_accounts')
        .insert({
          [fkColumn]: legacyAccountId,
          managed_creator_id: mc.id,
          account_type: 'brand_owned',
          status: 'replaced',
          submitted_at: nowIso,
          verified_at: nowIso,
          ended_at: nowIso,
          ended_reason: 'legacy_handle_replaced',
        })
        .select('id')
        .single<{ id: string }>();
      if (synthErr) {
        console.error('[saveHandles] Failed to synthesize legacy replaced row:', synthErr);
        // Non-fatal: the new account creation should still succeed.
      } else if (synthRow?.id) {
        // Register a rollback that deletes the orphan synth row if anything
        // later fails. Without this, a failed swap leaves a leaked "Previously"
        // entry pointing at the old handle.
        rollbackHandlers.push(async () => {
          await db.from('social_accounts').delete().eq('id', synthRow.id);
        });
      }
    }
  }

  // Pre-flight ownership check. findOrCreatePlatformAccountWithConnector mutates
  // the connector's managed_creator_id in-place when needsUpdate fires (see
  // lib/db/social-accounts.ts), so reading the connector AFTER the call always
  // shows mc.id and the account_in_use guard never trips. Look at the existing
  // state first; refuse before we mutate anything.
  //
  // Use ilike(): the downstream find*AccountByUsername lookups are case-
  // insensitive, so a case-sensitive .eq() here would miss "MyHandle" when
  // "myhandle" exists and let findOrCreatePlatformAccountWithConnector silently
  // reassign the existing connector to this MC.
  const { data: existingPlatformAcct } = await db
    .from(platformTable)
    .select('id')
    .ilike(usernameColumn, normalized)
    .maybeSingle<{ id: string }>();
  if (existingPlatformAcct) {
    // Only the currently active connector blocks ownership transfer. Historical
    // rows in 'replaced' status from prior swaps must not surface as a conflict
    // when a different creator legitimately reclaims the freed-up handle.
    //
    // Reject personal-owned connectors too: at_most_one_owner forbids both
    // ownership FKs being set, and findOrCreatePlatformAccountWithConnector
    // would silently fail the CHECK when adopting for this MC — leaving the
    // MC's old SA marked 'replaced' and the new one still owned by the personal
    // creator_profile_id.
    const { data: existingConn } = await db
      .from('social_accounts')
      .select('managed_creator_id, creator_profile_id')
      .eq(fkColumn, existingPlatformAcct.id)
      .eq('status', 'active')
      .maybeSingle<{
        managed_creator_id: string | null;
        creator_profile_id: string | null;
      }>();
    if (existingConn) {
      const ownedByOtherMc =
        existingConn.managed_creator_id != null &&
        existingConn.managed_creator_id !== mc.id;
      const ownedByPersonal = existingConn.creator_profile_id != null;
      if (ownedByOtherMc || ownedByPersonal) {
        await rollback();
        return { kind: 'error', code: 'account_in_use' };
      }
    }
  }

  const result = await findOrCreatePlatformAccountWithConnector(db, {
    platform,
    username: normalized,
    managedCreatorId: mc.id,
    accountType: 'brand_owned',
    source: 'portal-onboarding',
  });

  if (!result) {
    await rollback();
    return { kind: 'error', code: 'db_error' };
  }

  // Ensure the new connector is status='active' and timestamps fresh.
  // The write-back trigger then mirrors the FK + username text into managed_creators.
  const { error: activateErr } = await db
    .from('social_accounts')
    .update({
      status: 'active',
      submitted_at: nowIso,
      verified_at: nowIso,
      ended_at: null,
      ended_reason: null,
    })
    .eq('id', result.connector.id);
  if (activateErr) {
    console.error('[saveHandles] Failed to activate new social_accounts row:', activateErr);
    await rollback();
    return { kind: 'error', code: 'db_error' };
  }

  // Ensure a BTSA row exists for this (brand, new connector) pair so posts from the
  // new account land on the brand's dashboard. campaign='general' gets refined to the
  // job's target country by trg_resolve_btsa_campaign (BEFORE INSERT on BTSA), which
  // reads through social_accounts.managed_creator_id → managed_creators.job_id.
  const { error: btsaErr } = await db
    .from('brand_tracked_social_accounts')
    .insert({
      brand_organization_id: brandOrganizationId,
      social_account_connector_id: result.connector.id,
      campaign: 'general',
      frozen: false,
    });
  if (btsaErr && btsaErr.code !== '23505') {
    // 23505 = unique violation, i.e. a BTSA row already exists for this
    // (brand, connector) — idempotent re-submit. Anything else is a real failure.
    console.error('[saveHandles] Failed to create BTSA row for new connector:', btsaErr);
    await rollback();
    return { kind: 'error', code: 'db_error' };
  }
  if (btsaErr?.code === '23505') {
    // A stale (likely frozen) row exists from a prior submission — unfreeze it.
    await db
      .from('brand_tracked_social_accounts')
      .update({ frozen: false })
      .eq('brand_organization_id', brandOrganizationId)
      .eq('social_account_connector_id', result.connector.id);
  }

  // Set replaced_by only after BTSA succeeds. Doing it earlier would leak a
  // dangling pointer to result.connector.id if BTSA insertion failed and we
  // rolled back — the old row's status would revert to 'active' but its
  // replaced_by would still point at the orphaned new connector.
  if (oldActive) {
    await db
      .from('social_accounts')
      .update({ replaced_by: result.connector.id })
      .eq('id', oldActive.id);
  }

  return { kind: 'ok', handleSaved: normalized };
}
