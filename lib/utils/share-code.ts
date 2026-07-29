import { randomBytes } from 'crypto';

/**
 * Generates an 8-character alphanumeric share code for referral tracking.
 * Uses URL-safe base64 encoding (lowercase) for compact, stable identifiers.
 *
 * @returns An 8-character lowercase alphanumeric string
 */
export function generateShareCode(): string {
  return randomBytes(6).toString('base64url').slice(0, 8).toLowerCase();
}
