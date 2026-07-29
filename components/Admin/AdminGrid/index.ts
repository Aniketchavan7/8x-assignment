/**
 * AdminGrid Module
 *
 * AG Grid-based tables for admin views including:
 * - Tracked accounts and posts (analytics)
 * - Creators and brands (entity management)
 *
 * Provides column definitions and cell renderers for admin-specific views
 * that include cross-brand visibility (brand name, job links, etc.).
 */

// ============================================================================
// TRACKED ACCOUNTS/POSTS CELL RENDERERS
// ============================================================================
export {
  AdminAccountCellRenderer,
  AdminBrandCellRenderer,
  AdminJobCellRenderer,
  AdminPlatformCellRenderer,
  AdminCampaignCellRenderer,
  AdminPostsLast7DaysCellRenderer,
  AdminLastSyncedCellRenderer,
  AdminSyncActionCellRenderer,
  AdminNumericCellRenderer,
  AdminBadgeCellRenderer,
  AdminPostThumbnailCellRenderer,
  AdminPostAccountCellRenderer,
  AdminDateCellRenderer,
  AdminLastFetchedCellRenderer,
} from './cellRenderers';

// ============================================================================
// ENTITY CELL RENDERERS (Creators, Jobs, Applications, Brands)
// ============================================================================
export {
  // Shared
  AdminEmailCellRenderer,
  AdminStatusBadgeCellRenderer,
  AdminOnboardingBadgeCellRenderer,
  AdminLocationCellRenderer,
  AdminHasVideoCellRenderer,
  AdminIdCellRenderer,
  // Creators
  AdminCreatorCellRenderer,
  AdminJobsCountCellRenderer,
  AdminRatingCellRenderer,
  AdminCampaignProgressCellRenderer,
  AdminTotalOwedCellRenderer,
  AdminCreatorCountryCellRenderer,
  // Brands
  AdminBrandNameCellRenderer,
  AdminMemberCountCellRenderer,
  AdminTrackedAccountsCountCellRenderer,
  AdminViewsCountCellRenderer,
  AdminEightXManagedCellRenderer,
  AdminBrandActionsCellRenderer,
  AdminBudgetCellRenderer,
  AdminNotesCellRenderer,
  // Managed Creators
  AdminManagedCreatorNameCellRenderer,
  AdminManagedCreatorBrandCellRenderer,
  AdminManagedCreatorStatusCellRenderer,
  AdminAvgViewsCellRenderer,
  AdminPlatformAvgViewsCellRenderer,
  AdminPlatformPostCountCellRenderer,
  AdminSparkCodesCellRenderer,
  AdminDaysSincePostCellRenderer,
  AdminBasePayCellRenderer,
  AdminOutstandingCellRenderer,
} from './entityCellRenderers';

// ============================================================================
// TRACKED ACCOUNTS COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminAccountColumnDefs,
  defaultAdminAccountColDef,
  type AdminAccountGridData,
  type AdminAccountColumnTranslations,
} from './accountColumnDefs';

// ============================================================================
// TRACKED POSTS COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminPostColumnDefs,
  defaultAdminPostColDef,
  type AdminPostGridData,
  type AdminPostColumnTranslations,
} from './postColumnDefs';

// ============================================================================
// CREATOR COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminCreatorColumnDefs,
  defaultAdminCreatorColDef,
  type AdminCreatorGridData,
  type AdminCreatorColumnTranslations,
} from './creatorColumnDefs';

// ============================================================================
// BRAND COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminBrandColumnDefs,
  defaultAdminBrandColDef,
  type AdminBrandGridData,
  type AdminBrandColumnTranslations,
} from './brandColumnDefs';

// ============================================================================
// MANAGED CREATOR COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminManagedCreatorColumnDefs,
  defaultAdminManagedCreatorColDef,
  type AdminManagedCreatorGridData,
} from './managedCreatorColumnDefs';

// ============================================================================
// PIPELINE COLUMN DEFINITIONS
// ============================================================================
export {
  createPipelineColumnDefs,
  defaultPipelineColDef,
  type PipelineGridData,
} from './pipelineColumnDefs';

// ============================================================================
// CREATOR POST PAYMENT COLUMN DEFINITIONS
// ============================================================================
export {
  createCreatorPostPaymentColumnDefs,
  createGroupedPostPaymentColumnDefs,
  defaultCreatorPostPaymentColDef,
  PostPaymentPlatformCellRenderer,
  PostPaymentStatusCellRenderer,
  PostPaymentGroupedStatusCellRenderer,
  PostPaymentCreatorCellRenderer,
  ManagedCreatorStatusCellRenderer,
  PostPaymentOutstandingCellRenderer,
  PostPaymentViewsCellRenderer,
  PostPaymentDateCellRenderer,
  PostPaymentStripeCellRenderer,
  PostPaymentPostCountCellRenderer,
  PostPaymentCurrencyCell,
  ReviewStatusCellRenderer,
  AdCodeCellRenderer,
  DisclosureCellRenderer,
  type CreatorPostPaymentGridData,
  type CreatorPostPaymentGroupedData,
  type GroupedViewRow,
} from './creatorPostPaymentColumnDefs';

// ============================================================================
// CPM CELL RENDERERS
// ============================================================================
export {
  AdminCurrencyCellRenderer,
  AdminViewsCellRenderer,
  AdminCountCellRenderer,
  AdminCpmCampaignNameCellRenderer,
  AdminCpmBrandCellRenderer,
  AdminCpmCampaignStatusCellRenderer,
  AdminCpmRateCellRenderer,
  AdminCpmPlatformsCellRenderer,
  AdminCpmSubmissionCountCellRenderer,
  AdminCpmCampaignActionsCellRenderer,
  AdminCpmCreatorCellRenderer,
  AdminCpmSubmissionStatusCellRenderer,
  AdminCpmPlatformBadgeCellRenderer,
  AdminCpmUnpaidCellRenderer,
  AdminCpmSubmissionActionsCellRenderer,
} from './cpmCellRenderers';

// ============================================================================
// CPM COLUMN DEFINITIONS
// ============================================================================
export {
  createAdminCpmCampaignColumnDefs,
  defaultAdminCpmCampaignColDef,
  createAdminCpmSubmissionColumnDefs,
  defaultAdminCpmSubmissionColDef,
  type AdminCpmCampaignGridData,
  type AdminCpmCampaignColumnTranslations,
  type AdminCpmSubmissionGridData,
  type AdminCpmSubmissionColumnTranslations,
} from './cpmColumnDefs';
