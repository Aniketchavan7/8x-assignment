import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

interface AutoLinkOptions {
  managedCreatorId?: string;
  brandOrganizationId?: string;
  userId?: string;
  creatorProfileId?: string;
  extraFields?: Record<string, unknown>;
}

/**
 * Auto-link managed_creators records to a platform user by email.
 *
 * Caller must provide a service-role Supabase client (bypasses RLS to look up
 * users/profiles that the current user may not own).
 */
export async function autoLinkManagedCreatorByEmail(
  supabase: SupabaseClient<Database>,
  email: string,
  opts?: AutoLinkOptions
): Promise<{ linkedCount: number; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { linkedCount: 0 };

  // Resolve userId
  let userId = opts?.userId;
  if (!userId) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .eq('account_type', 'creator')
      .maybeSingle();

    if (!existingUser) return { linkedCount: 0 };
    userId = existingUser.id;
  }

  // Resolve creatorProfileId
  let creatorProfileId = opts?.creatorProfileId;
  if (!creatorProfileId) {
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) return { linkedCount: 0 };
    creatorProfileId = profile.id;
  }

  // Build the update payload
  const updatePayload: Record<string, unknown> = {
    linked_user_id: userId,
    linked_creator_profile_id: creatorProfileId,
    ...opts?.extraFields,
  };

  if (opts?.managedCreatorId) {
    // Link a specific managed_creator record
    const { data, error } = await supabase
      .from('managed_creators')
      .update(updatePayload)
      .eq('id', opts.managedCreatorId)
      .is('linked_user_id', null)
      .select('id');

    if (error) return { linkedCount: 0, error: error.message };
    return { linkedCount: data?.length ?? 0 };
  }

  // Find all unlinked managed_creators matching email, then update
  let query = supabase
    .from('managed_creators')
    .select('id')
    .ilike('email', normalizedEmail)
    .is('linked_user_id', null);

  if (opts?.brandOrganizationId) {
    query = query.eq('brand_organization_id', opts.brandOrganizationId);
  }

  const { data: unlinked } = await query;
  if (!unlinked || unlinked.length === 0) return { linkedCount: 0 };

  const { error } = await supabase
    .from('managed_creators')
    .update(updatePayload)
    .in(
      'id',
      unlinked.map((mc) => mc.id)
    );

  if (error) return { linkedCount: 0, error: error.message };
  return { linkedCount: unlinked.length };
}
