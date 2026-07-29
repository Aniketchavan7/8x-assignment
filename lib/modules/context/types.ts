/**
 * Unified API Context Types
 *
 * This module provides type definitions for the unified context system
 * used across all API routes. It standardizes authentication and authorization.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type AccountType = 'creator' | 'brand_member' | 'admin';

export type BrandMemberRole = 'owner' | 'admin' | 'manager' | 'member';

export type ContextUser = {
  id: string;
  email: string | null;
  accountType: AccountType | null;
};

export type ContextBrandMember = {
  id: string;
  userId: string;
  brandOrganizationId: string;
  role: BrandMemberRole;
  firstName: string | null;
  lastName: string | null;
};

export type ContextBrandOrganization = {
  id: string;
  organizationName: string;
  mainUserId: string | null;
};

export type ContextCreatorProfile = {
  id: string;
  userId: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  status: 400 | 401 | 403 | 404 | 500;
};

export type BrandContextSuccess = {
  ok: true;
  user: ContextUser;
  brandMember: ContextBrandMember;
  brandOrganization: ContextBrandOrganization;
  supabase: SupabaseClient<Database>;
  isAdminViewAs: boolean;
  isAdmin: boolean;
};

export type BrandContextError = {
  ok: false;
  error: ApiError;
};

export type BrandContextResult = BrandContextSuccess | BrandContextError;

export type CreatorContextSuccess = {
  ok: true;
  user: ContextUser;
  creatorProfile: ContextCreatorProfile;
  supabase: SupabaseClient<Database>;
  isAdmin: boolean;
};

export type CreatorContextError = {
  ok: false;
  error: ApiError;
};

export type CreatorContextResult = CreatorContextSuccess | CreatorContextError;

export type BrandContextOptions = {
  requiredRoles?: BrandMemberRole[];
};

