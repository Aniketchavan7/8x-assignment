'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/hooks/useDebounce';
import type { JobStatus } from '@/lib/db/types';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  RowSelectionModule,
  RowApiModule,
  ColumnApiModule,
  RenderApiModule,
  ValidationModule,
  CellStyleModule,
  RowStyleModule,
  QuickFilterModule,
  themeQuartz,
  type GridReadyEvent,
  type GridApi,
  type SelectionChangedEvent,
  type PostSortRowsParams,
} from 'ag-grid-community';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, Search, X, RefreshCw, DollarSign, Banknote, CheckCircle, ShieldCheck, Building2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  createCreatorPostPaymentColumnDefs,
  createGroupedPostPaymentColumnDefs,
  defaultCreatorPostPaymentColDef,
  PostPaymentPlatformCellRenderer,
  PostPaymentStatusCellRenderer,
  PostPaymentGroupedStatusCellRenderer,
  PostPaymentCreatorCellRenderer,
  ManagedCreatorStatusCellRenderer,
  PostPaymentOutstandingCellRenderer,
  PostPaymentViewsCellRenderer,
  PostPaymentDateCellRenderer,
  PostPaymentStripeCellRenderer,
  PostPaymentPostCountCellRenderer,
  ReviewStatusCellRenderer,
  AdCodeCellRenderer,
  DisclosureCellRenderer,
  type CreatorPostPaymentGridData,
  type CreatorPostPaymentGroupedData,
  type GroupedViewRow,
} from '@/components/Admin/AdminGrid';
import { PaySelectedDialog } from './components/PaySelectedDialog';
import { MarkPaidOffPlatformDialog } from './components/MarkPaidOffPlatformDialog';
import { VerifyPostsDialog } from './components/VerifyPostsDialog';
import { MinViewsCheckDialog } from './components/MinViewsCheckDialog';
import { ChangePricingDialog } from './components/ChangePricingDialog';
import { PostPaymentDetailPanel } from './components/PostPaymentDetailPanel';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  RowSelectionModule,
  RowApiModule,
  ColumnApiModule,
  RenderApiModule,
  CellStyleModule,
  RowStyleModule,
  QuickFilterModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

const customTheme = themeQuartz.withParams({
  borderRadius: 0,
  headerHeight: 44,
  rowHeight: 52,
  spacing: 8,
  backgroundColor: 'transparent',
  oddRowBackgroundColor: 'transparent',
  rowBorder: { color: 'hsl(var(--border))' },
  selectedRowBackgroundColor: 'hsl(213 94% 88%)',
});

const PAGE_SIZE = 100;

const FILTERS_STORAGE_KEY = 'admin-post-payments-filters-v1';

type StatusValue = 'unpaid' | 'partially_paid' | 'paid';

type PersistedFilters = {
  viewMode: 'grouped' | 'flat';
  hideSettled: boolean;
  statusFilters: StatusValue[];
  reviewStatusFilter: string;
  brandFilter: string;
  jobFilter: string;
  searchQuery: string;
};

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

