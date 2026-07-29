/**
 * Brand Column Definitions for Admin AG Grid
 *
 * Defines the columns and data shape for the admin brands table.
 */

import type { ColDef } from 'ag-grid-community';

/**
 * Data shape for each row in the brands grid.
 */
export interface AdminBrandGridData {
  id: string;
  organization_name: string;
  organization_slug: string;
  company_logo: string | null;
  primary_email: string | null;
  member_count: number;
  tracked_accounts_count: number;
  tracked_posts_count: number;
  total_views: number;
  managed_creators_count: number;
  budget: number | null;
  currency: string | null;
  admin_notes: string | null;
  eight_x_managed: boolean;
  created_at: string | null;
  accessible?: boolean;
}

/**
 * Translation keys for column headers
 */
export interface AdminBrandColumnTranslations {
  brand: string;
  email: string;
  members: string;
  accounts: string;
  videos: string;
  views: string;
  creators: string;
  budget: string;
  notes: string;
  eightXManaged: string;
  created: string;
  actions: string;
}

/**
 * Default column translations (English)
 */
export const defaultBrandTranslations: AdminBrandColumnTranslations = {
  brand: 'Brand',
  email: 'Email',
  members: 'Members',
  accounts: 'Accounts',
  videos: 'Videos',
  views: 'Views',
  creators: 'Creators',
  budget: 'Budget',
  notes: 'Notes',
  eightXManaged: '8x Managed',
  created: 'Created',
  actions: '',
};

/**
 * Creates column definitions for the admin brands table.
 */
export function createAdminBrandColumnDefs(options: {
  translations?: Partial<AdminBrandColumnTranslations>;
  onViewDetails?: (brand: AdminBrandGridData) => void;
  onToggleEightXManaged?: (brand: AdminBrandGridData) => void;
}): ColDef<AdminBrandGridData>[] {
  const t = { ...defaultBrandTranslations, ...options.translations };

  return [
    {
      field: 'organization_name',
      colId: 'brand',
      headerName: t.brand,
      minWidth: 220,
      flex: 2,
      sortable: true,
      cellRenderer: 'AdminBrandNameCellRenderer',
      pinned: 'left',
    },
    {
      field: 'primary_email',
      colId: 'email',
      headerName: t.email,
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      cellRenderer: 'AdminEmailCellRenderer',
    },
    {
      field: 'member_count',
      colId: 'members',
      headerName: t.members,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminMemberCountCellRenderer',
    },
    {
      field: 'tracked_accounts_count',
      colId: 'accounts',
      headerName: t.accounts,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminTrackedAccountsCountCellRenderer',
    },
    {
      field: 'tracked_posts_count',
      colId: 'videos',
      headerName: t.videos,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminTrackedAccountsCountCellRenderer',
    },
    {
      field: 'total_views',
      colId: 'views',
      headerName: t.views,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminViewsCountCellRenderer',
    },
    {
      field: 'managed_creators_count',
      colId: 'creators',
      headerName: t.creators,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminTrackedAccountsCountCellRenderer',
    },
    {
      field: 'budget',
      colId: 'budget',
      headerName: t.budget,
      minWidth: 100,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminBudgetCellRenderer',
    },
    {
      field: 'admin_notes',
      colId: 'notes',
      headerName: t.notes,
      minWidth: 150,
      flex: 1,
      sortable: true,
      cellRenderer: 'AdminNotesCellRenderer',
    },
    {
      field: 'eight_x_managed',
      colId: 'eightXManaged',
      headerName: t.eightXManaged,
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminEightXManagedCellRenderer',
      cellRendererParams: {
        onToggle: options.onToggleEightXManaged,
      },
    },
    {
      field: 'created_at',
      colId: 'created',
      headerName: t.created,
      minWidth: 110,
      width: 130,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      colId: 'actions',
      headerName: t.actions,
      minWidth: 50,
      width: 60,
      sortable: false,
      cellRenderer: 'AdminBrandActionsCellRenderer',
      cellRendererParams: {
        onViewDetails: options.onViewDetails,
      },
      pinned: 'right',
    },
  ];
}

/**
 * Default column definition for all columns
 */
export const defaultAdminBrandColDef: ColDef<AdminBrandGridData> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null], // Sort descending first when clicking column headers
};
