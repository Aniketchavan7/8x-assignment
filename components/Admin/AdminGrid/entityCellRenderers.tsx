'use client';

/**
 * Entity Cell Renderers for Admin AG Grid Tables
 *
 * Cell renderers for creators and brands tables.
 * Provides consistent rendering across all admin entity grids.
 */

import { Link } from '@/i18n/routing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail,
  MapPin,
  Star,
  Briefcase,
  Video,
  Building2,
  Users,
  Eye,
  BarChart3,
  Lock,
} from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { AdminCreatorGridData } from './creatorColumnDefs';
import type { AdminBrandGridData } from './brandColumnDefs';
import type { AdminManagedCreatorGridData } from './managedCreatorColumnDefs';
import { MANAGED_CREATOR_STATUS_LABELS } from '@/lib/modules/managed-creators/constants';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { getCountryName } from '@/components/Admin/BrandDetail/shared';

// ============================================================================
// SHARED RENDERERS
// ============================================================================

/**
 * Email Cell Renderer - shows email with mail icon
 */
export function AdminEmailCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (!value) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex items-center gap-1.5 h-full">
      <Mail className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{value}</span>
    </div>
  );
}

/**
 * Status Badge Cell Renderer - shows account status as badge
 */
export function AdminStatusBadgeCellRenderer(props: CustomCellRendererProps) {
  const status = props.value;
  return (
    <div className="flex items-center h-full">
      <Badge variant={status === 'active' ? 'default' : 'secondary'}>{status || 'N/A'}</Badge>
    </div>
  );
}

/**
 * Onboarding Badge Cell Renderer - shows onboarding status
 */
export function AdminOnboardingBadgeCellRenderer(props: CustomCellRendererProps) {
  const status = props.value;
  return (
    <div className="flex items-center h-full">
      <Badge variant="outline" className="text-xs">
        {status?.replace(/_/g, ' ') || 'N/A'}
      </Badge>
    </div>
  );
}

/**
 * Location Cell Renderer - shows location with map pin
 */
export function AdminLocationCellRenderer(props: CustomCellRendererProps) {
  const location = props.value;
  if (!location) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex items-center gap-1.5 h-full">
      <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{location}</span>
    </div>
  );
}

/**
 * Has Video Cell Renderer - shows video badge if has video
 */
export function AdminHasVideoCellRenderer(props: CustomCellRendererProps) {
  const hasVideo = !!props.value;

  return (
    <div className="flex items-center justify-center h-full">
      {hasVideo ? (
        <Badge variant="default" className="bg-blue-500 text-xs">
          <Video className="h-3 w-3 mr-1" />
          Yes
        </Badge>
      ) : (
        <Badge variant="outline" className="text-xs">
          No
        </Badge>
      )}
    </div>
  );
}

/**
 * ID Cell Renderer - shows truncated ID
 */
export function AdminIdCellRenderer(props: CustomCellRendererProps) {
  const id = props.value;
  if (!id) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex items-center h-full">
      <span className="text-xs text-muted-foreground font-mono truncate" title={id}>
        {id.slice(0, 8)}...
      </span>
    </div>
  );
}

// ============================================================================
// CREATOR RENDERERS
// ============================================================================

/**
 * Creator Cell Renderer - shows avatar and name
 */
