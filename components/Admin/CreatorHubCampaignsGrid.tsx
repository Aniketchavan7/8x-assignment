'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import type { CustomCellRendererProps } from 'ag-grid-react';
import { ChevronDown, ExternalLink, MoreHorizontal, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countryNameToISO } from '@/lib/utils/country-iso-mapping';
import { LazyAgGrid } from '@/components/Admin/AdminGrid/LazyAgGrid';
import type { PipelineGridData } from '@/components/Admin/AdminGrid/pipelineColumnDefs';
import {
  TikTokLinkCellRenderer,
  InstagramLinkCellRenderer,
  YouTubeLinkCellRenderer,
} from '@/components/Admin/AdminGrid/sharedCellRenderers';
import {
  STATUS_CONFIG,
  STATUSES,
} from '@/components/Admin/BrandDetail/sections/pipelineHelpers';
import {
  MANAGED_CREATOR_STATUS_LABELS,
  type ManagedCreatorStatus,
} from '@/lib/modules/managed-creators/constants';
import { appAgGridTheme } from '@/lib/ag-grid/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { AddFundsDialog } from '@/components/Admin/AddFundsDialog';
import type { CreatorPayoutData } from '@/components/Admin/types/creator-payouts';
import type { CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';

// ---------------------------------------------------------------------------
// Row type — extends PipelineGridData with brand + campaign-specific fields
// ---------------------------------------------------------------------------

export interface CreatorHubCampaignRow extends PipelineGridData {
  brandName: string;
  brandSlug: string | null;
  brandOrganizationId: string;
  managedCreatorId: string;
  linkedCreatorProfileId: string | null;
  advanceBalanceCents: number;
  jobCountry: string | null;
}

const defaultColDef: ColDef<CreatorHubCampaignRow> = {
  resizable: true,
  sortable: true,
  sortingOrder: ['desc', 'asc', null],
  cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

// ---------------------------------------------------------------------------
// Cell renderers (read-only variants for the modal context)
// ---------------------------------------------------------------------------

function CampaignStatusCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const data = props.data;
  if (!data) return null;

  const cfg = STATUS_CONFIG[data.statusLabel];
  if (!cfg) {
    return (
      <div className="flex items-center h-full">
        <Badge variant="outline" className="text-xs">{data.statusLabel}</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${cfg.bg} ${cfg.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
        {data.statusLabel}
      </span>
    </div>
  );
}

function CampaignCountryCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const value = props.value;
  if (!value) return <span className="text-muted-foreground/40">&mdash;</span>;

  return (
    <div className="flex items-center h-full">
      <span className="text-sm truncate">{value}</span>
    </div>
  );
}

function CampaignBooleanCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const value = props.value;
  return (
    <div className="flex items-center justify-center h-full">
      <span className={`text-xs font-medium ${value ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

function CampaignPostCountCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const value = props.value;
  if (value == null || value === 0) {
    return <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">&ndash;</div>;
  }

  return (
    <div className="flex items-center justify-center h-full text-xs font-medium">
      {value}
    </div>
  );
}

function CampaignVideoCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center justify-center h-full">
      {data.hasVideos ? (
        <span className="text-xs text-green-600 dark:text-green-400 font-medium">Yes</span>
      ) : (
        <span className="text-xs text-muted-foreground/40">&mdash;</span>
      )}
    </div>
  );
}

function AdvanceCellRenderer(props: CustomCellRendererProps<CreatorHubCampaignRow>) {
  const data = props.data;
  if (!data || data.advanceBalanceCents <= 0) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm tabular-nums font-medium text-amber-600">
        ${(data.advanceBalanceCents / 100).toFixed(2)}
      </span>
    </div>
  );
}

function countryToFlag(country: string | null): string {
  if (!country) return '';
  const iso = country.length === 2 ? country : countryNameToISO(country);
  if (!iso || iso.length !== 2) return '';
  const base = 0x1f1e6;
  const upper = iso.toUpperCase();
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCodePoint(base + a - 65) + String.fromCodePoint(base + b - 65);
}

interface BrandJobOption {
  id: string;
  job_title: string | null;
  job_type: 'standard' | 'cpm' | null;
  cpm_base_pay: number | null;
  country: string | null;
  cpm_platforms_allowed: string[] | null;
  bonus_milestones: unknown;
  status: string;
}

function ChangeJobDialog({
  open,
  onOpenChange,
  managedCreatorId,
  brandOrganizationId,
  brandName,
  currentJobId,
  currentJobTitle,
  currentJobCountry,
  currentBasePayCents,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedCreatorId: string;
  brandOrganizationId: string;
  brandName: string;
  currentJobId: string | null;
  currentJobTitle: string | null;
  currentJobCountry: string | null;
  currentBasePayCents: number;
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<BrandJobOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: jobsData, isLoading } = useQuery<{ data: BrandJobOption[] }>({
    queryKey: ['/api/admin/brands', brandOrganizationId, 'jobs'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandOrganizationId}/jobs`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load jobs');
      return res.json();
    },
    enabled: open && !!brandOrganizationId,
    staleTime: 30_000,
  });

  const jobs = jobsData?.data ?? [];

  const handleSave = async () => {
    if (!selected || selected.id === currentJobId) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/managed-creators/${managedCreatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: selected.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to change job');
      }
      onSuccess();
      onOpenChange(false);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change job');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setSelected(null);
      setError(null);
    }
    onOpenChange(newOpen);
  };

  const selectedPlatformCount = selected?.cpm_platforms_allowed?.length || 1;
  const selectedBasePerVideo =
    selected?.cpm_base_pay != null ? selected.cpm_base_pay / selectedPlatformCount : null;

  const currentJob = jobs.find((j) => j.id === currentJobId) ?? null;
  const currentPlatformCount = currentJob?.cpm_platforms_allowed?.length || 1;
  const currentBasePerVideo = Math.round(currentBasePayCents / Math.max(currentPlatformCount, 1));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Change job — {brandName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Pick a job under the same brand. Base pay and bonus milestones on the
            managed_creators row will update to match. Existing posts keep their current
            pricing.
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading jobs…</div>
          ) : (
            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {jobs.map((j) => {
                const isCurrent = j.id === currentJobId;
                const isSelected = selected?.id === j.id;
                const flag = countryToFlag(j.country);
                const platforms = j.cpm_platforms_allowed?.length || 1;
                const perVideo = j.cpm_base_pay != null ? j.cpm_base_pay / platforms : null;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelected(j)}
                    className={cn(
                      'w-full flex items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                      isSelected && 'bg-muted',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {flag && <span className="mr-1">{flag}</span>}
                        {j.country ?? '—'}
                        <span className="text-muted-foreground font-normal ml-2">
                          {j.job_title}
                        </span>
                        {isCurrent && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Current
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {j.job_type?.toUpperCase() ?? 'STANDARD'} ·{' '}
                        {perVideo != null
                          ? `$${(perVideo / 100).toFixed(2)}/video`
                          : 'No base pay'}{' '}
                        · {platforms} platform{platforms === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>
                );
              })}
              {jobs.length === 0 && (
                <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                  No jobs found for this brand.
                </div>
              )}
            </div>
          )}

          {selected && selected.id !== currentJobId && (
            <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs space-y-1">
              <div className="font-medium">Review change</div>
              <div className="text-muted-foreground tabular-nums">
                Old: {currentJobCountry ?? '—'} · {currentJobTitle ?? '—'} · $
                {(currentBasePerVideo / 100).toFixed(2)}/video, {currentPlatformCount} platform
                {currentPlatformCount === 1 ? '' : 's'}
              </div>
              <div className="text-muted-foreground tabular-nums">
                New: {selected.country ?? '—'} · {selected.job_title} ·{' '}
                {selectedBasePerVideo != null
                  ? `$${(selectedBasePerVideo / 100).toFixed(2)}/video`
                  : '—'}
                , {selectedPlatformCount} platform{selectedPlatformCount === 1 ? '' : 's'}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !selected || selected.id === currentJobId}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Change job'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobCellRenderer(
  props: CustomCellRendererProps<CreatorHubCampaignRow> & { onRefresh?: () => void },
) {
  const [open, setOpen] = useState(false);
  const data = props.data;
  if (!data) return null;
  const flag = countryToFlag(data.jobCountry);

  return (
    <div className="flex items-center gap-2 h-full w-full">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="flex items-center gap-1 text-xs hover:bg-muted/50 px-2 py-1 rounded transition-colors min-w-0 flex-1 text-left"
      >
        {data.jobId ? (
          <>
            {flag && <span>{flag}</span>}
            <span className="font-medium">{data.jobCountry ?? '—'}</span>
            <span className="text-muted-foreground truncate">{data.jobTitle}</span>
          </>
        ) : (
          <span className="text-muted-foreground/60">No job — click to assign</span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      </button>
      <ChangeJobDialog
        open={open}
        onOpenChange={setOpen}
        managedCreatorId={data.managedCreatorId}
        brandOrganizationId={data.brandOrganizationId}
        brandName={data.brandName}
        currentJobId={data.jobId}
        currentJobTitle={data.jobTitle}
        currentJobCountry={data.jobCountry}
        currentBasePayCents={data.base_pay ?? 0}
        onSuccess={() => props.onRefresh?.()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Set Advance Dialog
// ---------------------------------------------------------------------------

function SetAdvanceDialog({
  open,
  onOpenChange,
  managedCreatorId,
  currentBalance,
  creatorName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedCreatorId: string;
  currentBalance: number;
  creatorName: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(String(currentBalance / 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      setError('Please enter a valid non-negative amount');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/managed-creators/${managedCreatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advance_balance_cents: Math.round(parsed * 100) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update');
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Set Advance — {creatorName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Amount ($)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Campaign Actions Menu (cell renderer)
// ---------------------------------------------------------------------------

function CampaignActionsCellRenderer(
  props: CustomCellRendererProps<CreatorHubCampaignRow> & {
    onRefresh?: () => void;
    creatorProfile?: CreatorDetailResponse['profile'];
  }
) {
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const data = props.data;
  if (!data) return null;

  const creatorPayoutData: CreatorPayoutData | null = props.creatorProfile?.user_id
    ? {
        id: props.creatorProfile.id,
        display_name: props.creatorProfile.display_name,
        profile_picture: props.creatorProfile.profile_picture,
        user_id: props.creatorProfile.user_id,
        email: props.creatorProfile.email || '',
        stripe_account_id: null,
        stripe_onboarding_complete: false,
        stripe_payouts_enabled: false,
        stripe_balance: null,
        wallet_balance: 0,
        wallet_pending: 0,
      }
    : null;

  return (
    <div className="flex items-center justify-center h-full">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 p-0 flex items-center justify-center rounded hover:bg-muted transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[100]">
          <DropdownMenuItem onSelect={() => setAdvanceOpen(true)}>
            Set Advance
          </DropdownMenuItem>
          {creatorPayoutData && (
            <DropdownMenuItem onSelect={() => setBonusOpen(true)}>
              Add Bonus
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SetAdvanceDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        managedCreatorId={data.managedCreatorId}
        currentBalance={data.advanceBalanceCents}
        creatorName={props.creatorProfile?.display_name || data.brandName}
        onSuccess={() => props.onRefresh?.()}
      />

      {creatorPayoutData && (
        <AddFundsDialog
          open={bonusOpen}
          onOpenChange={setBonusOpen}
          creator={creatorPayoutData}
          onSuccess={() => props.onRefresh?.()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column defs
// ---------------------------------------------------------------------------

function createCampaignColumnDefs(options?: {
  onRefresh?: () => void;
  creatorProfile?: CreatorDetailResponse['profile'];
}): ColDef<CreatorHubCampaignRow>[] {
  const brandCol: ColDef<CreatorHubCampaignRow> = {
    headerName: 'Brand',
    field: 'brandName',
    width: 140,
    pinned: 'left',
    cellRenderer: (params: CustomCellRendererProps<CreatorHubCampaignRow>) => {
      if (!params.data || !params.data.brandSlug) return params.value || null;
      const locale = window.location.pathname.split('/')[1] || 'en';
      return (
        <a
          href={`/${locale}/admin/brands/${params.data.brandSlug}`}
          className="text-primary hover:underline flex items-center gap-1"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/${locale}/admin/brands/${params.data!.brandSlug}`;
          }}
        >
          {params.value}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    },
  };

  const actionsCol: ColDef<CreatorHubCampaignRow> = {
    headerName: '',
    width: 60,
    minWidth: 60,
    sortable: false,
    filter: false,
    resizable: false,
    cellRenderer: 'CampaignActionsCellRenderer',
    cellRendererParams: {
      onRefresh: options?.onRefresh,
      creatorProfile: options?.creatorProfile,
    },
  };

  return [
    brandCol,
    {
      field: 'statusLabel',
      headerName: 'Status',
      minWidth: 130,
      width: 150,
      sortable: true,
      cellRenderer: 'CampaignStatusCellRenderer',
      comparator: (_a: string, _b: string, nodeA, nodeB) => {
        const orderA = nodeA.data?.statusOrder ?? 0;
        const orderB = nodeB.data?.statusOrder ?? 0;
        return orderA - orderB;
      },
    },
    {
      colId: 'job',
      headerName: 'Job',
      minWidth: 220,
      width: 260,
      sortable: true,
      valueGetter: (p) => p.data?.jobCountry ?? '',
      cellRenderer: 'JobCellRenderer',
      cellRendererParams: { onRefresh: options?.onRefresh },
      cellStyle: { display: 'flex', alignItems: 'center' },
    },
    {
      field: 'country',
      headerName: 'Country',
      minWidth: 110,
      width: 120,
      sortable: true,
      cellRenderer: 'CampaignCountryCellRenderer',
    },
    {
      field: 'hasVideos',
      headerName: 'Video',
      minWidth: 70,
      width: 80,
      sortable: true,
      cellRenderer: 'CampaignVideoCellRenderer',
    },
    {
      colId: 'tiktok',
      field: 'tiktokTracked',
      headerName: 'TikTok',
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
      cellRenderer: 'CampaignPostCountCellRenderer',
    },
    {
      field: 'instagramPostCount',
      headerName: 'IG Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'CampaignPostCountCellRenderer',
    },
    {
      field: 'youtubePostCount',
      headerName: 'YT Posts',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'CampaignPostCountCellRenderer',
    },
    {
      field: 'base_pay',
      headerName: 'Base/Video',
      minWidth: 100,
      width: 110,
      sortable: true,
      valueGetter: (params) => {
        const v = params.data?.base_pay;
        if (v == null || v === 0) return null;
        return v / 100;
      },
      valueFormatter: (params) => {
        const v = Number(params.value);
        if (params.value == null || isNaN(v)) return '';
        return `$${v.toFixed(2)}`;
      },
      cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    },
    {
      field: 'contractSigned',
      headerName: 'Contract',
      minWidth: 80,
      width: 90,
      sortable: true,
      cellRenderer: 'CampaignBooleanCellRenderer',
    },
    {
      colId: 'advance',
      headerName: 'Advance',
      minWidth: 90,
      width: 100,
      sortable: true,
      cellRenderer: 'AdvanceCellRenderer',
      valueGetter: (params) => params.data?.advanceBalanceCents ?? 0,
    },
    actionsCol,
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CELL_RENDERERS = {
  CampaignStatusCellRenderer,
  CampaignCountryCellRenderer,
  CampaignBooleanCellRenderer,
  CampaignPostCountCellRenderer,
  CampaignVideoCellRenderer,
  AdvanceCellRenderer,
  CampaignActionsCellRenderer,
  JobCellRenderer,
  TikTokLinkCellRenderer,
  InstagramLinkCellRenderer,
  YouTubeLinkCellRenderer,
};

interface CreatorHubCampaignsGridProps {
  managedCreators: CreatorDetailResponse['managedCreators'];
  creatorProfile?: CreatorDetailResponse['profile'];
  onRefresh?: () => void;
}

export function CreatorHubCampaignsGrid({ managedCreators, creatorProfile, onRefresh }: CreatorHubCampaignsGridProps) {
  const gridData = useMemo<CreatorHubCampaignRow[]>(() => {
    return managedCreators.map((mc) => {
      const statusKey = mc.status as ManagedCreatorStatus | null;
      const statusLabel = statusKey ? (MANAGED_CREATOR_STATUS_LABELS[statusKey] ?? mc.status ?? '') : '';
      const cfg = STATUS_CONFIG[statusLabel];

      return {
        // PipelineGridData fields
        id: mc.id,
        name: mc.brand_name || '',
        email: null,
        phone: null,
        status: mc.status ?? '',
        statusLabel,
        statusOrder: cfg?.num ?? 99,
        tiktok_username: mc.tiktok_username,
        tiktok_url: null,
        instagram_username: mc.instagram_username,
        instagram_url: null,
        jobId: mc.job_id,
        jobTitle: mc.job_title,
        base_pay: mc.base_pay,
        payment: mc.payment_method,
        job_cpm: null,
        warmup: 0,
        country: mc.country,
        countryCode: mc.country,
        linked: mc.linked_user_id != null,
        linkedUserId: mc.linked_user_id,
        hasVideos: false,
        notes: null,
        contractSigned: false,
        lastActionAt: null,
        youtube_username: mc.youtube_username,
        youtube_url: null,
        youtubeTracked: mc.youtubeTracked,
        tiktokTracked: mc.tiktokTracked,
        instagramTracked: mc.instagramTracked,
        tiktokPostCount: mc.tiktokPostCount,
        instagramPostCount: mc.instagramPostCount,
        youtubePostCount: mc.youtubePostCount,
        tiktokFrozen: mc.tiktokFrozen ?? false,
        instagramFrozen: mc.instagramFrozen ?? false,
        youtubeFrozen: mc.youtubeFrozen ?? false,
        daysCount: null,
        daysPhase: 'waiting' as const,
        daysTooltip: '',

        // Campaign-specific fields
        brandName: mc.brand_name || '',
        brandSlug: mc.brand_slug,
        brandOrganizationId: mc.brand_organization_id ?? '',
        managedCreatorId: mc.id,
        linkedCreatorProfileId: mc.linked_creator_profile_id,
        advanceBalanceCents: mc.advance_balance_cents,
        jobCountry: mc.job_country,
      };
    });
  }, [managedCreators]);

  const columnDefs = useMemo(
    () => createCampaignColumnDefs({ onRefresh, creatorProfile }),
    [onRefresh, creatorProfile],
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      <LazyAgGrid<CreatorHubCampaignRow>
        theme={appAgGridTheme}
        rowData={gridData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        components={CELL_RENDERERS}
        domLayout="autoHeight"
        headerHeight={36}
        rowHeight={40}
        suppressRowClickSelection
        suppressCellFocus
      />
    </div>
  );
}
