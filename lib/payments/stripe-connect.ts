import { createHash } from 'node:crypto';
import { stripe } from './stripe';
import { getAppUrl } from '@/lib/utils/env-detection';
import type Stripe from 'stripe';
import {
  getStripeRegion,
  getStripeForRegion,
  getStripeForCountry,
  retrieveAccountFromAnyRegion,
  logRoutingDecision,
  type StripeRegion,
} from './stripe-router';

/**
 * Get business_profile URL for a creator.
 * Uses the app URL (app.example.com) for Stripe verification.
 * Uses format: https://app.example.com/creator/{creator_id}
 *
 * Note: Stripe requires a valid public URL (not localhost), so we always
 * use the production URL even in development.
 *
 * Args:
 *   creatorId: The creator profile ID
 */
function getBusinessProfileUrl(creatorId: string): string {
  // Use app URL for Stripe business profile verification
  // Stripe requires a valid public URL, so use production URL even in dev
  const appUrl = getAppUrl();

  // If the URL is localhost/local, use production URL for Stripe
  // Stripe doesn't accept localhost URLs for business_profile.url
  const isLocalhost =
    appUrl.includes('localhost') ||
    appUrl.includes('127.0.0.1') ||
    appUrl.includes('0.0.0.0') ||
    !appUrl.startsWith('https://');

  const urlToUse = isLocalhost ? 'https://app.example.com' : appUrl;
  return `${urlToUse}/creator/${creatorId}`;
}

/**
 * Create a Stripe Express Connected Account for a creator.
 *
 * Uses the appropriate regional Stripe account based on the creator's country:
 * - US creators → US Stripe account (to enable US bank payouts)
 * - All other countries → EU Stripe account (default)
 *
 * Note: Stripe automatically sets the default_currency based on the country.
 * All internal payments on the platform are in USD.
 *
 * Args:
 *   email: Creator's email address
 *   creatorId: Creator profile ID
 *   country: ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'FR')
 *            Defaults to 'US'. This determines which banks are available during onboarding.
 *            IMPORTANT: Country cannot be changed after account creation.
 *
 * Returns:
 *   Object containing:
 *   - accountId: Stripe account ID (e.g., 'acct_1234...')
 *   - region: The Stripe region used ('eu' or 'us')
 */
export async function createConnectedAccount(
  email: string,
  creatorId: string,
  country: string = 'US'
): Promise<{ accountId: string; region: StripeRegion }> {
  const businessUrl = getBusinessProfileUrl(creatorId);

  // Ensure country is uppercase (Stripe expects uppercase ISO codes)
  const countryISO = country.toUpperCase();

  // Determine which Stripe account to use based on country
  const region = getStripeRegion(countryISO);
  const stripeInstance = getStripeForRegion(region);

  logRoutingDecision('createConnectedAccount', countryISO, region, {
    creator_id: creatorId,
    email: email,
  });

  // Countries that support full service agreement with cross-border transfers
  // US, UK, EEA (European Economic Area), Canada, Switzerland
  const FULL_SERVICE_COUNTRIES = new Set([
    'US',
    'GB',
    'CA',
    'CH',
    // EEA countries
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'IS', 'LI',
  ]);

  const useFullService = FULL_SERVICE_COUNTRIES.has(countryISO);

  const capabilities: Stripe.AccountCreateParams['capabilities'] = {
    transfers: { requested: true },
  };

  if (useFullService) {
    capabilities.card_payments = { requested: true };
  }

  console.log('[STRIPE CONNECT] Creating connected account:', {
    creator_id: creatorId,
    email: email,
    country: countryISO,
    business_profile_url: businessUrl,
    stripe_region: region,
    service_agreement: useFullService ? 'full' : 'recipient',
    capabilities: Object.keys(capabilities),
  });

  try {
    const accountParams: Stripe.AccountCreateParams = {
      type: 'express',
      country: countryISO,
      email: email,
      capabilities,
      business_type: 'individual',
      business_profile: {
        url: businessUrl,
        mcc: '7311',
      },
      metadata: {
        platform: 'example.com',
        creator_id: creatorId,
        stripe_region: region,
      },
    };

    // Non-full-service countries require recipient agreement for cross-border transfers
    if (!useFullService) {
      accountParams.tos_acceptance = {
        service_agreement: 'recipient',
      };
    }

    // Pentest v2 A8-1: idempotency key prevents parallel onboarding attempts
    // from creating two Stripe Connect accounts for the same creator.
    const account = await stripeInstance.accounts.create(accountParams, {
      idempotencyKey: `connect-account:${creatorId}:${region}`,
    });

    // Set manual payout schedule - platform triggers payouts, not automatic
    // See: https://docs.stripe.com/connect/manual-payouts
    await stripeInstance.accounts.update(
      account.id,
      {
        settings: {
          payouts: {
            schedule: {
              interval: 'manual',
            },
          },
        },
      },
      { idempotencyKey: `connect-account-manual-payout:${account.id}` }
    );

    console.log('[STRIPE CONNECT] Connected account created successfully:', {
      creator_id: creatorId,
      stripe_account_id: account.id,
      country: account.country,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      stripe_region: region,
      payout_schedule: 'manual',
    });

    return { accountId: account.id, region };
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE CONNECT] Error creating connected account:', {
      creator_id: creatorId,
      email: email,
      country: countryISO,
      stripe_region: region,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}

