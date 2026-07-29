'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import { TikTokIcon, InstagramIcon } from '@/components/Admin/BrandDetail/shared';
import { extractTikTokUsername, extractInstagramUsername, extractYouTubeUsername } from '@/lib/utils/social-username';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// ---------------------------------------------------------------------------
// Name + Avatar — shows initials circle + name, optional source badge
// Expects: data.name (string), optionally data.source ('application' | 'managed')
// ---------------------------------------------------------------------------

export function NameAvatarCellRenderer(props: CustomCellRendererProps) {
  const data = props.data;
  if (!data?.name) return null;

  const initials = (data.name as string)
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const ctx = props.context as { onNameClick?: (id: string) => void } | undefined;

  return (
    <button
      type="button"
      className="flex items-center gap-2.5 h-full w-full text-left hover:bg-accent/50 rounded-sm px-1 -mx-1 transition-colors cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        ctx?.onNameClick?.(data.id);
      }}
    >
      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-medium text-muted-foreground">{initials}</span>
      </div>
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="font-medium text-sm truncate text-primary hover:underline">{data.name}</span>
        {data.source === 'application' && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium leading-none flex-shrink-0">
            APP
          </span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SocialHandleEditPopover — inline popover for adding a social handle
// ---------------------------------------------------------------------------

const PLATFORM_ICONS = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
} as const;

const PLATFORM_EXTRACT = {
  tiktok: extractTikTokUsername,
  instagram: extractInstagramUsername,
  youtube: extractYouTubeUsername,
} as const;

