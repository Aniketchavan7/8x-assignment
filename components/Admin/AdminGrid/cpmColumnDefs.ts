import type { ColDef } from 'ag-grid-community';
import type { CpmSubmissionStatus } from '@/lib/db/types';

export interface AdminCpmCampaignGridData {
  id: string;
  job_title: string;
  job_slug: string;
  status: string;
  cpm_rate: number;
  cpm_cap: number;
  cpm_base_pay: number;
  cpm_platforms_allowed: string[];
  created_at: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_logo: string | null;
  // Stats
  total_creators: number;
  total_submissions: number;
  pending_submissions: number;
  active_submissions: number;
  total_views_earned: number;
  total_earnings: number;
  total_paid: number;
}

export interface AdminCpmCampaignColumnTranslations {
  campaign: string;
  brand: string;
  status: string;
  rate: string;
  cap: string;
  basePay: string;
  platforms: string;
  creators: string;
  submissions: string;
  views: string;
  earnings: string;
  paid: string;
  created: string;
  actions: string;
}

export const defaultCpmCampaignTranslations: AdminCpmCampaignColumnTranslations = {
  campaign: 'Campaign',
  brand: 'Brand',
  status: 'Status',
  rate: 'CPM Rate',
  cap: 'Cap',
  basePay: 'Base Pay',
  platforms: 'Platforms',
  creators: 'Creators',
  submissions: 'Submissions',
  views: 'Views',
  earnings: 'Earnings',
  paid: 'Paid',
  created: 'Created',
  actions: '',
};

export function createAdminCpmCampaignColumnDefs(options: {
  translations?: Partial<AdminCpmCampaignColumnTranslations>;
  onViewDetails?: (campaign: AdminCpmCampaignGridData) => void;
  onViewSubmissions?: (campaign: AdminCpmCampaignGridData) => void;
}): ColDef<AdminCpmCampaignGridData>[] {
  const t = { ...defaultCpmCampaignTranslations, ...options.translations };

  return [
    {
      field: 'job_title',
      colId: 'campaign',
      headerName: t.campaign,
      minWidth: 200,
      flex: 2,
      sortable: true,
      cellRenderer: 'AdminCpmCampaignNameCellRenderer',
      pinned: 'left',
    },
    {
      field: 'brand_name',
      colId: 'brand',
      headerName: t.brand,
      minWidth: 150,
      flex: 1,
      sortable: true,
      cellRenderer: 'AdminCpmBrandCellRenderer',
    },
    {
      field: 'status',
      colId: 'status',
      headerName: t.status,
      minWidth: 100,
      width: 120,
      sortable: true,
      cellRenderer: 'AdminCpmCampaignStatusCellRenderer',
    },
    {
      field: 'cpm_rate',
      colId: 'rate',
      headerName: t.rate,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminCpmRateCellRenderer',
    },
    {
      field: 'cpm_cap',
      colId: 'cap',
      headerName: t.cap,
      minWidth: 80,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminCurrencyCellRenderer',
    },
    {
      field: 'cpm_platforms_allowed',
      colId: 'platforms',
      headerName: t.platforms,
      minWidth: 120,
      width: 140,
      sortable: false,
      cellRenderer: 'AdminCpmPlatformsCellRenderer',
    },
    {
      field: 'total_creators',
      colId: 'creators',
      headerName: t.creators,
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'AdminCountCellRenderer',
    },
    {
      field: 'total_submissions',
      colId: 'submissions',
      headerName: t.submissions,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminCpmSubmissionCountCellRenderer',
    },
    {
      field: 'total_views_earned',
      colId: 'views',
      headerName: t.views,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminViewsCellRenderer',
    },
    {
      field: 'total_earnings',
      colId: 'earnings',
      headerName: t.earnings,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminCurrencyCellRenderer',
    },
    {
      field: 'created_at',
      colId: 'created',
      headerName: t.created,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      colId: 'actions',
      headerName: t.actions,
      minWidth: 50,
      width: 60,
      sortable: false,
      cellRenderer: 'AdminCpmCampaignActionsCellRenderer',
      cellRendererParams: {
        onViewDetails: options.onViewDetails,
        onViewSubmissions: options.onViewSubmissions,
      },
      pinned: 'right',
    },
  ];
}

export const defaultAdminCpmCampaignColDef: ColDef<AdminCpmCampaignGridData> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
};