/**
 * Update existing Stripe account to set business_profile.url if missing.
 * This prevents Stripe from requiring it as a future requirement.
 *
 * Automatically detects which regional Stripe account the Express account belongs to.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   creatorId: Creator profile ID (optional, will try to get from account metadata or database)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 */
export async function updateAccountBusinessProfile(
  stripeAccountId: string,
  creatorId?: string,
  region?: StripeRegion
): Promise<void> {
  try {
    // Find the account and determine which Stripe instance it belongs to
    let account: Stripe.Account;
    let stripeInstance: Stripe;
    let detectedRegion: StripeRegion;

    if (region) {
      // Use provided region
      stripeInstance = getStripeForRegion(region);
      account = await stripeInstance.accounts.retrieve(stripeAccountId);
      detectedRegion = region;
    } else {
      // Auto-detect region by trying to retrieve from both
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        console.error('[STRIPE CONNECT] Account not found in any region:', {
          stripe_account_id: stripeAccountId,
        });
        return;
      }
      account = result.account;
      detectedRegion = result.region;
      stripeInstance = getStripeForRegion(detectedRegion);
    }

    // Get creator ID from metadata if not provided
    let finalCreatorId = creatorId || account.metadata?.creator_id;

    // If still no creator ID, try to look it up from database
    if (!finalCreatorId) {
      const { createServiceRoleClient } = await import('@/lib/db/supabase');
      const supabase = createServiceRoleClient();
      const { data: creator } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('stripe_account_id', stripeAccountId)
        .maybeSingle();

      if (creator) {
        finalCreatorId = creator.id;
      }
    }

    if (!finalCreatorId) {
      console.warn('[STRIPE CONNECT] Could not determine creator ID for account:', {
        stripe_account_id: stripeAccountId,
      });
      return;
    }

    const businessUrl = getBusinessProfileUrl(finalCreatorId);
    console.log('[STRIPE CONNECT] Updating account business profile:', {
      creator_id: finalCreatorId,
      stripe_account_id: stripeAccountId,
      business_profile_url: businessUrl,
      current_url: account.business_profile?.url || null,
      stripe_region: detectedRegion,
    });

    // Only update if business_profile.url is not set or doesn't match
    if (!account.business_profile?.url || account.business_profile.url !== businessUrl) {
      await stripeInstance.accounts.update(
        stripeAccountId,
        {
          business_profile: {
            url: businessUrl,
          },
        },
        { idempotencyKey: `connect-account-business-url:${stripeAccountId}:${businessUrl}` }
      );
      console.log('[STRIPE CONNECT] Account business_profile.url updated successfully:', {
        creator_id: finalCreatorId,
        stripe_account_id: stripeAccountId,
        business_profile_url: businessUrl,
        stripe_region: detectedRegion,
      });
    } else {
      console.log('[STRIPE CONNECT] Account already has correct business_profile.url:', {
        creator_id: finalCreatorId,
        stripe_account_id: stripeAccountId,
        business_profile_url: account.business_profile.url,
      });
    }
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE CONNECT] Error updating business_profile:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    // Don't throw - this is not critical
  }
}

