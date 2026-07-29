/**
 * Stripe Checkout & Customer Portal
 *
 * Functions for creating checkout sessions (subscriptions, deposits)
 * and managing customer portal sessions.
 */
import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { BrandOrganization } from '@/lib/db/types';
import { getUser } from '@/lib/modules/auth/queries';
import { trackEvent as trackPostHogEvent } from '@/lib/analytics/posthog-server';
import { getAppUrl } from '@/lib/utils/env-detection';
import { stripe } from './stripe-client';
import { ensureStripeCustomer } from './stripe-customer';

/**
 * Create a subscription checkout session.
 * Supports both pre-defined price IDs and dynamic price_data.
 */
export async function createCheckoutSession({
  team,
  priceId,
  priceData,
  trialPeriodDays = 7,
}: {
  team: BrandOrganization | null;
  priceId?: string;
  priceData?: {
    currency: string;
    unitAmount: number;
    productName: string;
    recurring?: {
      interval: 'day' | 'week' | 'month' | 'year';
      interval_count?: number;
    };
  };
  trialPeriodDays?: number;
}): Promise<never> {
  const user = await getUser();

  if (!team || !user) {
    const redirectParam = priceId ? `priceId=${priceId}` : 'dynamic=true';
    redirect(`/sign-up?redirect=checkout&${redirectParam}`);
  }

  if (!priceId && !priceData) {
    throw new Error('Either priceId or priceData must be provided');
  }

  // Ensure Stripe customer exists before creating checkout session
  // Required for Stripe Accounts V2 in test mode
  const stripeCustomerId = await ensureStripeCustomer({
    userId: user.id,
    brandOrganizationId: team.id,
    email: user.email,
    currentCustomerId: team.stripe_customer_id,
  });

  // Build line items - support both price ID and dynamic price_data
  const lineItems = priceId
    ? [
        {
          price: priceId,
          quantity: 1,
        },
      ]
    : [
        {
          price_data: {
            currency: priceData!.currency,
            unit_amount: priceData!.unitAmount,
            product_data: {
              name: priceData!.productName,
            },
            recurring: {
              interval: priceData!.recurring?.interval || 'month',
              interval_count: priceData!.recurring?.interval_count || 1,
            },
          },
          quantity: 1,
        },
      ];

  // Check if customer has ever had a subscription before (including canceled ones)
  // If they have, disable the free trial
  let finalTrialPeriodDays = trialPeriodDays;
  if (stripeCustomerId && trialPeriodDays > 0) {
    try {
      const previousSubscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 1,
      });

      if (previousSubscriptions.data.length > 0) {
        console.log(
          `[createCheckoutSession] Customer ${stripeCustomerId} has previous subscriptions. Disabling trial.`,
          {
            previousSubscriptionCount: previousSubscriptions.data.length,
            previousStatuses: previousSubscriptions.data.map((s) => s.status).join(', '),
          }
        );
        finalTrialPeriodDays = 0;
      }
    } catch (error) {
      console.error('[createCheckoutSession] Error checking previous subscriptions:', error);
      // Continue with trial period if check fails (fail open)
    }
  }

  // Pentest v2 A8-1: minute-bucket idempotency avoids duplicate sessions from
  // rapid double-submit on the pricing page.
  const subCheckoutKey = `checkout-sub:${user.id}:${team.id}:${priceId ?? 'dynamic'}:${Math.floor(Date.now() / 60000)}`;
  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${getAppUrl()}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/dashboard/brand-payment`,
      customer: stripeCustomerId,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: finalTrialPeriodDays,
      },
    },
    { idempotencyKey: subCheckoutKey }
  );

  // Track checkout initiated event
  try {
    trackPostHogEvent(user.id, 'checkout_initiated', {
      brand_organization_id: team.id,
      price_id: priceId || 'dynamic',
      price_data: priceData || null,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Failed to track PostHog event:', error);
  }

  redirect(session.url!);
}

/**
 * Create a wallet deposit checkout session.
 */
export async function createDepositCheckoutSession({
  brandOrganizationId,
  amount,
  walletAmount,
  userId,
  stripeCustomerId,
  currency = 'usd',
  returnTo,
}: {
  brandOrganizationId: string;
  amount: number; // in cents - total charge amount (includes fees)
  walletAmount: number; // in currency units - exact amount to credit to wallet
  userId: string;
  stripeCustomerId: string;
  currency?: string;
  returnTo?: string;
}): Promise<never> {
  const walletAmountCents = Math.round(walletAmount * 100);

  // Pentest v2 A8-1: minute-bucket idempotency on deposit checkout sessions
  // prevents duplicate sessions from double-submit.
  const depositCheckoutKey = `checkout-deposit:${brandOrganizationId}:${amount}:${currency.toLowerCase()}:${Math.floor(Date.now() / 60000)}`;
  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: 'Brand Wallet Deposit',
              description: 'Add funds to your brand wallet',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${getAppUrl()}/api/stripe/deposit-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/dashboard/add-funds`,
      customer: stripeCustomerId,
      client_reference_id: userId,
      metadata: {
        brand_organization_id: brandOrganizationId,
        type: 'wallet_deposit',
        currency: currency.toLowerCase(),
        wallet_amount: walletAmountCents.toString(),
        ...(returnTo && { return_to: returnTo }),
      },
      allow_promotion_codes: false,
    },
    { idempotencyKey: depositCheckoutKey }
  );

  // Track checkout initiated event
  try {
    trackPostHogEvent(userId, 'deposit_checkout_initiated', {
      brand_organization_id: brandOrganizationId,
      amount,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Failed to track PostHog event:', error);
  }

  redirect(session.url!);
}

/**
 * Create a customer portal session for subscription management.
 */
export async function createCustomerPortalSession(team: BrandOrganization) {
  console.log('[STRIPE] Creating customer portal session:', {
    brand_organization_id: team.id,
    stripe_customer_id: team.stripe_customer_id || null,
  });

  if (!team.stripe_customer_id) {
    console.warn('[STRIPE] No Stripe customer ID found for team:', team.id);
    redirect('/pricing');
  }

  try {
    // Get customer's subscriptions to find active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: team.stripe_customer_id,
      status: 'active',
      limit: 1,
      expand: ['data.items.data.price'],
    });

    if (subscriptions.data.length === 0) {
      console.warn('[STRIPE] No active subscriptions found for customer:', {
        brand_organization_id: team.id,
        stripe_customer_id: team.stripe_customer_id,
      });
      redirect('/pricing');
    }

    const subscription = subscriptions.data[0];
    const price = subscription.items.data[0]?.price;
    const productId =
      typeof price?.product === 'string' ? price.product : (price?.product as Stripe.Product)?.id;

    if (!productId) {
      throw new Error('No product found for subscription');
    }

    let configuration: Stripe.BillingPortal.Configuration;
    const configurations = await stripe.billingPortal.configurations.list();

    if (configurations.data.length > 0) {
      configuration = configurations.data[0];
      console.log('[STRIPE] Using existing billing portal configuration:', {
        brand_organization_id: team.id,
        configuration_id: configuration.id,
      });
    } else {
      console.log('[STRIPE] Creating new billing portal configuration:', {
        brand_organization_id: team.id,
        product_id: productId,
      });

      const product = await stripe.products.retrieve(productId);
      if (!product.active) {
        throw new Error("Team's product is not active in Stripe");
      }

      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
      });
      if (prices.data.length === 0) {
        throw new Error("No active prices found for the team's product");
      }

      configuration = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Manage your subscription',
        },
        features: {
          subscription_update: {
            enabled: true,
            default_allowed_updates: ['price', 'quantity', 'promotion_code'],
            proration_behavior: 'create_prorations',
            products: [
              {
                product: product.id,
                prices: prices.data.map((price) => price.id),
              },
            ],
          },
          subscription_cancel: {
            enabled: true,
            mode: 'at_period_end',
            cancellation_reason: {
              enabled: true,
              options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
            },
          },
          payment_method_update: {
            enabled: true,
          },
        },
      });

      console.log('[STRIPE] Billing portal configuration created:', {
        brand_organization_id: team.id,
        configuration_id: configuration.id,
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripe_customer_id,
      return_url: `${getAppUrl()}/dashboard`,
      configuration: configuration.id,
    });

    console.log('[STRIPE] Customer portal session created successfully:', {
      brand_organization_id: team.id,
      stripe_customer_id: team.stripe_customer_id,
      session_id: session.id,
      url: session.url,
    });

    return session;
  } catch (error: any) {
    console.error('[STRIPE] Error creating customer portal session:', {
      brand_organization_id: team.id,
      stripe_customer_id: team.stripe_customer_id,
      error_type: error?.type || error?.constructor?.name,
      error_code: error?.code,
      error_message: error?.message,
      error_param: error?.param,
      status_code: error?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}
