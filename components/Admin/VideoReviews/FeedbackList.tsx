'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@/i18n/routing';
import { Loader2 } from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  CellStyleModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from 'ag-grid-community';
import type { CustomCellRendererProps } from 'ag-grid-react';
import { PlatformIcon } from '@/components/shared/PlatformIcon';
import { REVIEW_STATUS_CONFIG, type VideoReviewFeedbackItem } from './constants';

ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule]);

const gridTheme = themeQuartz.withParams({
  borderRadius: 0,
  headerHeight: 44,
  rowHeight: 52,
  spacing: 8,
  backgroundColor: 'transparent',
  oddRowBackgroundColor: 'transparent',
  rowBorder: { color: 'hsl(var(--border))' },
});

// ============================================================================
// Cell Renderers
// ============================================================================

function ThumbnailCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  const postData = props.data?.managed_creator_posts?.posts;
  if (!postData) return null;
  return (
    <div className="flex items-center h-full">
      {postData.thumbnail_url ? (
        <img src={postData.thumbnail_url} alt="" className="h-10 w-8 rounded object-cover" />
      ) : (
        <div className="h-10 w-8 rounded bg-muted flex items-center justify-center">
          <PlatformIcon platform={postData.platform || 'tiktok'} url={postData.post_url || ''} />
        </div>
      )}
    </div>
  );
}

function CreatorCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  const mc = props.data?.managed_creator_posts?.managed_creators;
  if (!mc) return null;
  return (
    <div className="flex items-center h-full text-sm font-medium">
      {mc.name || 'Unknown'}
    </div>
  );
}

function BrandJobCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  const mc = props.data?.managed_creator_posts?.managed_creators;
  if (!mc) return null;
  return (
    <div className="flex flex-col justify-center h-full">
      <span className="text-sm">{mc.brand_organizations?.organization_name || '-'}</span>
      {mc.jobs?.job_title && (
        <span className="text-xs text-muted-foreground truncate">{mc.jobs.job_title}</span>
      )}
    </div>
  );
}

function ReviewerCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  if (!props.data) return null;
  const reviewerEmail = props.data.users?.email || props.data.reviewer_id || 'Unknown';
  return (
    <div className="flex items-center h-full text-sm">
      <span className="truncate">{reviewerEmail}</span>
    </div>
  );
}

function StatusCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  if (!props.data) return null;
  const config = REVIEW_STATUS_CONFIG[props.data.status] || REVIEW_STATUS_CONFIG.pending;
  return (
    <div className="flex items-center h-full">
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${config.bg} ${config.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
        {config.label}
      </span>
    </div>
  );
}

function FeedbackCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  if (!props.data) return null;
  return (
    <div className="flex items-center h-full text-xs text-muted-foreground truncate">
      {props.data.feedback || '-'}
    </div>
  );
}

function DateCellRenderer(props: CustomCellRendererProps<VideoReviewFeedbackItem>) {
  if (!props.data) return null;
  const date = new Date(props.data.created_at);
  return (
    <div className="flex items-center h-full text-sm text-muted-foreground">
      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </div>
  );
}

// ============================================================================
// Column Definitions
// ============================================================================

const columnDefs: ColDef<VideoReviewFeedbackItem>[] = [
  { colId: 'thumbnail', headerName: '', width: 60, sortable: false, cellRenderer: ThumbnailCellRenderer },
  { colId: 'creator', headerName: 'Creator', flex: 1, minWidth: 120, cellRenderer: CreatorCellRenderer,
    valueGetter: (p) => p.data?.managed_creator_posts?.managed_creators?.name },
  { colId: 'brandJob', headerName: 'Brand / Job', flex: 1.5, minWidth: 160, cellRenderer: BrandJobCellRenderer,
    valueGetter: (p) => p.data?.managed_creator_posts?.managed_creators?.brand_organizations?.organization_name },
  { colId: 'reviewer', headerName: 'Reviewer', flex: 1, minWidth: 140, cellRenderer: ReviewerCellRenderer,
    valueGetter: (p) => p.data?.users?.email ?? p.data?.reviewer_id },
  { colId: 'status', headerName: 'Status', width: 140, sortable: true, cellRenderer: StatusCellRenderer,
    valueGetter: (p) => p.data?.status },
  { colId: 'feedback', headerName: 'Feedback', flex: 2, minWidth: 200, cellRenderer: FeedbackCellRenderer,
    valueGetter: (p) => p.data?.feedback },
  { colId: 'date', headerName: 'Date', width: 100, sortable: true, cellRenderer: DateCellRenderer,
    valueGetter: (p) => p.data?.created_at, sort: 'desc' },
];

const defaultColDef: ColDef = {
  resizable: true,
  sortable: false,
  suppressMovable: true,
  cellStyle: { display: 'flex', alignItems: 'center' },
};

// ============================================================================
// Component
// ============================================================================

interface FeedbackListProps {
  brandFilter?: string;
  creatorFilter?: string;
}

export function FeedbackList({ brandFilter = 'all', creatorFilter = 'all' }: FeedbackListProps) {
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-video-reviews', 'feedback', brandFilter, creatorFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ tab: 'feedback', limit: '50' });
      if (brandFilter !== 'all') params.set('brand_id', brandFilter);
      if (creatorFilter !== 'all') params.set('creator_id', creatorFilter);
      const res = await fetch(`/api/admin/video-reviews?${params}`);
      if (!res.ok) throw new Error('Failed to fetch feedback');
      return res.json();
    },
  });

  const reviews: VideoReviewFeedbackItem[] = useMemo(() => data?.reviews || [], [data]);

  const onRowClicked = useCallback((event: { data: VideoReviewFeedbackItem | undefined }) => {
    const mcpId = event.data?.managed_creator_post_id;
    if (mcpId) {
      router.push(`/admin/video-reviews?post=${mcpId}`);
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-destructive">
        {error instanceof Error ? error.message : 'An error occurred'}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No reviews yet.
      </div>
    );
  }

  return (
    <div className="h-full">
      <AgGridReact<VideoReviewFeedbackItem>
        theme={gridTheme}
        rowData={reviews}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(params) => params.data.id}
        onRowClicked={onRowClicked}
        suppressCellFocus={true}
      />
    </div>
  );
}
