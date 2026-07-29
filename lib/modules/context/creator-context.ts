/**
 * Creator Context for API Routes
 *
 * Provides a unified way to get creator context (user, creator profile)
 * for API routes.
 */

import { getUser } from '@/lib/modules/auth/queries';
import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import type {
  CreatorContextResult,
  ContextUser,
  ContextCreatorProfile,
} from './types';
import { ERRORS } from './errors';

/**
 * Get creator context for API routes.
 *
 * Fetches the authenticated user's creator profile.
 *
 * @param request - The incoming HTTP request
 * @returns CreatorContextResult - discriminated union with `ok: true/false`
 *
 * @example
 * ```typescript
 * import { getCreatorContext, errorResponse } from '@/lib/modules/context';
 *
 * export async function GET(request: Request) {
 *   const ctx = await getCreatorContext(request);
 *   if (!ctx.ok) return errorResponse(ctx.error);
 *
 *   const { creatorProfile, supabase } = ctx;
 *   // Use creatorProfile.id for queries...
 * }
 * ```
 */
export async function getCreatorContext(
  request: Request
): Promise<CreatorContextResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, error: ERRORS.UNAUTHORIZED };
  }

  const supabase = await createAuthenticatedSupabaseClient();

  const { data: creatorProfile, error: profileError } = await supabase
    .from('creator_profiles')
    .select('id, user_id, display_name, first_name, last_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[getCreatorContext] Query error:', profileError);
    return { ok: false, error: ERRORS.INTERNAL };
  }

  if (!creatorProfile) {
    return { ok: false, error: ERRORS.NOT_CREATOR };
  }

  const contextUser: ContextUser = {
    id: user.id,
    email: user.email ?? null,
    accountType: 'creator',
  };

  const contextCreatorProfile: ContextCreatorProfile = {
    id: creatorProfile.id,
    userId: creatorProfile.user_id,
    displayName: creatorProfile.display_name,
    firstName: creatorProfile.first_name,
    lastName: creatorProfile.last_name,
  };

  return {
    ok: true,
    user: contextUser,
    creatorProfile: contextCreatorProfile,
    supabase,
    isAdmin: false,
  };
}
