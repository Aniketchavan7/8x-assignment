'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  ExternalLink,
  Eye,
  Check,
  X,
  RefreshCw,
  Video,
  DollarSign,
  TrendingUp,
  Wallet,
  Play,
  Loader2,
} from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { AdminCpmCampaignGridData, AdminCpmSubmissionGridData } from './cpmColumnDefs';
import { formatCurrencyAmount } from '@/lib/utils/currency';

export function AdminCurrencyCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center h-full">
      <span className="text-sm font-medium">{formatCurrencyAmount(value, 'USD')}</span>
    </div>
  );
}

export function AdminViewsCellRenderer(props: CustomCellRendererProps) {
  const value = props.value ?? 0;

  const formatViews = (views: number): string => {
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M`;
    }
    if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}K`;
    }
    return views.toString();
  };

  return (
    <div className="flex items-center gap-1 h-full">
      <Eye className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{formatViews(value)}</span>
    </div>
  );
}

export function AdminCountCellRenderer(props: CustomCellRendererProps) {
  const value = props.value ?? 0;
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function AdminDateCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (!value) return <span className="text-muted-foreground">—</span>;

  const date = new Date(value);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex items-center h-full">
      <span className="text-sm text-muted-foreground">{formatted}</span>
    </div>
  );
}

export function AdminCpmCampaignNameCellRenderer(
  props: CustomCellRendererProps<AdminCpmCampaignGridData>
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2 h-full">
      <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10 flex-shrink-0">
        <TrendingUp className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{data.job_title}</p>
        <p className="text-xs text-muted-foreground truncate">{data.job_slug}</p>
      </div>
    </div>
  );
}

export function AdminCpmBrandCellRenderer(props: CustomCellRendererProps<AdminCpmCampaignGridData>) {
  const data = props.data;
  if (!data || !data.brand_name) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-2 h-full">
      <Avatar className="h-6 w-6 flex-shrink-0">
        {data.brand_logo && <AvatarImage src={data.brand_logo} alt={data.brand_name} />}
        <AvatarFallback className="text-xs">{data.brand_name[0]}</AvatarFallback>
      </Avatar>
      <span className="text-sm truncate">{data.brand_name}</span>
    </div>
  );
}

