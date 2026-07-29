import type { ColDef, ValueFormatterParams, ValueGetterParams, ValueSetterParams } from 'ag-grid-community';

export interface PipelineGridData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  statusLabel: string;
  statusOrder: number;
  tiktok_username: string | null;
  tiktok_url: string | null;
  instagram_username: string | null;
  instagram_url: string | null;
  jobId: string | null;
  jobTitle: string | null;
  jobCountry: string | null;
  base_pay: number | null;
  payment: string | null;
  job_cpm: number | null;
  warmup: number;
  country: string | null;
  countryCode: string | null;
  linked: boolean;
  linkedUserId: string | null;
  hasVideos: boolean;
  notes: string | null;
  contractSigned: boolean;
  lastActionAt: string | null;
  daysCount: number | null;
  daysPhase: 'waiting' | 'accepted' | 'warming_up' | 'posting' | 'stalled' | 'rejected' | 'dropped';
  daysTooltip: string;
  youtube_username: string | null;
  youtube_url: string | null;
  youtubeTracked: boolean | null;
  tiktokTracked: boolean | null;
  instagramTracked: boolean | null;
  tiktokPostCount: number | null;
  instagramPostCount: number | null;
  youtubePostCount: number | null;
  tiktokFrozen: boolean;
  instagramFrozen: boolean;
  youtubeFrozen: boolean;
}

function centsToDollars(params: ValueGetterParams<PipelineGridData>): number | null {
  const v = params.data?.base_pay;
  if (v == null || v === 0) return null;
  return v / 100;
}

function dollarsToCents(params: ValueSetterParams<PipelineGridData>): boolean {
  const raw = String(params.newValue).replace(/[$,\s]/g, '');
  if (raw === '') {
    params.data.base_pay = null;
    return true;
  }
  const n = parseFloat(raw);
  if (isNaN(n)) return false;
  params.data.base_pay = Math.round(n * 100);
  return true;
}

function formatDollars(params: ValueFormatterParams<PipelineGridData>): string {
  const v = Number(params.value);
  if (params.value == null || isNaN(v)) return '';
  return `$${v.toFixed(2)}`;
}

export function createPipelineColumnDefs(): ColDef<PipelineGridData>[] {
  return [
    {
      field: 'name',
      headerName: 'Creator',
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      pinned: 'left',
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
      cellRenderer: 'NameAvatarCellRenderer',
    },
    {
      field: 'email',
      headerName: 'Email',
      minWidth: 160,
      width: 180,
      sortable: true,
      hide: true,
      cellRenderer: 'CopyableCellRenderer',
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
    },
    {
      field: 'phone',
      headerName: 'Phone',
      minWidth: 120,
      width: 140,
      sortable: true,
      hide: true,
      cellRenderer: 'CopyableCellRenderer',
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
    },
    {
      field: 'statusLabel',
      headerName: 'Status',
      minWidth: 130,
      width: 150,
      sortable: true,
      cellRenderer: 'PipelineStatusCellRenderer',
      comparator: (_a: string, _b: string, nodeA, nodeB) => {
        const orderA = nodeA.data?.statusOrder ?? 0;
        const orderB = nodeB.data?.statusOrder ?? 0;
        return orderA - orderB;
      },
    },
    {
      colId: 'job',
      field: 'jobTitle',
      headerName: 'Job',
      minWidth: 160,
      width: 180,
      sortable: true,
      cellRenderer: 'PipelineJobCellRenderer',
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
    },
    {
      colId: 'days',
      field: 'daysCount',
      headerName: 'Days',
      headerTooltip: 'Days at current stage',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'DaysColumnCellRenderer',
    },
    {
      field: 'country',
      headerName: 'Country',
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'PipelineCountryCellRenderer',
    },
    {
      field: 'hasVideos',
      headerName: 'Video',
      minWidth: 70,
      width: 80,
      sortable: true,
      cellRenderer: 'PipelineVideoCellRenderer',
    },
    {
      colId: 'tiktok',
      field: 'tiktokTracked',
      headerName: 'TikTok',
      headerTooltip:
        'Platform tracking status colors:\n🟢 Green — Tracked (posts synced)\n🔴 Red — Handle added, not tracked\n🔵 Blue — Frozen (tracking paused)\n⚫ Gray — No tracking data',
      minWidth: 70,
      width: 80,
      sortable: true,
      cellRenderer: 'TikTokLinkCellRenderer',
    },
    {
      colId: 'instagram',
      field: 'instagramTracked',
      headerName: 'IG',
      minWidth: 70,
      width: 80,
      sortable: true,
      cellRenderer: 'InstagramLinkCellRenderer',
    },
    {
      colId: 'youtube',
      field: 'youtubeTracked',
      headerName: 'YT',
      minWidth: 70,
      width: 80,
      sortable: true,
      cellRenderer: 'YouTubeLinkCellRenderer',
    },
    {
      field: 'tiktokPostCount',
      headerName: 'TT Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'PipelinePostCountCellRenderer',
    },
    {
      field: 'instagramPostCount',
      headerName: 'IG Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'PipelinePostCountCellRenderer',
    },
    {
      field: 'youtubePostCount',
      headerName: 'YT Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'PipelinePostCountCellRenderer',
    },
    {
      field: 'base_pay',
      headerName: 'Base/Video',
      minWidth: 100,
      width: 110,
      sortable: true,
      editable: true,
      valueGetter: centsToDollars,
      valueSetter: dollarsToCents,
      valueFormatter: formatDollars,
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    },
    {
      field: 'contractSigned',
      headerName: 'Contract',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'PipelineBooleanCellRenderer',
    },
    {
      field: 'notes',
      headerName: 'Notes',
      minWidth: 120,
      width: 180,
      sortable: true,
      editable: false,
      cellRenderer: 'PipelineNotesCellRenderer',
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
      tooltipField: 'notes',
    },
  ];
}

export const defaultPipelineColDef: ColDef<PipelineGridData> = {
  resizable: true,
  sortable: true,
  sortingOrder: ['desc', 'asc', null],
  cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