export function AdminCreatorCellRenderer(
  props: CustomCellRendererProps<AdminCreatorGridData> & {
    onViewDetails?: (creator: AdminCreatorGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2.5 h-full">
      <Avatar className="h-8 w-8 flex-shrink-0">
        {data.profile_picture && <AvatarImage src={data.profile_picture} alt={data.display_name} />}
        <AvatarFallback className="text-xs">{data.display_name?.[0] || '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <button
          type="button"
          className="block w-full font-medium text-sm truncate hover:underline cursor-pointer text-left"
          onClick={() => props.onViewDetails?.(data)}
        >
          {data.display_name}
        </button>
        {data.email && <p className="text-xs text-muted-foreground truncate">{data.email}</p>}
      </div>
    </div>
  );
}

/**
 * Jobs Count Cell Renderer - shows job count with icon
 */
export function AdminJobsCountCellRenderer(props: CustomCellRendererProps) {
  const count = props.value ?? 0;

  return (
    <div className="flex items-center justify-center gap-1 h-full">
      <Briefcase className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{count}</span>
    </div>
  );
}

/**
 * Rating Cell Renderer - shows star rating
 */
export function AdminRatingCellRenderer(props: CustomCellRendererProps) {
  const rating = props.value;

  if (rating === null || rating === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center justify-center gap-1 h-full">
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      <span className="text-sm">{Number(rating).toFixed(1)}</span>
    </div>
  );
}

const MC_STATUS_COLORS: Record<string, string> = {
  active: 'text-green-600 dark:text-green-400',
  ghosted: 'text-amber-600 dark:text-amber-400',
  unclear: 'text-amber-600 dark:text-amber-400',
  warming_up: 'text-blue-600 dark:text-blue-400',
  accepted: 'text-blue-600 dark:text-blue-400',
  test_videos_submitted: 'text-muted-foreground',
  applied: 'text-muted-foreground',
  dropped: 'text-red-600 dark:text-red-400',
};

export function AdminCampaignProgressCellRenderer(
  props: CustomCellRendererProps<AdminCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;

  if (!data.best_mc_status) {
    return <span className="text-muted-foreground text-sm">No campaigns</span>;
  }

  const label =
    MANAGED_CREATOR_STATUS_LABELS[data.best_mc_status as keyof typeof MANAGED_CREATOR_STATUS_LABELS] ||
    data.best_mc_status;
  const colorClass = MC_STATUS_COLORS[data.best_mc_status] || 'text-muted-foreground';

  return (
    <div className="flex items-center gap-1 h-full">
      <span className={`text-sm font-medium ${colorClass}`}>{label}</span>
      {data.mc_brand_count > 1 && (
        <span className="text-xs text-muted-foreground">({data.mc_brand_count} brands)</span>
      )}
    </div>
  );
}

export function AdminTotalOwedCellRenderer(
  props: CustomCellRendererProps<AdminCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;

  if (data.total_owed_cents == null || data.total_owed_cents === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const formatted = formatCurrencyAmount(data.total_owed_cents);

  return (
    <div className="flex items-center h-full">
      <span className="text-sm">{formatted}</span>
    </div>
  );
}

export function AdminCreatorCountryCellRenderer(
  props: CustomCellRendererProps<AdminCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center h-full">
      <span className="text-sm text-muted-foreground truncate">
        {data.country || '—'}
      </span>
    </div>
  );
}

// ============================================================================
// BRAND RENDERERS
// ============================================================================

/**
 * Brand Name Cell Renderer - shows logo and name
 */
export function AdminBrandNameCellRenderer(props: CustomCellRendererProps<AdminBrandGridData>) {
  const data = props.data;
  if (!data) return null;

  const locked = data.accessible === false;

  return (
    <div className="flex items-center gap-2.5 h-full">
      <Avatar className="h-8 w-8 flex-shrink-0">
        {data.company_logo && <AvatarImage src={data.company_logo} alt={data.organization_name} />}
        <AvatarFallback className="text-xs">
          <Building2 className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium text-sm truncate flex items-center gap-1.5">
          {locked && (
            <Lock
              className="h-3 w-3 text-muted-foreground flex-shrink-0"
              aria-label="No access"
            />
          )}
          <span className="truncate">{data.organization_name}</span>
        </p>
        <p className="text-xs text-muted-foreground truncate">@{data.organization_slug}</p>
      </div>
    </div>
  );
}

/**
 * Member Count Cell Renderer
 */
export function AdminMemberCountCellRenderer(props: CustomCellRendererProps) {
  const count = props.value ?? 0;

  return (
    <div className="flex items-center justify-center gap-1 h-full">
      <Users className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{count}</span>
    </div>
  );
}

/**
 * Tracked Accounts Count Cell Renderer
 */
export function AdminTrackedAccountsCountCellRenderer(props: CustomCellRendererProps) {
  const count = props.value ?? 0;

  return (
    <div className="flex items-center justify-center gap-1 h-full">
      <BarChart3 className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{count}</span>
    </div>
  );
}

function formatSI(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toString();
}

/**
 * Views Count Cell Renderer - formats large numbers with SI suffixes (K, M, B)
 */
export function AdminViewsCountCellRenderer(props: CustomCellRendererProps) {
  const count = props.value ?? 0;

  return (
    <div className="flex items-center justify-center gap-1 h-full">
      <Eye className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm" title={count.toLocaleString()}>{formatSI(count)}</span>
    </div>
  );
}

/**
 * 8x Managed Cell Renderer - shows toggle switch
 * Uses both cellRendererParams.onToggle and context.onToggleEightXManaged for reliability
 */
export function AdminEightXManagedCellRenderer(
  props: CustomCellRendererProps<AdminBrandGridData> & {
    onToggle?: (brand: AdminBrandGridData) => void;
    context?: {
      onToggleEightXManaged?: (brand: AdminBrandGridData) => void;
    };
  }
) {
  const data = props.data;
  if (!data) return null;

  const isManaged = data.eight_x_managed;

  // Use context callback (more reliable) or fall back to cellRendererParams
  const onToggle = props.context?.onToggleEightXManaged || props.onToggle;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onToggle) {
      onToggle(data);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        role="switch"
        aria-checked={isManaged}
        onClick={handleClick}
        className={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
          border-2 border-transparent transition-colors focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          ${isManaged ? 'bg-primary' : 'bg-muted'}
        `}
        title={isManaged ? 'Disable 8x management' : 'Enable 8x management'}
      >
        <span
          className={`
            pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0
            transition-transform duration-200
            ${isManaged ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

/**
 * Brand Actions Cell Renderer - Eye icon button to view as brand
 */
export function AdminBrandActionsCellRenderer(
  props: CustomCellRendererProps<AdminBrandGridData>
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        asChild
        title="View as Brand"
      >
        <Link
          href={`/admin/view-as/brand/${data.id}/dashboard/analytics`}
          onClick={(e) => e.stopPropagation()}
        >
          <Eye className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

/**
 * Budget Cell Renderer - shows budget in brand's currency
 */
export function AdminBudgetCellRenderer(props: CustomCellRendererProps<AdminBrandGridData>) {
  const data = props.data;
  const value = props.value as number | null;

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  // Get currency symbol based on brand's currency
  const currency = data?.currency?.toUpperCase() || 'USD';
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  return (
    <div className="flex items-center h-full">
      <span className="text-sm font-medium">
        {currencySymbol}
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * Notes Cell Renderer - shows truncated admin notes
 */
export function AdminNotesCellRenderer(props: CustomCellRendererProps<AdminBrandGridData>) {
  const value = props.value as string | null;

  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center h-full">
      <span className="text-sm text-muted-foreground truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

// ============================================================================
// MANAGED CREATOR RENDERERS
// ============================================================================

function formatViews(views: number | null): string {
  if (views == null || views === 0) return '0';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return views.toLocaleString();
}

export function AdminManagedCreatorNameCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData> & {
    onClick?: (data: AdminManagedCreatorGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  return (
    <button
      onClick={() => props.onClick?.(data)}
      className="flex items-center gap-2.5 h-full text-left hover:underline cursor-pointer"
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="text-xs">{data.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{data.name}</p>
        {data.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{data.location}</span>
          </p>
        )}
      </div>
    </button>
  );
}

export function AdminAvgViewsCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;
  return (
    <div className="flex items-center h-full text-sm font-medium">
      {formatViews(data.overall_avg_views)}
    </div>
  );
}

export function AdminPlatformAvgViewsCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData> & {
    platform: 'tiktok' | 'instagram' | 'youtube';
  }
) {
  const data = props.data;
  if (!data) return null;
  const connected = data[`${props.platform}_connected` as keyof AdminManagedCreatorGridData] as boolean;
  if (!connected) return null;
  const views = data[`${props.platform}_avg_views` as keyof AdminManagedCreatorGridData] as number | null;
  return (
    <div className="flex items-center h-full text-sm">
      {formatViews(views)}
    </div>
  );
}

export function AdminPlatformPostCountCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData> & {
    platform: 'tiktok' | 'instagram' | 'youtube';
  }
) {
  const data = props.data;
  if (!data) return null;
  const connected = data[`${props.platform}_connected` as keyof AdminManagedCreatorGridData] as boolean;
  if (!connected) return null;
  const count = (data[`${props.platform}_post_count` as keyof AdminManagedCreatorGridData] as number | null) ?? 0;

  const counts: number[] = [];
  if (data.tiktok_connected && data.tiktok_post_count != null) counts.push(data.tiktok_post_count);
  if (data.instagram_connected && data.instagram_post_count != null) counts.push(data.instagram_post_count);
  if (data.youtube_connected && data.youtube_post_count != null) counts.push(data.youtube_post_count);
  const maxCount = Math.max(...counts, 0);
  const isLow = counts.length > 1 && count < maxCount;

  return (
    <div className={`flex items-center h-full text-sm ${isLow ? 'text-red-600 font-medium' : ''}`}>
      {count}
    </div>
  );
}

export function AdminSparkCodesCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;
  return (
    <div className="flex items-center h-full text-sm">
      {data.spark_code_count != null ? data.spark_code_count : '—'}
    </div>
  );
}

export function AdminDaysSincePostCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data || !data.last_posted_at) return <div className="flex items-center h-full text-sm text-muted-foreground">—</div>;
  const days = Math.floor((Date.now() - new Date(data.last_posted_at).getTime()) / (1000 * 60 * 60 * 24));
  return (
    <div className={`flex items-center h-full text-sm ${days > 7 ? 'text-red-600 font-medium' : ''}`}>
      {days === 0 ? 'Today' : `${days}d`}
    </div>
  );
}

export function AdminBasePayCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data || data.base_pay == null) return null;
  const dollars = Number(data.base_pay) / 100;
  return (
    <div className="flex items-center h-full text-sm">
      ${dollars.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </div>
  );
}

export function AdminOutstandingCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData> & {
    onClick?: (data: AdminManagedCreatorGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;
  const dollars = (data.outstanding_cents ?? 0) / 100;
  if (dollars === 0) {
    return <div className="flex items-center h-full text-sm text-muted-foreground">—</div>;
  }
  return (
    <button
      onClick={() => props.onClick?.(data)}
      className="flex items-center h-full text-sm font-medium text-blue-600 hover:underline cursor-pointer"
    >
      ${dollars.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </button>
  );
}

/**
 * Managed Creator Brand Cell Renderer - shows which brand owns this creator
 */
export function AdminManagedCreatorBrandCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data || !data.brand_name) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-2 h-full">
      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{data.brand_name}</span>
    </div>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  applied:                { bg: 'bg-blue-50 dark:bg-blue-950/40',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-400' },
  test_videos_submitted:  { bg: 'bg-indigo-50 dark:bg-indigo-950/40',  text: 'text-indigo-700 dark:text-indigo-300',  dot: 'bg-indigo-400' },
  accepted:               { bg: 'bg-violet-50 dark:bg-violet-950/40',  text: 'text-violet-700 dark:text-violet-300',  dot: 'bg-violet-400' },
  warming_up:             { bg: 'bg-amber-50 dark:bg-amber-950/40',    text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-400' },
  active:                 { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-400' },
  ghosted:                { bg: 'bg-gray-50 dark:bg-gray-950/40',      text: 'text-gray-700 dark:text-gray-300',      dot: 'bg-gray-400' },
  dropped:                { bg: 'bg-red-50 dark:bg-red-950/40',        text: 'text-red-700 dark:text-red-300',        dot: 'bg-red-400' },
  unclear:                { bg: 'bg-rose-50 dark:bg-rose-950/40',      text: 'text-rose-700 dark:text-rose-300',      dot: 'bg-rose-400' },
};

const STATUS_DISPLAY: Record<string, string> = MANAGED_CREATOR_STATUS_LABELS;

/**
 * Managed Creator Status Cell Renderer — colored pill matching pipeline style
 */
export function AdminManagedCreatorStatusCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;

  const status = data.status || '';
  const colors = STATUS_COLORS[status];
  const label = STATUS_DISPLAY[status] || status || 'N/A';

  if (!colors) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {label}
    </span>
  );
}

export function AdminCountryCellRenderer(
  props: CustomCellRendererProps<AdminManagedCreatorGridData>
) {
  const data = props.data;
  if (!data) return null;
  return (
    <span className="text-xs text-muted-foreground truncate">
      {data.country ? getCountryName(data.country) : '—'}
    </span>
  );
}

