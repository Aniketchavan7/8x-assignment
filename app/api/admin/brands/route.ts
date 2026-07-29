import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { generateUniqueSlug } from '@/lib/utils/slugUtils';
import { handleApiError } from '@/lib/utils/api-error';
import { sanitizeSearchFilter } from '@/lib/utils';
import { SCOPED_ROLES, type AdminRole } from '@/lib/modules/admin/roles';
import type {
  BrandOrganization,
  BrandMember,
  BrandAccountStatus,
  BrandOnboardingStatus,
  BrandMemberRole,
  InvitationStatus,
} from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Extended BrandOrganization type with members
export type BrandOrganizationWithMembers = Omit<
  BrandOrganization,
  'account_status' | 'onboarding_status'
> & {
  account_status: BrandAccountStatus | null;
  onboarding_status: BrandOnboardingStatus | null;
  eight_x_managed: boolean;
  tracked_accounts_count: number;
  tracked_posts_count: number;
  total_views: number;
  managed_creators_count: number;
  admin_notes: string | null;
  budget: number | null;
  contract_start_date: string | null;
  target_markets: string[] | null;
  target_creators_by_market: Record<string, number> | null;
  budget_by_market: Record<string, number> | null;
  admin_status: string | null;
  onboarding_call_link: string | null;
  job_ids: string[];
  main_user: {
    id: string;
    email: string;
  } | null;
  members: Array<
    Omit<BrandMember, 'role' | 'invitation_status'> & {
      role: BrandMemberRole | null;
      invitation_status: InvitationStatus | null;
      users: {
        id: string;
        email: string;
      } | null;
    }
  >;
};

