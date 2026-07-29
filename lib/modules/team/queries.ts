import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { TeamDataWithMembers } from '@/lib/auth/middleware';
import { BrandOrganization, BrandMember, User } from '@/lib/db/types';

// Type for Supabase query result with nested relations
type BrandOrganizationWithMembersQuery = BrandOrganization & {
  brand_members: (BrandMember & {
    users: Pick<User, 'id' | 'email'> | null;
  })[];
};

/**
 * Get brand organization by Stripe customer ID.
 */
export async function getTeamByStripeCustomerId(customerId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('brand_organizations')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get brand organization (team) for a user with all members.
 *
 * @param userId - The user ID to get the team for. If not provided, will get the current user.
 */
export async function getTeamForUser(userId?: string) {
  const supabase = await createAuthenticatedSupabaseClient();

  let user;
  if (userId) {
    // If userId is provided, fetch that user
    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !userData) {
      return null;
    }
    user = userData;
  } else {
    // Otherwise, get the current authenticated user (cached)
    user = await getUser();
    if (!user) {
      return null;
    }
  }

  // Check if user is a brand member (not a creator)
  const { data: membership, error: membershipError } = await supabase
    .from('brand_members')
    .select('brand_organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    // User is not part of a brand organization (might be a creator)
    return null;
  }

  // Get brand organization with all members
  const { data: brandOrg, error: brandOrgError } = await supabase
    .from('brand_organizations')
    .select(
      `
      *,
      brand_members (
        id,
        role,
        joined_at,
        user_id,
        users!brand_members_user_id_fkey (
          id,
          email
        )
      )
      `
    )
    .eq('id', membership.brand_organization_id)
    .single();

  if (brandOrgError || !brandOrg) {
    console.log(`[getTeamForUser] Brand org query error:`, brandOrgError);
    return null;
  }

  // Type assertion for Supabase query result
  const brandOrgWithMembers = brandOrg as unknown as BrandOrganizationWithMembersQuery;

  console.log(
    `[getTeamForUser] Brand org found: ${brandOrgWithMembers.id}, stripe_customer_id: ${brandOrgWithMembers.stripe_customer_id || 'null'}`
  );

  // Transform to match expected format (maintaining backwards compatibility)
  return {
    // Map brand_organization fields to old team fields
    id: brandOrgWithMembers.id,
    name: brandOrgWithMembers.organization_name,
    stripe_customer_id: brandOrgWithMembers.stripe_customer_id,
    stripe_subscription_id: null, // Brand orgs don't have this field directly, would need to fetch from Stripe
    plan_name: null, // Would need to fetch from Stripe subscription
    subscription_status: null, // Would need to fetch from Stripe subscription
    created_at: brandOrgWithMembers.created_at,
    updated_at: brandOrgWithMembers.updated_at,

    // Transform members
    teamMembers: (brandOrgWithMembers.brand_members || []).map((bm) => ({
      id: bm.id,
      role: bm.role || 'member',
      joined_at: bm.joined_at,
      profile_id: bm.user_id, // Map user_id to profile_id for backwards compatibility
      user:
        bm.users && !Array.isArray(bm.users)
          ? {
              id: bm.users.id,
              display_name: bm.users.email.split('@')[0], // Extract display name from email
              primary_email: bm.users.email,
            }
          : null,
    })),
  } as TeamDataWithMembers;
}
