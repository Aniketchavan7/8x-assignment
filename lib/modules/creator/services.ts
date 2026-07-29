/**
 * Thin delegating shim over `lib/services/creator-profile.ts`.
 *
 * Existing callers (the `/api/creator/profile` PATCH route and
 * `lib/modules/creator/actions.ts`) use these functions with the signature
 * `(userId, input) => { success } | { error }`. The canonical implementation
 * now lives in the shared services layer so mobile + web call the same code.
 */

import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';
import {
  updateCreatorProfile,
  updateLanguages,
} from '@/lib/services/creator-profile';
import { isServiceError } from '@/lib/services/_types';

async function buildWebContext(userId: string) {
  const supabase = await createAuthenticatedSupabaseClient();
  return { user: { id: userId }, supabase };
}

export async function updateCreatorBasicInfo(
  userId: string,
  data: { display_name: string; bio?: string | null; location?: string | null }
): Promise<{ success: true } | { error: string }> {
  try {
    const ctx = await buildWebContext(userId);
    await updateCreatorProfile(ctx, {
      display_name: data.display_name,
      bio: data.bio ?? null,
      location: data.location ?? null,
    });
    return { success: true };
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }
}

export async function updateCreatorLanguages(
  userId: string,
  languages: string[]
): Promise<{ success: true } | { error: string }> {
  try {
    const ctx = await buildWebContext(userId);
    await updateLanguages(ctx, languages);
    return { success: true };
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }
}
