import crypto from 'crypto';

import { CRON_SECRET } from '@/lib/env';

/**
 * Verifies the CRON_SECRET from the Authorization header
 * Used to secure cron job endpoints from unauthorized access
 *
 * @param request - The incoming request with Authorization header
 * @returns true if valid, false otherwise
 */
export function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return false;
  }

  const expectedHeader = `Bearer ${CRON_SECRET}`;

  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expectedHeader);
  if (authBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(authBuffer, expectedBuffer);
}

/**
 * Middleware function that returns 401 if CRON_SECRET is invalid
 * Use this in cron endpoints to protect them
 *
 * @param request - The incoming request
 * @returns Response with 401 status if invalid, null if valid
 */
export function requireCronSecret(request: Request): Response | null {
  if (!verifyCronSecret(request)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