export function AdminCpmCampaignStatusCellRenderer(
  props: CustomCellRendererProps<AdminCpmCampaignGridData>
) {
  const status = props.value;

  const getStatusVariant = (
    s: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (s) {
      case 'open':
      case 'in_progress':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'draft':
        return 'outline';
      case 'closed':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="flex items-center h-full">
      <Badge variant={getStatusVariant(status)} className="text-xs">
        {status?.replace(/_/g, ' ') || 'N/A'}
      </Badge>
    </div>
  );
}

export function AdminCpmRateCellRenderer(props: CustomCellRendererProps) {
  const value = props.value ?? 0;

  return (
    <div className="flex items-center gap-1 h-full">
      <DollarSign className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm font-medium">{value.toFixed(2)}</span>
      <span className="text-xs text-muted-foreground">/1K</span>
    </div>
  );
}

export function AdminCpmPlatformsCellRenderer(props: CustomCellRendererProps) {
  const platforms = props.value as string[] | null;
  if (!platforms || platforms.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1 h-full">
      {platforms.map((p) => (
        <Badge key={p} variant="outline" className="text-xs capitalize">
          {p}
        </Badge>
      ))}
    </div>
  );
}

export function AdminCpmSubmissionCountCellRenderer(
  props: CustomCellRendererProps<AdminCpmCampaignGridData>
) {
  const data = props.data;
  if (!data) return null;

  const total = data.total_submissions;
  const pending = data.pending_submissions;

  return (
    <div className="flex items-center gap-2 h-full">
      <span className="text-sm">{total}</span>
      {pending > 0 && (
        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
          {pending} pending
        </Badge>
      )}
    </div>
  );
}

export function AdminCpmCampaignActionsCellRenderer(
  props: CustomCellRendererProps<AdminCpmCampaignGridData> & {
    onViewDetails?: (campaign: AdminCpmCampaignGridData) => void;
    onViewSubmissions?: (campaign: AdminCpmCampaignGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center justify-center h-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              props.onViewDetails?.(data);
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              props.onViewSubmissions?.(data);
            }}
          >
            <Video className="h-4 w-4 mr-2" />
            View Submissions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/job/${data.job_slug}`} target="_blank">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Job Page
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AdminCpmCreatorCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData>
) {
  const data = props.data;
  if (!data) return null;

  return (
    <div className="flex items-center gap-2 h-full">
      <Avatar className="h-8 w-8 flex-shrink-0">
        {data.creator_profile_picture && (
          <AvatarImage src={data.creator_profile_picture} alt={data.creator_name} />
        )}
        <AvatarFallback className="text-xs">{data.creator_name?.[0] || '?'}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{data.creator_name}</p>
        {data.creator_email && (
          <p className="text-xs text-muted-foreground truncate">{data.creator_email}</p>
        )}
      </div>
    </div>
  );
}

export function AdminCpmSubmissionStatusCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData>
) {
  const status = props.value;

  const getStatusConfig = (
    s: string
  ): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string } => {
    switch (s) {
      case 'pending_approval':
        return { variant: 'secondary', label: 'Pending' };
      case 'approved':
        return { variant: 'default', label: 'Approved' };
      case 'tracking':
        return { variant: 'default', label: 'Tracking' };
      case 'completed':
        return { variant: 'outline', label: 'Completed' };
      case 'rejected':
        return { variant: 'destructive', label: 'Rejected' };
      case 'paid':
        return { variant: 'outline', label: 'Paid' };
      default:
        return { variant: 'outline', label: status || 'Unknown' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div className="flex items-center h-full">
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    </div>
  );
}

export function AdminCpmPlatformBadgeCellRenderer(props: CustomCellRendererProps) {
  const platform = props.value;
  if (!platform) return <span className="text-muted-foreground">—</span>;

  const getColor = (p: string) => {
    switch (p.toLowerCase()) {
      case 'tiktok':
        return 'bg-black text-white';
      case 'instagram':
        return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
      default:
        return '';
    }
  };

  return (
    <div className="flex items-center h-full">
      <Badge className={`text-xs capitalize ${getColor(platform)}`}>{platform}</Badge>
    </div>
  );
}

export function AdminCpmUnpaidCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData>
) {
  const value = props.value ?? 0;

  if (value === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center h-full">
      <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
        {formatCurrencyAmount(value, 'USD')}
      </Badge>
    </div>
  );
}

export function AdminCpmSubmissionActionsCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData> & {
    onViewDetails?: (submission: AdminCpmSubmissionGridData) => void;
    onApprove?: (submission: AdminCpmSubmissionGridData) => void;
    onReject?: (submission: AdminCpmSubmissionGridData) => void;
    onUpdateViews?: (submission: AdminCpmSubmissionGridData) => void;
    onPayout?: (submission: AdminCpmSubmissionGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isPending = data.status === 'pending_approval';
  const hasUnpaidBalance = data.earnings_unpaid > 0;
  const canPayout = hasUnpaidBalance && !isPending && data.status !== 'rejected';

  return (
    <div className="flex items-center justify-center h-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              props.onViewDetails?.(data);
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={data.video_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Video
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isPending && (
            <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  props.onApprove?.(data);
                }}
                className="text-green-600"
              >
                <Check className="h-4 w-4 mr-2" />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  props.onReject?.(data);
                }}
                className="text-red-600"
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canPayout && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                props.onPayout?.(data);
              }}
              className="text-green-600"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pay Out ({formatCurrencyAmount(data.earnings_unpaid, 'USD')})
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              props.onUpdateViews?.(data);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Update Views
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Video preview cell renderer - clickable to open modal
export function AdminCpmVideoCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData> & {
    onOpenVideo?: (submission: AdminCpmSubmissionGridData) => void;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isTikTok = data.platform === 'tiktok';

  return (
    <div className="flex items-center h-full">
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onOpenVideo?.(data);
        }}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors group"
      >
        <div
          className={`flex items-center justify-center w-8 h-8 rounded ${
            isTikTok ? 'bg-black' : 'bg-gradient-to-br from-purple-500 to-pink-500'
          }`}
        >
          <Play className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm text-muted-foreground group-hover:text-foreground truncate max-w-[120px]">
          {isTikTok ? 'TikTok' : 'Instagram'}
        </span>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

// Quick actions cell renderer - inline buttons for approve/reject
export function AdminCpmQuickActionsCellRenderer(
  props: CustomCellRendererProps<AdminCpmSubmissionGridData> & {
    onApprove?: (submission: AdminCpmSubmissionGridData) => void;
    onReject?: (submission: AdminCpmSubmissionGridData) => void;
    onPayout?: (submission: AdminCpmSubmissionGridData) => void;
    onOpenVideo?: (submission: AdminCpmSubmissionGridData) => void;
    isApproving?: string | null;
    isRejecting?: string | null;
    isPaying?: string | null;
  }
) {
  const data = props.data;
  if (!data) return null;

  const isPending = data.status === 'pending_approval';
  const hasUnpaidBalance = data.earnings_unpaid > 0;
  const canPayout = hasUnpaidBalance && !isPending && data.status !== 'rejected';

  const isCurrentlyApproving = props.isApproving === data.id;
  const isCurrentlyRejecting = props.isRejecting === data.id;
  const isCurrentlyPaying = props.isPaying === data.id;

  return (
    <div className="flex items-center gap-1 h-full">
      {isPending && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={(e) => {
              e.stopPropagation();
              props.onApprove?.(data);
            }}
            disabled={isCurrentlyApproving || isCurrentlyRejecting}
          >
            {isCurrentlyApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              props.onReject?.(data);
            }}
            disabled={isCurrentlyApproving || isCurrentlyRejecting}
          >
            {isCurrentlyRejecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
      {canPayout && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={(e) => {
            e.stopPropagation();
            props.onPayout?.(data);
          }}
          disabled={isCurrentlyPaying}
        >
          {isCurrentlyPaying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Wallet className="h-4 w-4 mr-1" />
              <span className="text-xs">{formatCurrencyAmount(data.earnings_unpaid, 'USD')}</span>
            </>
          )}
        </Button>
      )}
      {!isPending && !canPayout && (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}