/**
 * Generate Stripe onboarding URL for creator to connect their bank account.
 *
 * Automatically detects which regional Stripe account the Express account belongs to.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   returnUrl: URL to redirect to after onboarding completion
 *   refreshUrl: URL to redirect to if onboarding needs to be refreshed
 *   creatorId: Creator profile ID (optional, will be looked up if not provided)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Onboarding URL string
 */
export async function createAccountLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string,
  creatorId?: string,
  region?: StripeRegion,
  options?: { skipBusinessProfileUpdate?: boolean }
): Promise<string> {
  console.log('[STRIPE CONNECT] Creating account link:', {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId || null,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    stripe_region: region || 'auto-detect',
    skip_business_profile_update: options?.skipBusinessProfileUpdate || false,
  });

  try {
    // Determine which Stripe instance to use
    let stripeInstance: Stripe;
    let detectedRegion: StripeRegion;

    if (region) {
      stripeInstance = getStripeForRegion(region);
      detectedRegion = region;
    } else {
      // Auto-detect by retrieving the account
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        throw new Error(`Stripe account ${stripeAccountId} not found in any region`);
      }
      stripeInstance = getStripeForRegion(result.region);
      detectedRegion = result.region;
    }

    // Ensure business_profile.url is set before creating account link
    // Skip this for newly created accounts since URL is already set at creation time
    if (!options?.skipBusinessProfileUpdate) {
      await updateAccountBusinessProfile(stripeAccountId, creatorId, detectedRegion);
    }

    // Pentest v2 A8-1: scope idempotency to a minute bucket so double-clicks
    // don't burn Stripe rate limits creating short-lived links.
    const accountLink = await stripeInstance.accountLinks.create(
      {
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
        collection_options: {
          fields: 'currently_due',
        },
      },
      { idempotencyKey: `account-link:${stripeAccountId}:${Math.floor(Date.now() / 60000)}` }
    );

    console.log('[STRIPE CONNECT] Account link created successfully:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      url: accountLink.url,
      expires_at: accountLink.expires_at
        ? new Date(accountLink.expires_at * 1000).toISOString()
        : null,
      stripe_region: detectedRegion,
    });

    return accountLink.url;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE CONNECT] Error creating account link:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}

/**
 * Check if creator has completed Stripe onboarding and get account status.
 *
 * Automatically detects which regional Stripe account the Express account belongs to.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   creatorId: Creator profile ID (optional, will be looked up if not provided)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Object with onboarding status, capabilities, requirements, and region
 */
export async function getAccountStatus(
  stripeAccountId: string,
  creatorId?: string,
  region?: StripeRegion
) {
  console.log('[STRIPE CONNECT] Checking account status:', {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId || null,
    stripe_region: region || 'auto-detect',
  });

  try {
    // Determine which Stripe instance to use
    let account: Stripe.Account;
    let detectedRegion: StripeRegion;

    if (region) {
      const stripeInstance = getStripeForRegion(region);
      account = await stripeInstance.accounts.retrieve(stripeAccountId);
      detectedRegion = region;
    } else {
      // Auto-detect by retrieving from any region
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        throw new Error(`Stripe account ${stripeAccountId} not found in any region`);
      }
      account = result.account;
      detectedRegion = result.region;
    }

    // Ensure business_profile.url is set to avoid future requirements
    await updateAccountBusinessProfile(stripeAccountId, creatorId, detectedRegion);

    // Determine if account requires action from the user
    const currentlyDue = account.requirements?.currently_due || [];
    const pastDue = account.requirements?.past_due || [];
    const pendingVerification = account.requirements?.pending_verification || [];
    const disabledReason = account.requirements?.disabled_reason || null;
    const errors = account.requirements?.errors || [];

    // Account requires action if:
    // 1. There are currently_due or past_due requirements
    // 2. Payouts are disabled (regardless of reason)
    // 3. There's a disabled_reason set
    const requiresAction =
      currentlyDue.length > 0 ||
      pastDue.length > 0 ||
      !account.payouts_enabled ||
      disabledReason !== null;

    const status = {
      onboardingComplete: account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      detailsSubmitted: account.details_submitted || false,
      requiresInfo: currentlyDue.length > 0,
      futureRequirements: account.requirements?.eventually_due || [],
      region: detectedRegion,
      // New detailed requirements fields
      requiresAction,
      currentlyDue,
      pastDue,
      pendingVerification,
      disabledReason,
      errors: errors.map((e) => ({
        code: e.code,
        reason: e.reason,
        requirement: e.requirement,
      })),
    };

    console.log('[STRIPE CONNECT] Account status retrieved:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || account.metadata?.creator_id || null,
      onboarding_complete: status.onboardingComplete,
      charges_enabled: status.chargesEnabled,
      payouts_enabled: status.payoutsEnabled,
      requires_info: status.requiresInfo,
      requires_action: status.requiresAction,
      currently_due_count: currentlyDue.length,
      past_due_count: pastDue.length,
      pending_verification_count: pendingVerification.length,
      disabled_reason: disabledReason,
      errors_count: errors.length,
      stripe_region: detectedRegion,
    });

    return status;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE CONNECT] Error checking account status:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}

