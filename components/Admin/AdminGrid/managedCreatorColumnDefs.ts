import type { ColDef } from 'ag-grid-community';

export interface AdminManagedCreatorGridData {
  id: string;
  name: string;
  location: string | null;
  status: string | null;
  brand_organization_id: string | null;
  brand_name: string | null;
  linked_creator_profile_id: string | null;
  linked_user_id: string | null;
  job_id: string | null;
  country: string | null;
  base_pay: number | null;
  overall_avg_views: number;
  overall_post_count: number;
  last_posted_at: string | null;
  tiktok_avg_views: number | null;
  tiktok_post_count: number | null;
  tiktok_connected: boolean;
  instagram_avg_views: number | null;
  instagram_post_count: number | null;
  instagram_connected: boolean;
  youtube_avg_views: number | null;
  youtube_post_count: number | null;
  youtube_connected: boolean;
  spark_code_count: number;
  outstanding_cents: number;
}

const centeredCell = {
  cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' } as const,
};

export function createAdminManagedCreatorColumnDefs(options: {
  onCreatorClick?: (creator: AdminManagedCreatorGridData) => void;
  onOutstandingClick?: (creator: AdminManagedCreatorGridData) => void;
}): ColDef<AdminManagedCreatorGridData>[] {
  return [
    {
      field: 'name',
      headerName: 'Creator',
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      cellRenderer: 'AdminManagedCreatorNameCellRenderer',
      cellRendererParams: { onClick: options.onCreatorClick },
      pinned: 'left',
    },
    {
      field: 'brand_name',
      headerName: 'Brand',
      minWidth: 140,
      flex: 1,
      sortable: true,
      cellRenderer: 'AdminManagedCreatorBrandCellRenderer',
      ...centeredCell,
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 120,
      width: 130,
      sortable: true,
      cellRenderer: 'AdminManagedCreatorStatusCellRenderer',
      ...centeredCell,
    },
    {
      field: 'country',
      headerName: 'Country',
      minWidth: 100,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminCountryCellRenderer',
      ...centeredCell,
    },
    {
      field: 'overall_avg_views',
      headerName: 'Avg Views',
      width: 110,
      sortable: true,
      sort: 'desc',
      cellRenderer: 'AdminAvgViewsCellRenderer',
      ...centeredCell,
    },
    {
      field: 'tiktok_avg_views',
      headerName: 'TT Views',
      width: 100,
      sortable: true,
      cellRenderer: 'AdminPlatformAvgViewsCellRenderer',
      cellRendererParams: { platform: 'tiktok' },
      ...centeredCell,
    },
    {
      field: 'tiktok_post_count',
      headerName: 'TT Posts',
      width: 90,
      sortable: true,
      cellRenderer: 'AdminPlatformPostCountCellRenderer',
      cellRendererParams: { platform: 'tiktok' },
      ...centeredCell,
    },
    {
      field: 'instagram_avg_views',
      headerName: 'IG Views',
      width: 100,
      sortable: true,
      cellRenderer: 'AdminPlatformAvgViewsCellRenderer',
      cellRendererParams: { platform: 'instagram' },
      ...centeredCell,
    },
    {
      field: 'instagram_post_count',
      headerName: 'IG Posts',
      width: 90,
      sortable: true,
      cellRenderer: 'AdminPlatformPostCountCellRenderer',
      cellRendererParams: { platform: 'instagram' },
      ...centeredCell,
    },
    {
      field: 'youtube_avg_views',
      headerName: 'YT Views',
      width: 100,
      sortable: true,
      cellRenderer: 'AdminPlatformAvgViewsCellRenderer',
      cellRendererParams: { platform: 'youtube' },
      ...centeredCell,
    },
    {
      field: 'youtube_post_count',
      headerName: 'YT Posts',
      width: 90,
      sortable: true,
      cellRenderer: 'AdminPlatformPostCountCellRenderer',
      cellRendererParams: { platform: 'youtube' },
      ...centeredCell,
    },
    {
      field: 'spark_code_count',
      headerName: 'Spark Codes',
      width: 100,
      sortable: true,
      cellRenderer: 'AdminSparkCodesCellRenderer',
      ...centeredCell,
    },
    {
      field: 'last_posted_at',
      headerName: 'Last Post',
      width: 90,
      sortable: true,
      cellRenderer: 'AdminDaysSincePostCellRenderer',
      ...centeredCell,
    },
    {
      field: 'base_pay',
      headerName: 'Base Pay',
      width: 100,
      sortable: true,
      cellRenderer: 'AdminBasePayCellRenderer',
      ...centeredCell,
    },
    {
      field: 'outstanding_cents',
      headerName: 'Outstanding',
      width: 110,
      sortable: true,
      cellRenderer: 'AdminOutstandingCellRenderer',
      cellRendererParams: { onClick: options.onOutstandingClick },
      ...centeredCell,
    },
  ];
}

export const defaultAdminManagedCreatorColDef: ColDef<AdminManagedCreatorGridData> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
};