interface PostPaymentsResponse {
  rows: (CreatorPostPaymentGridData | CreatorPostPaymentGroupedData)[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  grouped?: boolean;
}

interface FilterData {
  brands: Array<{ id: string; name: string }>;
  jobs: Array<{ id: string; job_title: string; brand_id: string; status: JobStatus | null }>;
}

export function AdminCreatorPostPaymentsContent({ canPayout = true }: { canPayout?: boolean }) {
  // Refs use `any` because both grouped (GroupedViewRow) and flat (CreatorPostPaymentGridData) grids share them
  const gridRef = useRef<AgGridReact<any>>(null);
  const gridApiRef = useRef<GridApi<any> | null>(null);

  // View mode and filters
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [hideSettled, setHideSettled] = useState(true);
  const [statusFilters, setStatusFilters] = useState<Set<StatusValue>>(new Set());
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Hydrate filters from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedFilters>;
        if (saved.viewMode === 'grouped' || saved.viewMode === 'flat') setViewMode(saved.viewMode);
        if (typeof saved.hideSettled === 'boolean') setHideSettled(saved.hideSettled);
        if (Array.isArray(saved.statusFilters)) setStatusFilters(new Set(saved.statusFilters));
        if (typeof saved.reviewStatusFilter === 'string') setReviewStatusFilter(saved.reviewStatusFilter);
        if (typeof saved.brandFilter === 'string') setBrandFilter(saved.brandFilter);
        if (typeof saved.jobFilter === 'string') setJobFilter(saved.jobFilter);
        if (typeof saved.searchQuery === 'string') setSearchQuery(saved.searchQuery);
      }
    } catch {}
    setFiltersHydrated(true);
  }, []);

  // Persist filters to localStorage on change (after initial hydration)
  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      const payload: PersistedFilters = {
        viewMode,
        hideSettled,
        statusFilters: [...statusFilters],
        reviewStatusFilter,
        brandFilter,
        jobFilter,
        searchQuery,
      };
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [filtersHydrated, viewMode, hideSettled, statusFilters, reviewStatusFilter, brandFilter, jobFilter, searchQuery]);
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [offplatformDialogOpen, setOffplatformDialogOpen] = useState(false);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [minViewsOpen, setMinViewsOpen] = useState(false);
  const [changePricingOpen, setChangePricingOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [bulkReviewAction, setBulkReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const { toast } = useToast();

  const searchParams = useSearchParams();

  // Grouped view: expand state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [childData, setChildData] = useState<Map<string, CreatorPostPaymentGridData[]>>(new Map());
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [childFetchErrors, setChildFetchErrors] = useState<Set<string>>(new Set());

  // Fetch filter data (brands + jobs)
  const { data: filterData } = useQuery({
    queryKey: ['admin-jobs-with-managed-creators'],
    queryFn: async () => {
      const res = await fetch('/api/admin/jobs-with-managed-creators');
      if (!res.ok) throw new Error('Failed to fetch filter data');
      return res.json() as Promise<FilterData>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const brands = filterData?.brands || [];

  // Filter jobs by selected brand
  const filteredJobs = useMemo(() => {
    if (!filterData?.jobs) return [];
    if (!brandFilter) return filterData.jobs;
    return filterData.jobs.filter((j) => j.brand_id === brandFilter);
  }, [filterData?.jobs, brandFilter]);

  const {
    data: infiniteData,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['admin-creator-post-payments', viewMode, [...statusFilters].sort().join(','), reviewStatusFilter, brandFilter, jobFilter, debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      params.set('page', String(pageParam));
      params.set('limit', String(PAGE_SIZE));
      if (viewMode === 'grouped') params.set('group_by', 'creator_job');
      if (statusFilters.size > 0) params.set('status', [...statusFilters].join(','));
      if (reviewStatusFilter !== 'all') params.set('review_status', reviewStatusFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (jobFilter !== 'all') params.set('job_id', jobFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/admin/creator-post-payments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch post payments data');
      return res.json() as Promise<PostPaymentsResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled: brandFilter !== '',
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const isSearching = searchQuery !== debouncedSearch;

  const rawRowData = useMemo(() => {
    const all = infiniteData?.pages.flatMap((p) => p.rows) || [];
    if (!hideSettled) return all;
    return all.filter((row: CreatorPostPaymentGridData | CreatorPostPaymentGroupedData) => row.payment_status !== 'paid');
  }, [infiniteData, hideSettled]);

  const lastPage = infiniteData?.pages[infiniteData.pages.length - 1];
  const serverTotal = lastPage?.total || 0;
  const total = hideSettled ? rawRowData.length : serverTotal;

  // Build combined row data for grouped view (interleave group rows with expanded children)
  const groupedRowData: GroupedViewRow[] = useMemo(() => {
    if (viewMode !== 'grouped') return [];

    const result: GroupedViewRow[] = [];
    for (const row of rawRowData as CreatorPostPaymentGroupedData[]) {
      result.push({ ...row, _rowType: 'group' as const });
      if (expandedGroups.has(row.id)) {
        const children = childData.get(row.id) || [];
        for (const child of children) {
          if (hideSettled && child.payment_status === 'paid') continue;
          result.push({ ...child, _rowType: 'child' as const, _parentGroupId: row.id });
        }
      }
    }
    return result;
  }, [viewMode, rawRowData, expandedGroups, childData, hideSettled]);

  const flatRowData = useMemo(
    () => (viewMode === 'flat' ? (rawRowData as CreatorPostPaymentGridData[]) : []),
    [viewMode, rawRowData]
  );

  const flatColumnDefs = useMemo(() => createCreatorPostPaymentColumnDefs(), []);
  const groupedColumnDefs = useMemo(() => createGroupedPostPaymentColumnDefs(), []);

  const flatComponents = useMemo(
    () => ({
      PostPaymentPlatformCellRenderer,
      PostPaymentStatusCellRenderer,
      PostPaymentCreatorCellRenderer,
      ManagedCreatorStatusCellRenderer,
      PostPaymentOutstandingCellRenderer,
      PostPaymentViewsCellRenderer,
      PostPaymentDateCellRenderer,
      PostPaymentStripeCellRenderer,
      ReviewStatusCellRenderer,
      AdCodeCellRenderer,
      DisclosureCellRenderer,
    }),
    []
  );

  const groupedComponents = useMemo(
    () => ({
      PostPaymentCreatorCellRenderer,
      ManagedCreatorStatusCellRenderer,
      PostPaymentOutstandingCellRenderer,
      PostPaymentPostCountCellRenderer,
      PostPaymentGroupedStatusCellRenderer,
      PostPaymentStripeCellRenderer,
      ReviewStatusCellRenderer,
      AdCodeCellRenderer,
      DisclosureCellRenderer,
    }),
    []
  );

  const gridContext = useMemo(() => ({
    expandedGroups,
    loadingChildren,
    childFetchErrors,
  }), [expandedGroups, loadingChildren, childFetchErrors]);

  // Refresh creator column cells when expand/loading state changes so chevrons update
  useEffect(() => {
    if (viewMode !== 'grouped' || !gridApiRef.current) return;
    gridApiRef.current.refreshCells({ columns: ['creator'], force: true });
  }, [expandedGroups, loadingChildren, viewMode]);

  // Resolve selected rows to actual post-level data for payment.
  // When a group's children are expanded (rendered in the grid), the individual
  // child checkbox state is authoritative. When a group is selected but not
  // expanded, fall back to childData so "select group" still counts all posts.
  const selectedPostRows: CreatorPostPaymentGridData[] = useMemo(() => {
    if (viewMode === 'flat') return selectedRows as CreatorPostPaymentGridData[];

    const posts: CreatorPostPaymentGridData[] = [];
    const seen = new Set<string>();

    // Individually-selected child rows (authoritative for expanded groups)
    for (const row of selectedRows) {
      if (row._rowType === 'child' && !seen.has(row.id)) {
        posts.push(row as CreatorPostPaymentGridData);
        seen.add(row.id);
      }
    }

    // For selected groups that are NOT expanded, fall back to childData
    for (const row of selectedRows) {
      if (row._rowType !== 'group') continue;
      if (expandedGroups.has(row.id)) continue;
      const children = childData.get(row.id) || [];
      for (const c of children) {
        if (!seen.has(c.id)) {
          posts.push(c);
          seen.add(c.id);
        }
      }
    }

    return posts;
  }, [viewMode, selectedRows, childData, expandedGroups]);

  // Check if any selected groups are still loading their children
  const hasGroupsLoadingChildren = useMemo(() => {
    if (viewMode !== 'grouped') return false;
    return selectedRows.some((row) => row._rowType === 'group' && loadingChildren.has(row.id));
  }, [viewMode, selectedRows, loadingChildren]);

  const payablePostRows = useMemo(
    () => selectedPostRows.filter((row) => row.outstanding_cents > 0),
    [selectedPostRows]
  );

  const selectedOutstandingCents = useMemo(
    () => payablePostRows.reduce((sum, row) => sum + row.outstanding_cents, 0),
    [payablePostRows]
  );

  const hasActiveFilters = statusFilters.size > 0 || brandFilter !== '' || jobFilter !== 'all' || debouncedSearch;

  const syncingSelection = useRef(false);
  const prevSelectedGroupIds = useRef<Set<string>>(new Set());

  const onSelectionChanged = useCallback((event: SelectionChangedEvent<any>) => {
    if (syncingSelection.current) return;

    const api = event.api;

    if (viewMode !== 'grouped') {
      setSelectedRows(api.getSelectedRows());
      return;
    }

    const selected = api.getSelectedRows();
    const currentGroupIds = new Set(
      selected.filter((r: any) => r._rowType === 'group').map((r: any) => r.id)
    );
    const prevGroups = prevSelectedGroupIds.current;
    const newlySelected = new Set([...currentGroupIds].filter((id) => !prevGroups.has(id)));
    const newlyDeselected = new Set([...prevGroups].filter((id) => !currentGroupIds.has(id)));

    // 1. Cascade group selection to its rendered children
    if (newlySelected.size > 0 || newlyDeselected.size > 0) {
      syncingSelection.current = true;
      api.forEachNode((node) => {
        if (!node.data || node.data._rowType !== 'child') return;
        const parentId = node.data._parentGroupId;
        if (newlySelected.has(parentId) && !node.isSelected()) {
          node.setSelected(true, false, 'api');
        } else if (newlyDeselected.has(parentId) && node.isSelected()) {
          node.setSelected(false, false, 'api');
        }
      });
      syncingSelection.current = false;
    }

    // 2. If a group is still selected but has rendered children that aren't all
    //    selected (user unchecked one), deselect the group so its checkbox
    //    empties out. This is the "partial selection" UX — individual children
    //    stay as-is.
    const totalByParent = new Map<string, number>();
    const selectedByParent = new Map<string, number>();
    api.forEachNode((node) => {
      if (!node.data || node.data._rowType !== 'child') return;
      const parentId = node.data._parentGroupId;
      totalByParent.set(parentId, (totalByParent.get(parentId) ?? 0) + 1);
      if (node.isSelected()) {
        selectedByParent.set(parentId, (selectedByParent.get(parentId) ?? 0) + 1);
      }
    });

    const groupsToDeselect = new Set<string>();
    for (const groupId of currentGroupIds) {
      const total = totalByParent.get(groupId) ?? 0;
      const sel = selectedByParent.get(groupId) ?? 0;
      if (total > 0 && sel < total) groupsToDeselect.add(groupId);
    }

    if (groupsToDeselect.size > 0) {
      syncingSelection.current = true;
      api.forEachNode((node) => {
        if (!node.data || node.data._rowType !== 'group') return;
        if (groupsToDeselect.has(node.data.id) && node.isSelected()) {
          node.setSelected(false, false, 'api');
        }
      });
      syncingSelection.current = false;
      for (const id of groupsToDeselect) currentGroupIds.delete(id);
    }

    prevSelectedGroupIds.current = currentGroupIds;
    setSelectedRows(api.getSelectedRows());
  }, [viewMode]);

  const onGridReady = useCallback((event: GridReadyEvent<any>) => {
    gridApiRef.current = event.api;
  }, []);

  // Keep child rows glued under their parent group after sorting. AG Grid
  // sorts every row independently, so without this children would scatter
  // away from their group when the user sorts by any column.
  const postSortRows = useCallback((params: PostSortRowsParams<GroupedViewRow>) => {
    const { nodes } = params;
    const groupNodes: typeof nodes = [];
    const childrenByParent = new Map<string, typeof nodes>();

    for (const node of nodes) {
      const data = node.data;
      if (!data) continue;
      if (data._rowType === 'child') {
        const pid = data._parentGroupId;
        const bucket = childrenByParent.get(pid) ?? [];
        bucket.push(node);
        childrenByParent.set(pid, bucket);
      } else {
        groupNodes.push(node);
      }
    }

    const rebuilt: typeof nodes = [];
    for (const g of groupNodes) {
      rebuilt.push(g);
      const kids = childrenByParent.get(g.data!.id);
      if (kids) rebuilt.push(...kids);
    }

    nodes.length = 0;
    nodes.push(...rebuilt);
  }, []);

  const getRowId = useCallback((params: { data: any }) => {
    if (params.data._rowType === 'child') return `child:${params.data.id}`;
    if (params.data._rowType === 'group') return `group:${params.data.id}`;
    return params.data.id;
  }, []);

  // Infinite scroll
  const onBodyScrollEnd = useCallback(() => {
    const api = gridApiRef.current;
    if (!api || !hasNextPage || isFetchingNextPage) return;

    const lastRow = api.getLastDisplayedRowIndex();
    const totalRows = api.getDisplayedRowCount();
    if (totalRows > 0 && totalRows - lastRow < 20) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-fetch next page when client-side filtering hides all loaded rows
  useEffect(() => {
    if (!hideSettled || !hasNextPage || isFetchingNextPage || isLoading) return;
    const displayed = viewMode === 'grouped' ? groupedRowData.length : flatRowData.length;
    if (displayed === 0) {
      fetchNextPage();
    }
  }, [hideSettled, hasNextPage, isFetchingNextPage, isLoading, viewMode, groupedRowData.length, flatRowData.length, fetchNextPage]);

  const onRowClicked = useCallback(
    (event: { data: any | undefined; event?: Event | null }) => {
      if (event.event && (event.event.target as HTMLElement).closest('[data-creator-click]')) return;
      if (event.event && (event.event.target as HTMLElement).closest('[data-expand-click]')) return;
      if (viewMode === 'flat' && event.data) {
        setSelectedPostId(event.data.id);
      }
      // In grouped mode, clicking a child row opens the detail panel
      if (viewMode === 'grouped' && event.data?._rowType === 'child') {
        setSelectedPostId(event.data.id);
      }
    },
    [viewMode]
  );

  // Fetch children for a group row
  const childAbortControllers = useRef<Map<string, AbortController>>(new Map());

  const fetchChildren = useCallback((groupId: string, managedCreatorId: string, jobId: string | null) => {
    if (childData.has(groupId) || loadingChildren.has(groupId)) return;

    setLoadingChildren((prev) => new Set(prev).add(groupId));
    setChildFetchErrors((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });

    // Cancel any in-flight fetch for this group
    childAbortControllers.current.get(groupId)?.abort();
    const controller = new AbortController();
    childAbortControllers.current.set(groupId, controller);

    const params = new URLSearchParams();
    params.set('creator_id', managedCreatorId);
    if (jobId) params.set('job_id', jobId);
    if (statusFilters.size > 0) params.set('status', [...statusFilters].join(','));
    params.set('limit', '500');

    fetch(`/api/admin/creator-post-payments?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        childAbortControllers.current.delete(groupId);
        setChildData((prev) => new Map(prev).set(groupId, data.rows));
        setLoadingChildren((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        childAbortControllers.current.delete(groupId);
        setLoadingChildren((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
        setChildFetchErrors((prev) => new Set(prev).add(groupId));
      });
  }, [childData, loadingChildren, statusFilters]);

  // Toggle expand for grouped rows
  const toggleExpand = useCallback((groupId: string, managedCreatorId: string, jobId: string | null) => {
    let isExpanding = false;
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
        isExpanding = true;
      }
      return next;
    });
    if (isExpanding) {
      fetchChildren(groupId, managedCreatorId, jobId);
    }
  }, [fetchChildren]);

  // Auto-fetch children for selected group rows that haven't been loaded
  const selectedGroupsNeedingChildren = useMemo(() => {
    if (viewMode !== 'grouped') return [];
    return selectedRows
      .filter((row) => row._rowType === 'group' && !childData.has(row.id) && !loadingChildren.has(row.id))
      .map((row) => ({ id: row.id, managedCreatorId: row.managed_creator_id, jobId: row.job_id }));
  }, [viewMode, selectedRows, childData, loadingChildren]);

  useEffect(() => {
    for (const group of selectedGroupsNeedingChildren) {
      fetchChildren(group.id, group.managedCreatorId, group.jobId);
    }
  }, [selectedGroupsNeedingChildren, fetchChildren]);

  // When children of a selected group become rendered (group expanded, data
  // loaded), auto-select those child rows so the checkbox UI matches the
  // conceptual "group is selected = all children selected" state.
  useEffect(() => {
    if (viewMode !== 'grouped' || !gridApiRef.current) return;
    const selectedGroupIds = new Set<string>();
    for (const row of selectedRows) {
      if (row._rowType === 'group') selectedGroupIds.add(row.id);
    }
    if (selectedGroupIds.size === 0) return;

    let changed = false;
    syncingSelection.current = true;
    gridApiRef.current.forEachNode((node) => {
      if (!node.data || node.data._rowType !== 'child') return;
      const parentId = node.data._parentGroupId;
      if (selectedGroupIds.has(parentId) && !node.isSelected()) {
        node.setSelected(true, false, 'api');
        changed = true;
      }
    });
    syncingSelection.current = false;

    if (changed) {
      setSelectedRows(gridApiRef.current.getSelectedRows());
    }
    // Re-run whenever the rendered rows change (groupedRowData).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, groupedRowData, selectedRows]);

  // Listen for expand toggle events from the cell renderer
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toggleExpand(detail.groupId, detail.managedCreatorId, detail.jobId);
    };
    window.addEventListener('toggle-group-expand', handler);
    return () => window.removeEventListener('toggle-group-expand', handler);
  }, [toggleExpand]);

  // Hydrate brand filter from ?brand= URL param (used by command palette deep links)
  useEffect(() => {
    const brandId = searchParams.get('brand');
    if (brandId && brandFilter !== brandId) {
      setBrandFilter(brandId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Posts that need approval among the selected rows
  const pendingReviewPostRows = useMemo(
    () => selectedPostRows.filter((row) => row.review_status !== 'approved'),
    [selectedPostRows]
  );

  // Posts not already rejected — candidates for Reject action
  const rejectableReviewPostRows = useMemo(
    () => selectedPostRows.filter((row) => row.review_status !== 'rejected'),
    [selectedPostRows]
  );

  const deselectByIds = useCallback((ids: Iterable<string>) => {
    const set = new Set(ids);
    gridApiRef.current?.forEachNode((node) => {
      if (!node.data || !node.isSelected()) return;
      if (node.data._rowType === 'child' || node.data._rowType === 'group') {
        if (set.has(node.data.id)) node.setSelected(false);
      } else if (set.has(node.data.id)) {
        node.setSelected(false);
      }
    });
  }, []);

  // Patch local childData (and keep selection) after a pricing mutation.
  const patchChildPricing = useCallback(
    (succeededIds: string[], basePayOverride?: number, bonusOverride?: number) => {
      if (succeededIds.length === 0) return;
      const idSet = new Set(succeededIds);
      setChildData((prev) => {
        const next = new Map(prev);
        for (const [groupId, children] of prev) {
          next.set(
            groupId,
            children.map((c) => {
              if (!idSet.has(c.id)) return c;
              const newBase = basePayOverride !== undefined ? basePayOverride : c.base_pay_cents;
              const newBonus = bonusOverride !== undefined ? bonusOverride : c.bonus_cents;
              const newOwed = newBase + newBonus;
              const paid = c.total_paid_cents;
              const newStatus =
                paid >= newOwed ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid';
              return {
                ...c,
                base_pay_cents: newBase,
                bonus_cents: newBonus,
                total_owed_cents: newOwed,
                outstanding_cents: Math.max(0, newOwed - paid),
                payment_status: newStatus,
              };
            })
          );
        }
        return next;
      });
    },
    []
  );

  const runDisclosureCheck = useCallback(() => {
    const toDeselect: string[] = [];
    let notApplicable = 0;
    for (const row of selectedPostRows) {
      if (row.is_sponsored === null) {
        notApplicable++;
        continue;
      }
      if (row.is_sponsored === false) {
        toDeselect.push(row.id);
      }
    }
    deselectByIds(toDeselect);
    toast({
      title: 'Disclosure check complete',
      description: `${toDeselect.length} undisclosed post${toDeselect.length === 1 ? '' : 's'} deselected${notApplicable > 0 ? `. ${notApplicable} row${notApplicable === 1 ? '' : 's'} where rule does not apply ignored.` : '.'}`,
    });
  }, [selectedPostRows, deselectByIds, toast]);

  const runSparkCodeCheck = useCallback(() => {
    const toDeselect: string[] = [];
    let nonTikTok = 0;
    for (const row of selectedPostRows) {
      if (row.platform !== 'tiktok') {
        nonTikTok++;
        continue;
      }
      if (!row.ad_code || row.ad_code.trim() === '') {
        toDeselect.push(row.id);
      }
    }
    deselectByIds(toDeselect);
    toast({
      title: 'Spark code check complete',
      description: `${toDeselect.length} TikTok post${toDeselect.length === 1 ? '' : 's'} without spark code deselected${nonTikTok > 0 ? `. ${nonTikTok} non-TikTok row${nonTikTok === 1 ? '' : 's'} ignored.` : '.'}`,
    });
  }, [selectedPostRows, deselectByIds, toast]);

  const runBulkReview = useCallback(async (action: 'approve' | 'reject') => {
    const targets = action === 'approve' ? pendingReviewPostRows : rejectableReviewPostRows;
    if (targets.length === 0) return;
    const status = action === 'approve' ? 'approved' : 'rejected';
    setReviewing(true);
    let successCount = 0;
    let failCount = 0;
    const succeededIds = new Set<string>();

    const BATCH_SIZE = 10;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const res = await fetch(`/api/admin/video-reviews/${row.id}/review`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status }),
            });
            if (res.ok) {
              successCount++;
              succeededIds.add(row.id);
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        })
      );
    }

    const verb = action === 'approve' ? 'approved' : 'rejected';
    if (failCount === 0) {
      toast({ title: `${successCount} post${successCount === 1 ? '' : 's'} ${verb}` });
    } else {
      toast({
        title: `${successCount} ${verb}, ${failCount} failed`,
        variant: 'destructive',
      });
    }

    // Optimistically update review_status on already-expanded children so the
    // grid reflects the change without collapsing groups or losing selection.
    if (succeededIds.size > 0) {
      setChildData((prev) => {
        const next = new Map(prev);
        for (const [groupId, rows] of prev) {
          let mutated = false;
          const updated = rows.map((r) => {
            if (succeededIds.has(r.id)) {
              mutated = true;
              return { ...r, review_status: status };
            }
            return r;
          });
          if (mutated) next.set(groupId, updated);
        }
        return next;
      });
    }

    setReviewing(false);
    setBulkReviewAction(null);
    refetch();
  }, [pendingReviewPostRows, rejectableReviewPostRows, toast, refetch]);

  // Clear expand state when filters or view mode change
  useEffect(() => {
    // Abort all in-flight child fetches
    childAbortControllers.current.forEach((c) => c.abort());
    childAbortControllers.current.clear();
    setExpandedGroups(new Set());
    setChildData(new Map());
    setChildFetchErrors(new Set());
    prevSelectedGroupIds.current = new Set();
  }, [viewMode, statusFilters, brandFilter, jobFilter, debouncedSearch]);

  // Reset job filter when brand changes
  const handleBrandChange = useCallback((value: string) => {
    setBrandFilter(value);
    setJobFilter('all');
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-destructive">Failed to load post payments data. Please try again.</p>
            <Button onClick={() => refetch()} variant="outline" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 -mx-4 -mt-6 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-background sticky top-0 z-30 flex-shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              {isSearching || isFetching ? (
                <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                type="text"
                placeholder="Search creators..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-52 pl-8 pr-8 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Brand filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1 ${brandFilter ? 'bg-accent' : ''}`}
                >
                  {brandFilter
                    ? brands.find((b) => b.id === brandFilter)?.name || 'Brand'
                    : 'Brand'}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup value={brandFilter} onValueChange={handleBrandChange}>
                  {brands.map((brand) => (
                    <DropdownMenuRadioItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Job filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1 ${jobFilter !== 'all' ? 'bg-accent' : ''}`}
                >
                  {jobFilter === 'all'
                    ? 'Job'
                    : filteredJobs.find((j) => j.id === jobFilter)?.job_title || 'Job'}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
                <DropdownMenuRadioGroup
                  value={jobFilter}
                  onValueChange={(value) => setJobFilter(value)}
                >
                  <DropdownMenuRadioItem value="all">All Jobs</DropdownMenuRadioItem>
                  {filteredJobs.map((job) => (
                    <DropdownMenuRadioItem key={job.id} value={job.id}>
                      {job.job_title}
                      {(job.status === 'closed' || job.status === 'cancelled' || job.status === 'completed') && (
                        <span className="ml-1 text-muted-foreground text-xs">
                          ({job.status.charAt(0).toUpperCase() + job.status.slice(1)})
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status filter (multi-select) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1 ${statusFilters.size > 0 ? 'bg-accent' : ''}`}
                >
                  {statusFilters.size === 0
                    ? 'Status'
                    : statusFilters.size === 1
                      ? STATUS_OPTIONS.find((s) => statusFilters.has(s.value))?.label
                      : `${statusFilters.size} statuses`}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {STATUS_OPTIONS.map((opt) => {
                  const disabled = hideSettled && opt.value === 'paid';
                  return (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={statusFilters.has(opt.value)}
                      disabled={disabled}
                      onCheckedChange={(checked) => {
                        setStatusFilters((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(opt.value);
                          else next.delete(opt.value);
                          return next;
                        });
                      }}
                    >
                      {opt.label}{disabled ? ' (hidden)' : ''}
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {statusFilters.size > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={false}
                      onCheckedChange={() => setStatusFilters(new Set())}
                    >
                      Clear
                    </DropdownMenuCheckboxItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Review status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1 ${reviewStatusFilter !== 'all' ? 'bg-accent' : ''}`}
                >
                  {reviewStatusFilter === 'all' ? 'Review' : reviewStatusFilter.replace('_', ' ')}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuRadioGroup value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pending">Pending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="approved">Approved</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="needs_changes">Needs Changes</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="rejected">Rejected</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Hide settled toggle */}
            <button
              onClick={() => {
                setHideSettled((prev) => {
                  const next = !prev;
                  if (next) {
                    setStatusFilters((s) => {
                      const updated = new Set(s);
                      updated.delete('paid');
                      return updated;
                    });
                  }
                  return next;
                });
              }}
              className={`h-8 px-2.5 text-xs font-medium border rounded-md transition-colors ${
                hideSettled
                  ? 'bg-foreground text-background border-foreground'
                  : 'text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              Hide settled
            </button>
          </div>

          {(selectedPostRows.length > 0 || hasGroupsLoadingChildren) && (
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {hasGroupsLoadingChildren && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading posts...
                </span>
              )}
              {canPayout && selectedPostRows.length > 0 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={hasGroupsLoadingChildren}
                      >
                        <ShieldCheck className="w-4 h-4 mr-1" />
                        Checks
                        <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setVerifyDialogOpen(true)}>
                        Verify posts exist
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={runSparkCodeCheck}>
                        Require spark code (TikTok)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={runDisclosureCheck}>
                        Require ad disclosure
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMinViewsOpen(true)}>
                        Minimum views
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 bg-green-600 hover:bg-green-700"
                        disabled={hasGroupsLoadingChildren}
                      >
                        Actions
                        <ChevronDown className="w-3 h-3 ml-1 opacity-75" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={pendingReviewPostRows.length === 0}
                        onClick={() => setBulkReviewAction('approve')}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve videos ({pendingReviewPostRows.length})
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={rejectableReviewPostRows.length === 0}
                        onClick={() => setBulkReviewAction('reject')}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject videos ({rejectableReviewPostRows.length})
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setChangePricingOpen(true)}>
                        Change pricing
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={payablePostRows.length === 0}
                        onClick={() => setOffplatformDialogOpen(true)}
                      >
                        <Banknote className="w-4 h-4 mr-2" />
                        Mark paid off-platform ({payablePostRows.length})
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={payablePostRows.length === 0}
                        onClick={() => setPayDialogOpen(true)}
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Pay selected ({payablePostRows.length}) — ${(selectedOutstandingCents / 100).toFixed(2)}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>

        <div
          className="flex-1 min-h-0 overflow-hidden ag-grid-container ag-grid-post-payments"
          style={{ height: 'calc(100vh - 180px)', minHeight: '400px' }}
        >
          {!brandFilter ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Building2 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Select a brand to view post payments</p>
            </div>
          ) : viewMode === 'grouped' ? (
            <AgGridReact<GroupedViewRow>
              ref={gridRef}
              theme={customTheme}
              rowData={groupedRowData}
              columnDefs={groupedColumnDefs}
              defaultColDef={defaultCreatorPostPaymentColDef}
              components={groupedComponents}
              context={gridContext}
              onGridReady={onGridReady}
              onSelectionChanged={onSelectionChanged}
              onRowClicked={onRowClicked}
              getRowId={getRowId}
              onBodyScrollEnd={onBodyScrollEnd}
              postSortRows={postSortRows}
              loading={isLoading}
              animateRows={true}
              suppressCellFocus={true}
              rowSelection="multiple"
              suppressRowClickSelection={true}
            />
          ) : (
            <AgGridReact<CreatorPostPaymentGridData>
              ref={gridRef}
              theme={customTheme}
              rowData={flatRowData}
              columnDefs={flatColumnDefs}
              defaultColDef={defaultCreatorPostPaymentColDef}
              components={flatComponents}
              onGridReady={onGridReady}
              onSelectionChanged={onSelectionChanged}
              onRowClicked={onRowClicked}
              getRowId={getRowId}
              onBodyScrollEnd={onBodyScrollEnd}
              loading={isLoading}
              animateRows={true}
              suppressCellFocus={true}
              rowSelection="multiple"
              suppressRowClickSelection={true}
            />
          )}
        </div>

        <div className="flex items-center justify-between h-8 px-3 border-t border-border bg-background text-xs text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-4">
            <span>
              <span className="font-medium text-foreground">
                {(viewMode === 'grouped' ? rawRowData.length : flatRowData.length).toLocaleString()}
              </span>{' '}
              of <span className="font-medium text-foreground">{total.toLocaleString()}</span>{' '}
              {viewMode === 'grouped'
                ? (total === 1 ? 'creator' : 'creators')
                : (total === 1 ? 'post' : 'posts')}
            </span>
            {selectedRows.length > 0 && (
              <span>
                <span className="font-medium text-foreground">{selectedRows.length}</span> selected
                {viewMode === 'grouped' && payablePostRows.length > 0 && (
                  <span className="text-muted-foreground"> ({payablePostRows.length} posts)</span>
                )}
              </span>
            )}
            {debouncedSearch && <span>matching &quot;{debouncedSearch}&quot;</span>}
            {hasActiveFilters && !debouncedSearch && <span>(filtered)</span>}
          </div>
          <div className="flex items-center gap-2">
            {(isLoading || isFetchingNextPage) && (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isFetchingNextPage ? 'Loading more...' : 'Loading...'}
              </span>
            )}
            {hasNextPage && !isFetchingNextPage && brandFilter && total <= 500 && (
              <button
                onClick={() => {
                  const loadAll = async () => {
                    let pages = 0;
                    let hasMore = true;
                    while (hasMore && pages < 10) {
                      try {
                        const result = await fetchNextPage();
                        hasMore = result.hasNextPage ?? false;
                        pages++;
                      } catch {
                        break;
                      }
                    }
                  };
                  loadAll();
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Load all ({total.toLocaleString()})
              </button>
            )}
          </div>
        </div>
      </div>

      <VerifyPostsDialog
        selectedIds={selectedPostRows.map((r) => r.id)}
        open={verifyDialogOpen}
        onOpenChange={(open) => {
          setVerifyDialogOpen(open);
        }}
        onVerified={(verifiedIds) => {
          setVerifyDialogOpen(false);
          const verifiedSet = new Set(verifiedIds);
          const toDeselect: string[] = [];
          for (const row of selectedPostRows) {
            if (!verifiedSet.has(row.id)) toDeselect.push(row.id);
          }
          deselectByIds(toDeselect);
        }}
      />

      <MinViewsCheckDialog
        rows={selectedPostRows}
        open={minViewsOpen}
        onOpenChange={setMinViewsOpen}
        onSuccess={({ succeededIds, basePayCents }) => {
          patchChildPricing(succeededIds, basePayCents, 0);
          refetch();
        }}
      />

      <ChangePricingDialog
        rows={selectedPostRows}
        open={changePricingOpen}
        onOpenChange={setChangePricingOpen}
        onSuccess={({ succeededIds, basePayCents, bonusCents }) => {
          patchChildPricing(succeededIds, basePayCents, bonusCents);
          refetch();
        }}
      />

      <PaySelectedDialog
        rows={payablePostRows}
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        onSuccess={(succeededIds) => {
          refetch();
          deselectByIds(succeededIds);
          setChildData(new Map());
          setExpandedGroups(new Set());
        }}
      />

      <MarkPaidOffPlatformDialog
        rows={payablePostRows}
        open={offplatformDialogOpen}
        onOpenChange={setOffplatformDialogOpen}
        onSuccess={() => {
          refetch();
          gridApiRef.current?.deselectAll();
          setChildData(new Map());
          setExpandedGroups(new Set());
        }}
      />

      <PostPaymentDetailPanel
        id={selectedPostId}
        open={!!selectedPostId}
        onOpenChange={(open) => {
          if (!open) setSelectedPostId(null);
        }}
      />


      <AlertDialog
        open={bulkReviewAction !== null}
        onOpenChange={(open) => {
          if (open || reviewing) return;
          setBulkReviewAction(null);
        }}
      >
        <AlertDialogContent>
          {(() => {
            const isApprove = bulkReviewAction === 'approve';
            const targets = isApprove ? pendingReviewPostRows : rejectableReviewPostRows;
            const verb = isApprove ? 'Approve' : 'Reject';
            const pastVerb = isApprove ? 'approved' : 'rejected';
            const noun = targets.length === 1 ? 'this post' : 'these posts';
            const followUp = isApprove
              ? `and allow ${targets.length === 1 ? 'it' : 'them'} to be paid.`
              : `and block ${targets.length === 1 ? 'it' : 'them'} from payment.`;
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {verb} {targets.length} post{targets.length === 1 ? '' : 's'}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark {noun} as {pastVerb} {followUp}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={reviewing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => runBulkReview(isApprove ? 'approve' : 'reject')}
                    disabled={reviewing}
                    className={isApprove ? undefined : 'bg-destructive hover:bg-destructive/90'}
                  >
                    {reviewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {verb}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
