'use client';

import { useState } from 'react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Building2, Copy, ExternalLink, Globe, Lock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { BrandCampaignRow } from './brandCampaignColumnDefs';
import { TikTokIcon, InstagramIcon } from '@/components/Admin/BrandDetail/shared';

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
    </svg>
  );
}

const PLATFORM_ICON: Record<string, React.FC<{ className?: string }>> = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
};

export function BrandCampaignBrandCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const data = props.data;
  if (!data) return null;

  const locked = data.accessible === false;

  return (
    <div className="flex items-center gap-2.5 h-full">
      <Avatar className="h-7 w-7 flex-shrink-0">
        {data.brand_logo && <AvatarImage src={data.brand_logo} alt={data.brand_name} />}
        <AvatarFallback className="text-xs">
          <Building2 className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      {locked && (
        <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-label="No access" />
      )}
      <span className="text-sm truncate">{data.brand_name}</span>
    </div>
  );
}

export function BrandCampaignStatusCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const status = props.value as string;

  const getVariant = (s: string): 'default' | 'secondary' | 'outline' => {
    switch (s) {
      case 'active':
        return 'default';
      case 'paused':
        return 'secondary';
      case 'completed':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <Badge variant={getVariant(status)} className="text-xs capitalize">
        {status || 'N/A'}
      </Badge>
    </div>
  );
}

export function BrandCampaignCountryCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const value = props.value as string | null;
  if (!value) return <span className="text-muted-foreground/40">&mdash;</span>;

  return (
    <div className="flex items-center justify-center gap-1.5 h-full">
      <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{value}</span>
    </div>
  );
}

export function BrandCampaignPlatformsCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const platforms = props.value as string[] | null;
  if (!platforms || platforms.length === 0) {
    return <span className="text-muted-foreground/40">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center gap-1.5 h-full">
      {platforms.map((p) => {
        const Icon = PLATFORM_ICON[p.toLowerCase()];
        if (Icon) {
          return <Icon key={p} className="h-4 w-4 text-muted-foreground" />;
        }
        return (
          <Badge key={p} variant="outline" className="text-xs capitalize">
            {p}
          </Badge>
        );
      })}
    </div>
  );
}

export function BrandCampaignCurrencyCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (value == null || value === 0) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm tabular-nums font-medium">${(Number(value) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </div>
  );
}

export function BrandCampaignNumberCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (value == null) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function BrandCampaignViewsCellRenderer(props: CustomCellRendererProps) {
  const value = props.value as number | null;
  if (value == null) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  const formatted =
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
        ? `${(value / 1_000).toFixed(0)}K`
        : String(value);

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm tabular-nums">{formatted}</span>
    </div>
  );
}

export function BrandCampaignBonusCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const milestones = props.value as Record<string, unknown>[] | null;
  if (!milestones || milestones.length === 0) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  const formatted = milestones.map((m) => {
    const views = (m.views ?? m.min_views) as number | undefined;
    const cents = (m.bonus_cents ?? m.amount_cents) as number | undefined;
    if (views == null || cents == null) return null;

    const viewsStr =
      views >= 1_000_000
        ? `${(views / 1_000_000).toFixed(1)}M`
        : views >= 1_000
          ? `${(views / 1_000).toFixed(0)}K`
          : String(views);

    return `${viewsStr}=$${(cents / 100).toFixed(0)}`;
  }).filter(Boolean);

  if (formatted.length === 0) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-xs text-muted-foreground truncate" title={formatted.join(', ')}>
        {formatted.join(', ')}
      </span>
    </div>
  );
}

export function BrandCampaignMonthNumberCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const data = props.data;
  if (!data?.start_date) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  const start = new Date(data.start_date);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm tabular-nums">{Math.max(1, months)}</span>
    </div>
  );
}

export function BrandCampaignNotesCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const notes = props.value as string | null;
  if (!notes) {
    return <span className="text-muted-foreground/40">&mdash;</span>;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-sm text-muted-foreground truncate" title={notes}>
        {notes}
      </span>
    </div>
  );
}

export function BrandCampaignActionsCellRenderer(props: CustomCellRendererProps<BrandCampaignRow>) {
  const data = props.data;
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!data) return null;

  const ctx = props.context as {
    onEdit?: (campaign: BrandCampaignRow) => void;
    onDelete?: (campaignId: string) => void;
  } | undefined;

  if (!ctx?.onEdit && !ctx?.onDelete) return null;
  if (data.accessible === false) return null;

  const handleCopyPortal = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`https://app.example.com/portal/${data.brand_slug}`);
  };

  return (
    <>
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
                ctx?.onEdit?.(data);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/en/admin/brands/${data.brand_slug}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Brand
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyPortal}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Portal Link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{data.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => ctx?.onDelete?.(data.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
