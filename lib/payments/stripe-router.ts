/**
 * Stripe Router
 *
 * Routes Stripe operations to the main Stripe account.
 *
 * Architecture (Post-Migration):
 * - Single US Account: Handles ALL creators worldwide
 * - All payouts in USD, creators handle their own FX
 *
 * Note: stripe_region column is kept for backwards compatibility
 * but always set to 'us' for new accounts.
 */
import type Stripe from 'stripe';
import { stripe } from './stripe-client';

/**
 * Stripe region identifiers.
 * Kept for backwards compatibility - all new accounts use 'us'.
 */
export type StripeRegion = 'eu' | 'us';

/**
 * Returns the Stripe region for a country.
 * Post-migration: Always returns 'us' since we use a single US account.
 *
 * @param countryISO - ISO 3166-1 alpha-2 country code (ignored post-migration)
 * @returns Always 'us'
 */
export function getStripeRegion(_countryISO: string): StripeRegion {
  return 'us';
}

/**
 * Gets the Stripe instance.
 * Post-migration: Always returns the single US account instance.
 *
 * @param _region - Ignored post-migration, kept for API compatibility
 * @returns The Stripe SDK instance
 */
export function getStripeForRegion(_region: StripeRegion): Stripe {
  return stripe;
}

/**
 * Gets the Stripe instance for a country.
 * Post-migration: Always returns the single US account instance.
 *
 * @param _countryISO - Ignored post-migration, kept for API compatibility
 * @returns The Stripe SDK instance
 */
export function getStripeForCountry(_countryISO: string): Stripe {
  return stripe;
}

/**
 * Retrieves a connected account from Stripe.
 * Post-migration: Uses single US account.
 *
 * @param stripeAccountId - The Stripe Connect account ID
 * @returns The account and region ('us')
 */
export async function retrieveAccountFromAnyRegion(
  stripeAccountId: string
): Promise<{ account: Stripe.Account; region: StripeRegion } | null> {
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return { account, region: 'us' };
  } catch (error: unknown) {
    const stripeError = error as { type?: string };
    if (stripeError.type === 'StripeInvalidRequestError') {
      return null;
    }
    throw error;
  }
}

/**
 * Logs routing decision for debugging.
 */
export function logRoutingDecision(
  operation: string,
  countryISO: string,
  region: StripeRegion,
  additionalContext?: Record<string, unknown>
): void {
  console.log(`[STRIPE ROUTER] ${operation}:`, {
    country: countryISO,
    routed_to: region,
    ...additionalContext,
  });
}