export type BrandsApiResponse = {
  data: BrandOrganizationWithMembers[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * Fetches brand organizations with pagination (admin-only).
 * Requires admin account_type to access.
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 12)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { data: member } = await supabase
      .from('admin_members')
      .select('admin_role, job_ids')
      .eq('user_id', user.id)
      .maybeSingle();

    const memberRole = (member?.admin_role ?? null) as AdminRole | null;
    const memberJobIds = (member?.job_ids ?? []) as string[];
    const isScoped = memberRole !== null && SCOPED_ROLES.includes(memberRole);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    // Single brand lookup by slug
    if (slug) {
      const { data: brandData, error: brandError } = await supabase
        .from('brand_organizations')
        .select(`
          *,
          main_user:users!main_user_id (
            id,
            email
          ),
          brand_members (
            *,
            users!brand_members_user_id_fkey (
              id,
              email
            )
          )
        `)
        .eq('organization_slug', slug)
        .single();

      if (brandError || !brandData) {
        return Response.json({ error: 'Brand not found' }, { status: 404 });
      }

      // Scoped admins only need to see whether any of their member jobs belong to this brand —
      // no need to fetch all the brand's jobs.
      let brandJobsQuery = supabase
        .from('jobs')
        .select('id')
        .eq('brand_organization_id', brandData.id);
      if (isScoped) {
        brandJobsQuery = brandJobsQuery.in('id', memberJobIds);
      }

      const [
        { data: trackedAccounts },
        { count: managedCreatorsCount },
        { data: brandJobs },
      ] = await Promise.all([
        supabase
          .from('brand_tracked_social_accounts')
          .select('social_account_connector_id')
          .eq('brand_organization_id', brandData.id),
        supabase
          .from('managed_creators')
          .select('id', { count: 'exact', head: true })
          .eq('brand_organization_id', brandData.id),
        brandJobsQuery,
      ]);

      // Compute post stats for this brand's connectors
      const connectorIds = (trackedAccounts || [])
        .map((r) => r.social_account_connector_id)
        .filter((id): id is string => id != null);
      let trackedPostsCount = 0;
      let totalViews = 0;
      if (connectorIds.length > 0) {
        const { data: stats } = await supabase.rpc('get_post_stats_by_connectors', {
          p_connector_ids: connectorIds,
        });
        if (stats) {
          for (const stat of stats) {
            trackedPostsCount += Number(stat.post_count);
            totalViews += Number(stat.total_views);
          }
        }
      }

      const { brand_members, main_user, ...brandProps } = brandData;
      const brand: BrandOrganizationWithMembers = {
        ...brandProps,
        account_status: brandData.account_status,
        onboarding_status: brandData.onboarding_status,
        eight_x_managed: brandData.eight_x_managed ?? false,
        tracked_accounts_count: connectorIds.length,
        tracked_posts_count: trackedPostsCount,
        total_views: totalViews,
        managed_creators_count: managedCreatorsCount ?? 0,
        admin_notes: brandData.admin_notes ?? null,
        budget: brandData.budget ? Number(brandData.budget) : null,
        contract_start_date: brandData.contract_start_date ?? null,
        target_markets: brandData.target_markets ?? null,
        target_creators_by_market:
          (brandData.target_creators_by_market as Record<string, number>) ?? null,
        budget_by_market:
          (brandData.budget_by_market as Record<string, number>) ?? null,
        admin_status: brandData.admin_status ?? null,
        onboarding_call_link: brandData.onboarding_call_link ?? null,
        job_ids: (brandJobs ?? []).map((j) => j.id),
        main_user: main_user && !Array.isArray(main_user) ? main_user : null,
        members: (brand_members || []).map((member) => ({
          ...member,
          role: member.role,
          invitation_status: member.invitation_status,
          users: member.users && !Array.isArray(member.users) ? member.users : null,
        })),
      };

      return Response.json({ data: brand });
    }

    const availableCountriesOnly = searchParams.get('available_countries') === 'true';

    // If only requesting available countries, return them
    if (availableCountriesOnly) {
      // Get main_user_ids for all brands
      const { data: brands, error: brandsError } = await supabase
        .from('brand_organizations')
        .select('main_user_id')
        .not('main_user_id', 'is', null);

      if (brandsError) {
        console.error('Error fetching brand organizations:', brandsError);
        return Response.json({ error: 'Failed to fetch available countries' }, { status: 500 });
      }

      const mainUserIds = (brands || [])
        .map((b) => b.main_user_id)
        .filter((id): id is string => id !== null && id !== undefined);

      if (mainUserIds.length === 0) {
        return Response.json({
          countries: [],
        });
      }

      // Get countries for these users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('country')
        .in('id', mainUserIds)
        .not('country', 'is', null);

      if (usersError) {
        console.error('Error fetching user countries:', usersError);
        return Response.json({ error: 'Failed to fetch available countries' }, { status: 500 });
      }

      // Extract unique countries
      const countries = new Set<string>();
      (users || []).forEach((user: any) => {
        if (user.country) {
          countries.add(user.country);
        }
      });

      return Response.json({
        countries: Array.from(countries).sort(),
      });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '12', 10)));
    const offset = (page - 1) * limit;

    // Parse filter parameters
    const country = searchParams.get('country') || null;
    const search = searchParams.get('search') || null;
    const eightXManaged = searchParams.get('eight_x_managed');
    const jobIdsParam = searchParams.get('job_ids');
    const jobIds = jobIdsParam ? jobIdsParam.split(',').filter(Boolean) : null;

    // If job_ids filter is provided, resolve to brand IDs first
    let jobBrandIds: string[] | null = null;
    if (jobIds && jobIds.length > 0) {
      const { data: jobBrandData } = await supabase
        .from('jobs')
        .select('brand_organization_id')
        .in('id', jobIds);

      jobBrandIds = [...new Set((jobBrandData ?? []).map((j) => j.brand_organization_id).filter((id): id is string => id != null))];

      if (jobBrandIds.length === 0) {
        return Response.json({ data: [], total: 0, page, limit, totalPages: 0 });
      }
    }

    // If country filter is provided, get main_user_ids first
    let mainUserIds: string[] | null = null;
    if (country) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id')
        .eq('country', country);

      if (usersError) {
        console.error('Error fetching users by country:', usersError);
        return Response.json({ error: 'Failed to filter by country' }, { status: 500 });
      }

      mainUserIds = users?.map((u) => u.id) || [];
      if (mainUserIds.length === 0) {
        // No users in this country, return empty result
        return Response.json({
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    // Build count query with filters
    let countQuery = supabase
      .from('brand_organizations')
      .select('*', { count: 'exact', head: true });

    // Apply filters
    if (mainUserIds) {
      countQuery = countQuery.in('main_user_id', mainUserIds);
    }

    // Apply search filter if provided (searches organization name and slug)
    if (search) {
      const sanitized = sanitizeSearchFilter(search);
      countQuery = countQuery.or(
        `organization_name.ilike.%${sanitized}%,organization_slug.ilike.%${sanitized}%`
      );
    }

    // Apply 8x managed filter if provided
    if (eightXManaged === 'true') {
      countQuery = countQuery.eq('eight_x_managed', true);
    } else if (eightXManaged === 'false') {
      countQuery = countQuery.eq('eight_x_managed', false);
    }

    // Apply job_ids brand filter
    if (jobBrandIds) {
      countQuery = countQuery.in('id', jobBrandIds);
    }

    // Get paginated brand organizations with their members
    let dataQuery = supabase.from('brand_organizations').select(`
        *,
        main_user:users!main_user_id (
          id,
          email
        ),
        brand_members (
          *,
          users!brand_members_user_id_fkey (
            id,
            email
          )
        )
      `);

    // Apply same filters to data query
    if (mainUserIds) {
      dataQuery = dataQuery.in('main_user_id', mainUserIds);
    }

    // Apply search filter if provided
    if (search) {
      const sanitized = sanitizeSearchFilter(search);
      dataQuery = dataQuery.or(
        `organization_name.ilike.%${sanitized}%,organization_slug.ilike.%${sanitized}%`
      );
    }

    // Apply 8x managed filter if provided
    if (eightXManaged === 'true') {
      dataQuery = dataQuery.eq('eight_x_managed', true);
    } else if (eightXManaged === 'false') {
      dataQuery = dataQuery.eq('eight_x_managed', false);
    }

    // Apply job_ids brand filter
    if (jobBrandIds) {
      dataQuery = dataQuery.in('id', jobBrandIds);
    }

    // Execute count and data queries in parallel
    const [{ count, error: countError }, { data: brands, error }] = await Promise.all([
      countQuery,
      dataQuery
        .order('eight_x_managed', { ascending: false })
        .order('default_listening_passive', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ]);

    if (countError) {
      console.error('Error counting brands:', countError);
      return Response.json({ error: 'Failed to count brands' }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    if (error) {
      console.error('Error fetching brands:', error);
      return Response.json({ error: 'Failed to fetch brands' }, { status: 500 });
    }

    // Fetch tracked accounts counts, post counts, and managed creators counts for all brands
    const brandIds = (brands || []).map((b) => b.id);
    let trackedAccountsCounts: Record<string, number> = {};
    let trackedPostsCounts: Record<string, number> = {};
    let totalViewsCounts: Record<string, number> = {};
    let managedCreatorsCounts: Record<string, number> = {};
    let jobIdsByBrand: Record<string, string[]> = {};

    if (brandIds.length > 0) {
      // Fetch tracked accounts with connector IDs
      const { data: trackedAccounts, error: trackedError } = await supabase
        .from('brand_tracked_social_accounts')
        .select('brand_organization_id, social_account_connector_id')
        .in('brand_organization_id', brandIds);

      // Map connector IDs to brands and count unique accounts per brand
      const connectorToBrands: Record<string, Set<string>> = {};
      const allConnectorIds = new Set<string>();

      if (!trackedError && trackedAccounts) {
        const brandUniqueConnectors: Record<string, Set<string>> = {};

        trackedAccounts.forEach((row) => {
          const { brand_organization_id: brandId, social_account_connector_id: connectorId } = row;
          if (!connectorId) return;

          if (!brandUniqueConnectors[brandId]) {
            brandUniqueConnectors[brandId] = new Set();
          }
          brandUniqueConnectors[brandId].add(connectorId);

          if (!connectorToBrands[connectorId]) {
            connectorToBrands[connectorId] = new Set();
          }
          connectorToBrands[connectorId].add(brandId);
          allConnectorIds.add(connectorId);
        });

        Object.entries(brandUniqueConnectors).forEach(([brandId, connectors]) => {
          trackedAccountsCounts[brandId] = connectors.size;
        });
      }

      // Aggregate post counts and views per connector via RPC (replaces unbounded posts fetch)
      if (allConnectorIds.size > 0) {
        const { data: stats, error: statsError } = await supabase.rpc(
          'get_post_stats_by_connectors',
          { p_connector_ids: Array.from(allConnectorIds) }
        );

        if (!statsError && stats) {
          for (const stat of stats) {
            const connectorId = stat.social_account_connector_id;
            if (connectorId && connectorToBrands[connectorId]) {
              connectorToBrands[connectorId].forEach((brandId) => {
                trackedPostsCounts[brandId] =
                  (trackedPostsCounts[brandId] || 0) + Number(stat.post_count);
                totalViewsCounts[brandId] =
                  (totalViewsCounts[brandId] || 0) + Number(stat.total_views);
              });
            }
          }
        }
      }

      // Fetch managed creators counts per brand
      const { data: managedCreators, error: managedError } = await supabase
        .from('managed_creators')
        .select('brand_organization_id')
        .in('brand_organization_id', brandIds);

      if (!managedError && managedCreators) {
        managedCreators.forEach((creator) => {
          const brandId = creator.brand_organization_id;
          if (brandId) {
            managedCreatorsCounts[brandId] = (managedCreatorsCounts[brandId] || 0) + 1;
          }
        });
      }

      // Fetch job IDs per brand for accessibility checks. Scoped admins only need to know
      // which of their member jobs belong to each brand — push the intersection to the DB
      // to avoid returning thousands of jobs for non-scoped admins who don't need them.
      if (isScoped) {
        const brandJobsQuery = supabase
          .from('jobs')
          .select('id, brand_organization_id')
          .in('brand_organization_id', brandIds)
          .in('id', memberJobIds);

        const { data: brandJobs, error: brandJobsError } = await brandJobsQuery;

        if (!brandJobsError && brandJobs) {
          brandJobs.forEach((job) => {
            const brandId = job.brand_organization_id;
            if (brandId) {
              if (!jobIdsByBrand[brandId]) jobIdsByBrand[brandId] = [];
              jobIdsByBrand[brandId].push(job.id);
            }
          });
        }
      }
    }

    // Transform the data to match the expected format
    const brandsWithMembers: BrandOrganizationWithMembers[] = (brands || []).map((brand) => {
      const { brand_members, main_user, ...brandProps } = brand;
      return {
        ...brandProps,
        account_status: brand.account_status,
        onboarding_status: brand.onboarding_status,
        eight_x_managed: brand.eight_x_managed ?? false,
        tracked_accounts_count: trackedAccountsCounts[brand.id] || 0,
        tracked_posts_count: trackedPostsCounts[brand.id] || 0,
        total_views: totalViewsCounts[brand.id] || 0,
        managed_creators_count: managedCreatorsCounts[brand.id] || 0,
        admin_notes: brand.admin_notes ?? null,
        budget: brand.budget ? Number(brand.budget) : null,
        contract_start_date: brand.contract_start_date ?? null,
        target_markets: brand.target_markets ?? null,
        target_creators_by_market:
          (brand.target_creators_by_market as Record<string, number>) ?? null,
        budget_by_market:
          (brand.budget_by_market as Record<string, number>) ?? null,
        admin_status: brand.admin_status ?? null,
        onboarding_call_link: brand.onboarding_call_link ?? null,
        job_ids: jobIdsByBrand[brand.id] || [],
        main_user: main_user && !Array.isArray(main_user) ? main_user : null,
        members: (brand_members || []).map((member) => ({
          ...member,
          role: member.role,
          invitation_status: member.invitation_status,
          users: member.users && !Array.isArray(member.users) ? member.users : null,
        })),
      };
    });

    return Response.json(
      {
        data: brandsWithMembers,
        total,
        page,
        limit,
        totalPages,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brands',
      method: 'GET',
    });
  }
}

/**
 * Creates a new brand organization (admin-only).
 * Requires admin account_type to access.
 *
 * Form data:
 * - brandName: Name of the brand organization (required)
 * - website: Website URL (optional)
 * - logo: Logo image file (optional)
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse form data
    const formData = await request.formData();
    const brandName = formData.get('brandName') as string | null;
    const website = formData.get('website') as string | null;
    const logoFile = formData.get('logo') as File | null;

    // Validate required fields
    if (!brandName || !brandName.trim()) {
      return Response.json({ error: 'Brand name is required' }, { status: 400 });
    }

    // Generate unique organization slug
    let organizationSlug: string;
    try {
      organizationSlug = await generateUniqueSlug(brandName);
    } catch (error) {
      console.error('Error generating unique slug:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Failed to generate brand slug' },
        { status: 500 }
      );
    }

    // Create brand organization first (we need the ID for logo path)
    const { data: newOrg, error: orgError } = await supabase
      .from('brand_organizations')
      .insert({
        organization_name: brandName.trim(),
        organization_slug: organizationSlug,
        website: website?.trim()
          ? /^https?:\/\//.test(website.trim()) ? website.trim() : `https://${website.trim()}`
          : null,
        company_logo: null, // Will update after logo upload
        contact_email: null,
        billing_email: null,
        main_user_id: null,
        account_status: 'active',
        activity_status: 'onboarding',
        onboarding_status: 'started',
      })
      .select('id')
      .single();

    if (orgError || !newOrg) {
      console.error('Error creating brand organization:', orgError);
      return Response.json({ error: 'Failed to create brand organization' }, { status: 500 });
    }

    // Upload logo if provided (now we have the organization ID)
    if (logoFile && logoFile.size > 0) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(logoFile.type)) {
        // Clean up organization if logo is invalid
        await supabase.from('brand_organizations').delete().eq('id', newOrg.id);
        return Response.json(
          { error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' },
          { status: 400 }
        );
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (logoFile.size > maxSize) {
        // Clean up organization if logo is too large
        await supabase.from('brand_organizations').delete().eq('id', newOrg.id);
        return Response.json({ error: 'File size must be less than 5MB.' }, { status: 400 });
      }

      // Generate filename with organization ID
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `brand-logos/${newOrg.id}/${Date.now()}.${fileExt}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, logoFile, {
          contentType: logoFile.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Error uploading logo:', uploadError);
        // Clean up organization if logo upload fails
        await supabase.from('brand_organizations').delete().eq('id', newOrg.id);
        return Response.json(
          { error: 'Failed to upload logo. Please try again.' },
          { status: 500 }
        );
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-photos').getPublicUrl(fileName);

      // Update organization with logo URL
      const { error: updateError } = await supabase
        .from('brand_organizations')
        .update({ company_logo: publicUrl })
        .eq('id', newOrg.id);

      if (updateError) {
        console.error('Error updating logo URL:', updateError);
        // Non-critical error, continue
      }
    }

    // Create brand wallet
    const { error: walletError } = await supabase.from('brand_wallet').insert({
      brand_organization_id: newOrg.id,
      available_balance: 0,
      pending_balance: 0,
      total_deposited: 0,
      total_spent: 0,
      currency: 'usd',
    });

    if (walletError) {
      console.error('Error creating brand wallet:', walletError);
      // Non-critical error, continue
    }

    return Response.json({
      success: true,
      brandId: newOrg.id,
      message: 'Brand created successfully',
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brands',
      method: 'POST',
    });
  }
}
