/**
 * Brand Context for API Routes
 *
 * Provides a unified way to get brand context (user, brand member, organization)
 * for API routes, handling both regular brand member access and admin view-as mode.
 *
 * This replaces the ~25 lines of duplicated boilerplate that was copied across
 * 20+ API routes.
 */

import { getUser } from '@/lib/modules/auth/queries';
import { createAuthenticatedSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import type {
  BrandContextResult,
  BrandContextOptions,
  BrandMemberRole,
  ContextUser,
  ContextBrandMember,
  ContextBrandOrganization,
} from './types';
import { ERRORS } from './errors';
import { isValidUUID, extractViewAsHeaders } from './validators';

/**
 * Get brand context for API routes.
 *
 * Handles three scenarios:
 * 1. **Admin view-as mode**: When `x-admin-view-as-brand` header is present,
 *    verifies admin status and returns context for the target brand.
 * 2. **Regular brand member**: Fetches the user's brand membership and org.
 * 3. **No membership**: Returns NOT_FOUND error.
 *
 * @param request - The incoming HTTP request
 * @param options - Optional configuration (e.g., requiredRoles)
 * @returns BrandContextResult - discriminated union with `ok: true/false`
 *
 * @example
 * ```typescript
 * import { getBrandContext, errorResponse } from '@/lib/modules/context';
 *
 * export async function GET(request: Request) {
 *   const ctx = await getBrandContext(request);
 *   if (!ctx.ok) return errorResponse(ctx.error);
 *
 *   const { brandOrganization, supabase } = ctx;
 *   // Use brandOrganization.id for queries...
 * }
 * ```
 *
 * @example With role requirements
 * ```typescript
 * export async function DELETE(request: Request) {
 *   const ctx = await getBrandContext(request, {
 *     requiredRoles: ['owner', 'admin']
 *   });
 *   if (!ctx.ok) return errorResponse(ctx.error);
 *   // Only owners and admins reach here
 * }
 * ```
 */
export async function getBrandContext(
  request: Request,
  options: BrandContextOptions = {}
): Promise<BrandContextResult> {
  const { requiredRoles } = options;

  const user = await getUser();
  if (!user) {
    return { ok: false, error: ERRORS.UNAUTHORIZED };
  }

  const { viewAsBrandId } = extractViewAsHeaders(request);

  if (viewAsBrandId) {
    return handleAdminViewAs(user.id, user.email, viewAsBrandId);
  }

  const supabase = await createAuthenticatedSupabaseClient();

  // Fetch brand member with organization in a single query
  const { data: brandMemberData, error: memberError } = await supabase
    .from('brand_members')
    .select(
      `
      id,
      user_id,
      brand_organization_id,
      role,
      first_name,
      last_name,
      brand_organizations!inner (
        id,
        organization_name,
        main_user_id
      )
    `
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    console.error('[getBrandContext] Query error:', memberError);
    return { ok: false, error: ERRORS.INTERNAL };
  }

  if (!brandMemberData) {
    return { ok: false, error: ERRORS.NOT_BRAND_MEMBER };
  }

  const memberRole = brandMemberData.role as BrandMemberRole;

  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(memberRole)) {
      return { ok: false, error: ERRORS.BRAND_ROLE_REQUIRED(requiredRoles) };
    }
  }

  // Check if user is also a global admin
  const serviceClient = createServiceRoleClient();
  const { data: userData } = await serviceClient
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.account_type === 'admin';

  const brandOrg = brandMemberData.brand_organizations as {
    id: string;
    organization_name: string;
    main_user_id: string | null;
  };

  const contextUser: ContextUser = {
    id: user.id,
    email: user.email ?? null,
    accountType: (userData?.account_type as ContextUser['accountType']) ?? 'brand_member',
  };

  const brandMember: ContextBrandMember = {
    id: brandMemberData.id,
    userId: brandMemberData.user_id,
    brandOrganizationId: brandMemberData.brand_organization_id,
    role: memberRole,
    firstName: brandMemberData.first_name,
    lastName: brandMemberData.last_name,
  };

  const brandOrganization: ContextBrandOrganization = {
    id: brandOrg.id,
    organizationName: brandOrg.organization_name,
    mainUserId: brandOrg.main_user_id,
  };

  return {
    ok: true,
    user: contextUser,
    brandMember,
    brandOrganization,
    supabase,
    isAdminViewAs: false,
    isAdmin,
  };
}

async function handleAdminViewAs(
  userId: string,
  userEmail: string | null | undefined,
  viewAsBrandId: string
): Promise<BrandContextResult> {
  // Validate UUID format first
  if (!isValidUUID(viewAsBrandId)) {
    return { ok: false, error: ERRORS.INVALID_VIEW_AS_ID };
  }

  const serviceClient = createServiceRoleClient();

  // Verify user is an admin
  const { data: userData } = await serviceClient
    .from('users')
    .select('account_type')
    .eq('id', userId)
    .single();

  if (userData?.account_type !== 'admin') {
    return { ok: false, error: ERRORS.ADMIN_REQUIRED };
  }

  // Verify target brand exists
  const { data: brandOrg } = await serviceClient
    .from('brand_organizations')
    .select('id, organization_name, main_user_id')
    .eq('id', viewAsBrandId)
    .single();

  if (!brandOrg) {
    return { ok: false, error: ERRORS.VIEW_AS_TARGET_NOT_FOUND('brand') };
  }

  // Get owner's brand member record for context
  const { data: ownerMember } = await serviceClient
    .from('brand_members')
    .select('id, user_id, brand_organization_id, role, first_name, last_name')
    .eq('brand_organization_id', viewAsBrandId)
    .eq('role', 'owner')
    .maybeSingle();

  const contextUser: ContextUser = {
    id: userId,
    email: userEmail ?? null,
    accountType: 'admin',
  };

  const brandMember: ContextBrandMember = ownerMember
    ? {
        id: ownerMember.id,
        userId: ownerMember.user_id,
        brandOrganizationId: ownerMember.brand_organization_id,
        role: ownerMember.role as BrandMemberRole,
        firstName: ownerMember.first_name,
        lastName: ownerMember.last_name,
      }
    : {
        id: `admin-view-as-${viewAsBrandId}`,
        userId: userId,
        brandOrganizationId: viewAsBrandId,
        role: 'owner',
        firstName: null,
        lastName: null,
      };

  const brandOrganization: ContextBrandOrganization = {
    id: brandOrg.id,
    organizationName: brandOrg.organization_name,
    mainUserId: brandOrg.main_user_id,
  };

  return {
    ok: true,
    user: contextUser,
    brandMember,
    brandOrganization,
    supabase: serviceClient,
    isAdminViewAs: true,
    isAdmin: true,
  };
}
