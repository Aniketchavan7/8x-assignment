/**
 * Stripe Client Instance
 *
 * Core Stripe SDK initialization with lazy loading to prevent
 * build-time errors when environment variables aren't available.
 */
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '@/lib/env';

let stripeInstance: Stripe | null = null;

function getStripeInstance(): Stripe {
  if (!stripeInstance) {
    if (!STRIPE_SECRET_KEY) {
      throw new Error(
        'STRIPE_SECRET_KEY environment variable is not set. Please configure it in your environment variables.'
      );
    }
    stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-04-30.basil',
    });
  }
  return stripeInstance;
}

/**
 * Lazy-initialized Stripe instance proxy.
 * Prevents build-time errors when environment variables aren't available.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    const instance = getStripeInstance();
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
    const instance = getStripeInstance();
    const descriptor = Object.getOwnPropertyDescriptor(instance, prop);
    return descriptor;
  },
  ownKeys() {
    const instance = getStripeInstance();
    return Reflect.ownKeys(instance);
  },
});
