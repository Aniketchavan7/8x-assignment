/**
 * Centralized Query Keys Registry for Tracked Accounts
 *
 * All query keys for tracked accounts related data should be defined here.
 * This ensures consistency across the codebase and makes cache invalidation reliable.
 *
 * Usage:
 * - Import these keys in hooks, mutations, and components
 * - Use for useQuery, useMutation, and queryClient operations
 * - Prefix matching: invalidateQueries({ queryKey: trackedAccountsKeys.analytics.accounts })
 *   will invalidate all queries starting with that key
 */

/**
 * Query keys for tracked accounts system
 * Organized by domain/API route
 */
export const trackedAccountsKeys = {
  // Base key for all tracked accounts queries (useful for invalidating everything)
  all: ['tracked-accounts'] as const,

  // Analytics API routes (brand dashboard)
  analytics: {
    // Main accounts list - used by brand dashboard
    accounts: ['/api/analytics/accounts'] as const,
    // Posts list
    posts: ['/api/analytics/posts'] as const,
    // Chart data for analytics overview
    chartData: ['/api/analytics/chart-data'] as const,
    // Sync status polling
    syncStatus: ['/api/analytics/sync-status'] as const,
  },

  // Brand API routes
  brand: {
    // Campaign list for the brand
    campaigns: ['/api/brand/campaigns'] as const,
  },

  // Admin API routes
  admin: {
    // All tracked accounts (admin view)
    accounts: ['/api/admin/track/accounts'] as const,
    // Tracked accounts for a specific brand (admin view)
    brandAccounts: (brandId: string) => ['/api/admin/track/accounts', { brandId }] as const,
    // Brand details
    brands: ['/api/admin/brands'] as const,
    // Brand detail by ID
    brand: (brandId: string) => ['/api/admin/brands', brandId] as const,
  },
} as const;

/**
 * Type helper for query key inference
 */
export type TrackedAccountsQueryKey =
  | typeof trackedAccountsKeys.all
  | typeof trackedAccountsKeys.analytics.accounts
  | typeof trackedAccountsKeys.analytics.posts
  | typeof trackedAccountsKeys.analytics.chartData
  | typeof trackedAccountsKeys.analytics.syncStatus
  | typeof trackedAccountsKeys.brand.campaigns
  | typeof trackedAccountsKeys.admin.accounts
  | ReturnType<typeof trackedAccountsKeys.admin.brandAccounts>
  | typeof trackedAccountsKeys.admin.brands
  | ReturnType<typeof trackedAccountsKeys.admin.brand>;
