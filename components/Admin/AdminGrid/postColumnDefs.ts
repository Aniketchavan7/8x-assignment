/**
 * AG Grid Column Definitions for Admin Tracked Posts Table
 *
 * Defines the columns for the AG Grid-based admin posts table,
 * including admin-specific columns like job title and cross-brand view.
 */

import type { ColDef } from 'ag-grid-community';
import {
  AdminJobCellRenderer,
  AdminPlatformCellRenderer,
  AdminNumericCellRenderer,
  AdminBadgeCellRenderer,
  AdminPostThumbnailCellRenderer,
  AdminPostAccountCellRenderer,
  AdminDateCellRenderer,
  AdminLastFetchedCellRenderer,
  AdminVideoStorageCellRenderer,
} from './cellRenderers';

/**
 * Admin post data structure for the AG Grid table
 */
export interface AdminPostGridData {
  id: string;
  postUrl: string;
  postedAt: string;
  caption: string | null;
  thumbnailUrl: string | null;
  username: string;
  accountId: string;
  platform: 'tiktok' | 'instagram';
  brandId?: string;
  brandName?: string;
  jobId: string | null;
  jobTitle: string | null;
  views: number | null;
  paidViews: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves?: number | null;
  engagementRate: number | null;
  isOutperforming: boolean;
  rawData?: Record<string, unknown> | null;
  lastFetchedAt: string | null;
  followerCount: number | null;
  videoStorageUrl: string | null;
  videoStorageError: string | null;
}

/**
 * Translations for column headers
 */
export interface AdminPostColumnTranslations {
  post?: string;
  account?: string;
  job?: string;
  platform?: string;
  followers?: string;
  views?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  engagement?: string;
  posted?: string;
  lastFetched?: string;
  paid?: string;
  organic?: string;
}

/**
 * Options for creating column definitions
 */
export interface CreateAdminPostColumnDefsOptions {
  translations?: AdminPostColumnTranslations;
  fetchingPostIds?: Set<string>;
  onViewDetails?: (post: AdminPostGridData) => void;
  /** Whether any post has paid_views data. When false, Paid/Organic columns are hidden. */
  hasPaidData?: boolean;
}

/**
 * Creates column definitions for the AG Grid admin tracked posts table
 */
export function createAdminPostColumnDefs(
  options: CreateAdminPostColumnDefsOptions
): ColDef<AdminPostGridData>[] {
  const { translations: t = {}, fetchingPostIds, onViewDetails, hasPaidData = false } = options;

  return [
    // Post/Thumbnail column - pinned left
    {
      field: 'thumbnailUrl',
      headerName: t.post || 'Post',
      pinned: 'left',
      width: 140,
      minWidth: 120,
      sortable: false,
      cellRenderer: AdminPostThumbnailCellRenderer,
      cellRendererParams: {
        fetchingPostIds,
      },
      cellClass: 'ag-cell-left-padded',
    },

    // Account column
    {
      field: 'username',
      headerName: t.account || 'Account',
      width: 140,
      minWidth: 120,
      sortable: true,
      cellRenderer: AdminPostAccountCellRenderer,
      valueGetter: (params) => params.data?.username?.toLowerCase() || '',
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
        type: 'post',
      },
    },

    // Followers column
    {
      field: 'followerCount',
      headerName: t.followers || 'Followers',
      headerTooltip: 'Account follower count at last sync',
      width: 110,
      minWidth: 90,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Views column
    {
      field: 'views',
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

    // Paid/Organic Views columns (only shown when ads data exists)
    ...(hasPaidData
      ? [
          {
            field: 'paidViews' as const,
            headerName: t.paid || 'Paid',
            width: 100,
            minWidth: 80,
            sortable: true,
            cellRenderer: AdminNumericCellRenderer,
            cellRendererParams: {
              bold: true,
              colorClass: 'text-blue-600 dark:text-blue-400',
            },
            type: 'numericColumn' as const,
          },
          {
            colId: 'organicViews',
            headerName: t.organic || 'Organic',
            width: 100,
            minWidth: 80,
            sortable: true,
            valueGetter: (params: { data?: AdminPostGridData }) => {
              const data = params.data;
              if (!data || data.views == null) return null;
              return Math.max(0, data.views - (data.paidViews || 0));
            },
            cellRenderer: AdminNumericCellRenderer,
            cellRendererParams: {
              bold: true,
              colorClass: 'text-emerald-600 dark:text-emerald-400',
            },
            type: 'numericColumn' as const,
          },
        ]
      : []),

    // Likes column
    {
      field: 'likes',
      headerName: t.likes || 'Likes',
      width: 90,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Comments column
    {
      field: 'comments',
      headerName: t.comments || 'Comments',
      width: 100,
      minWidth: 80,
      sortable: true,
      cellRenderer: AdminNumericCellRenderer,
      type: 'numericColumn',
    },

    // Shares column
    {
      field: 'shares',
      headerName: t.shares || 'Shares',
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

    // Posted At column
    {
      field: 'postedAt',
      headerName: t.posted || 'Posted',
      width: 110,
      minWidth: 90,
      sortable: true,
      cellRenderer: AdminDateCellRenderer,
    },

    // Last Fetched column
    {
      field: 'lastFetchedAt',
      headerName: t.lastFetched || 'Last Fetched',
      width: 110,
      minWidth: 90,
      sortable: true,
      cellRenderer: AdminLastFetchedCellRenderer,
      valueGetter: (params) =>
        params.data?.lastFetchedAt ? new Date(params.data.lastFetchedAt).getTime() : 0,
    },

    // Video Storage column
    {
      field: 'videoStorageUrl',
      headerName: 'Video',
      headerTooltip: 'Video download status (stored in R2)',
      width: 100,
      minWidth: 80,
      sortable: false,
      cellRenderer: AdminVideoStorageCellRenderer,
    },
  ];
}

/**
 * Default column definition applied to all columns
 * Center-aligns content by default for consistent appearance
 */
export const defaultAdminPostColDef: ColDef<AdminPostGridData> = {
  resizable: true,
  suppressMovable: false,
  sortable: true,
  filter: false,
  cellClass: 'ag-cell-centered',
  sortingOrder: ['desc', 'asc', null], // Sort descending first when clicking column headers
};
