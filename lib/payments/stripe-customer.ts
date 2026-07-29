/**
 * Stripe Customer Management
 *
 * Handles Stripe customer creation and management to ensure customers exist
 * before checkout sessions are created (required for Stripe Accounts V2 in test mode).
 */

import { stripe } from './stripe-client';
import { createServiceRoleClient } from '@/lib/db/supabase';

interface EnsureStripeCustomerParams {
  userId: string;
  brandOrganizationId: string;
  email: string;
  currentCustomerId: string | null;
}

/**
 * Ensures a Stripe customer exists for the given brand organization.
 *
 * If the brand already has a Stripe customer ID, it returns that.
 * Otherwise, it creates a new Stripe customer and updates the database.
 *
 * This function is idempotent and safe to call multiple times.
 *
 * @param params - Customer creation parameters
 * @returns Stripe customer ID (existing or newly created)
 * @throws Error if customer creation or database update fails
 */
export async function ensureStripeCustomer({
  userId,
  brandOrganizationId,
  email,
  currentCustomerId,
}: EnsureStripeCustomerParams): Promise<string> {
  if (currentCustomerId) {
    return currentCustomerId;
  }

  // Pentest v2 A8-1: idempotent against parallel first-subscribe flows so we
  // don't create two Stripe customers for the same brand organization.
  const customer = await stripe.customers.create(
    {
      email,
      metadata: {
        brand_organization_id: brandOrganizationId,
        user_id: userId,
      },
      description: `Brand Organization ${brandOrganizationId}`,
    },
    { idempotencyKey: `brand-customer:${brandOrganizationId}` }
  );

  const supabase = createServiceRoleClient();
  const { error: updateError } = await supabase
    .from('brand_organizations')
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', brandOrganizationId);

  if (updateError) {
    console.error('[ensureStripeCustomer] Failed to update database:', updateError.message);
    throw new Error(`Failed to update brand organization with customer ID: ${updateError.message}`);
  }

  return customer.id;
}