/**
 * Transfer money from platform to creator's Stripe account.
 * Platform absorbs the 0.5% Stripe Connect transfer fee.
 *
 * IMPORTANT: The transfer must go through the same regional Stripe account
 * that owns the Express account. This function auto-detects the region
 * or uses the provided region parameter.
 *
 * Args:
 *   stripeAccountId: Creator's Stripe Connect account ID
 *   amountCents: Amount to transfer in cents (e.g., 10000 = $100.00)
 *   description: Description for the transfer
 *   currency: Currency code (must be one of: GBP, USD, EUR) - defaults to USD
 *   metadata: Additional metadata to attach to the transfer
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Stripe Transfer object
 */
export async function transferToCreator(
  stripeAccountId: string,
  amountCents: number,
  description: string,
  currency: string = 'usd',
  metadata: Record<string, string | number | boolean> = {},
  region?: StripeRegion,
  idempotencyKey?: string
) {
  // Ensure currency is lowercase for Stripe API
  const currencyLower = currency.toLowerCase();

  // Validate currency is one of the accepted currencies
  if (!['gbp', 'usd', 'eur'].includes(currencyLower)) {
    throw new Error(`Invalid currency: ${currency}. Must be one of: GBP, USD, EUR`);
  }

  // Validate amount is positive integer
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Invalid amount: ${amountCents}. Must be a positive integer in cents.`);
  }

  // Validate account ID format
  if (!stripeAccountId || !stripeAccountId.startsWith('acct_')) {
    throw new Error(`Invalid Stripe account ID: ${stripeAccountId}`);
  }

  // Extract creator ID from metadata if available
  const creatorId = metadata?.creator_id || null;

  // Determine which Stripe instance to use
  let stripeInstance: Stripe;
  let detectedRegion: StripeRegion;

  if (region) {
    stripeInstance = getStripeForRegion(region);
    detectedRegion = region;
  } else {
    // Auto-detect region by retrieving account
    const result = await retrieveAccountFromAnyRegion(stripeAccountId);
    if (!result) {
      throw new Error(
        `Stripe account ${stripeAccountId} not found in any region. Cannot process transfer.`
      );
    }
    stripeInstance = getStripeForRegion(result.region);
    detectedRegion = result.region;
  }

  logRoutingDecision('transferToCreator', 'N/A', detectedRegion, {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId,
    amount_cents: amountCents,
    currency: currencyLower,
  });

  // Log transfer attempt for debugging
  console.log('[STRIPE TRANSFER] Creating transfer:', {
    creator_id: creatorId,
    destination: stripeAccountId,
    amount_cents: amountCents,
    currency: currencyLower,
    description: description.substring(0, 100), // Truncate long descriptions
    stripe_region: detectedRegion,
  });

  // Pentest v2 A8-1: transfers must be idempotent so retries / double-clicks
  // don't double-pay a creator. Priority:
  //   1. caller-supplied idempotencyKey (most deterministic — e.g. the ledger
  //      row id from record_earning_atomic);
  //   2. metadata.transaction_id when the caller passed one;
  //   3. a minute-bucket fallback keyed by account + amount + description so
  //      two distinct batches in the same minute don't collide (description
  //      usually contains a submission / creator identifier).
  const fallbackDescriptorRaw = `${stripeAccountId}:${amountCents}:${description}:${Math.floor(Date.now() / 60000)}`;
  const fallbackDescriptor = createHash('sha256').update(fallbackDescriptorRaw).digest('hex').slice(0, 32);
  const derivedKey =
    idempotencyKey ??
    (metadata?.transaction_id
      ? `transfer:${metadata.transaction_id}`
      : `transfer:${fallbackDescriptor}`);

  try {
    const transfer = await stripeInstance.transfers.create(
      {
        amount: amountCents,
        currency: currencyLower,
        destination: stripeAccountId,
        description: description,
        metadata: {
          ...metadata,
          platform: 'example.com',
          stripe_region: detectedRegion,
        },
      },
      { idempotencyKey: derivedKey }
    );

    console.log('[STRIPE TRANSFER] Transfer created successfully:', {
      creator_id: creatorId,
      transfer_id: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      destination: transfer.destination,
      created: transfer.created ? new Date(transfer.created * 1000).toISOString() : null,
      stripe_region: detectedRegion,
    });

    return transfer;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      decline_code?: string;
      statusCode?: number;
    };
    // Log detailed error before rethrowing
    console.error('[STRIPE TRANSFER] Transfer creation failed:', {
      creator_id: creatorId,
      destination: stripeAccountId,
      amount_cents: amountCents,
      currency: currencyLower,
      stripe_region: detectedRegion,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      error_decline_code: stripeError?.decline_code,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });

    // Re-throw to be caught by caller
    throw error;
  }
}

/**
 * Generate a login link for a Stripe Express account to access their dashboard.
 *
 * Automatically detects which regional Stripe account the Express account belongs to.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   creatorId: Creator profile ID (optional, for logging)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Login link URL string
 */
export async function createLoginLink(
  stripeAccountId: string,
  creatorId?: string,
  region?: StripeRegion
): Promise<string> {
  console.log('[STRIPE CONNECT] Creating login link:', {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId || null,
    stripe_region: region || 'auto-detect',
  });

  try {
    // Determine which Stripe instance to use
    let stripeInstance: Stripe;
    let detectedRegion: StripeRegion;

    if (region) {
      stripeInstance = getStripeForRegion(region);
      detectedRegion = region;
    } else {
      // Auto-detect by retrieving the account
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        throw new Error(`Stripe account ${stripeAccountId} not found in any region`);
      }
      stripeInstance = getStripeForRegion(result.region);
      detectedRegion = result.region;
    }

    const loginLink = await stripeInstance.accounts.createLoginLink(stripeAccountId);

    console.log('[STRIPE CONNECT] Login link created successfully:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      url: loginLink.url,
      stripe_region: detectedRegion,
    });

    return loginLink.url;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE CONNECT] Error creating login link:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}

/**
 * Balance information for a connected account.
 */
export interface ConnectedAccountBalance {
  /** Available balance in cents */
  available_cents: number;
  /** Pending balance in cents (not yet available for payout) */
  pending_cents: number;
  /** Currency code (lowercase, e.g., 'usd', 'eur') */
  currency: string;
  /** Whether instant payouts are available */
  instant_available: boolean;
  /** Amount available for instant payout in cents */
  instant_available_cents: number;
}

/**
 * Get the balance of a Stripe Connect account.
 *
 * Fetches the real-time balance directly from Stripe's API.
 * Works server-side, bypassing any client-side ad blockers.
 *
 * Automatically detects which regional Stripe account the Express account belongs to.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   creatorId: Creator profile ID (optional, for logging)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Balance information including available, pending, and instant payout amounts
 */
export async function getConnectedAccountBalance(
  stripeAccountId: string,
  creatorId?: string,
  region?: StripeRegion
): Promise<ConnectedAccountBalance> {
  console.log('[STRIPE BALANCE] Fetching balance:', {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId || null,
    stripe_region: region || 'auto-detect',
  });

  try {
    // Determine which Stripe instance to use
    let stripeInstance: Stripe;
    let detectedRegion: StripeRegion;

    if (region) {
      stripeInstance = getStripeForRegion(region);
      detectedRegion = region;
    } else {
      // Auto-detect by retrieving the account
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        throw new Error(`Stripe account ${stripeAccountId} not found in any region`);
      }
      stripeInstance = getStripeForRegion(result.region);
      detectedRegion = result.region;
    }

    // Fetch balance for the connected account using stripeAccount parameter
    const balance = await stripeInstance.balance.retrieve({
      stripeAccount: stripeAccountId,
    });

    // Get the primary currency balance (usually the first one)
    // Connected accounts typically have one currency
    const availableBalance = balance.available[0] || { amount: 0, currency: 'usd' };
    const pendingBalance = balance.pending[0] || { amount: 0, currency: availableBalance.currency };

    // Check for instant payout availability
    const instantAvailable = balance.instant_available?.[0];

    const result: ConnectedAccountBalance = {
      available_cents: availableBalance.amount,
      pending_cents: pendingBalance.amount,
      currency: availableBalance.currency,
      instant_available: !!instantAvailable && instantAvailable.amount > 0,
      instant_available_cents: instantAvailable?.amount || 0,
    };

    console.log('[STRIPE BALANCE] Balance retrieved:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      available_cents: result.available_cents,
      pending_cents: result.pending_cents,
      currency: result.currency,
      instant_available: result.instant_available,
      stripe_region: detectedRegion,
    });

    return result;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE BALANCE] Error fetching balance:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });
    throw error;
  }
}

/**
 * Information about a failed payout.
 */
export interface FailedPayoutInfo {
  /** Whether there are recent failed payouts */
  has_failed_payouts: boolean;
  /** Number of failed payouts in the last 30 days */
  failed_count: number;
  /** Most recent failure reason (if any) */
  failure_message?: string;
  /** Most recent failure code (if any) */
  failure_code?: string;
}

/**
 * Check for recent failed payouts on a connected account.
 *
 * Only shows a warning if the MOST RECENT payout failed.
 * If there's been a successful payout after a failure, no warning is shown.
 *
 * Args:
 *   stripeAccountId: The Stripe Connect account ID
 *   creatorId: Creator profile ID (optional, for logging)
 *   region: Stripe region (optional, will be auto-detected if not provided)
 *
 * Returns:
 *   Information about failed payouts
 */
export async function checkFailedPayouts(
  stripeAccountId: string,
  creatorId?: string,
  region?: StripeRegion
): Promise<FailedPayoutInfo> {
  console.log('[STRIPE PAYOUTS] Checking for failed payouts:', {
    stripe_account_id: stripeAccountId,
    creator_id: creatorId || null,
    stripe_region: region || 'auto-detect',
  });

  try {
    // Determine which Stripe instance to use
    let stripeInstance: Stripe;
    let detectedRegion: StripeRegion;

    if (region) {
      stripeInstance = getStripeForRegion(region);
      detectedRegion = region;
    } else {
      // Auto-detect by retrieving the account
      const result = await retrieveAccountFromAnyRegion(stripeAccountId);
      if (!result) {
        throw new Error(`Stripe account ${stripeAccountId} not found in any region`);
      }
      stripeInstance = getStripeForRegion(result.region);
      detectedRegion = result.region;
    }

    // Get the most recent payout to check its status
    const recentPayouts = await stripeInstance.payouts.list(
      {
        limit: 1,
      },
      {
        stripeAccount: stripeAccountId,
      }
    );

    const mostRecentPayout = recentPayouts.data[0];

    // Only show warning if the most recent payout failed
    // If a successful payout happened after a failure, don't show warning
    const hasFailed = mostRecentPayout?.status === 'failed';

    const result: FailedPayoutInfo = {
      has_failed_payouts: hasFailed,
      failed_count: hasFailed ? 1 : 0,
      failure_message: hasFailed ? mostRecentPayout?.failure_message || undefined : undefined,
      failure_code: hasFailed ? mostRecentPayout?.failure_code || undefined : undefined,
    };

    console.log('[STRIPE PAYOUTS] Failed payout check complete:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      most_recent_payout_status: mostRecentPayout?.status || 'none',
      has_failed_payouts: result.has_failed_payouts,
      failure_code: result.failure_code,
      stripe_region: detectedRegion,
    });

    return result;
  } catch (error: unknown) {
    const stripeError = error as {
      type?: string;
      code?: string;
      message?: string;
      param?: string;
      statusCode?: number;
    };
    console.error('[STRIPE PAYOUTS] Error checking failed payouts:', {
      stripe_account_id: stripeAccountId,
      creator_id: creatorId || null,
      error_type: stripeError?.type || (error as Error)?.constructor?.name,
      error_code: stripeError?.code,
      error_message: stripeError?.message,
      error_param: stripeError?.param,
      status_code: stripeError?.statusCode,
      raw_error: error,
    });

    // Return safe default - don't block the UI if this check fails
    return {
      has_failed_payouts: false,
      failed_count: 0,
    };
  }
}
