/**
 * Stripe Subscriptions
 *
 * Functions for handling subscription changes, status queries,
 * and price/product retrieval.
 */
import Stripe from 'stripe';
import { getTeamByStripeCustomerId } from '@/lib/modules/team/queries';
import { updateTeamSubscription } from '@/lib/modules/billing/queries';
import { stripe } from './stripe-client';

/**
 * Handle subscription status changes from webhooks.
 */
export async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  brandOrgId?: string
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  console.log('[STRIPE] Handling subscription change:', {
    subscription_id: subscriptionId,
    customer_id: customerId,
    status: status,
    brand_org_id: brandOrgId || null,
    current_period_end: (subscription as unknown as { current_period_end?: number })
      .current_period_end
      ? new Date(
          (subscription as unknown as { current_period_end: number }).current_period_end * 1000
        ).toISOString()
      : null,
    cancel_at_period_end:
      (subscription as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end || false,
  });

  let brandOrg;

  try {
    if (brandOrgId) {
      const { createServiceRoleClient } = await import('@/lib/db/supabase');
      const supabase = createServiceRoleClient();
      const { data } = await supabase
        .from('brand_organizations')
        .select('*')
        .eq('id', brandOrgId)
        .single();

      if (!data) {
        console.error('[STRIPE] Brand organization not found:', {
          subscription_id: subscriptionId,
          customer_id: customerId,
          brand_org_id: brandOrgId,
        });
        return;
      }
      brandOrg = data;
    } else {
      brandOrg = await getTeamByStripeCustomerId(customerId);

      if (!brandOrg) {
        console.error('[STRIPE] Brand organization not found for Stripe customer:', {
          subscription_id: subscriptionId,
          customer_id: customerId,
        });
        return;
      }
    }

    console.log('[STRIPE] Processing subscription change:', {
      subscription_id: subscriptionId,
      customer_id: customerId,
      brand_organization_id: brandOrg.id,
      status: status,
    });

    if (status === 'active' || status === 'trialing') {
      const plan = subscription.items.data[0]?.price;
      const planName =
        typeof plan?.product === 'string' ? null : (plan?.product as Stripe.Product)?.name || null;

      // Extract plan_id from subscription metadata (for new pricing structure)
      const planId = subscription.metadata?.plan_id || 'free';

      await updateTeamSubscription(brandOrg.id, {
        stripeSubscriptionId: subscriptionId,
        planName: planName,
        subscriptionStatus: status,
      });

      // Sync subscription_plan_id to brand_organizations
      const { createServiceRoleClient } = await import('@/lib/db/supabase');
      const supabase = createServiceRoleClient();
      await supabase
        .from('brand_organizations')
        .update({ subscription_plan_id: planId })
        .eq('id', brandOrg.id);

      console.log('[STRIPE] Subscription updated successfully:', {
        subscription_id: subscriptionId,
        brand_organization_id: brandOrg.id,
        status: status,
        plan_name: planName,
        plan_id: planId,
      });
    } else if (status === 'canceled' || status === 'unpaid') {
      await updateTeamSubscription(brandOrg.id, {
        stripeSubscriptionId: null,
        planName: null,
        subscriptionStatus: status,
      });

      // Reset to free plan when subscription is canceled/unpaid
      const { createServiceRoleClient } = await import('@/lib/db/supabase');
      const supabase = createServiceRoleClient();
      await supabase
        .from('brand_organizations')
        .update({ subscription_plan_id: 'free' })
        .eq('id', brandOrg.id);

      console.log('[STRIPE] Subscription cleared:', {
        subscription_id: subscriptionId,
        brand_organization_id: brandOrg.id,
        status: status,
      });
    }
  } catch (error) {
    console.error('[STRIPE] Error handling subscription change:', {
      subscription_id: subscriptionId,
      customer_id: customerId,
      brand_org_id: brandOrgId || brandOrg?.id || null,
      status: status,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get subscription status for a brand organization.
 * Returns null if no active/trialing subscription found.
 */
export async function getBrandSubscriptionStatus(stripeCustomerId: string | null): Promise<{
  status: string;
  planName: string | null;
  planId: string | null;
  trialEnd: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
} | null> {
  if (!stripeCustomerId) {
    console.log('[getBrandSubscriptionStatus] No customer ID provided');
    return null;
  }

  try {
    console.log(
      `[getBrandSubscriptionStatus] Fetching subscriptions for customer ${stripeCustomerId}`
    );

    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
      expand: ['data.items.data.price'],
    });

    console.log(`[getBrandSubscriptionStatus] Found ${subscriptions.data.length} subscription(s)`);

    if (subscriptions.data.length === 0) {
      console.log(
        `[getBrandSubscriptionStatus] No subscriptions found for customer ${stripeCustomerId}`
      );
      return null;
    }

    const activeSubscriptions = subscriptions.data.filter(
      (sub) => sub.status === 'active' || sub.status === 'trialing'
    );

    if (activeSubscriptions.length === 0) {
      console.log(
        `[getBrandSubscriptionStatus] No active/trialing subscriptions found. Statuses: ${subscriptions.data.map((s) => s.status).join(', ')}`
      );
      return null;
    }

    const subscription = activeSubscriptions.sort((a, b) => (b.created || 0) - (a.created || 0))[0];

    console.log(
      `[getBrandSubscriptionStatus] Using subscription ${subscription.id} with status ${subscription.status}`
    );

    const price = subscription.items.data[0]?.price;

    let planName: string | null = null;
    if (price?.product) {
      if (typeof price.product === 'string') {
        try {
          const product = await stripe.products.retrieve(price.product);
          planName = product.name;
        } catch (error) {
          console.error('[getBrandSubscriptionStatus] Failed to fetch product name:', error);
        }
      } else {
        planName = (price.product as Stripe.Product)?.name || null;
      }
    }

    const planId = subscription.metadata?.plan_id || null;

    const result = {
      status: subscription.status,
      planName,
      planId,
      trialEnd: subscription.trial_end || null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      // current_period_end exists on the API response but is absent from this SDK's types
      currentPeriodEnd: (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end ?? null,
    };

    console.log(`[getBrandSubscriptionStatus] Returning subscription status:`, result);
    return result;
  } catch (error) {
    console.error('[getBrandSubscriptionStatus] Error fetching subscription status:', error);
    return null;
  }
}

