/**
 * Utility to map ISO 3166-1 alpha-2 country codes to country names.
 * Uses i18n-iso-countries library for comprehensive country code mappings.
 * Handles conversion between ISO codes and country names matching our COUNTRIES array.
 */

import * as countries from 'i18n-iso-countries';

// Register English locale for country names
// Using require for JSON import as TypeScript doesn't support JSON imports without special config
const enLocale = require('i18n-iso-countries/langs/en.json');
countries.registerLocale(enLocale);

/**
 * Maps ISO library country names to our COUNTRIES array format.
 * The library uses official ISO names which may differ from our COUNTRIES array.
 * Most names match directly now, but some still need conversion.
 */
const ISO_NAME_TO_COUNTRIES_FORMAT: Record<string, string> = {
  'United States of America': 'United States',
  'Cape Verde': 'Cabo Verde',
  // Add more mappings as discrepancies are discovered
};

/**
 * Reverse mapping: COUNTRIES array format to ISO library names.
 * Only needed for countries where our COUNTRIES array format doesn't match
 * the library's format. Most names (like "South Korea", "North Korea") now match directly.
 */
const COUNTRIES_FORMAT_TO_ISO_NAME: Record<string, string> = {
  'Cabo Verde': 'Cape Verde',
  // Add more mappings only for countries that the library doesn't recognize directly
};

/**
 * Converts an ISO 3166-1 alpha-2 country code to a country name.
 * Uses i18n-iso-countries library and maps to our COUNTRIES array format.
 *
 * @param isoCode - ISO 3166-1 alpha-2 code (e.g., "US", "GB", "FR")
 * @returns Country name matching COUNTRIES array, or null if not found
 */
export function isoCodeToCountryName(isoCode: string | null | undefined): string | null {
  if (!isoCode) {
    return null;
  }

  const code = isoCode.toUpperCase().trim();

  // Get country name from library (returns official name like "United States of America")
  const isoCountryName = countries.getName(code, 'en');

  if (!isoCountryName) {
    return null;
  }

  // Map to our COUNTRIES array format if needed
  return ISO_NAME_TO_COUNTRIES_FORMAT[isoCountryName] || isoCountryName;
}

/**
 * Converts a country name to ISO 3166-1 alpha-2 country code.
 * Handles both our COUNTRIES array format and ISO standard names.
 *
 * @param countryName - Country name (e.g., "United States", "South Korea")
 * @returns ISO 3166-1 alpha-2 code (e.g., "US", "GB", "FR") or null if not found
 */
export function countryNameToISO(countryName: string | null | undefined): string | null {
  if (!countryName) {
    return null;
  }

  const name = countryName.trim();

  // First, try direct lookup with our format
  let code = countries.getAlpha2Code(name, 'en');
  if (code) {
    return code.toUpperCase();
  }

  // Try mapping to ISO standard name first
  const isoStandardName = COUNTRIES_FORMAT_TO_ISO_NAME[name];
  if (isoStandardName) {
    code = countries.getAlpha2Code(isoStandardName, 'en');
    if (code) {
      return code.toUpperCase();
    }
  }

  // Fallback: case-insensitive search through all country names
  const allCountries = countries.getNames('en');
  for (const [isoCode, country] of Object.entries(allCountries)) {
    const countryName = typeof country === 'string' ? country : String(country);
    if (countryName.toLowerCase() === name.toLowerCase()) {
      return isoCode.toUpperCase();
    }
  }

  // Also try with our format mapped to ISO name
  if (isoStandardName) {
    for (const [isoCode, country] of Object.entries(allCountries)) {
      const countryName = typeof country === 'string' ? country : String(country);
      if (countryName.toLowerCase() === isoStandardName.toLowerCase()) {
        return isoCode.toUpperCase();
      }
    }
  }

  return null;
}

/**
 * Check if two country values match, handling both ISO codes and full names.
 */
export function countriesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const isoA = countryNameToISO(a) ?? a.toUpperCase();
  const isoB = countryNameToISO(b) ?? b.toUpperCase();
  return isoA === isoB;
}