export interface AdminCpmSubmissionGridData {
  id: string;
  job_id: string;
  job_title: string;
  cpm_rate: number;
  cpm_cap: number;
  creator_id: string;
  creator_name: string;
  creator_profile_picture: string | null;
  creator_email: string | null;
  brand_id: string;
  brand_name: string;
  video_url: string;
  platform: string;
  status: CpmSubmissionStatus;
  views_at_submission: number;
  views_current: number;
  views_approved: number;
  views_earned: number;
  views_pending: number;
  earnings_total: number;
  earnings_paid: number;
  earnings_unpaid: number;
  submitted_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
}

export interface AdminCpmSubmissionColumnTranslations {
  creator: string;
  campaign: string;
  brand: string;
  video: string;
  platform: string;
  status: string;
  viewsStart: string;
  viewsCurrent: string;
  viewsEarned: string;
  earnings: string;
  paid: string;
  unpaid: string;
  submitted: string;
  approved: string;
  actions: string;
  quickActions: string;
}

export const defaultCpmSubmissionTranslations: AdminCpmSubmissionColumnTranslations = {
  creator: 'Creator',
  campaign: 'Campaign',
  brand: 'Brand',
  video: 'Video',
  platform: 'Platform',
  status: 'Status',
  viewsStart: 'Start Views',
  viewsCurrent: 'Current Views',
  viewsEarned: 'Views Earned',
  earnings: 'Earnings',
  paid: 'Paid',
  unpaid: 'Unpaid',
  submitted: 'Submitted',
  approved: 'Approved',
  actions: '',
  quickActions: 'Actions',
};

export function createAdminCpmSubmissionColumnDefs(options: {
  translations?: Partial<AdminCpmSubmissionColumnTranslations>;
  onViewDetails?: (submission: AdminCpmSubmissionGridData) => void;
  onApprove?: (submission: AdminCpmSubmissionGridData) => void;
  onReject?: (submission: AdminCpmSubmissionGridData) => void;
  onUpdateViews?: (submission: AdminCpmSubmissionGridData) => void;
  onPayout?: (submission: AdminCpmSubmissionGridData) => void;
  onOpenVideo?: (submission: AdminCpmSubmissionGridData) => void;
  isApproving?: string | null;
  isRejecting?: string | null;
  isPaying?: string | null;
}): ColDef<AdminCpmSubmissionGridData>[] {
  const t = { ...defaultCpmSubmissionTranslations, ...options.translations };

  return [
    {
      field: 'creator_name',
      colId: 'creator',
      headerName: t.creator,
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      cellRenderer: 'AdminCpmCreatorCellRenderer',
      pinned: 'left',
    },
    {
      field: 'video_url',
      colId: 'video',
      headerName: t.video,
      minWidth: 140,
      width: 160,
      sortable: false,
      cellRenderer: 'AdminCpmVideoCellRenderer',
      cellRendererParams: {
        onOpenVideo: options.onOpenVideo,
      },
    },
    {
      field: 'job_title',
      colId: 'campaign',
      headerName: t.campaign,
      minWidth: 140,
      flex: 1,
      sortable: true,
    },
    {
      field: 'status',
      colId: 'status',
      headerName: t.status,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminCpmSubmissionStatusCellRenderer',
    },
    {
      field: 'views_current',
      colId: 'viewsCurrent',
      headerName: 'Views',
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminViewsCellRenderer',
    },
    {
      field: 'earnings_total',
      colId: 'earnings',
      headerName: t.earnings,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminCurrencyCellRenderer',
    },
    {
      field: 'earnings_unpaid',
      colId: 'unpaid',
      headerName: t.unpaid,
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdminCpmUnpaidCellRenderer',
    },
    {
      field: 'submitted_at',
      colId: 'submitted',
      headerName: t.submitted,
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'AdminDateCellRenderer',
    },
    {
      colId: 'quickActions',
      headerName: t.quickActions,
      minWidth: 130,
      width: 150,
      sortable: false,
      cellRenderer: 'AdminCpmQuickActionsCellRenderer',
      cellRendererParams: {
        onApprove: options.onApprove,
        onReject: options.onReject,
        onPayout: options.onPayout,
        onOpenVideo: options.onOpenVideo,
        isApproving: options.isApproving,
        isRejecting: options.isRejecting,
        isPaying: options.isPaying,
      },
    },
    {
      colId: 'actions',
      headerName: '',
      minWidth: 50,
      width: 50,
      sortable: false,
      cellRenderer: 'AdminCpmSubmissionActionsCellRenderer',
      cellRendererParams: {
        onViewDetails: options.onViewDetails,
        onApprove: options.onApprove,
        onReject: options.onReject,
        onUpdateViews: options.onUpdateViews,
        onPayout: options.onPayout,
      },
      pinned: 'right',
    },
  ];
}

export const defaultAdminCpmSubmissionColDef: ColDef<AdminCpmSubmissionGridData> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
};
