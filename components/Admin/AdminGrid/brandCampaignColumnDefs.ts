import type { ColDef } from 'ag-grid-community';

export interface BrandCampaignRow {
  id: string;
  name: string;
  brand_organization_id: string;
  brand_name: string;
  brand_slug: string;
  brand_logo: string | null;
  job_id: string | null;
  status: 'active' | 'paused' | 'completed';
  country: string | null;
  platforms: string[];
  budget_cents: number | null;
  target_video_count: number | null;
  base_pay_per_video_cents: number | null;
  monthly_cap_cents: number | null;
  posting_frequency: string | null;
  min_views_threshold: number | null;
  min_views_pay_cents: number | null;
  bonus_milestones: Record<string, unknown>[] | null;
  referral_bonus_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  accessible: boolean;
}

export function createBrandCampaignColumnDefs(): ColDef<BrandCampaignRow>[] {
  return [
    {
      field: 'brand_name',
      headerName: 'Brand',
      minWidth: 160,
      flex: 1.2,
      sortable: true,
      pinned: 'left',
      cellRenderer: 'BrandCampaignBrandCellRenderer',
      cellStyle: { textAlign: 'left' },
    },
    {
      field: 'name',
      headerName: 'Campaign',
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      cellStyle: { textAlign: 'left' },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      minWidth: 85,
      sortable: true,
      cellRenderer: 'BrandCampaignStatusCellRenderer',
    },
    {
      field: 'country',
      headerName: 'Country',
      width: 100,
      minWidth: 80,
      sortable: true,
      cellRenderer: 'BrandCampaignCountryCellRenderer',
    },
    {
      field: 'platforms',
      headerName: 'Platforms',
      width: 120,
      minWidth: 100,
      sortable: false,
      cellRenderer: 'BrandCampaignPlatformsCellRenderer',
    },
    {
      field: 'budget_cents',
      headerName: 'Budget',
      width: 100,
      minWidth: 85,
      sortable: true,
      cellRenderer: 'BrandCampaignCurrencyCellRenderer',
    },
    {
      field: 'target_video_count',
      headerName: 'Videos',
      width: 80,
      minWidth: 70,
      sortable: true,
      cellRenderer: 'BrandCampaignNumberCellRenderer',
    },
    {
      field: 'base_pay_per_video_cents',
      headerName: 'Base Pay',
      width: 95,
      minWidth: 80,
      sortable: true,
      cellRenderer: 'BrandCampaignCurrencyCellRenderer',
    },
    {
      field: 'monthly_cap_cents',
      headerName: 'Mo. Cap',
      width: 95,
      minWidth: 80,
      sortable: true,
      cellRenderer: 'BrandCampaignCurrencyCellRenderer',
    },
    {
      field: 'bonus_milestones',
      headerName: 'Bonuses',
      width: 140,
      minWidth: 110,
      sortable: false,
      cellRenderer: 'BrandCampaignBonusCellRenderer',
    },
    {
      field: 'min_views_threshold',
      headerName: 'Min Views',
      width: 90,
      minWidth: 75,
      sortable: true,
      cellRenderer: 'BrandCampaignViewsCellRenderer',
    },
    {
      field: 'min_views_pay_cents',
      headerName: 'Min Pay',
      width: 85,
      minWidth: 75,
      sortable: true,
      cellRenderer: 'BrandCampaignCurrencyCellRenderer',
    },
    {
      field: 'referral_bonus_cents',
      headerName: 'Referral',
      width: 85,
      minWidth: 75,
      sortable: true,
      cellRenderer: 'BrandCampaignCurrencyCellRenderer',
    },
    {
      field: 'posting_frequency',
      headerName: 'Frequency',
      width: 100,
      minWidth: 85,
      sortable: true,
    },
    {
      colId: 'month_number',
      headerName: 'Month #',
      width: 85,
      minWidth: 70,
      sortable: true,
      cellRenderer: 'BrandCampaignMonthNumberCellRenderer',
    },
    {
      field: 'start_date',
      headerName: 'Start',
      width: 100,
      minWidth: 90,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      field: 'end_date',
      headerName: 'End',
      width: 100,
      minWidth: 90,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      field: 'notes',
      headerName: 'Notes',
      width: 200,
      minWidth: 120,
      flex: 1,
      sortable: false,
      cellRenderer: 'BrandCampaignNotesCellRenderer',
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 100,
      minWidth: 90,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      colId: 'actions',
      headerName: '',
      width: 50,
      minWidth: 50,
      maxWidth: 50,
      sortable: false,
      resizable: false,
      pinned: 'right',
      cellRenderer: 'BrandCampaignActionsCellRenderer',
    },
  ];
}

export const defaultBrandCampaignColDef: ColDef<BrandCampaignRow> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
  cellStyle: { textAlign: 'center' },
};
