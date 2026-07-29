import type { WarmupPlatform } from './verify-screenshot';

export const WARMUP_PLATFORMS: WarmupPlatform[] = ['tiktok', 'instagram', 'youtube'];

export const WARMUP_SCREENSHOT_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type WarmupScreenshotContentType = (typeof WARMUP_SCREENSHOT_CONTENT_TYPES)[number];

export const WARMUP_PLATFORM_URL_HOSTS: Record<WarmupPlatform, string[]> = {
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
};

export function warmupPlatformForUrl(value: string): WarmupPlatform | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    return (
      WARMUP_PLATFORMS.find((platform) =>
        WARMUP_PLATFORM_URL_HOSTS[platform].some(
          (host) => hostname === host || hostname.endsWith(`.${host}`)
        )
      ) ?? null
    );
  } catch {
    return null;
  }
}
