'use client';

import { useState, useMemo, useCallback } from 'react';
import { CountryPricingView } from '@/components/Admin/CountryPricingView';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { themeQuartz } from 'ag-grid-community';
import { LazyAgGrid } from '@/components/Admin/AdminGrid/LazyAgGrid';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Globe, Loader2, Plus, Search, X } from 'lucide-react';
import { CACHE_TIMES } from '@/lib/modules/cache-constants';
import {
  createBrandCampaignColumnDefs,
  defaultBrandCampaignColDef,
  type BrandCampaignRow,
} from '@/components/Admin/AdminGrid/brandCampaignColumnDefs';
import {
  BrandCampaignBrandCellRenderer,
  BrandCampaignStatusCellRenderer,
  BrandCampaignCountryCellRenderer,
  BrandCampaignPlatformsCellRenderer,
  BrandCampaignCurrencyCellRenderer,
  BrandCampaignNumberCellRenderer,
  BrandCampaignViewsCellRenderer,
  BrandCampaignBonusCellRenderer,
  BrandCampaignMonthNumberCellRenderer,
  BrandCampaignNotesCellRenderer,
  BrandCampaignActionsCellRenderer,
} from '@/components/Admin/AdminGrid/brandCampaignCellRenderers';
import { AdminDateCellRenderer } from '@/components/Admin/AdminGrid/cpmCellRenderers';
import {
  CampaignFormDialog,
  EMPTY_FORM,
  campaignToForm,
  formToPayload,
  type CampaignFormData,
} from '@/components/Admin/BrandDetail/CampaignFormDialog';
import { useToast } from '@/hooks/use-toast';
import { CampaignDetailModal } from '@/components/Admin/CampaignDetailModal';
import { useAdminContext } from '@/lib/contexts/AdminContext';
import { SCOPED_ROLES } from '@/lib/modules/admin/roles';

const customTheme = themeQuartz.withParams({
  borderRadius: 0,
  headerHeight: 44,
  rowHeight: 52,
  spacing: 8,
});

interface BrandCampaignApiRow {
  id: string;
  name: string;
  brand_organization_id: string;
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
  updated_at: string;
  accessible: boolean;
  brand_organizations: {
    id: string;
    organization_name: string;
    organization_slug: string;
    company_logo: string | null;
  } | null;
  jobs: { id: string; job_title: string } | null;
}

async function fetchBrandCampaigns(): Promise<{ data: BrandCampaignApiRow[] }> {
  const res = await fetch('/api/admin/brand-campaigns');
  if (!res.ok) throw new Error('Failed to fetch brand campaigns');
  return res.json();
}

