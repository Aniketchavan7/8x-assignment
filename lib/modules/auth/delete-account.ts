import { createServiceRoleClient } from '@/lib/db/supabase';
import { notifyUserDeleted } from '@/lib/notifications/slack/users';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { captureAuthError } from '@/lib/analytics/capture-error';
import type { AccountType } from '@/lib/db/types';

export type DeleteUserAccountInput = {
  userId: string;
  authUserId: string | null;
  userInfo: {
    name: string | null;
    email: string | null;
    accountType: AccountType | null;
  };
};

export type DeleteUserAccountResult =
  | { success: true }
  | { success?: never; error: string };

/**
 * Core account deletion logic. Shared by the web server action
 * (`deleteAccountWithoutPassword`) and the mobile API handler
 * (`handleDeleteAccount`).
 *
 * - Resolves the Supabase Auth UUID via `user_identities` if not provided.
 * - Deletes the `users` row first (FK cascades clean up related data).
 *   If this fails the caller can still sign in and retry.
 * - Then deletes the Supabase Auth user.
 * - Fires the Slack notification (fire-and-forget).
 */
export async function deleteUserAccount(
  input: DeleteUserAccountInput,
): Promise<DeleteUserAccountResult> {
  const { userId, userInfo } = input;
  const serviceSupabase = createServiceRoleClient();

  let authUserId = input.authUserId;
  if (!authUserId) {
    const { data: identity } = await serviceSupabase
      .from('user_identities')
      .select('provider_id')
      .eq('internal_user_id', userId)
      .eq('provider', 'supabase_auth')
      .maybeSingle();
    authUserId = identity?.provider_id ?? null;
  }

  try {
    const { error: dbErr } = await serviceSupabase
      .from('users')
      .delete()
      .eq('id', userId);
    if (dbErr) {
      captureAuthError(dbErr, 'delete_user_account_db', { userId });
      return { error: 'Failed to delete account. Please try again.' };
    }

    if (authUserId) {
      const { error: authErr } = await serviceSupabase.auth.admin.deleteUser(authUserId);
      if (authErr) {
        // DB row is already gone — log but don't fail the operation.
        captureAuthError(authErr, 'delete_user_account_auth', {
          userId,
          metadata: { authUserId },
        });
      }
    }

    notifyUserDeleted({
      name: userInfo.name ?? undefined,
      email: userInfo.email ?? undefined,
      accountType: userInfo.accountType,
    }).catch(captureFireAndForget('auth_user_deleted_notification'));

    return { success: true };
  } catch (error) {
    captureAuthError(error, 'delete_user_account_unexpected', { userId });
    return { error: 'Failed to delete account. Please try again.' };
  }
}
