/**
 * Stripe Payments Module
 *
 * Re-exports all Stripe-related functionality from specialized modules.
 * This maintains backward compatibility with existing imports.
 *
 * Module Structure:
 * - stripe-client.ts     - Core Stripe SDK instance (EU)
 * - stripe-client-us.ts  - US Stripe SDK instance (for US payouts)
 * - stripe-router.ts     - Region-based routing logic
 * - stripe-checkout.ts   - Checkout sessions & customer portal
 * - stripe-subscriptions.ts - Subscription handling & queries
 * - stripe-webhooks.ts   - Webhook event handlers
 * - stripe-connect.ts    - Stripe Connect (creator accounts)
 */

// Core Stripe instances
export { stripe } from './stripe-client';
export { stripeUS, isUSStripeConfigured } from './stripe-client-us';

// Region routing
export {
  getStripeRegion,
  getStripeForRegion,
  getStripeForCountry,
  retrieveAccountFromAnyRegion,
  type StripeRegion,
} from './stripe-router';

// Checkout & Portal
export {
  createCheckoutSession,
  createDepositCheckoutSession,
  createCustomerPortalSession,
} from './stripe-checkout';

// Subscriptions
export {
  handleSubscriptionChange,
  getBrandSubscriptionStatus,
} from './stripe-subscriptions';

// Webhook Handlers
export {
  // Account
  handleAccountUpdate,
  // Transfers
  handleTransferCreated,
  handleTransferReversed,
  // Payouts
  handlePayoutCreated,
  handlePayoutPaid,
  handlePayoutUpdated,
  handlePayoutFailed,
  handlePayoutCanceled,
  // Invoices
  handleInvoicePaymentFailed,
  handleInvoicePaid,
  // Deposits
  handleDepositPayment,
} from './stripe-webhooks';
