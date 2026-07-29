/**
 * Currency utilities for mapping countries to currencies and formatting.
 */

/**
 * Formatter cache to avoid recreating Intl.NumberFormat instances.
 * Key format: `${locale}-${currency}-${minDecimals}-${maxDecimals}`
 */
const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Get a cached Intl.NumberFormat instance for currency formatting.
 * Creates the formatter if it doesn't exist in the cache.
 */
function getCachedFormatter(
  locale: string,
  currency: string,
  minDecimals: number,
  maxDecimals: number
): Intl.NumberFormat {
  const key = `${locale}-${currency}-${minDecimals}-${maxDecimals}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Maps country names to their primary currency codes.
 * Uses ISO 4217 currency codes (3 letters).
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // North America
  'United States': 'usd',
  Canada: 'cad',
  Mexico: 'mxn',

  // Europe
  'United Kingdom': 'gbp',
  Ireland: 'eur',
  France: 'eur',
  Germany: 'eur',
  Italy: 'eur',
  Spain: 'eur',
  Portugal: 'eur',
  Netherlands: 'eur',
  Belgium: 'eur',
  Austria: 'eur',
  Finland: 'eur',
  Greece: 'eur',
  Luxembourg: 'eur',
  Slovenia: 'eur',
  Cyprus: 'eur',
  Malta: 'eur',
  Slovakia: 'eur',
  Estonia: 'eur',
  Latvia: 'eur',
  Lithuania: 'eur',
  Switzerland: 'chf',
  Norway: 'nok',
  Sweden: 'sek',
  Denmark: 'dkk',
  Poland: 'pln',
  'Czech Republic': 'czk',
  Hungary: 'huf',
  Romania: 'ron',
  Bulgaria: 'bgn',
  Croatia: 'hrk',
  Russia: 'rub',
  Ukraine: 'uah',
  Turkey: 'try',

  // Asia Pacific
  Japan: 'jpy',
  China: 'cny',
  'South Korea': 'krw',
  India: 'inr',
  Singapore: 'sgd',
  'Hong Kong': 'hkd',
  Taiwan: 'twd',
  Thailand: 'thb',
  Malaysia: 'myr',
  Indonesia: 'idr',
  Philippines: 'php',
  Vietnam: 'vnd',
  Australia: 'aud',
  'New Zealand': 'nzd',

  // Middle East
  'United Arab Emirates': 'aed',
  'Saudi Arabia': 'sar',
  Israel: 'ils',
  Qatar: 'qar',
  Kuwait: 'kwd',
  Bahrain: 'bhd',
  Oman: 'omr',
  Jordan: 'jod',
  Lebanon: 'lbp',
  Egypt: 'egp',

  // Africa
  'South Africa': 'zar',
  Nigeria: 'ngn',
  Kenya: 'kes',
  Ghana: 'ghs',
  Morocco: 'mad',
  Tunisia: 'tnd',
  Algeria: 'dzd',

  // South America
  Brazil: 'brl',
  Argentina: 'ars',
  Chile: 'clp',
  Colombia: 'cop',
  Peru: 'pen',
  Venezuela: 'ves',
  Ecuador: 'usd', // Uses USD
  Uruguay: 'uyu',
  Paraguay: 'pyg',
  Bolivia: 'bob',
};

/**
 * Gets the currency code for a given country name.
 * Falls back to USD if country is not found.
 *
 * @param country - Country name (e.g., "United States", "United Kingdom")
 * @returns ISO 4217 currency code (lowercase, e.g., "usd", "gbp", "eur")
 */
export function getCurrencyForCountry(country: string | null | undefined): string {
  if (!country) {
    return 'usd'; // Default to USD
  }

  // Try exact match first
  const currency = COUNTRY_TO_CURRENCY[country];
  if (currency) {
    return currency;
  }

  // Try case-insensitive match
  const countryLower = country.toLowerCase();
  for (const [key, value] of Object.entries(COUNTRY_TO_CURRENCY)) {
    if (key.toLowerCase() === countryLower) {
      return value;
    }
  }

  // Try partial match (e.g., "United Kingdom" matches "United Kingdom")
  // This handles cases where the country name might have slight variations
  const countryWords = countryLower.split(/\s+/);
  for (const [key, value] of Object.entries(COUNTRY_TO_CURRENCY)) {
    const keyLower = key.toLowerCase();
    const keyWords = keyLower.split(/\s+/);
    if (
      countryWords.some((word) => keyLower.includes(word)) ||
      keyWords.some((word) => countryLower.includes(word))
    ) {
      return value;
    }
  }

  // Default to USD if no match found
  return 'usd';
}

/**
 * Maps country to one of the accepted platform currencies (GBP, USD, EUR).
 * Used during onboarding to set default currency based on user's location.
 *
 * @param country - Country name (e.g., "United States", "United Kingdom", "France")
 * @returns One of: "GBP", "USD", or "EUR" (uppercase)
 */
export function getAcceptedCurrencyForCountry(
  country: string | null | undefined
): 'GBP' | 'USD' | 'EUR' {
  if (!country) {
    return 'EUR'; // Default to EUR
  }

  // Get currency from country mapping
  const currency = getCurrencyForCountry(country).toUpperCase();

  // Map to accepted currencies
  // GBP countries
  if (currency === 'GBP') {
    return 'GBP';
  }

  // USD countries
  if (currency === 'USD') {
    return 'USD';
  }

  // All other countries default to EUR
  return 'EUR';
}

/**
 * Formats a currency amount with the appropriate symbol.
 *
 * @param amount - Amount in cents (for most currencies) or base units
 * @param currency - Currency code (e.g., "usd", "gbp", "eur")
 * @returns Formatted string (e.g., "$10.00", "£10.00", "€10.00")
 */
export function formatCurrencyAmount(amount: number, currency: string = 'usd'): string {
  const amountInCurrency = amount / 100; // Convert cents to currency units

  // Special handling for JPY (no decimals)
  if (currency === 'jpy' || currency === 'krw' || currency === 'vnd') {
    return getCachedFormatter('en-US', currency, 0, 0).format(amountInCurrency);
  }

  return getCachedFormatter('en-US', currency, 2, 2).format(amountInCurrency);
}

/**
 * Gets the currency symbol for a given currency code.
 *
 * @param currency - Currency code (e.g., "usd", "gbp", "eur")
 * @returns Currency symbol (e.g., "$", "£", "€")
 */
export function getCurrencySymbol(currency: string = 'usd'): string {
  const formatter = getCachedFormatter('en-US', currency, 0, 0);
  // Extract symbol from formatted string
  const parts = formatter.formatToParts(1);
  const symbolPart = parts.find((part) => part.type === 'currency');
  return symbolPart?.value || '$';
}

/**
 * Gets the minimum amount in cents for a given currency.
 * Some currencies have different minimum amounts.
 *
 * @param currency - Currency code
 * @returns Minimum amount in cents
 */
export function getMinimumAmount(currency: string = 'usd'): number {
  // Most currencies: $10 minimum
  const defaults: Record<string, number> = {
    jpy: 1000, // ¥1000 minimum for JPY
    krw: 10000, // ₩10,000 minimum for KRW
    vnd: 200000, // ₫200,000 minimum for VND
  };

  return defaults[currency.toLowerCase()] || 1000; // $10.00 = 1000 cents
}
