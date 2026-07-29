import type { ColDef } from 'ag-grid-community';

export interface AdminCreatorGridData {
  id: string;
  display_name: string;
  profile_picture: string | null;
  user_id: string | null;
  email: string | null;
  country: string | null;
  best_mc_status: string | null;
  mc_brand_count: number;
  total_owed_cents: number;
  created_at: string | null;
}

export interface AdminCreatorColumnTranslations {
  creator: string;
  country: string;
  campaignProgress: string;
  totalOwed: string;
  signedUp: string;
}

export const defaultCreatorTranslations: AdminCreatorColumnTranslations = {
  creator: 'Creator',
  country: 'Country',
  campaignProgress: 'Campaign Progress',
  totalOwed: 'Total Owed',
  signedUp: 'Signed Up',
};

export function createAdminCreatorColumnDefs(options: {
  translations?: Partial<AdminCreatorColumnTranslations>;
  onViewDetails?: (creator: AdminCreatorGridData) => void;
}): ColDef<AdminCreatorGridData>[] {
  const t = { ...defaultCreatorTranslations, ...options.translations };

  return [
    {
      field: 'display_name',
      colId: 'display_name',
      headerName: t.creator,
      minWidth: 220,
      flex: 2,
      sortable: true,
      editable: false,
      cellRenderer: 'AdminCreatorCellRenderer',
      cellRendererParams: {
        onViewDetails: options.onViewDetails,
      },
      pinned: 'left',
    },
    {
      field: 'country',
      colId: 'country',
      headerName: t.country,
      minWidth: 130,
      flex: 1,
      sortable: true,
      cellRenderer: 'AdminCreatorCountryCellRenderer',
    },
    {
      field: 'best_mc_status',
      colId: 'campaign_progress',
      headerName: t.campaignProgress,
      minWidth: 160,
      flex: 1.5,
      sortable: true,
      cellRenderer: 'AdminCampaignProgressCellRenderer',
    },
    {
      field: 'total_owed_cents',
      colId: 'total_owed',
      headerName: t.totalOwed,
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminTotalOwedCellRenderer',
    },
    {
      field: 'created_at',
      colId: 'signed_up',
      headerName: t.signedUp,
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
  ];
}

export const defaultAdminCreatorColDef: ColDef<AdminCreatorGridData> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
};
