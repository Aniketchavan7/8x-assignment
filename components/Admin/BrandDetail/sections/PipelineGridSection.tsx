'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { extractTikTokUsername, extractInstagramUsername, extractYouTubeUsername } from '@/lib/utils/social-username';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Search,
  Globe,
  Plus,
  Pencil,
  Trash2,
  Check,
  Copy,
  Columns3,
  RotateCcw,
  X,
  StickyNote,
  Loader2,
  Hourglass,
  Clock,
  Flame,
  CircleCheck,
  AlertTriangle,
  Minus,
} from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { CellValueChangedEvent, GridApi, RowClassRules, SelectionChangedEvent } from 'ag-grid-community';
import type { BrandOrganizationWithMembers } from '@/app/api/admin/brands/route';
import type {
  ManagedCreatorsApiResponse,
  ManagedCreatorListItem,
} from '@/app/api/admin/managed-creators/route';
import { LazyAgGrid } from '@/components/Admin/AdminGrid/LazyAgGrid';
import {
  NameAvatarCellRenderer,
  TikTokLinkCellRenderer,
  InstagramLinkCellRenderer,
  YouTubeLinkCellRenderer,
} from '@/components/Admin/AdminGrid/sharedCellRenderers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { appAgGridTheme } from '@/lib/ag-grid/theme';
import {
  createPipelineColumnDefs,
  defaultPipelineColDef,
  type PipelineGridData,
} from '@/components/Admin/AdminGrid/pipelineColumnDefs';
import {
  STATUSES,
  STATUS_CONFIG,
  warmupProgress,
  getLastActionAt,
  getDaysColumnData,
  type StatusId,
} from './pipelineHelpers';
import { COUNTRIES, getCountryName, resolveCountryCode } from '@/components/Admin/BrandDetail/shared';
import { useGridColumnState } from '@/lib/ag-grid/useGridColumnState';
import { CreateCreatorPanel } from './CreateCreatorPanel';
import { AddExistingCreatorPanel } from './AddExistingCreatorPanel';
import { CreatorVideosPanel } from './CreatorVideosPanel';
import { CreatorPostsPanel } from './CreatorPostsPanel';
import type { BrandCreatorsApiResponse, BrandJob } from '@/lib/types/admin-brand-creators';
import { CreatorDetailModal } from '@/components/Admin/CreatorDetailModal';
import { useToast } from '@/hooks/use-toast';
import type { ExtendedBrandDetails } from '@/app/api/admin/brands/[brandId]/details/route';
import { SocialAccountProfileModal } from '@/components/Admin/BrandDetail/SocialAccountProfileModal';
import { ReassignJobModal } from '@/components/Admin/BrandDetail/sections/ReassignJobModal';
import { countryToFlag } from '@/components/Admin/JobPickerList';
import { ChevronDown } from 'lucide-react';

type AddTab = 'create' | 'existing';

type PanelMode =
  | { type: 'add'; tab: AddTab }
  | { type: 'videos'; row: PipelineGridData }
  | { type: 'notes'; row: PipelineGridData }
  | { type: 'posts'; row: PipelineGridData }
  | null;


// ---------------------------------------------------------------------------
// Pipeline grid context — typed callbacks passed to cell renderers via AG Grid
// ---------------------------------------------------------------------------

interface PipelineGridContext {
  onStatusChange: (id: string, status: string) => void;
  onCountryChange: (id: string, country: string | null) => void;
  onInviteCreator: (id: string) => void;
  onVideoClick: (row: PipelineGridData) => void;
  onNotesClick: (row: PipelineGridData) => void;
  onNameClick: (id: string) => void;
  onPostCountClick: (row: PipelineGridData) => void;
  onJobClick: (row: PipelineGridData) => void;
  onSocialIconClick?: (platform: 'tiktok' | 'instagram' | 'youtube', username: string, managedCreatorId?: string) => void;
  onSocialHandleEdit?: (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => void;
}

// ---------------------------------------------------------------------------
// Days column — time at current stage
// ---------------------------------------------------------------------------

const DAYS_PHASE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  waiting:    { icon: Hourglass,     bg: 'bg-muted',                                    text: 'text-muted-foreground' },
  accepted:   { icon: Clock,         bg: 'bg-amber-50 dark:bg-amber-950/40',            text: 'text-amber-700 dark:text-amber-300' },
  warming_up: { icon: Flame,         bg: 'bg-orange-50 dark:bg-orange-950/40',           text: 'text-orange-700 dark:text-orange-300' },
  posting:    { icon: CircleCheck,   bg: 'bg-emerald-50 dark:bg-emerald-950/40',        text: 'text-emerald-700 dark:text-emerald-300' },
  stalled:    { icon: AlertTriangle, bg: 'bg-red-50 dark:bg-red-950/40',                text: 'text-red-700 dark:text-red-300' },
  dropped:    { icon: Minus,         bg: 'bg-muted',                                    text: 'text-muted-foreground' },
};

function DaysColumnCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  if (!data) return null;

  const cfg = DAYS_PHASE_CONFIG[data.daysPhase] ?? DAYS_PHASE_CONFIG.waiting;
  const Icon = cfg.icon;

  if (data.daysCount == null) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-muted-foreground">&mdash;</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full" title={data.daysTooltip}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${cfg.bg} ${cfg.text}`}>
        <Icon className="h-3 w-3" />
        {data.daysCount}d
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline-specific cell renderers
// ---------------------------------------------------------------------------

function PipelineStatusCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium cursor-pointer hover:ring-1 hover:ring-ring/30 transition-shadow ${cfg.bg} ${cfg.text}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
            {data.statusLabel}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-[200px]">
          {STATUSES.map((s) => {
            const sCfg = STATUS_CONFIG[s.label];
            return (
              <DropdownMenuItem
                key={s.id}
                disabled={s.id === data.status}
                onClick={(e) => {
                  e.stopPropagation();
                  (props.context as PipelineGridContext | undefined)?.onStatusChange(data.id, s.id);
                }}
                className="text-xs"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${sCfg?.dot ?? 'bg-gray-400'} flex-shrink-0 mr-2`} />
                {s.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const PINNED_COUNTRY_CODES = new Set(['US', 'GB', 'CA']);
const SORTED_COUNTRIES = [
  ...COUNTRIES.filter((c) => PINNED_COUNTRY_CODES.has(c.code)),
  ...COUNTRIES.filter((c) => !PINNED_COUNTRY_CODES.has(c.code)).sort((a, b) => a.name.localeCompare(b.name)),
];

function PipelineCountryCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!data) return null;

  const query = search.toLowerCase();
  const filtered = query
    ? SORTED_COUNTRIES.filter((c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase().includes(query))
    : SORTED_COUNTRIES;

  const handleSelect = (code: string | null) => {
    (props.context as PipelineGridContext | undefined)?.onCountryChange(data.id, code);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="flex items-center h-full">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm cursor-pointer hover:ring-1 hover:ring-ring/30 rounded px-1.5 py-0.5 transition-shadow"
            onClick={(e) => e.stopPropagation()}
          >
            {data.country ? (
              <>
                <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{data.country}</span>
              </>
            ) : (
              <span className="text-muted-foreground/40">&mdash;</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-[200px] p-0"
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => inputRef.current?.focus(), 0); }}
        >
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  handleSelect(filtered[0].code);
                }
              }}
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto p-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
              className="w-full text-left px-2 py-1.5 rounded-sm text-xs text-muted-foreground hover:bg-accent cursor-pointer"
            >
              None
            </button>
            {filtered.map((c, i) => (
              <React.Fragment key={c.code}>
                {i === PINNED_COUNTRY_CODES.size && !query && (
                  <div className="h-px bg-border my-1" />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSelect(c.code); }}
                  className={`w-full text-left px-2 py-1.5 rounded-sm text-xs hover:bg-accent cursor-pointer ${
                    c.code === data.countryCode ? 'font-medium text-foreground' : ''
                  }`}
                >
                  {c.name}
                </button>
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No results</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PipelineLinkedCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  if (!data) return null;

  if (data.linked) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-xs text-green-600 dark:text-green-400 font-medium">Yes</span>
      </div>
    );
  }

  const handleInvite = (e: React.MouseEvent) => {
    e.stopPropagation();
    (props.context as PipelineGridContext | undefined)?.onInviteCreator(data.id);
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        onClick={handleInvite}
        className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 cursor-pointer"
        title="Generate and copy invite link"
      >
        No
      </button>
    </div>
  );
}

function PipelineBooleanCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const value = props.value;
  return (
    <div className="flex items-center justify-center h-full">
      <span className={`text-xs font-medium ${value ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

function PipelineVideoCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  if (!data) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    (props.context as PipelineGridContext | undefined)?.onVideoClick(data);
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        onClick={handleClick}
        className="text-xs cursor-pointer hover:ring-1 hover:ring-ring/30 rounded px-1.5 py-0.5 transition-shadow"
      >
        {data.hasVideos ? (
          <span className="text-green-600 dark:text-green-400 font-medium">Yes</span>
        ) : (
          <span className="text-muted-foreground/40">&mdash;</span>
        )}
      </button>
    </div>
  );
}

function CopyableCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const value = props.value as string | null;
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <div className="flex items-center h-full">
        <span className="text-muted-foreground/40">&mdash;</span>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center h-full group/cell">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors truncate"
        title={`Copy ${value}`}
      >
        <span className="truncate">{value}</span>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
        ) : (
          <Copy className="h-3 w-3 flex-shrink-0 opacity-0 group-hover/cell:opacity-100" />
        )}
      </button>
    </div>
  );
}

function PipelineNotesCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  if (!data) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    (props.context as PipelineGridContext | undefined)?.onNotesClick(data);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center h-full w-full text-left cursor-pointer group/notes"
    >
      {data.notes ? (
        <span className="text-xs text-muted-foreground truncate group-hover/notes:text-foreground transition-colors">
          {data.notes}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/40 group-hover/notes:text-muted-foreground transition-colors">
          Add note...
        </span>
      )}
    </button>
  );
}

function PipelinePostCountCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  const value = props.value;
  if (!data) return null;

  if (value == null || value === 0) {
    return <div className="flex items-center justify-center h-full text-xs text-muted-foreground/40">–</div>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        (props.context as PipelineGridContext | undefined)?.onPostCountClick(data);
      }}
      className="flex items-center justify-center h-full w-full text-xs font-medium text-primary hover:underline cursor-pointer"
    >
      {value}
    </button>
  );
}

function PipelineJobCellRenderer(props: CustomCellRendererProps<PipelineGridData>) {
  const data = props.data;
  if (!data) return null;

  const flag = countryToFlag(data.jobCountry);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        (props.context as PipelineGridContext | undefined)?.onJobClick(data);
      }}
      className="flex items-center gap-1 text-xs hover:bg-muted/50 px-2 py-1 rounded transition-colors min-w-0 flex-1 text-left h-full w-full"
    >
      {data.jobId ? (
        <>
          {flag && <span className="flex-shrink-0">{flag}</span>}
          {data.jobCountry && <span className="font-medium flex-shrink-0">{data.jobCountry}</span>}
          <span className="text-muted-foreground truncate">{data.jobTitle ?? '—'}</span>
        </>
      ) : (
        <span className="text-muted-foreground/60 truncate">No job — click to assign</span>
      )}
      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-auto" />
    </button>
  );
}

const CELL_RENDERERS = {
  NameAvatarCellRenderer,
  PipelineStatusCellRenderer,
  DaysColumnCellRenderer,
  PipelineLinkedCellRenderer,
  PipelineBooleanCellRenderer,
  PipelineVideoCellRenderer,
  PipelineNotesCellRenderer,
  PipelinePostCountCellRenderer,
  PipelineJobCellRenderer,
  TikTokLinkCellRenderer,
  InstagramLinkCellRenderer,
  YouTubeLinkCellRenderer,
  PipelineCountryCellRenderer,
  CopyableCellRenderer,
};

// ---------------------------------------------------------------------------
// Creator Notes Panel — sidebar panel for editing creator notes
// ---------------------------------------------------------------------------

function CreatorNotesPanel({
  row,
  onClose,
  onSave,
}: {
  row: PipelineGridData;
  onClose: () => void;
  onSave: (id: string, notes: string) => void;
}) {
  const [value, setValue] = useState(row.notes ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestRef = useRef(row.notes ?? '');
  const dirtyRef = useRef(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      latestRef.current = newValue;
      dirtyRef.current = true;
      setSaveStatus('saving');
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onSaveRef.current(row.id, newValue);
        dirtyRef.current = false;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      }, 800);
    },
    [row.id]
  );

  // Flush pending save on unmount
  useEffect(() => {
    const rowId = row.id;
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (dirtyRef.current) {
        onSaveRef.current(rowId, latestRef.current);
      }
    };
  }, [row.id]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 relative">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">{row.name}</span>
        </div>
        {saveStatus !== 'idle' && (
          <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Notes textarea */}
      <div className="flex-1 p-4 overflow-hidden">
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Add notes about this creator..."
          className="w-full h-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          maxLength={50000}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row class rules — dim dropped rows, highlight unclear/active
// ---------------------------------------------------------------------------

const ROW_CLASS_RULES: RowClassRules<PipelineGridData> = {
  'opacity-50': (params) => params.data?.status === 'dropped' || params.data?.status === 'rejected',
};

// Inline styles for row backgrounds — Tailwind bg-* classes are overridden by
// AG Grid's theme (same specificity, but AG Grid injects later in the cascade).
// Inline styles always win.
function getRowStyle(params: { data: PipelineGridData | undefined }): Record<string, string> | undefined {
  const d = params.data;
  if (!d) return undefined;

  if (d.status === 'unclear') return { backgroundColor: 'oklch(0.936 0.032 17.717)' }; // red-100

  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<string, number> = {};
STATUSES.forEach((s, i) => {
  STATUS_ORDER[s.id] = i + 1;
});

function managedToRow(mc: ManagedCreatorListItem): PipelineGridData {
  const statusId = (mc.status as StatusId) || 'applied';
  const statusLabel = STATUSES.find((s) => s.id === statusId)?.label ?? statusId;
  const daysData = getDaysColumnData(mc);

  return {
    id: mc.id,
    name: mc.name,
    email: mc.email,
    phone: mc.phone,
    status: statusId,
    statusLabel,
    statusOrder: STATUS_ORDER[statusId] ?? 0,
    daysCount: daysData.days,
    daysPhase: daysData.phase,
    daysTooltip: daysData.tooltip,
    tiktok_username: mc.tiktok_username,
    tiktok_url: mc.collected_tiktok_url,
    instagram_username: mc.instagram_username,
    instagram_url: mc.collected_instagram_url,
    youtube_username: mc.youtube_username ?? null,
    youtube_url: null,
    youtubeTracked: null,
    jobId: mc.job_id,
    jobTitle: mc.job_title,
    jobCountry: mc.job_country,
    base_pay: mc.base_pay,
    payment: mc.payment,
    job_cpm: mc.job_cpm,
    warmup: warmupProgress(mc),
    country: mc.country ? getCountryName(mc.country) : null,
    countryCode: mc.country ? resolveCountryCode(mc.country) : null,
    linked: !!mc.linked_creator_profile_id,
    linkedUserId: mc.linked_user_id ?? null,
    hasVideos: !!mc.videos_complete,
    contractSigned: !!mc.contract_accepted_at,
    notes: mc.notes ?? null,
    lastActionAt: getLastActionAt(mc),
    tiktokTracked: null,
    instagramTracked: null,
    tiktokPostCount: null,
    instagramPostCount: null,
    youtubePostCount: null,
    tiktokFrozen: false,
    instagramFrozen: false,
    youtubeFrozen: false,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AG Grid v35 selection config
// ---------------------------------------------------------------------------

const ROW_SELECTION = {
  mode: 'multiRow' as const,
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
};

const SELECTION_COLUMN_DEF = {
  pinned: 'left' as const,
  width: 48,
  minWidth: 48,
  maxWidth: 48,
  lockPosition: 'left' as const,
  suppressHeaderMenuButton: true,
};

// ---------------------------------------------------------------------------
// Bulk edit field definitions
// ---------------------------------------------------------------------------

type BulkEditField = 'status' | 'base_pay' | 'sourced' | 'location' | 'country';

const BULK_EDIT_FIELDS: { value: BulkEditField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'base_pay', label: 'Base Pay' },
  { value: 'sourced', label: 'Sourced' },
  { value: 'location', label: 'Location' },
  { value: 'country', label: 'Country' },
];

const ALL_STATUS_LABELS = new Set(STATUSES.map((s) => s.label));

const STATUS_ID_BY_LABEL: Record<string, StatusId> = {};
STATUSES.forEach((s) => {
  STATUS_ID_BY_LABEL[s.label] = s.id;
});

// Default status filter on page load — engaged creators only.
// Power users opt into the long tail (applied/dropped) via the popover.
const ENGAGED_STATUS_LABELS: string[] = [
  'Video Submitted',
  'Accepted',
  'Warming Up',
  'Active',
  'Ghosted',
  'Unclear',
];

const EMPTY_JOBS: BrandJob[] = [];

interface PipelineGridSectionProps {
  brand: BrandOrganizationWithMembers;
  initialJobFilter?: string | null;
  initialCountryFilter?: string | null;
}

export function PipelineGridSection({ brand, initialJobFilter, initialCountryFilter }: PipelineGridSectionProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [quickFilter, setQuickFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(ENGAGED_STATUS_LABELS));
  const [jobFilter, setJobFilterState] = useState<string | null>(initialJobFilter ?? null);
  const [countryFilter, setCountryFilterState] = useState<string | null>(initialCountryFilter ?? null);
  const jobFilterRef = useRef(jobFilter);
  jobFilterRef.current = jobFilter;
  const countryFilterRef = useRef(countryFilter);
  countryFilterRef.current = countryFilter;

  const syncFiltersToUrl = useCallback((job: string | null, country: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (job) p.set('job', job); else p.delete('job');
    if (country) p.set('country', country); else p.delete('country');
    const qs = p.toString();
    router.replace(`/admin/brands/${orgSlug}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, orgSlug]);

  const setJobFilter = useCallback((v: string | null) => {
    setJobFilterState(v);
    syncFiltersToUrl(v, countryFilterRef.current);
  }, [syncFiltersToUrl]);

  const setCountryFilter = useCallback((v: string | null) => {
    setCountryFilterState(v);
    syncFiltersToUrl(jobFilterRef.current, v);
  }, [syncFiltersToUrl]);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colVisibility, setColVisibility] = useState<Array<{ colId: string; headerName: string; visible: boolean }>>([]);
  const [creatorModalId, setCreatorModalId] = useState<string | null>(null);
  const [reassignModal, setReassignModal] = useState<{
    managedCreatorId: string;
    currentJobId: string | null;
    creatorName: string;
  } | null>(null);

  // Column state persistence (widths, order, visibility) per brand
  const {
    onGridReady: onGridReadyColumnState,
    onColumnChanged,
    resetColumnState,
    toggleColumnVisibility,
    getColumnVisibility,
    apiRef: gridApiRef,
  } = useGridColumnState('pipeline', brand.id);

  // Selection state
  const [selectedRows, setSelectedRows] = useState<PipelineGridData[]>([]);
  // Rows targeted by the current action (from toolbar or row menu)
  const [actionRows, setActionRows] = useState<PipelineGridData[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editField, setEditField] = useState<BulkEditField | ''>('');
  const [editValue, setEditValue] = useState('');

  // Cascade pay dialog state
  const [cascadeDialogOpen, setCascadeDialogOpen] = useState(false);
  const [cascadeCreatorIds, setCascadeCreatorIds] = useState<string[]>([]);
  const [cascadeOldValues, setCascadeOldValues] = useState<Record<string, number | null>>({});
  const [cascadeLoading, setCascadeLoading] = useState(false);

  const selectedRowId = panelMode?.type === 'videos' || panelMode?.type === 'notes' || panelMode?.type === 'posts' ? panelMode.row.id : null;

  // Resize state
  const [detailPanelWidth, setDetailPanelWidth] = useState<number | null>(null);

  // Debounce search input so each keystroke doesn't refetch
  const [debouncedQuickFilter, setDebouncedQuickFilter] = useState(quickFilter);
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuickFilter(quickFilter), 300);
    return () => clearTimeout(handle);
  }, [quickFilter]);

  // Build status_in param from the current filter set.
  // null  → omit param (server returns all statuses, capped by limit)
  // ''    → pass an empty list (server returns nothing, matches popover state)
  // 'a,b' → pass selected status IDs
  const statusInParam = useMemo<string | null>(() => {
    if (statusFilter.size === STATUSES.length) return null;
    if (statusFilter.size === 0) return '';
    return [...statusFilter]
      .map((label) => STATUS_ID_BY_LABEL[label])
      .filter(Boolean)
      .join(',');
  }, [statusFilter]);

  const { data: managedData, isLoading: isLoadingManaged } = useQuery<ManagedCreatorsApiResponse>({
    queryKey: ['/api/admin/managed-creators', brand.id, countryFilter, jobFilter, statusInParam, debouncedQuickFilter],
    queryFn: async () => {
      // No statuses selected — skip the round trip; the grid will be empty anyway
      if (statusInParam === '') {
        return { data: [], total: 0, page: 1, limit: 0, totalPages: 0 };
      }
      const params = new URLSearchParams({
        brand_id: brand.id,
        limit: '200000',
      });
      if (countryFilter) params.set('country', countryFilter);
      if (jobFilter) params.set('job_id', jobFilter);
      if (statusInParam) params.set('status_in', statusInParam);
      if (debouncedQuickFilter) params.set('search', debouncedQuickFilter);
      const res = await fetch(`/api/admin/managed-creators?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch managed creators');
      return res.json();
    },
    staleTime: 15000,
  });

  // Status counts come from a separate aggregate query so they stay accurate
  // even when the row list is filtered down. Reflects country/job/search but
  // NOT status (the counts ARE the per-status totals).
  type StatusCountsResponse = { counts: Record<string, number>; total: number };
  const { data: statusCountsData } = useQuery<StatusCountsResponse>({
    queryKey: ['/api/admin/managed-creators/status-counts', brand.id, countryFilter, jobFilter, debouncedQuickFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        brand_id: brand.id,
        view: 'status_counts',
      });
      if (countryFilter) params.set('country', countryFilter);
      if (jobFilter) params.set('job_id', jobFilter);
      if (debouncedQuickFilter) params.set('search', debouncedQuickFilter);
      const res = await fetch(`/api/admin/managed-creators?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch status counts');
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: brandCreatorsData } = useQuery<BrandCreatorsApiResponse>({
    queryKey: ['/api/admin/brands', brand.id, 'creators'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brand.id}/creators`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 30000,
  });

  const brandJobs = brandCreatorsData?.jobs ?? EMPTY_JOBS;

  // Fetch extended details for tracked accounts
  const { data: extendedDetails } = useQuery<ExtendedBrandDetails>({
    queryKey: ['/api/admin/brands', brand.id, 'details'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brand.id}/details`);
      if (!res.ok) throw new Error('Failed to fetch details');
      return res.json();
    },
    staleTime: 30000,
  });

  // Build tracked username sets + lookup map from extendedDetails
  // Returns undefined sets when data hasn't loaded so renderers show neutral gray (not red)
  const { trackedTiktokUsernames, trackedInstagramUsernames, trackedYoutubeUsernames, trackedAccountLookup, postCountByKey, frozenByKey } = useMemo(() => {
    if (!extendedDetails?.tracked_accounts) {
      return { trackedTiktokUsernames: undefined, trackedInstagramUsernames: undefined, trackedYoutubeUsernames: undefined, trackedAccountLookup: new Map<string, string>(), postCountByKey: new Map<string, number>(), frozenByKey: new Map<string, boolean>() };
    }

    const tiktok = new Set<string>();
    const instagram = new Set<string>();
    const youtube = new Set<string>();
    const lookup = new Map<string, string>(); // "platform:username" → account ID
    const counts = new Map<string, number>(); // "platform:username" → post count
    const frozen = new Map<string, boolean>(); // "platform:username" → frozen

    for (const acc of extendedDetails.tracked_accounts) {
      if (!acc.username) continue;
      const lower = acc.username.toLowerCase();
      if (acc.platform === 'tiktok') {
        tiktok.add(lower);
      } else if (acc.platform === 'instagram') {
        instagram.add(lower);
      } else if (acc.platform === 'youtube') {
        youtube.add(lower);
      }
      lookup.set(`${acc.platform}:${lower}`, acc.id);
      counts.set(`${acc.platform}:${lower}`, acc.post_count ?? 0);
      if (acc.frozen) frozen.set(`${acc.platform}:${lower}`, true);
    }

    return { trackedTiktokUsernames: tiktok, trackedInstagramUsernames: instagram, trackedYoutubeUsernames: youtube, trackedAccountLookup: lookup, postCountByKey: counts, frozenByKey: frozen };
  }, [extendedDetails?.tracked_accounts]);

  // Social account profile modal state
  const [socialModalOpen, setSocialModalOpen] = useState(false);
  const [socialModalPlatform, setSocialModalPlatform] = useState<'tiktok' | 'instagram' | 'youtube' | null>(null);
  const [socialModalUsername, setSocialModalUsername] = useState<string | null>(null);
  const [socialModalCreatorId, setSocialModalCreatorId] = useState<string | null>(null);

  const handleSocialIconClick = useCallback((platform: 'tiktok' | 'instagram' | 'youtube', username: string, managedCreatorId?: string) => {
    setSocialModalPlatform(platform);
    setSocialModalUsername(username);
    setSocialModalCreatorId(managedCreatorId ?? null);
    setSocialModalOpen(true);
  }, []);

  const socialModalIsTracked = socialModalPlatform && socialModalUsername
    ? (socialModalPlatform === 'tiktok'
        ? trackedTiktokUsernames
        : socialModalPlatform === 'instagram'
          ? trackedInstagramUsernames
          : trackedYoutubeUsernames
      )?.has(socialModalUsername.toLowerCase()) ?? false
    : false;

  const socialModalAccountId = socialModalPlatform && socialModalUsername
    ? trackedAccountLookup.get(`${socialModalPlatform}:${socialModalUsername.toLowerCase()}`) ?? null
    : null;

  const socialModalIsFrozen = socialModalPlatform && socialModalUsername
    ? frozenByKey.get(`${socialModalPlatform}:${socialModalUsername.toLowerCase()}`) ?? false
    : false;

  const handleFreezeChanged = useCallback((frozen: boolean) => {
    if (socialModalPlatform && socialModalUsername) {
      queryClient.setQueryData<ExtendedBrandDetails>(
        ['/api/admin/brands', brand.id, 'details'],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            tracked_accounts: (old.tracked_accounts ?? []).map((acc) =>
              acc.platform === socialModalPlatform && acc.username?.toLowerCase() === socialModalUsername.toLowerCase()
                ? { ...acc, frozen }
                : acc
            ),
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: ['/api/admin/brands', brand.id, 'details'] });
    }
  }, [queryClient, brand.id, socialModalPlatform, socialModalUsername]);

  const handleTrackingChanged = useCallback((action: 'added' | 'removed') => {
    // Optimistically update the extendedDetails cache so icons flip instantly
    if (socialModalPlatform && socialModalUsername) {
      queryClient.setQueryData<ExtendedBrandDetails>(
        ['/api/admin/brands', brand.id, 'details'],
        (old) => {
          if (!old) return old;
          const accounts = old.tracked_accounts ?? [];
          if (action === 'added') {
            return {
              ...old,
              tracked_accounts: [
                ...accounts,
                { id: crypto.randomUUID(), platform: socialModalPlatform, username: socialModalUsername, display_name: null, profile_pic_url: null, follower_count: null, post_count: 0, frozen: false },
              ],
            };
          }
          return {
            ...old,
            tracked_accounts: accounts.filter(
              (acc) => !(acc.platform === socialModalPlatform && acc.username?.toLowerCase() === socialModalUsername.toLowerCase())
            ),
          };
        }
      );
    }
    // Refetch for accurate data (real account IDs, etc.)
    queryClient.invalidateQueries({ queryKey: ['/api/admin/brands', brand.id, 'details'] });
    setSocialModalOpen(false);
    setSocialModalPlatform(null);
    setSocialModalUsername(null);
  }, [queryClient, brand.id, socialModalPlatform, socialModalUsername]);

  const isLoading = isLoadingManaged;

  const cacheKey = useMemo(
    () => ['/api/admin/managed-creators', brand.id, countryFilter, jobFilter, statusInParam, debouncedQuickFilter],
    [brand.id, countryFilter, jobFilter, statusInParam, debouncedQuickFilter]
  );

  const invalidatePipelineData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/managed-creators', brand.id] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/managed-creators/status-counts', brand.id] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/brands', brand.id, 'creators'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/brands', brand.id, 'details'] });
  }, [queryClient, brand.id]);

  const updateCreatorCache = useCallback(
    (creatorId: string, updater: (item: ManagedCreatorListItem) => ManagedCreatorListItem) => {
      queryClient.setQueryData<ManagedCreatorsApiResponse>(
        cacheKey,
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item) => (item.id === creatorId ? updater(item) : item)),
          };
        }
      );
    },
    [queryClient, cacheKey]
  );

  const sendBatchUpdate = useCallback(
    (creatorId: string, changes: Record<string, unknown>) => {
      fetch('/api/managed-creators/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-view-as-brand': brand.id,
        },
        body: JSON.stringify({
          updates: [{ id: creatorId, changes }],
          creates: [],
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            toast({ title: 'Update failed', description: 'Could not save changes', variant: 'destructive' });
            return;
          }
          const data = await res.json();
          if (data.errors?.length > 0) {
            toast({ title: 'Update failed', description: data.errors[0]?.error || 'Could not save changes', variant: 'destructive' });
          }
        })
        .catch(() => {
          toast({ title: 'Update failed', description: 'Could not save changes', variant: 'destructive' });
        })
        .finally(() => invalidatePipelineData());
    },
    [brand.id, invalidatePipelineData, toast]
  );

  const handleHandleDeleted = useCallback(() => {
    if (!socialModalCreatorId || !socialModalPlatform) return;
    const field = socialModalPlatform === 'tiktok' ? 'tiktok_username' : socialModalPlatform === 'instagram' ? 'instagram_username' : 'youtube_username';
    updateCreatorCache(socialModalCreatorId, (item) => ({ ...item, [field]: null }));
    sendBatchUpdate(socialModalCreatorId, { [field]: '' });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/brands', brand.id, 'details'] });
    setSocialModalOpen(false);
    setSocialModalPlatform(null);
    setSocialModalUsername(null);
    setSocialModalCreatorId(null);
  }, [socialModalCreatorId, socialModalPlatform, updateCreatorCache, sendBatchUpdate, queryClient, brand.id]);

  const rows = useMemo(() => {
    const managed = managedData?.data || [];
    return managed.map((mc) => {
      const row = managedToRow(mc);
      // Normalize usernames once — managed_creators may store full URLs
      // (e.g. "https://www.tiktok.com/@user") instead of clean usernames ("user")
      if (row.tiktok_username) row.tiktok_username = extractTikTokUsername(row.tiktok_username) ?? row.tiktok_username;
      if (row.instagram_username) row.instagram_username = extractInstagramUsername(row.instagram_username) ?? row.instagram_username;
      if (row.youtube_username) row.youtube_username = extractYouTubeUsername(row.youtube_username) ?? row.youtube_username;
      // Compute tracking status and post counts per row
      if (trackedTiktokUsernames && row.tiktok_username) {
        const lower = row.tiktok_username.toLowerCase();
        row.tiktokTracked = trackedTiktokUsernames.has(lower);
        row.tiktokPostCount = postCountByKey.get(`tiktok:${lower}`) ?? null;
        row.tiktokFrozen = frozenByKey.get(`tiktok:${lower}`) ?? false;
      }
      if (trackedInstagramUsernames && row.instagram_username) {
        const lower = row.instagram_username.toLowerCase();
        row.instagramTracked = trackedInstagramUsernames.has(lower);
        row.instagramPostCount = postCountByKey.get(`instagram:${lower}`) ?? null;
        row.instagramFrozen = frozenByKey.get(`instagram:${lower}`) ?? false;
      }
      if (trackedYoutubeUsernames && row.youtube_username) {
        const lower = row.youtube_username.toLowerCase();
        row.youtubeTracked = trackedYoutubeUsernames.has(lower);
        row.youtubePostCount = postCountByKey.get(`youtube:${lower}`) ?? null;
        row.youtubeFrozen = frozenByKey.get(`youtube:${lower}`) ?? false;
      }
      return row;
    });
  }, [managedData, trackedTiktokUsernames, trackedInstagramUsernames, trackedYoutubeUsernames, postCountByKey, frozenByKey]);

  const handleSocialHandleEdit = useCallback(
    (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => {
      const fieldMap = { tiktok: 'tiktok_username', instagram: 'instagram_username', youtube: 'youtube_username' } as const;
      const field = fieldMap[platform];
      updateCreatorCache(managedCreatorId, (item) => ({ ...item, [field]: handle }));
      sendBatchUpdate(managedCreatorId, { [field]: handle });
    },
    [updateCreatorCache, sendBatchUpdate]
  );

  const handleCountryChange = useCallback(
    (creatorId: string, country: string | null) => {
      updateCreatorCache(creatorId, (item) => ({ ...item, country }));
      sendBatchUpdate(creatorId, { country });
    },
    [updateCreatorCache, sendBatchUpdate]
  );

  const handleStatusChange = useCallback(
    (creatorId: string, newStatus: string) => {
      updateCreatorCache(creatorId, (item) => ({ ...item, status: newStatus }));

      // Directly update AG Grid row node — AG Grid's rowData prop change detection
      // doesn't always refresh custom cell renderers after portal-based interactions
      const rowNode = gridApiRef.current?.getRowNode(creatorId);
      if (rowNode?.data) {
        const statusLabel = STATUSES.find((s) => s.id === newStatus)?.label ?? newStatus;
        rowNode.setData({
          ...rowNode.data,
          status: newStatus,
          statusLabel,
          statusOrder: STATUS_ORDER[newStatus] ?? 0,
        });
      }

      sendBatchUpdate(creatorId, { status: newStatus });
    },
    [updateCreatorCache, sendBatchUpdate]
  );

  // --- Inline cell edit handler (name, base_pay, payment) ---
  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<PipelineGridData>) => {
      const { data, colDef, oldValue } = event;
      if (!data) return;

      const field = colDef.field as string;

      const fieldMap: Record<string, string> = {
        base_pay: 'base_pay',
        payment: 'payment',
      };

      const apiField = fieldMap[field];
      if (!apiField) return;

      // For currency fields, valueSetter already wrote cents into data
      const apiValue = data[field as keyof PipelineGridData];
      updateCreatorCache(data.id, (item) => ({ ...item, [apiField]: apiValue ?? null }));
      sendBatchUpdate(data.id, { [apiField]: apiValue ?? null });

      // Show cascade dialog when base_pay changes
      if (field === 'base_pay') {
        const oldCents = oldValue != null ? Math.round(oldValue * 100) : null;
        setCascadeCreatorIds([data.id]);
        setCascadeOldValues({ [data.id]: oldCents });
        setCascadeDialogOpen(true);
      }
    },
    [updateCreatorCache, sendBatchUpdate]
  );


  // --- Generate invite link for unlinked managed creator ---
  const handleInviteCreator = useCallback(
    async (managedCreatorId: string) => {
      try {
        const res = await fetch(`/api/admin/managed-creators/${managedCreatorId}/invite`, {
          method: 'POST',
        });
        if (!res.ok) {
          const data = await res.json();
          toast({ title: 'Invite failed', description: data.error || 'Could not generate invite link', variant: 'destructive' });
          return;
        }
        const data = await res.json();
        await navigator.clipboard.writeText(data.invite.url);
        toast({ title: 'Invite link copied' });
      } catch {
        toast({ title: 'Invite failed', description: 'Could not generate invite link', variant: 'destructive' });
      }
    },
    [toast]
  );


  const jobFilteredRows = useMemo(
    () => (jobFilter ? rows.filter((r) => r.jobId === jobFilter) : rows),
    [rows, jobFilter]
  );

  // Country filtering is now server-side — no client-side filter needed
  const countryFilteredRows = jobFilteredRows;

  // Cache available countries from unfiltered loads so the dropdown always shows all options
  const [cachedCountries, setCachedCountries] = useState<string[]>([]);

  useEffect(() => {
    if (!countryFilter && rows.length > 0) {
      const codes = new Set<string>();
      for (const r of rows) {
        if (r.countryCode) codes.add(r.countryCode);
      }
      setCachedCountries([...codes].sort());
    }
  }, [rows, countryFilter]);

  // If cache is empty but a filter is active (e.g., page loaded with ?country=BR),
  // show at least the active filter so the dropdown isn't empty
  const availableCountries = useMemo(
    () => cachedCountries.length > 0 ? cachedCountries : countryFilter ? [countryFilter] : [],
    [cachedCountries, countryFilter]
  );

  // Per-status totals come from the dedicated counts endpoint so the popover
  // stays accurate when the list is filtered to engaged statuses only.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUSES) {
      counts[s.label] = statusCountsData?.counts?.[s.id] ?? 0;
    }
    return counts;
  }, [statusCountsData]);

  const totalCreatorsCount = statusCountsData?.total ?? 0;

  const allStatusesSelected = statusFilter.size === STATUSES.length;

  const filteredRows = useMemo(
    () => (allStatusesSelected ? countryFilteredRows : countryFilteredRows.filter((r) => statusFilter.has(r.statusLabel))),
    [countryFilteredRows, statusFilter, allStatusesSelected]
  );

  const columnDefs = useMemo(() => createPipelineColumnDefs(), []);

  const handleVideoClick = useCallback((row: PipelineGridData) => {
    setPanelMode({ type: 'videos', row });
  }, []);

  const handlePostCountClick = useCallback((row: PipelineGridData) => {
    setPanelMode((prev) => (prev?.type === 'posts' && prev.row.id === row.id ? null : { type: 'posts', row }));
  }, []);

  const handleNotesClick = useCallback((row: PipelineGridData) => {
    setPanelMode({ type: 'notes', row });
  }, []);

  const handleNameClick = useCallback((id: string) => {
    setCreatorModalId(id);
  }, []);

  const handleJobClick = useCallback((row: PipelineGridData) => {
    setReassignModal({
      managedCreatorId: row.id,
      currentJobId: row.jobId,
      creatorName: row.name,
    });
  }, []);

  const gridContext: PipelineGridContext = useMemo(() => ({
    onStatusChange: handleStatusChange,
    onCountryChange: handleCountryChange,
    onInviteCreator: handleInviteCreator,
    onVideoClick: handleVideoClick,
    onNotesClick: handleNotesClick,
    onNameClick: handleNameClick,
    onPostCountClick: handlePostCountClick,
    onJobClick: handleJobClick,
    onSocialIconClick: handleSocialIconClick,
    onSocialHandleEdit: handleSocialHandleEdit,
  }), [handleStatusChange, handleCountryChange, handleInviteCreator, handleVideoClick, handleNotesClick, handleNameClick, handlePostCountClick, handleJobClick, handleSocialIconClick, handleSocialHandleEdit]);

  const getRowId = useCallback((params: { data: PipelineGridData }) => params.data.id, []);

  const onGridReady = useCallback((params: { api: GridApi<PipelineGridData> }) => {
    onGridReadyColumnState(params as never);
    setColVisibility(getColumnVisibility());
  }, [onGridReadyColumnState, getColumnVisibility]);


  const onSelectionChanged = useCallback((event: SelectionChangedEvent<PipelineGridData>) => {
    setSelectedRows(event.api.getSelectedRows());
  }, []);

  const clearSelection = useCallback(() => {
    gridApiRef.current?.deselectAll();
    setSelectedRows([]);
  }, []);

  // --- Bulk delete ---
  const handleBulkDeleteConfirm = useCallback(() => {
    if (actionRows.length === 0) return;

    const idsToDelete = new Set(actionRows.map((r) => r.id));

    // Optimistically remove rows from cache
    queryClient.setQueryData<ManagedCreatorsApiResponse>(
      cacheKey,
      (old) => {
        if (!old) return old;
        const filtered = old.data.filter((item) => !idsToDelete.has(item.id));
        return { ...old, data: filtered, total: filtered.length };
      }
    );

    // Close dialog and clear selection immediately
    setDeleteDialogOpen(false);
    setActionRows([]);
    clearSelection();

    // Fire DELETEs in background, then sync
    Promise.allSettled(
      actionRows.map((row) =>
        fetch(`/api/managed-creators/${row.id}`, {
          method: 'DELETE',
          headers: { 'x-admin-view-as-brand': brand.id },
        })
      ),
    ).then((results) => {
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        toast({ title: 'Delete failed', description: `${failures.length} of ${results.length} deletions failed`, variant: 'destructive' });
      }
    }).finally(() => invalidatePipelineData());
  }, [actionRows, brand.id, queryClient, cacheKey, invalidatePipelineData, clearSelection, toast]);

  // --- Bulk edit ---
  const handleBulkEditConfirm = useCallback(() => {
    if (!editField || editValue === '') return;
    if (actionRows.length === 0) return;

    const isBulkBasePay = editField === 'base_pay';

    let apiValue: unknown = editValue;

    if (isBulkBasePay) {
      const dollars = parseFloat(editValue);
      if (isNaN(dollars)) return;
      apiValue = Math.round(dollars * 100);
    }

    // Capture old base_pay values before overwriting
    const oldBasePayMap: Record<string, number | null> = {};
    if (isBulkBasePay) {
      for (const row of actionRows) {
        oldBasePayMap[row.id] = row.base_pay;
      }
    }

    const rowIds = actionRows.map((r) => r.id);
    const idsToUpdate = new Set(rowIds);

    // Optimistically update cache
    queryClient.setQueryData<ManagedCreatorsApiResponse>(
      cacheKey,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((item) =>
            idsToUpdate.has(item.id) ? { ...item, [editField]: apiValue } : item
          ),
        };
      }
    );

    // Close dialog and clear selection immediately
    setEditDialogOpen(false);
    setEditField('');
    setEditValue('');
    setActionRows([]);
    clearSelection();

    // Fire batch update in background
    fetch('/api/managed-creators/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-view-as-brand': brand.id,
      },
      body: JSON.stringify({
        updates: rowIds.map((id) => ({
          id,
          changes: { [editField]: apiValue },
        })),
        creates: [],
      }),
    })
      .then((res) => {
        if (!res.ok) {
          toast({ title: 'Bulk edit failed', description: 'Could not apply changes', variant: 'destructive' });
        } else if (isBulkBasePay) {
          setCascadeCreatorIds(rowIds);
          setCascadeOldValues(oldBasePayMap);
          setCascadeDialogOpen(true);
        }
      })
      .catch(() => {
        toast({ title: 'Bulk edit failed', description: 'Could not apply changes', variant: 'destructive' });
      })
      .finally(() => invalidatePipelineData());
  }, [editField, editValue, actionRows, brand.id, queryClient, cacheKey, invalidatePipelineData, clearSelection, toast]);

  const handleEditDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditField('');
      setEditValue('');
      setActionRows([]);
    }
    setEditDialogOpen(open);
  }, []);

  // --- Cascade pay dialog handlers ---
  const handleCascadeApply = useCallback(async () => {
    setCascadeLoading(true);
    try {
      const results = await Promise.allSettled(
        cascadeCreatorIds.map(async (id) => {
          const res = await fetch(`/api/admin/managed-creators/${id}/cascade-pay`, { method: 'POST' });
          if (!res.ok) throw new Error('Cascade failed');
          return res.json();
        })
      );
      const totalUpdated = results.reduce((sum, r) => {
        if (r.status === 'fulfilled' && r.value?.updated) return sum + r.value.updated;
        return sum;
      }, 0);
      const failures = results.filter((r) => r.status === 'rejected').length;
      if (failures > 0) {
        toast({ title: `Updated ${totalUpdated} posts, ${failures} failed`, variant: 'destructive' });
      } else {
        toast({ title: `Updated ${totalUpdated} post${totalUpdated !== 1 ? 's' : ''}` });
      }
      invalidatePipelineData();
    } catch {
      toast({ title: 'Failed to update posts', variant: 'destructive' });
    } finally {
      setCascadeLoading(false);
      setCascadeDialogOpen(false);
    }
  }, [cascadeCreatorIds, toast, invalidatePipelineData]);

  const handleCascadeUndo = useCallback(async () => {
    setCascadeLoading(true);
    try {
      await Promise.allSettled(
        cascadeCreatorIds.map((id) =>
          fetch('/api/managed-creators/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-view-as-brand': brand.id },
            body: JSON.stringify({
              updates: [{ id, changes: { base_pay: cascadeOldValues[id] ?? 0 } }],
              creates: [],
            }),
          })
        )
      );
      // Revert cache
      for (const id of cascadeCreatorIds) {
        updateCreatorCache(id, (item) => ({ ...item, base_pay: cascadeOldValues[id] ?? item.base_pay }));
      }
      toast({ title: 'Base pay reverted' });
      invalidatePipelineData();
    } catch {
      toast({ title: 'Failed to undo', variant: 'destructive' });
    } finally {
      setCascadeLoading(false);
      setCascadeDialogOpen(false);
    }
  }, [cascadeCreatorIds, cascadeOldValues, brand.id, updateCreatorCache, toast, invalidatePipelineData]);

  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setActionRows([]);
    }
    setDeleteDialogOpen(open);
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelMode(null);
  }, []);

  // Highlight selected row
  const getRowClass = useCallback(
    (params: { data: PipelineGridData | undefined }) => {
      if (!params.data) return '';
      if (params.data.id === selectedRowId) return 'ag-row-selected-detail';
      return '';
    },
    [selectedRowId]
  );

  // Resize handle — self-contained: attaches listeners on mousedown, cleans up on mouseup
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggedRef.current = false;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      draggedRef.current = true;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const newWidth = containerRect.right - ev.clientX;
      const minWidth = 320;
      const maxWidth = containerRect.width - 300;
      setDetailPanelWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!draggedRef.current) {
        setPanelMode(null);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Set initial panel width on first open
  useEffect(() => {
    if (panelMode && detailPanelWidth === null && containerRef.current) {
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const initialWidth = Math.floor(containerWidth * 0.32);
      setDetailPanelWidth(Math.max(320, Math.min(initialWidth, containerWidth - 300)));
    }
  }, [panelMode, detailPanelWidth]);

  // Redraw only the affected rows when selection changes (for highlighting)
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;

    const rowNodes: NonNullable<ReturnType<typeof api.getRowNode>>[] = [];
    if (prevSelectedIdRef.current) {
      const prev = api.getRowNode(prevSelectedIdRef.current);
      if (prev) rowNodes.push(prev);
    }
    if (selectedRowId) {
      const curr = api.getRowNode(selectedRowId);
      if (curr) rowNodes.push(curr);
    }
    if (rowNodes.length > 0) {
      api.redrawRows({ rowNodes });
    }
    prevSelectedIdRef.current = selectedRowId;
  }, [selectedRowId]);

  const trackedAccountCount = extendedDetails?.tracked_accounts?.length ?? 0;
  const campaignPostCount = useMemo(
    () => extendedDetails?.tracked_accounts?.reduce((sum, account) => sum + (account.post_count ?? 0), 0) ?? 0,
    [extendedDetails?.tracked_accounts],
  );

  const showSplitView = panelMode !== null && panelMode.type !== 'posts';
  const showBottomPanel = panelMode?.type === 'posts';

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* Filter bar + pipeline status counts */}
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0">
        {/* Tracked accounts & posts */}
        <div className="flex items-center gap-3 mr-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-100 dark:bg-emerald-950/40">
              <Globe className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            </span>
            <span className="font-medium tabular-nums">{trackedAccountCount}</span>
            <span className="text-muted-foreground">tracked accounts</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sky-100 dark:bg-sky-950/40">
              <span className="text-sky-600 dark:text-sky-400 text-[10px] font-bold">P</span>
            </span>
            <span className="font-medium tabular-nums">{campaignPostCount}</span>
            <span className="text-muted-foreground">posts</span>
          </div>
        </div>

        <div className="h-5 w-px bg-border mx-1" />
        <div className="relative flex-shrink-0" style={{ width: 200 }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter creators..."
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {brandJobs.length > 0 && (
          <Select
            value={jobFilter ?? ''}
            onChange={(e) => setJobFilter(e.target.value || null)}
            className="h-8 w-[170px] flex-shrink-0 text-sm"
          >
            <option value="">All Jobs</option>
            {brandJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.job_title}
              </option>
            ))}
          </Select>
        )}

        {(availableCountries.length > 1 || countryFilter != null) && (
          <Select
            value={countryFilter ?? ''}
            onChange={(e) => setCountryFilter(e.target.value || null)}
            className="h-8 w-[120px] flex-shrink-0 text-sm"
          >
            <option value="">All Countries</option>
            {availableCountries.map((code) => (
              <option key={code} value={code}>
                {getCountryName(code) || code}
              </option>
            ))}
          </Select>
        )}

        {!isLoading && (
          <>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {allStatusesSelected ? (
                  <>
                    <span>All Statuses</span>
                    <span className="tabular-nums font-semibold text-muted-foreground">{totalCreatorsCount}</span>
                  </>
                ) : statusFilter.size === 1 ? (
                  (() => {
                    const label = [...statusFilter][0];
                    const cfg = STATUS_CONFIG[label];
                    return (
                      <>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-400'}`} />
                        <span className={cfg?.text}>{label}</span>
                        <span className="tabular-nums font-semibold text-muted-foreground">{statusCounts[label] ?? 0}</span>
                      </>
                    );
                  })()
                ) : statusFilter.size === 0 ? (
                  <span className="text-muted-foreground">No Statuses</span>
                ) : (
                  <>
                    <span>{statusFilter.size} Statuses</span>
                    <span className="tabular-nums font-semibold text-muted-foreground">{filteredRows.length}</span>
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[240px] p-1">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs cursor-pointer hover:bg-accent">
                <input
                  type="checkbox"
                  checked={allStatusesSelected}
                  onChange={(e) => setStatusFilter(e.target.checked ? new Set(ALL_STATUS_LABELS) : new Set())}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="font-medium">All Statuses</span>
                <span className="ml-auto tabular-nums font-semibold text-muted-foreground">{totalCreatorsCount}</span>
              </label>
              <div className="h-px bg-border my-1" />
              {STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s.label];
                const isChecked = statusFilter.has(s.label);
                return (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs cursor-pointer hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setStatusFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.label)) {
                            next.delete(s.label);
                          } else {
                            next.add(s.label);
                          }
                          return next;
                        });
                      }}
                      className="accent-primary h-3.5 w-3.5"
                    />
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-400'}`} />
                    <span className={cfg?.text}>{s.label}</span>
                    <span className="ml-auto tabular-nums font-semibold text-muted-foreground">{statusCounts[s.label] ?? 0}</span>
                  </label>
                );
              })}
            </PopoverContent>
          </Popover>

          </>
        )}

        {/* Column visibility toggle */}
        <Popover open={colMenuOpen} onOpenChange={(open) => {
          if (open) setColVisibility(getColumnVisibility());
          setColMenuOpen(open);
        }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Toggle columns"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-2 space-y-0.5">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-semibold text-muted-foreground">Columns</span>
              <button
                type="button"
                onClick={() => {
                  resetColumnState();
                  setColVisibility(getColumnVisibility());
                }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
            {colVisibility
              .filter((col) => col.colId !== 'ag-Grid-SelectionColumn')
              .map((col) => (
              <label key={col.colId} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => {
                    toggleColumnVisibility(col.colId);
                    setColVisibility(getColumnVisibility());
                  }}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="text-xs">{col.headerName}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Selection toolbar */}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums font-medium">
              {selectedRows.length} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => { setActionRows(selectedRows); setEditDialogOpen(true); }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => { setActionRows(selectedRows); setDeleteDialogOpen(true); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPanelMode((prev) => prev?.type === 'add' ? null : { type: 'add', tab: 'create' })}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors ${
            panelMode?.type === 'add'
              ? 'bg-blue-700 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {/* Main content: Grid + optional detail panel */}
      <div className={`flex min-h-0 overflow-hidden ${showBottomPanel ? '' : 'flex-1'}`} style={showBottomPanel ? { height: `calc(100% - ${bottomPanelHeight}px)` } : undefined}>
        {/* Grid section */}
        <div className="flex-1 min-w-0">
          <LazyAgGrid<PipelineGridData>
            theme={appAgGridTheme}
            columnDefs={columnDefs}
            defaultColDef={defaultPipelineColDef}
            rowData={isLoading ? undefined : filteredRows}
            components={CELL_RENDERERS}
            context={gridContext}
            containerStyle={{ height: '100%', minHeight: '400px' }}
            quickFilterText={quickFilter}
            rowClassRules={ROW_CLASS_RULES}
            getRowStyle={getRowStyle}
            getRowId={getRowId}
            getRowClass={getRowClass}
            onGridReady={onGridReady}
            onCellValueChanged={onCellValueChanged}
            onSelectionChanged={onSelectionChanged}
            onColumnResized={onColumnChanged}
            onColumnMoved={onColumnChanged}
            onColumnVisible={onColumnChanged}
            rowSelection={ROW_SELECTION}
            selectionColumnDef={SELECTION_COLUMN_DEF}
            animateRows={false}
          />
        </div>

        {/* Detail Panel (split view) */}
        {showSplitView && (
          <div
            className="flex-shrink-0 border-l overflow-hidden bg-background flex"
            style={{ width: detailPanelWidth ? `${detailPanelWidth}px` : '32%' }}
          >
            {/* Resize Handle */}
            <div
              className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors flex-shrink-0"
              onMouseDown={handleResizeMouseDown}
            />

            {/* Panel Content */}
            {panelMode?.type === 'videos' ? (
              <CreatorVideosPanel
                row={panelMode.row}
                onClose={handleClosePanel}
                onStatusChange={handleStatusChange}
                onRefresh={invalidatePipelineData}
              />
            ) : panelMode?.type === 'add' ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b px-4 flex-shrink-0">
                  {([
                    { id: 'create' as const, label: 'Create' },
                    { id: 'existing' as const, label: 'Add Existing' },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPanelMode({ type: 'add', tab: tab.id })}
                      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                        panelMode.tab === tab.id
                          ? 'border-primary text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {panelMode.tab === 'create' && (
                    <CreateCreatorPanel
                      brandId={brand.id}
                      brandJobs={brandJobs}
                      onClose={handleClosePanel}
                      onSuccess={invalidatePipelineData}
                    />
                  )}
                  {panelMode.tab === 'existing' && (
                    <AddExistingCreatorPanel
                      brandId={brand.id}
                      brandJobs={brandJobs}
                      onSuccess={invalidatePipelineData}
                    />
                  )}
                </div>
              </div>
            ) : panelMode?.type === 'notes' ? (
              <CreatorNotesPanel
                key={panelMode.row.id}
                row={panelMode.row}
                onClose={handleClosePanel}
                onSave={(id, notes) => {
                  updateCreatorCache(id, (item) => ({ ...item, notes }));
                  sendBatchUpdate(id, { notes });
                }}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Bottom panel for posts */}
      {showBottomPanel && panelMode?.type === 'posts' && (
        <div className="flex-shrink-0 border-t relative" style={{ height: bottomPanelHeight }}>
          {/* Resize handle */}
          <div
            className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              const startY = e.clientY;
              const startHeight = bottomPanelHeight;
              const onMove = (ev: MouseEvent) => {
                const delta = startY - ev.clientY;
                const newHeight = Math.max(180, Math.min(startHeight + delta, window.innerHeight * 0.6));
                setBottomPanelHeight(newHeight);
              };
              const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
              };
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          />
          <CreatorPostsPanel
            row={panelMode.row}
            onClose={handleClosePanel}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {actionRows.length} creator{actionRows.length !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected managed creators. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={handleEditDialogOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Bulk Edit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Field</label>
              <Select
                value={editField}
                onChange={(e) => {
                  setEditField(e.target.value as BulkEditField | '');
                  setEditValue('');
                }}
              >
                <option value="">Select field...</option>
                {BULK_EDIT_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </div>
            {editField === 'status' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Value</label>
                <Select value={editValue} onChange={(e) => setEditValue(e.target.value)}>
                  <option value="">Select status...</option>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </Select>
              </div>
            )}
            {editField === 'base_pay' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Value</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Amount in dollars (e.g. 150.00)"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
            )}
            {editField === 'country' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Value</label>
                <Select value={editValue} onChange={(e) => setEditValue(e.target.value)}>
                  <option value="">Select country...</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </Select>
              </div>
            )}
            {(editField === 'sourced' || editField === 'location') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Value</label>
                <Input
                  type="text"
                  placeholder={editField === 'sourced' ? 'e.g. TikTok, Referral' : 'e.g. New York, US'}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Apply to {actionRows.length} creator{actionRows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleEditDialogOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkEditConfirm}
              disabled={!editField || editValue === ''}
            >
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Social account profile modal */}
      <SocialAccountProfileModal
        open={socialModalOpen}
        onOpenChange={setSocialModalOpen}
        platform={socialModalPlatform}
        username={socialModalUsername}
        isTracked={socialModalIsTracked}
        isFrozen={socialModalIsFrozen}
        brandId={brand.id}
        trackedAccountId={socialModalAccountId}
        onTrackingChanged={handleTrackingChanged}
        onFreezeChanged={handleFreezeChanged}
        managedCreatorId={socialModalCreatorId}
        onHandleDeleted={handleHandleDeleted}
      />

      {/* Cascade pay config to posts dialog */}
      <Dialog open={cascadeDialogOpen} onOpenChange={setCascadeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update existing posts?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apply the new pay config to all existing posts for {cascadeCreatorIds.length === 1 ? 'this creator' : `these ${cascadeCreatorIds.length} creators`} and recalculate payments.
          </p>
          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button
              variant="ghost"
              onClick={handleCascadeUndo}
              disabled={cascadeLoading}
            >
              {cascadeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Undo change
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setCascadeDialogOpen(false)}
                disabled={cascadeLoading}
              >
                Skip
              </Button>
              <Button
                onClick={handleCascadeApply}
                disabled={cascadeLoading}
              >
                {cascadeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatorDetailModal
        managedCreatorId={creatorModalId ?? undefined}
        defaultBrandId={brand.id}
        open={!!creatorModalId}
        onOpenChange={(open) => { if (!open) setCreatorModalId(null); }}
      />

      <ReassignJobModal
        open={reassignModal !== null}
        onOpenChange={(open) => { if (!open) setReassignModal(null); }}
        managedCreatorId={reassignModal?.managedCreatorId ?? null}
        brandOrganizationId={brand.id}
        currentJobId={reassignModal?.currentJobId ?? null}
        creatorName={reassignModal?.creatorName ?? null}
        onSuccess={invalidatePipelineData}
      />
    </div>
  );
}
