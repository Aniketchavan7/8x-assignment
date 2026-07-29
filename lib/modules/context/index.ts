/**
 * Unified API Context Module
 *
 * Provides getBrandContext and getCreatorContext for API route auth/authz.
 * See brand-context.ts for usage examples.
 */

export { getBrandContext } from './brand-context';
export { getCreatorContext } from './creator-context';
export { ERRORS, errorResponse, createError, jsonError } from './errors';
export { isValidUUID, extractViewAsHeaders, VIEW_AS_HEADERS } from './validators';

export type {
  AccountType,
  ContextUser,
  BrandMemberRole,
  ContextBrandMember,
  ContextBrandOrganization,
  BrandContextSuccess,
  BrandContextError,
  BrandContextResult,
  BrandContextOptions,
  ContextCreatorProfile,
  CreatorContextSuccess,
  CreatorContextError,
  CreatorContextResult,
  ApiError,
  ApiErrorCode,
} from './types';
