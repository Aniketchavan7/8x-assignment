import { cache } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase';

/**
 * Count distinct tracked accounts for a brand (frozen or not).
 * Frozen accounts still count toward the plan limit — a connected account is a connected account.
 * This is the single source of truth for account counting.
 */
export async function getActiveAccountCount(
  supabase: SupabaseClient,
  brandOrganizationId: string
): Promise<number> {
  const { data: accounts } = await supabase
    .from('brand_tracked_social_accounts')
    .select('social_account_connector_id')
    .eq('brand_organization_id', brandOrganizationId);

  return accounts
    ? new Set(accounts.map(a => a.social_account_connector_id)).size
    : 0;
}

/**
 * Get the account limit for a brand's current subscription plan.
 * Returns null for unlimited plans.
 * Defaults to free plan limit when subscription_plan_id is NULL.
 */
export async function getPlanAccountLimit(
  supabase: SupabaseClient,
  brandOrganizationId: string
): Promise<number | null> {
  const { data: brand } = await supabase
    .from('brand_organizations')
    .select('subscription_plan_id')
    .eq('id', brandOrganizationId)
    .single();

  const planId = brand?.subscription_plan_id || 'free';

  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('account_limit')
    .eq('id', planId)
    .single();

  return plan?.account_limit ?? null;
}

/**
 * Get account usage for a brand (for frontend display)
 */
export const getBrandAccountUsage = cache(async (brandOrganizationId: string) => {
  const supabase = await createAuthenticatedSupabaseClient();

  const [currentCount, accountLimit] = await Promise.all([
    getActiveAccountCount(supabase, brandOrganizationId),
    getPlanAccountLimit(supabase, brandOrganizationId),
  ]);

  const canAddMore = accountLimit === null || currentCount < accountLimit;

  return {
    currentCount,
    accountLimit,
    canAddMore
  };
});

/**
 * Update brand organization subscription information.
 * Note: The new schema doesn't store subscription details in brand_organizations.
 * Subscription data should be fetched from Stripe when needed.
 * This function is kept for backwards compatibility but may be deprecated.
 */
export async function updateTeamSubscription(
  brandOrganizationId: string,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId?: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  // In the new schema, brand_organizations doesn't have subscription fields
  // Subscription data lives in Stripe and should be fetched when needed
  // For now, we'll just log this and not fail
  console.log('[updateTeamSubscription] Called with:', {
    brandOrganizationId,
    subscriptionData,
  });

  // TODO: Implement subscription metadata storage if needed
  // Options:
  // 1. Store in a separate subscription_metadata JSONB column
  // 2. Fetch from Stripe every time
  // 3. Use Redis/cache for subscription status

  return;
}