export default function AdminCampaignsPage() {
  const { adminRole } = useAdminContext();
  const isScopedRole = SCOPED_ROLES.includes(adminRole);

  const [showCountryPricing, setShowCountryPricing] = useState(false);
  const toggleView = useCallback(() => setShowCountryPricing((v) => !v), []);

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailAccessible, setDetailAccessible] = useState<boolean>(true);
  const [detailRow, setDetailRow] = useState<BrandCampaignRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ['/api/admin/brand-campaigns'];

  const { data: response, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: fetchBrandCampaigns,
    staleTime: CACHE_TIMES.ADMIN_CAMPAIGNS,
  });

  const { data: brandsResponse } = useQuery<{ data: Array<{ id: string; organization_name: string }> }>({
    queryKey: ['/api/admin/brands-list'],
    queryFn: async () => {
      const res = await fetch('/api/admin/brands?limit=200');
      if (!res.ok) throw new Error('Failed to fetch brands');
      return res.json();
    },
    staleTime: CACHE_TIMES.ADMIN_BRANDS,
  });

  const { data: jobsResponse } = useQuery<{ data: Array<{ id: string; job_title: string | null; status: string }> }>({
    queryKey: ['/api/admin/brands', form.brand_organization_id, 'jobs'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${form.brand_organization_id}/jobs`);
      if (!res.ok) throw new Error('Failed to fetch jobs');
      return res.json();
    },
    enabled: dialogOpen && !!form.brand_organization_id,
    staleTime: CACHE_TIMES.ADMIN_JOBS,
  });

  const dialogJobs = useMemo(
    () => (jobsResponse?.data ?? []).map((j) => ({
      id: j.id,
      job_title: j.job_title ?? '(untitled)',
      status: j.status,
    })),
    [jobsResponse]
  );

  const handleCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((campaign: BrandCampaignRow) => {
    setEditingId(campaign.id);
    setForm({ ...campaignToForm(campaign), brand_organization_id: campaign.brand_organization_id });
    setDialogOpen(true);
  }, []);

  const handleRowClicked = useCallback(
    (event: { data: BrandCampaignRow | undefined; event?: Event | null }) => {
      if (!event.data) return;
      const target = (event.event as MouseEvent | undefined)?.target as HTMLElement | undefined;
      if (target && target.closest('button, a, [role="menuitem"]')) return;
      setDetailId(event.data.id);
      setDetailAccessible(event.data.accessible);
      setDetailRow(event.data);
      setDetailOpen(true);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/admin/brand-campaigns/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToPayload(form)),
        });
        if (!res.ok) {
          toast({ title: 'Failed to update campaign', variant: 'destructive' });
          return;
        }
      } else {
        if (!form.brand_organization_id) {
          toast({ title: 'Please select a brand', variant: 'destructive' });
          setSaving(false);
          return;
        }
        const res = await fetch('/api/admin/brand-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formToPayload(form), brand_organization_id: form.brand_organization_id }),
        });
        if (!res.ok) {
          toast({ title: 'Failed to create campaign', variant: 'destructive' });
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [editingId, form, queryClient, queryKey, toast]);

  const handleDelete = useCallback(async (campaignId: string) => {
    const res = await fetch(`/api/admin/brand-campaigns/${campaignId}`, { method: 'DELETE' });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, queryKey]);

  const gridData: BrandCampaignRow[] = useMemo(() => {
    let rows = (response?.data || []).map((c): BrandCampaignRow => ({
      id: c.id,
      name: c.name,
      brand_organization_id: c.brand_organization_id,
      brand_name: c.brand_organizations?.organization_name || 'Unknown',
      brand_slug: c.brand_organizations?.organization_slug || '',
      brand_logo: c.brand_organizations?.company_logo || null,
      job_id: c.job_id,
      status: c.status,
      country: c.country,
      platforms: c.platforms || [],
      budget_cents: c.budget_cents,
      target_video_count: c.target_video_count,
      base_pay_per_video_cents: c.base_pay_per_video_cents,
      monthly_cap_cents: c.monthly_cap_cents,
      posting_frequency: c.posting_frequency,
      min_views_threshold: c.min_views_threshold,
      min_views_pay_cents: c.min_views_pay_cents,
      bonus_milestones: c.bonus_milestones,
      referral_bonus_cents: c.referral_bonus_cents,
      start_date: c.start_date,
      end_date: c.end_date,
      notes: c.notes,
      created_at: c.created_at,
      accessible: c.accessible !== false,
    }));

    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.brand_name.toLowerCase().includes(q) ||
          r.country?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [response, statusFilter, debouncedSearch]);

  const handleEditById = useCallback(
    (campaignId: string) => {
      const c = (response?.data || []).find((r) => r.id === campaignId);
      if (!c) return;
      setDetailOpen(false);
      setEditingId(c.id);
      setForm({
        ...campaignToForm({
          name: c.name,
          status: c.status,
          country: c.country,
          platforms: c.platforms || [],
          budget_cents: c.budget_cents,
          target_video_count: c.target_video_count,
          base_pay_per_video_cents: c.base_pay_per_video_cents,
          monthly_cap_cents: c.monthly_cap_cents,
          posting_frequency: c.posting_frequency,
          min_views_threshold: c.min_views_threshold,
          min_views_pay_cents: c.min_views_pay_cents,
          bonus_milestones: (c.bonus_milestones as Array<{ views?: number; min_views?: number; bonus_cents?: number; amount_cents?: number }> | null),
          referral_bonus_cents: c.referral_bonus_cents,
          start_date: c.start_date,
          end_date: c.end_date,
          notes: c.notes,
          job_id: c.job_id,
        }),
        brand_organization_id: c.brand_organization_id,
      });
      setDialogOpen(true);
    },
    [response]
  );

  const columnDefs = useMemo(() => createBrandCampaignColumnDefs(), []);

  const components = useMemo(
    () => ({
      BrandCampaignBrandCellRenderer,
      BrandCampaignStatusCellRenderer,
      BrandCampaignCountryCellRenderer,
      BrandCampaignPlatformsCellRenderer,
      BrandCampaignCurrencyCellRenderer,
      BrandCampaignNumberCellRenderer,
      BrandCampaignViewsCellRenderer,
      BrandCampaignBonusCellRenderer,
      BrandCampaignMonthNumberCellRenderer,
      BrandCampaignNotesCellRenderer,
      BrandCampaignActionsCellRenderer,
      AdminDateCellRenderer,
    }),
    []
  );

  const gridContext = useMemo(
    () =>
      isScopedRole ? {} : { onEdit: handleEdit, onDelete: handleDelete },
    [isScopedRole, handleEdit, handleDelete]
  );

  const getRowId = useCallback((params: { data: BrandCampaignRow }) => params.data.id, []);

  const isSearching = searchQuery !== debouncedSearch;

  return (
    <div className="flex flex-col flex-1 min-h-0 -mx-4 -mt-6 overflow-hidden">
      {/* Filter Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-30 flex-shrink-0">
        <div className="flex items-center gap-2">
          {!showCountryPricing && (
          <>
          {/* Search */}
          <div className="relative">
            {isSearching || isFetching ? (
              <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              type="text"
              placeholder="Search campaigns..."
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

          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 gap-1 ${statusFilter ? 'bg-accent' : ''}`}
              >
                {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'Status'}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuRadioGroup
                value={statusFilter || 'all'}
                onValueChange={(v) => setStatusFilter(v === 'all' ? null : v)}
              >
                <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="paused">Paused</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="completed">Completed</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showCountryPricing ? 'default' : 'outline'}
            size="sm"
            className="h-8"
            onClick={toggleView}
          >
            <Globe className="h-4 w-4 mr-1" />
            {showCountryPricing ? 'Back to Campaigns' : 'See Country Pricing'}
          </Button>
          {!showCountryPricing && !isScopedRole && (
            <Button size="sm" className="h-8" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Campaign
            </Button>
          )}
        </div>
      </div>

      {showCountryPricing ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <CountryPricingView />
        </div>
      ) : (
      <>
      {/* Grid */}
      <div
        className="flex-1 min-h-0 overflow-hidden ag-grid-container"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        <LazyAgGrid<BrandCampaignRow>
          containerStyle={{ height: '100%', width: '100%' }}
          theme={customTheme}
          rowData={gridData}
          columnDefs={columnDefs}
          defaultColDef={defaultBrandCampaignColDef}
          components={components}
          context={gridContext}
          getRowId={getRowId}
          loading={isLoading}
          suppressRowClickSelection={true}
          animateRows={true}
          suppressCellFocus={true}
          onRowClicked={handleRowClicked}
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center h-8 px-3 border-t border-border bg-background text-xs text-muted-foreground flex-shrink-0">
        <span>
          <span className="font-medium text-foreground">{gridData.length}</span> campaigns
        </span>
      </div>
      </>
      )}

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        saving={saving}
        title={editingId ? 'Edit Campaign' : 'New Campaign'}
        brands={editingId ? undefined : brandsResponse?.data}
        jobs={dialogJobs}
      />

      <CampaignDetailModal
        campaignId={detailId}
        accessible={detailAccessible}
        previewRow={detailRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={isScopedRole || !detailAccessible ? undefined : handleEditById}
      />
    </div>
  );
}
