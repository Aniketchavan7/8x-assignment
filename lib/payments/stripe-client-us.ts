/**
 * Stripe Client Instance (US)
 *
 * Secondary Stripe SDK initialization for US-based creators.
 * Uses lazy loading to prevent build-time errors when environment variables aren't available.
 *
 * This account is used specifically for:
 * - Creating Stripe Express accounts for US creators
 * - Processing transfers to US bank accounts
 * - Handling payouts to US creators
 *
 * The EU account (stripe-client.ts) handles all other regions.
 */
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY_US } from '@/lib/env';

let stripeUSInstance: Stripe | null = null;

function getStripeUSInstance(): Stripe {
  if (!stripeUSInstance) {
    if (!STRIPE_SECRET_KEY_US) {
      throw new Error(
        'STRIPE_SECRET_KEY_US environment variable is not set. ' +
          'This is required for US creator payouts. Please configure it in your environment variables.'
      );
    }
    stripeUSInstance = new Stripe(STRIPE_SECRET_KEY_US, {
      apiVersion: '2025-04-30.basil',
    });
  }
  return stripeUSInstance;
}

/**
 * Lazy-initialized US Stripe instance proxy.
 * Prevents build-time errors when environment variables aren't available.
 */
export const stripeUS = new Proxy({} as Stripe, {
  get(_, prop) {
    const instance = getStripeUSInstance();
    const value = instance[prop as keyof Stripe];
    // If the value is an object (like webhooks, checkout, etc.), return it as-is
    // If it's a function, bind it to maintain proper context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  // Also handle property descriptor access for better compatibility
  getOwnPropertyDescriptor(_, prop) {
    const instance = getStripeUSInstance();
    const descriptor = Object.getOwnPropertyDescriptor(instance, prop);
    return descriptor;
  },
  ownKeys() {
    const instance = getStripeUSInstance();
    return Reflect.ownKeys(instance);
  },
});

/**
 * Check if US Stripe is configured.
 * Useful for conditional logic when US payouts might not be set up.
 */
export function isUSStripeConfigured(): boolean {
  return !!STRIPE_SECRET_KEY_US;
}
