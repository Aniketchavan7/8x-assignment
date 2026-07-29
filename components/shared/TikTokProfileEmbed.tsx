'use client';

/**
 * TikTok Profile Embed Component
 *
 * Reusable component for embedding TikTok creator profiles using TikTok's direct iframe embed.
 * Uses the same approach as Sideshift with TikTok's official /embed/ endpoint.
 * Shows follower count, following count, likes, and recent videos.
 *
 * @see https://developers.tiktok.com/doc/embed-creator-profiles
 */

import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TikTokProfileEmbedProps {
  /** TikTok profile URL or username (e.g., https://www.tiktok.com/@username or @username) */
  url: string;
  /** Optional className for styling the container */
  className?: string;
}

export function TikTokProfileEmbed({ url, className = '' }: TikTokProfileEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Extract username from URL or use directly
  const getUsername = (input: string): string | null => {
    if (!input) return null;

    // Handle @username format
    if (input.startsWith('@')) {
      return input; // Keep the @ for TikTok embed URL
    }

    // Handle full URL like https://www.tiktok.com/@username
    if (input.startsWith('http')) {
      const match = input.match(/tiktok\.com\/@([^\/\?]+)/);
      return match ? `@${match[1]}` : null;
    }

    // Handle plain username without @
    return `@${input}`;
  };

  const username = getUsername(url);

  // Build TikTok embed URL (same pattern as Sideshift)
  const embedUrl = username ? `https://www.tiktok.com/embed/${username}?lang=en-GB` : null;

  // Build cite URL for the blockquote
  const citeUrl = username ? `https://www.tiktok.com/${username}` : null;

  if (!username || !embedUrl) {
    return (
      <div className={`flex items-center justify-center min-h-[400px] ${className}`}>
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invalid TikTok profile URL</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading TikTok profile...</p>
          </div>
        </div>
      )}

      {/* TikTok embed iframe wrapped in blockquote (Sideshift pattern) */}
      <div className="relative w-full" style={{ height: '481px' }}>
        <blockquote
          className="tiktok-embed"
          cite={citeUrl || undefined}
          data-unique-id={username.replace('@', '')}
          data-embed-type="creator"
          style={{
            maxWidth: '750px',
            minWidth: '432px',
            margin: '0px',
            height: '478px',
          }}
        >
          <iframe
            style={{
              width: '100%',
              height: '500px',
              display: 'block',
              visibility: 'unset',
            }}
            name={`__tt_embed__${username}`}
            src={embedUrl}
            onLoad={() => setIsLoading(false)}
          />
        </blockquote>
      </div>
    </div>
  );
}
