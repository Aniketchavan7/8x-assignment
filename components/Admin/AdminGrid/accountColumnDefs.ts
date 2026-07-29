/**
 * AG Grid Column Definitions for Admin Tracked Accounts Table
 *
 * Defines the columns for the AG Grid-based admin accounts table,
 * including admin-specific columns like brand name and job title.
 */

import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import {
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
} from './cellRenderers';

/**
 * Admin account data structure for the AG Grid table
 */
export interface AdminAccountGridData {
  id: string;
  username: string;
  profileUrl: string;
  profilePicUrl: string | null;
  platform: 'tiktok' | 'instagram';
  brandId: string;
  brandName: string;
  campaign: string;
  jobId: string | null;
  jobTitle: string | null;
  isActive: boolean;
  source: 'manual' | 'application';
  totalViews: number | null;
  totalLikes: number | null;
  totalComments: number | null;
  followersCount: number | null;
  postsCount: number | null;
  outperformingVideosPercentage: number | null;
  engagementRate: number | null;
  averageVideoViews: number | null;
  postsLast7Days: {
    count: number;
    dailyBreakdown: number[];
    averagePerDay: number;
  };
  lastSyncedAt: string | null;
  lastPostsFetchedAt: string | null;
  createdAt: string;
}

/**
 * Translations for column headers
 */
export interface AdminAccountColumnTranslations {
  account?: string;
  brand?: string;
  campaign?: string;
  job?: string;
  platform?: string;
  videos?: string;
  views?: string;
  likes?: string;
  comments?: string;
  avgViews?: string;
  outperforming?: string;
  engagement?: string;
  last7Days?: string;
  lastSynced?: string;
  actions?: string;
}

/**
 * Options for creating column definitions
 */
export interface CreateAdminAccountColumnDefsOptions {
  translations?: AdminAccountColumnTranslations;
  syncingAccountId?: string | null;
  onSync?: (accountId: string, jobId: string) => void;
  onCampaignFilter?: (campaign: string) => void;
}

/**
 * Creates column definitions for the AG Grid admin tracked accounts table
 */
export function createAdminAccountColumnDefs(
  options: CreateAdminAccountColumnDefsOptions
): ColDef<AdminAccountGridData>[] {
  const { translations: t = {}, syncingAccountId, onSync, onCampaignFilter } = options;

  return [
    // Account column - pinned left with avatar and username
    {
      field: 'username',
      headerName: t.account || 'Account',
      pinned: 'left',
      width: 180,
      minWidth: 160,
      sortable: true,
      cellRenderer: AdminAccountCellRenderer,
      cellRendererParams: {
        syncingAccountId,
      },
      cellClass: 'ag-cell-left-padded',
      valueGetter: (params) => params.data?.username?.toLowerCase() || '',
    },

    // Brand column
    {
      field: 'brandName',
      headerName: t.brand || 'Brand',
      width: 150,
      minWidth: 120,
      sortable: true,
      cellRenderer: AdminBrandCellRenderer,
    },

    // Campaign column
    {
      field: 'campaign',
      headerName: t.campaign || 'Campaign',
      width: 130,
      minWidth: 100,
      sortable: true,
      cellRenderer: AdminCampaignCellRenderer,
      cellRendererParams: {
        onCampaignFilter,
      },
    },

    // Job column
    {
      field: 'jobTitle',
      headerName: t.job || 'Job',
      width: 160,
      minWidth: 120,
      sortable: true,
      cellRenderer: AdminJobCellRenderer,
    },

    // Platform column
    {
      field: 'platform',
      headerName: t.platform || 'Platform',
      width: 100,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminPlatformCellRenderer,
      cellRendererParams: {
        type: 'account',
      },
    },

    // Outperforming % column
    {
      field: 'outperformingVideosPercentage',
      headerName: t.outperforming || 'Outperforming %',
      width: 130,
      minWidth: 110,
      sortable: true,
      cellRenderer: AdminBadgeCellRenderer,
      cellRendererParams: {
        colorType: 'outperforming',
      },
      type: 'numericColumn',
    },

    // Total Videos column
    {
      field: 'postsCount',
      headerName: t.videos || 'Videos',
      width: 90,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Total Views column
    {
      field: 'totalViews',
      headerName: t.views || 'Views',
      width: 100,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      cellRendererParams: {
        bold: true,
      },
      type: 'numericColumn',
    },

    // Total Likes column
    {
      field: 'totalLikes',
      headerName: t.likes || 'Likes',
      width: 90,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Engagement Rate column
    {
      field: 'engagementRate',
      headerName: t.engagement || 'Engagement %',
      headerTooltip: 'Engagement rate calculated as (likes + comments + shares) / views × 100',
      width: 120,
      minWidth: 100,
      sortable: true,
      cellRenderer: AdminBadgeCellRenderer,
      cellRendererParams: {
        colorType: 'engagement',
      },
      type: 'numericColumn',
    },

    // Average Views column
    {
      field: 'averageVideoViews',
      headerName: t.avgViews || 'Avg Views',
      width: 100,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Posts Last 7 Days column (chart)
    {
      field: 'postsLast7Days',
      headerName: t.last7Days || 'Posts 7d',
      width: 120,
      minWidth: 100,
      sortable: false,
      cellRenderer: AdminPostsLast7DaysCellRenderer,
    },

    // Last Synced column
    {
      field: 'lastSyncedAt',
      headerName: t.lastSynced || 'Last Synced',
      width: 110,
      minWidth: 90,
      sortable: true,
      cellRenderer: AdminLastSyncedCellRenderer,
      valueGetter: (params) =>
        params.data?.lastSyncedAt ? new Date(params.data.lastSyncedAt).getTime() : 0,
    },

    // Actions column - pinned right
    {
      field: 'id',
      headerName: '',
      pinned: 'right',
      width: 100,
      minWidth: 80,
      sortable: false,
      cellRenderer: AdminSyncActionCellRenderer,
      cellRendererParams: {
        syncingAccountId,
        onSync,
      },
      suppressHeaderMenuButton: true,
    },
  ];
}

/**
 * Default column definition applied to all columns
 * Center-aligns content by default for consistent appearance
 */
export const defaultAdminAccountColDef: ColDef<AdminAccountGridData> = {
  resizable: true,
  suppressMovable: false,
  sortable: true,
  filter: false,
  cellClass: 'ag-cell-centered',
  sortingOrder: ['desc', 'asc', null], // Sort descending first when clicking column headers
};
