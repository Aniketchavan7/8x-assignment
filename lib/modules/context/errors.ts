/**
 * Unified API Error Handling
 *
 * Provides consistent error creation and response formatting
 * across all API routes.
 */

import type { ApiError, ApiErrorCode } from './types';

const STATUS_MAP: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 500> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  INTERNAL_ERROR: 500,
};

/**
 * Create a typed API error.
 */
export function createError(code: ApiErrorCode, message: string): ApiError {
  return { code, message, status: STATUS_MAP[code] };
}

export const ERRORS = {
  // Authentication errors
  UNAUTHORIZED: createError('UNAUTHORIZED', 'Authentication required'),

  // Brand-related errors
  NOT_BRAND_MEMBER: createError('NOT_FOUND', 'Brand membership not found'),
  BRAND_NOT_FOUND: createError('NOT_FOUND', 'Brand organization not found'),
  BRAND_ROLE_REQUIRED: (roles: string[]) =>
    createError('FORBIDDEN', `Requires role: ${roles.join(' or ')}`),

  // Creator-related errors
  NOT_CREATOR: createError('NOT_FOUND', 'Creator profile not found'),
  CREATOR_NOT_FOUND: createError('NOT_FOUND', 'Creator not found'),

  // Admin view-as errors
  ADMIN_REQUIRED: createError('FORBIDDEN', 'Admin access required'),
  INVALID_VIEW_AS_ID: createError('BAD_REQUEST', 'Invalid ID format'),
  VIEW_AS_TARGET_NOT_FOUND: (type: 'brand' | 'creator') =>
    createError('NOT_FOUND', `${type === 'brand' ? 'Brand' : 'Creator'} not found`),

  // Generic errors
  INTERNAL: createError('INTERNAL_ERROR', 'An unexpected error occurred'),
} as const;

export function errorResponse(error: ApiError): Response {
  return Response.json(
    { error: error.message, code: error.code },
    {
      status: error.status,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

export function jsonError(code: ApiErrorCode, message: string): Response {
  const error = createError(code, message);
  return errorResponse(error);
}
