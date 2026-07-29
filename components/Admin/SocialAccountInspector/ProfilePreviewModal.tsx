'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { TikTokProfileEmbed } from '@/components/shared/TikTokProfileEmbed';
import { ExternalLink } from 'lucide-react';
import { PlatformIcon, PLATFORM_COLOR_CLASS } from './PlatformIcon';
import type { Platform } from '@/lib/modules/admin/inspector/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: Platform;
  username: string;
  profileUrl: string | null;
  channelId?: string | null;
}

/**
 * Single modal that previews a creator profile on any of the 3 platforms.
 * TikTok uses an iframe embed; Instagram/YouTube iframes are blocked by
 * X-Frame-Options so we show a summary card with a prominent "Open ↗" CTA.
 */
export function ProfilePreviewModal({
  open,
  onOpenChange,
  platform,
  username,
  profileUrl,
  channelId,
}: Props) {
  const openUrl = profileUrl ?? buildFallbackUrl(platform, username, channelId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 w-fit h-fit max-w-none max-h-none overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>{platform} profile — @{username}</DialogTitle>
        </VisuallyHidden>

        {platform === 'tiktok' && profileUrl ? (
          <TikTokProfileEmbed url={profileUrl} />
        ) : (
          <div className="w-[460px] p-8 flex flex-col items-center gap-5 text-center">
            <div className={`h-16 w-16 rounded-full bg-muted flex items-center justify-center ${PLATFORM_COLOR_CLASS[platform]}`}>
              <PlatformIcon platform={platform} className="h-8 w-8" />
            </div>
            <div>
              <div className="text-xl font-semibold">@{username}</div>
              <div className="text-xs text-muted-foreground capitalize mt-0.5">{platform}</div>
            </div>
            <p className="text-sm text-muted-foreground">
              {platform === 'instagram' ? 'Instagram' : 'YouTube'} blocks profile embedding.
              Open the profile in a new tab to view.
            </p>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Open on {cap(platform)}
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildFallbackUrl(
  platform: Platform,
  username: string,
  channelId?: string | null
): string | null {
  if (!username && !channelId) return null;
  if (platform === 'tiktok') return `https://www.tiktok.com/@${username}`;
  if (platform === 'instagram') return `https://www.instagram.com/${username}`;
  if (channelId) return `https://www.youtube.com/channel/${channelId}`;
  return `https://www.youtube.com/@${username}`;
}