function SocialHandleEditPopover({
  platform,
  rowId,
  context,
}: {
  platform: 'tiktok' | 'instagram' | 'youtube';
  rowId: string;
  context: {
    onSocialHandleEdit?: (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => void;
  } | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = PLATFORM_ICONS[platform];

  useEffect(() => {
    if (open) {
      // Focus after popover animation
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    setValue('');
  }, [open]);

  const handleSave = () => {
    const extract = PLATFORM_EXTRACT[platform];
    const username = extract(value);
    if (!username || !context?.onSocialHandleEdit) return;
    context.onSocialHandleEdit(platform, username, rowId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer text-center block w-full"
          onClick={(e) => e.stopPropagation()}
        >
          &mdash;
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="@handle or URL"
            className="flex-1 h-7 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim()}
            className="h-7 px-2 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// TikTok icon link — clickable TikTok logo with BTSA tracking indicator
// Expects: data.tiktok_url, data.tiktok_username
// Context: onSocialIconClick (callback)
// ---------------------------------------------------------------------------

export function TikTokLinkCellRenderer(props: CustomCellRendererProps) {
  const data = props.data;
  if (!data) return null;

  const username = data.tiktok_username || (data.tiktok_url ? extractTikTokUsername(data.tiktok_url) : null);

  const ctx = props.context as {
    onSocialIconClick?: (platform: 'tiktok' | 'instagram' | 'youtube', username: string, managedCreatorId?: string) => void;
    onSocialHandleEdit?: (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => void;
  } | undefined;

  if (!username) {
    return <SocialHandleEditPopover platform="tiktok" rowId={data.id} context={ctx} />;
  }

  // null = tracking data not loaded (gray), true = tracked (green), false = not tracked (red)
  // frozen = blue (overrides tracked)
  const tracked: boolean | null = data.tiktokTracked ?? null;
  const frozen: boolean = data.tiktokFrozen ?? false;

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        className={`rounded-full p-1.5 transition-colors cursor-pointer ${
          frozen
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60'
            : tracked === null
              ? 'text-muted-foreground hover:text-foreground'
              : tracked
                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60'
                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (ctx?.onSocialIconClick) {
            ctx.onSocialIconClick('tiktok', username, data.id);
          } else {
            window.open(`https://tiktok.com/@${encodeURIComponent(username)}`, '_blank');
          }
        }}
        title={`@${username}${frozen ? ' (frozen)' : tracked === null ? '' : tracked ? ' (tracked)' : ' (not tracked)'}`}
      >
        <TikTokIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instagram icon link — clickable Instagram logo with BTSA tracking indicator
// Expects: data.instagram_url, data.instagram_username
// Context: onSocialIconClick (callback)
// ---------------------------------------------------------------------------

export function InstagramLinkCellRenderer(props: CustomCellRendererProps) {
  const data = props.data;
  if (!data) return null;

  const username = data.instagram_username || (data.instagram_url ? extractInstagramUsername(data.instagram_url) : null);

  const ctx = props.context as {
    onSocialIconClick?: (platform: 'tiktok' | 'instagram' | 'youtube', username: string, managedCreatorId?: string) => void;
    onSocialHandleEdit?: (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => void;
  } | undefined;

  if (!username) {
    return <SocialHandleEditPopover platform="instagram" rowId={data.id} context={ctx} />;
  }

  // null = tracking data not loaded (gray), true = tracked (green), false = not tracked (red)
  // frozen = blue (overrides tracked)
  const tracked: boolean | null = data.instagramTracked ?? null;
  const frozen: boolean = data.instagramFrozen ?? false;

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        className={`rounded-full p-1.5 transition-colors cursor-pointer ${
          frozen
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60'
            : tracked === null
              ? 'text-muted-foreground hover:text-foreground'
              : tracked
                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60'
                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (ctx?.onSocialIconClick) {
            ctx.onSocialIconClick('instagram', username, data.id);
          } else {
            window.open(`https://instagram.com/${encodeURIComponent(username)}`, '_blank');
          }
        }}
        title={`@${username}${frozen ? ' (frozen)' : tracked === null ? '' : tracked ? ' (tracked)' : ' (not tracked)'}`}
      >
        <InstagramIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YouTube icon link — clickable YouTube logo with BTSA tracking indicator
// Expects: data.youtube_url, data.youtube_username
// Context: onSocialIconClick (callback)
// ---------------------------------------------------------------------------

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
    </svg>
  );
}

export function YouTubeLinkCellRenderer(props: CustomCellRendererProps) {
  const data = props.data;
  if (!data) return null;

  const username = data.youtube_username || (data.youtube_url ? extractYouTubeUsername(data.youtube_url) : null);

  const ctx = props.context as {
    onSocialIconClick?: (platform: 'tiktok' | 'instagram' | 'youtube', username: string, managedCreatorId?: string) => void;
    onSocialHandleEdit?: (platform: 'tiktok' | 'instagram' | 'youtube', handle: string, managedCreatorId: string) => void;
  } | undefined;

  if (!username) {
    return <SocialHandleEditPopover platform="youtube" rowId={data.id} context={ctx} />;
  }

  // null = tracking data not loaded (gray), true = tracked (green), false = not tracked (red)
  // frozen = blue (overrides tracked)
  const tracked: boolean | null = data.youtubeTracked ?? null;
  const frozen: boolean = data.youtubeFrozen ?? false;

  return (
    <div className="flex items-center justify-center h-full">
      <button
        type="button"
        className={`rounded-full p-1.5 transition-colors cursor-pointer ${
          frozen
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60'
            : tracked === null
              ? 'text-muted-foreground hover:text-foreground'
              : tracked
                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60'
                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (ctx?.onSocialIconClick) {
            ctx.onSocialIconClick('youtube', username, data.id);
          } else {
            window.open(`https://www.youtube.com/@${encodeURIComponent(username)}`, '_blank');
          }
        }}
        title={`@${username}${frozen ? ' (frozen)' : tracked === null ? '' : tracked ? ' (tracked)' : ' (not tracked)'}`}
      >
        <YouTubeIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Currency (cents) — formats props.value as $X
// Uses props.value so it works with any field name
// ---------------------------------------------------------------------------

export function CurrencyCentsCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (value == null || value === 0) {
    return <span className="text-muted-foreground/40 text-center block">&mdash;</span>;
  }

  return (
    <div className="flex items-center h-full">
      <span className="text-sm tabular-nums font-medium">${(value / 100).toFixed(2)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Globe + location text — shows Globe icon + props.value
// Uses props.value so it works with any field name (location, country, etc.)
// ---------------------------------------------------------------------------

export function GlobeLocationCellRenderer(props: CustomCellRendererProps) {
  const value = props.value;
  if (!value) return <span className="text-muted-foreground/40">&mdash;</span>;

  return (
    <div className="flex items-center gap-1.5 h-full">
      <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-sm truncate">{value}</span>
    </div>
  );
}
