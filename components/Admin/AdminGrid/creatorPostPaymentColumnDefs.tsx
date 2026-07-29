import type { ColDef } from 'ag-grid-community';
import type { CustomCellRendererProps } from 'ag-grid-react';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { REVIEW_STATUS_CONFIG } from '@/components/Admin/VideoReviews/constants';

export interface CreatorPostPaymentGridData {
  id: string;
  managed_creator_id: string;
  post_id: string;
  creator_name: string;
  creator_profile_id: string | null;
  managed_creator_status: string;
  brand_name: string;
  job_title: string | null;
  platform: string;
  post_url: string;
  thumbnail_url: string | null;
  posted_at: string | null;
  latest_views: number;
  base_pay_cents: number;
  bonus_cents: number;
  total_owed_cents: number;
  total_paid_cents: number;
  outstanding_cents: number;
  payment_status: string;
  review_status: string;
  offplatform_method: string | null;
  ad_code: string | null;
  is_sponsored: boolean | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
}

export interface CreatorPostPaymentGroupedData {
  id: string;
  managed_creator_id: string;
  job_id: string | null;
  creator_name: string;
  creator_profile_id: string | null;
  managed_creator_status: string;
  brand_name: string;
  job_title: string | null;
  post_count: number;
  ad_code_count: number;
  base_pay_cents: number;
  bonus_cents: number;
  total_owed_cents: number;
  total_paid_cents: number;
  outstanding_cents: number;
  payment_status: string;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
}

// Row type used in the grouped view grid — can be either a group row or a child post row
export type GroupedViewRow =
  | (CreatorPostPaymentGroupedData & { _rowType: 'group' })
  | (CreatorPostPaymentGridData & { _rowType: 'child'; _parentGroupId: string });

