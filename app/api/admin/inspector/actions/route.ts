export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import {
  forceResync,
  toggleTracking,
  resetSyncState,
  linkManagedCreator,
  mergeDuplicateAccount,
  reassignMcps,
  createMissingMcps,
  togglePostExcluded,
  editMcpPay,
  freezeBtsa,
  logInspectorAction,
} from '@/lib/modules/admin/inspector';
import type { InspectorActionType } from '@/lib/modules/admin/inspector';
import { PAYOUTS_ROLES, hasAccess, type AdminRole } from '@/lib/modules/admin/roles';
import { getAdminRole } from '@/lib/modules/admin/queries';

const FULL_ACCESS_ROLES: AdminRole[] = PAYOUTS_ROLES; // super_admin + senior_account_manager

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createServiceRoleClient();
  const { data: u } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();
  if (u?.account_type !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as {
    action: InspectorActionType;
    dryRun: boolean;
    payload: Record<string, unknown>;
  };
  const { action, dryRun = true, payload = {} } = body;
  if (!action) return Response.json({ error: 'Missing action' }, { status: 400 });

  // Writes require full access role. Dry-run is allowed for all admins.
  if (!dryRun) {
    const role = await getAdminRole(user.id);
    if (!role || !hasAccess(role, FULL_ACCESS_ROLES)) {
      return Response.json(
        { error: 'Forbidden: write access requires super_admin or senior_account_manager' },
        { status: 403 }
      );
    }
  }

  try {
    const p = payload as any;
    let result: unknown;
    let targetTable = '';
    let targetIds: string[] = [];

    switch (action) {
      case 'force_resync':
        result = await forceResync(supabase, p.accountId, dryRun);
        targetTable = `${p.platform || ''}_accounts`;
        targetIds = [p.accountId];
        break;
      case 'toggle_tracking':
        result = await toggleTracking(supabase, p.accountId, !!p.disabled, dryRun);
        targetTable = 'platform_accounts';
        targetIds = [p.accountId];
        break;
      case 'reset_sync_state':
        result = await resetSyncState(supabase, p.accountId, dryRun);
        targetTable = 'platform_accounts';
        targetIds = [p.accountId];
        break;
      case 'link_mc':
        result = await linkManagedCreator(supabase, {
          accountId: p.accountId,
          managedCreatorId: p.managedCreatorId,
          dryRun,
        });
        targetTable = 'managed_creators';
        targetIds = [p.managedCreatorId];
        break;
      case 'merge_duplicate':
        result = await mergeDuplicateAccount(supabase, {
          fromAccountId: p.fromAccountId,
          intoAccountId: p.intoAccountId,
          dryRun,
        });
        targetTable = 'platform_accounts';
        targetIds = [p.fromAccountId, p.intoAccountId];
        break;
      case 'reassign_mcp':
        result = await reassignMcps(supabase, {
          postIds: p.postIds,
          toManagedCreatorId: p.toManagedCreatorId,
          dryRun,
        });
        targetTable = 'managed_creator_posts';
        targetIds = p.postIds;
        break;
      case 'create_missing_mcp':
        result = await createMissingMcps(supabase, {
          postIds: p.postIds,
          managedCreatorId: p.managedCreatorId,
          dryRun,
        });
        targetTable = 'managed_creator_posts';
        targetIds = p.postIds;
        break;
      case 'toggle_exclude_post':
        result = await togglePostExcluded(supabase, {
          postIds: p.postIds,
          excluded: !!p.excluded,
          dryRun,
        });
        targetTable = 'posts';
        targetIds = p.postIds;
        break;
      case 'edit_mcp_pay':
        result = await editMcpPay(supabase, {
          mcpId: p.mcpId,
          basePayCents: p.basePayCents,
          bonusCents: p.bonusCents,
          totalOwedCents: p.totalOwedCents,
          dryRun,
        });
        targetTable = 'managed_creator_posts';
        targetIds = [p.mcpId];
        break;
      case 'freeze_btsa':
        result = await freezeBtsa(supabase, {
          btsaId: p.btsaId,
          frozen: !!p.frozen,
          dryRun,
        });
        targetTable = 'brand_tracked_social_accounts';
        targetIds = [p.btsaId];
        break;
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (!dryRun) {
      await logInspectorAction(supabase, {
        adminUserId: user.id,
        actionType: action,
        targetTable,
        targetIds,
        previewPayload: payload,
        executionResult: result,
      });
    }

    return Response.json({ ok: true, dryRun, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