// ============================================================================
// Cell Renderers
// ============================================================================

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k`;
  return views.toLocaleString();
}

export function PostPaymentPlatformCellRenderer(props: CustomCellRendererProps<CreatorPostPaymentGridData>) {
  if (!props.data) return null;
  return (
    <div className="flex items-center justify-center h-full">
      <PlatformIcon platform={props.data.platform} url={props.data.post_url} type="post" />
    </div>
  );
}

export function PostPaymentStatusCellRenderer(props: CustomCellRendererProps<CreatorPostPaymentGridData>) {
  if (!props.data) return null;
  const { payment_status: status, offplatform_method } = props.data;

  let dotColor: string;
  let label: string;

  if (status === 'paid') {
    dotColor = 'bg-emerald-500';
    label = 'Paid';
  } else if (status === 'partially_paid') {
    dotColor = 'bg-amber-500';
    label = 'Partial';
  } else if (status === 'excluded') {
    dotColor = 'bg-gray-400';
    label = 'Excluded';
  } else {
    dotColor = 'bg-red-500';
    label = 'Unpaid';
  }

  return (
    <div className="flex items-center h-full gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {offplatform_method && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap max-w-[120px] truncate" title={offplatform_method}>
          {offplatform_method}
        </span>
      )}
    </div>
  );
}

export function PostPaymentCurrencyCell({ value, muted }: { value: number; muted?: boolean }) {
  if (value === 0 && muted) {
    return (
      <div className="flex items-center h-full font-mono text-sm text-muted-foreground/40">
        -
      </div>
    );
  }
  return (
    <div className="flex items-center h-full font-mono text-sm">
      {formatCurrency(value)}
    </div>
  );
}

export function PostPaymentOutstandingCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;
  const value = props.data.outstanding_cents;

  return (
    <div className={`flex items-center h-full font-mono text-sm font-bold ${
      value > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
    }`}>
      {formatCurrency(value)}
    </div>
  );
}

export function PostPaymentViewsCellRenderer(props: CustomCellRendererProps<CreatorPostPaymentGridData>) {
  if (!props.data) return null;
  const views = props.data.latest_views;

  return (
    <div className="flex items-center h-full">
      <span className={`text-sm font-semibold tabular-nums ${
        views >= 1_000_000 ? 'text-violet-600 dark:text-violet-400' :
        views >= 100_000 ? 'text-blue-600 dark:text-blue-400' :
        ''
      }`}>
        {formatViews(views)}
      </span>
    </div>
  );
}

export function PostPaymentCreatorCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;
  return (
    <div className="flex items-center h-full gap-2 font-medium text-sm">
      <button
        type="button"
        className="hover:underline text-left"
        data-creator-click
        onClick={(e) => {
          e.stopPropagation();
          const event = new CustomEvent('open-creator-modal', {
            detail: {
              creatorProfileId: props.data!.creator_profile_id,
              managedCreatorId: props.data!.managed_creator_id,
            },
          });
          window.dispatchEvent(event);
        }}
      >
        {props.data.creator_name}
      </button>
    </div>
  );
}

const MANAGED_CREATOR_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active: { label: 'Active', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
  warming_up: { label: 'Warming Up', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  applied: { label: 'Applied', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-400' },
  test_videos_submitted: { label: 'Video Submitted', bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-400' },
  ghosted: { label: 'Ghosted', bg: 'bg-gray-50 dark:bg-gray-950/40', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-400' },
  dropped: { label: 'Dropped', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-400' },
  unclear: { label: 'Unclear', bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-400' },
};

export function ManagedCreatorStatusCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;
  const status = props.data.managed_creator_status;
  const config = MANAGED_CREATOR_STATUS_CONFIG[status];

  if (!config) {
    return (
      <div className="flex items-center h-full">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          {status?.replace(/_/g, ' ') || 'Unknown'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full">
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
        {config.label}
      </span>
    </div>
  );
}

export function PostPaymentDateCellRenderer(props: CustomCellRendererProps<CreatorPostPaymentGridData>) {
  if (!props.data?.posted_at) return null;
  const date = new Date(props.data.posted_at);
  return (
    <div className="flex items-center h-full text-sm text-muted-foreground">
      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
    </div>
  );
}

const STRIPE_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  yes: { label: 'Yes', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
  incomplete: { label: 'Incomplete', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  no: { label: 'No', bg: 'bg-gray-50 dark:bg-gray-950/40', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-400' },
};

export function PostPaymentStripeCellRenderer(props: CustomCellRendererProps<CreatorPostPaymentGridData | GroupedViewRow>) {
  if (!props.data) return null;

  if ('_rowType' in props.data && props.data._rowType === 'child') return null;

  const { stripe_account_id, stripe_payouts_enabled } = props.data;

  const status = !stripe_account_id ? 'no' : !stripe_payouts_enabled ? 'incomplete' : 'yes';
  const config = STRIPE_STATUS_CONFIG[status];

  return (
    <div className="flex items-center h-full">
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
        {config.label}
      </span>
    </div>
  );
}

// ============================================================================
// Grouped View Cell Renderers
// ============================================================================

export function PostPaymentPostCountCellRenderer(props: CustomCellRendererProps<GroupedViewRow>) {
  if (!props.data || props.data._rowType !== 'group') return null;
  return (
    <div className="flex items-center h-full text-sm tabular-nums">
      {props.data.post_count} {props.data.post_count === 1 ? 'post' : 'posts'}
    </div>
  );
}

export function PostPaymentGroupedStatusCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;
  const status = props.data.payment_status;

  let dotColor: string;
  let label: string;

  if (status === 'paid') {
    dotColor = 'bg-emerald-500';
    label = 'Paid';
  } else if (status === 'partially_paid') {
    dotColor = 'bg-amber-500';
    label = 'Partial';
  } else if (status === 'excluded') {
    dotColor = 'bg-gray-400';
    label = 'Excluded';
  } else {
    dotColor = 'bg-red-500';
    label = 'Unpaid';
  }

  return (
    <div className="flex items-center h-full gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

export function ReviewStatusCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;

  // In grouped view, skip group rows — only show on child rows
  if ('_rowType' in props.data && props.data._rowType === 'group') return null;

  const status = props.data.review_status;
  if (!status || status === 'approved') return null;

  const config = REVIEW_STATUS_CONFIG[status] || REVIEW_STATUS_CONFIG.pending;

  return (
    <div className="flex items-center h-full">
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
        {config.label}
      </span>
    </div>
  );
}

export function AdCodeCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;

  // Group rows: show count
  if ('_rowType' in props.data && props.data._rowType === 'group') {
    const count = props.data.ad_code_count;
    if (!count) {
      return (
        <div className="flex items-center h-full">
          <span className="text-xs text-muted-foreground/40">0</span>
        </div>
      );
    }
    return (
      <div className="flex items-center h-full">
        <span className="text-sm tabular-nums font-medium">{count}</span>
      </div>
    );
  }

  // Child / flat rows: show yes/no
  const adCode = props.data.ad_code;

  if (!adCode) {
    return (
      <div className="flex items-center h-full">
        <span className="text-xs text-muted-foreground/40">-</span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full">
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        Yes
      </span>
    </div>
  );
}

export function DisclosureCellRenderer(props: CustomCellRendererProps<any>) {
  if (!props.data) return null;

  if ('_rowType' in props.data && props.data._rowType === 'group') {
    return (
      <div className="flex items-center h-full">
        <span className="text-xs text-muted-foreground/40">—</span>
      </div>
    );
  }

  const value: boolean | null = props.data.is_sponsored ?? null;

  if (value === null) {
    return (
      <div className="flex items-center h-full">
        <span className="text-xs text-muted-foreground/40" title="Rule does not apply on this platform">—</span>
      </div>
    );
  }

  if (value === true) {
    return (
      <div className="flex items-center h-full">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          Disclosed
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full">
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        Missing
      </span>
    </div>
  );
}

// ============================================================================
// Flat View Column Definitions
// ============================================================================

export function createCreatorPostPaymentColumnDefs(): ColDef<CreatorPostPaymentGridData>[] {
  return [
    {
      colId: 'checkbox',
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 48,
      maxWidth: 48,
      pinned: 'left',
      sortable: false,
      resizable: false,
      suppressMovable: true,
    },
    {
      field: 'creator_name',
      colId: 'creator',
      headerName: 'Creator',
      minWidth: 160,
      flex: 1.5,
      sortable: true,
      pinned: 'left',
      cellRenderer: 'PostPaymentCreatorCellRenderer',
    },
    {
      field: 'managed_creator_status',
      colId: 'mcStatus',
      headerName: 'MC Status',
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'ManagedCreatorStatusCellRenderer',
    },
    {
      field: 'brand_name',
      colId: 'brand',
      headerName: 'Brand',
      minWidth: 120,
      flex: 0.8,
      sortable: true,
    },
    {
      field: 'job_title',
      colId: 'job',
      headerName: 'Job',
      minWidth: 140,
      flex: 1,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<CreatorPostPaymentGridData>) => {
        if (!props.data) return null;
        return (
          <div className="flex items-center h-full text-sm truncate">
            {props.data.job_title || <span className="text-muted-foreground">-</span>}
          </div>
        );
      },
    },
    {
      field: 'platform',
      colId: 'platform',
      headerName: 'Post',
      minWidth: 60,
      width: 70,
      sortable: true,
      cellRenderer: 'PostPaymentPlatformCellRenderer',
    },
    {
      field: 'posted_at',
      colId: 'date',
      headerName: 'Date',
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'PostPaymentDateCellRenderer',
    },
    {
      field: 'latest_views',
      colId: 'views',
      headerName: 'Views',
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'PostPaymentViewsCellRenderer',
    },
    {
      field: 'base_pay_cents',
      colId: 'basePay',
      headerName: 'Base',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<CreatorPostPaymentGridData>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.base_pay_cents} /> : null,
    },
    {
      field: 'bonus_cents',
      colId: 'bonus',
      headerName: 'Bonus',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<CreatorPostPaymentGridData>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.bonus_cents} muted /> : null,
    },
    {
      field: 'total_paid_cents',
      colId: 'paid',
      headerName: 'Paid',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<CreatorPostPaymentGridData>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.total_paid_cents} muted /> : null,
    },
    {
      field: 'outstanding_cents',
      colId: 'outstanding',
      headerName: 'Outstanding',
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'PostPaymentOutstandingCellRenderer',
    },
    {
      field: 'review_status',
      colId: 'review',
      headerName: 'Review',
      minWidth: 80,
      width: 100,
      sortable: true,
      cellRenderer: 'ReviewStatusCellRenderer',
    },
    {
      field: 'ad_code',
      colId: 'adCode',
      headerName: 'Ad Code',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'AdCodeCellRenderer',
    },
    {
      field: 'is_sponsored',
      colId: 'disclosure',
      headerName: 'Disclosure',
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'DisclosureCellRenderer',
    },
    {
      field: 'payment_status',
      colId: 'status',
      headerName: 'Status',
      minWidth: 100,
      width: 160,
      sortable: true,
      cellRenderer: 'PostPaymentStatusCellRenderer',
    },
    {
      field: 'stripe_account_id',
      colId: 'stripe',
      headerName: 'Stripe',
      minWidth: 80,
      width: 110,
      sortable: true,
      cellRenderer: 'PostPaymentStripeCellRenderer',
    },
  ];
}

// ============================================================================
// Grouped View Column Definitions
// ============================================================================

export function createGroupedPostPaymentColumnDefs(): ColDef<GroupedViewRow>[] {
  return [
    {
      colId: 'checkbox',
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 48,
      maxWidth: 48,
      pinned: 'left',
      sortable: false,
      resizable: false,
      suppressMovable: true,
    },
    {
      field: 'creator_name',
      colId: 'creator',
      headerName: 'Creator',
      minWidth: 180,
      flex: 1.5,
      sortable: true,
      pinned: 'left',
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) => {
        if (!props.data) return null;
        if (props.data._rowType === 'child') {
          const child = props.data as CreatorPostPaymentGridData & { _rowType: 'child' };
          return (
            <div className="flex items-center h-full gap-2 pl-8 text-sm text-muted-foreground">
              <PlatformIcon platform={child.platform} url={child.post_url} type="post" />
              <span className="truncate">
                {child.posted_at
                  ? new Date(child.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'No date'}
                {child.latest_views > 0 && ` · ${formatViews(child.latest_views)} views`}
              </span>
            </div>
          );
        }
        const ctx = props.context as { expandedGroups?: Set<string>; loadingChildren?: Set<string> } | undefined;
        const isExpanded = ctx?.expandedGroups?.has(props.data.id);
        const isLoading = ctx?.loadingChildren?.has(props.data.id);
        const gd = props.data as CreatorPostPaymentGroupedData & { _rowType: 'group' };
        return (
          <div className="flex items-center h-full gap-1">
            <button
              type="button"
              className="p-1 rounded hover:bg-muted transition-colors shrink-0"
              data-expand-click
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('toggle-group-expand', {
                  detail: {
                    groupId: gd.id,
                    managedCreatorId: gd.managed_creator_id,
                    jobId: gd.job_id,
                  },
                }));
              }}
            >
              {isLoading ? (
                <svg className="h-4 w-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                </svg>
              ) : (
                <svg className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="hover:underline text-left font-medium text-sm"
              data-creator-click
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('open-creator-modal', {
                  detail: {
                    creatorProfileId: props.data!.creator_profile_id,
                    managedCreatorId: props.data!.managed_creator_id,
                  },
                }));
              }}
            >
              {props.data.creator_name}
            </button>
          </div>
        );
      },
    },
    {
      field: 'managed_creator_status',
      colId: 'mcStatus',
      headerName: 'MC Status',
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) => {
        if (!props.data || props.data._rowType === 'child') return null;
        return <ManagedCreatorStatusCellRenderer {...(props as any)} />;
      },
    },
    {
      field: 'brand_name',
      colId: 'brand',
      headerName: 'Brand',
      minWidth: 120,
      flex: 0.8,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) => {
        if (!props.data || props.data._rowType === 'child') return null;
        return (
          <div className="flex items-center h-full text-sm">
            {props.data.brand_name}
          </div>
        );
      },
    },
    {
      field: 'job_title',
      colId: 'job',
      headerName: 'Job',
      minWidth: 140,
      flex: 1,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) => {
        if (!props.data || props.data._rowType === 'child') return null;
        return (
          <div className="flex items-center h-full text-sm truncate">
            {props.data.job_title || <span className="text-muted-foreground">-</span>}
          </div>
        );
      },
    },
    {
      colId: 'posts',
      headerName: 'Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'PostPaymentPostCountCellRenderer',
      valueGetter: (params) => {
        if (params.data?._rowType === 'group') return (params.data as any).post_count;
        return null;
      },
    },
    {
      field: 'base_pay_cents',
      colId: 'basePay',
      headerName: 'Base',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.base_pay_cents} /> : null,
    },
    {
      field: 'bonus_cents',
      colId: 'bonus',
      headerName: 'Bonus',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.bonus_cents} muted /> : null,
    },
    {
      field: 'total_paid_cents',
      colId: 'paid',
      headerName: 'Paid',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: (props: CustomCellRendererProps<GroupedViewRow>) =>
        props.data ? <PostPaymentCurrencyCell value={props.data.total_paid_cents} muted /> : null,
    },
    {
      field: 'outstanding_cents',
      colId: 'outstanding',
      headerName: 'Outstanding',
      minWidth: 100,
      width: 110,
      sortable: true,
      cellRenderer: 'PostPaymentOutstandingCellRenderer',
    },
    {
      field: 'review_status',
      colId: 'review',
      headerName: 'Review',
      minWidth: 80,
      width: 100,
      sortable: true,
      cellRenderer: 'ReviewStatusCellRenderer',
    },
    {
      field: 'ad_code',
      colId: 'adCode',
      headerName: 'Ad Code',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'AdCodeCellRenderer',
    },
    {
      colId: 'disclosure',
      headerName: 'Disclosure',
      minWidth: 100,
      width: 110,
      sortable: false,
      cellRenderer: 'DisclosureCellRenderer',
    },
    {
      field: 'payment_status',
      colId: 'status',
      headerName: 'Status',
      minWidth: 100,
      width: 130,
      sortable: true,
      cellRenderer: 'PostPaymentGroupedStatusCellRenderer',
    },
    {
      field: 'stripe_account_id',
      colId: 'stripe',
      headerName: 'Stripe',
      minWidth: 80,
      width: 110,
      sortable: true,
      cellRenderer: 'PostPaymentStripeCellRenderer',
    },
  ];
}

export const defaultCreatorPostPaymentColDef: ColDef<any> = {
  resizable: true,
  sortable: true,
  suppressMovable: true,
  sortingOrder: ['desc', 'asc', null],
  cellStyle: (params) => {
    const base: Record<string, string> = { display: 'flex', alignItems: 'center' };
    if (params.colDef.colId !== 'creator') {
      base.justifyContent = 'center';
    }
    return base;
  },
};
