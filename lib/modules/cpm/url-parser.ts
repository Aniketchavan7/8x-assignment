import { CPM_URL_LIMITS } from './constants';

export type SupportedPlatform = 'tiktok' | 'instagram';

export interface ParsedVideoUrl {
  platform: SupportedPlatform;
  videoId: string;
  username?: string;
  originalUrl: string;
  normalizedUrl: string;
}

export interface VideoUrlValidationResult {
  isValid: boolean;
  parsed?: ParsedVideoUrl;
  error?: string;
}

const TIKTOK_VIDEO_REGEX =
  /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/video\/(\d+)/i;
const TIKTOK_PHOTO_REGEX =
  /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/photo\/(\d+)/i;
const TIKTOK_SHORT_REGEX = /^https?:\/\/vm\.tiktok\.com\/([A-Za-z0-9]+)/i;
const TIKTOK_MOBILE_SHARE_REGEX = /^https?:\/\/(?:www\.)?tiktok\.com\/t\/([A-Za-z0-9]+)/i;
const INSTAGRAM_POST_REGEX =
  /^https?:\/\/(?:www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)/i;
const INSTAGRAM_REEL_REGEX =
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)/i;

function parseTikTokUrl(url: string): ParsedVideoUrl | null {
  // Try full video URL format first
  const fullMatch = url.match(TIKTOK_VIDEO_REGEX);
  if (fullMatch) {
    const [, username, videoId] = fullMatch;
    return {
      platform: 'tiktok',
      videoId,
      username,
      originalUrl: url,
      normalizedUrl: `https://www.tiktok.com/@${username}/video/${videoId}`,
    };
  }

  // Try photo/album URL format
  const photoMatch = url.match(TIKTOK_PHOTO_REGEX);
  if (photoMatch) {
    const [, username, photoId] = photoMatch;
    return {
      platform: 'tiktok',
      videoId: photoId,
      username,
      originalUrl: url,
      normalizedUrl: `https://www.tiktok.com/@${username}/photo/${photoId}`,
    };
  }

  // Try short URL format (vm.tiktok.com)
  // Note: Short URLs can't be fully normalized without following redirects,
  // but we strip query params for consistent duplicate detection
  const shortMatch = url.match(TIKTOK_SHORT_REGEX);
  if (shortMatch) {
    const [, shortCode] = shortMatch;
    return {
      platform: 'tiktok',
      videoId: shortCode,
      originalUrl: url,
      normalizedUrl: `https://vm.tiktok.com/${shortCode}`,
    };
  }

  // Try mobile share format (tiktok.com/t/...)
  const mobileMatch = url.match(TIKTOK_MOBILE_SHARE_REGEX);
  if (mobileMatch) {
    const [, shortCode] = mobileMatch;
    return {
      platform: 'tiktok',
      videoId: shortCode,
      originalUrl: url,
      normalizedUrl: `https://www.tiktok.com/t/${shortCode}`,
    };
  }

  return null;
}

function parseInstagramUrl(url: string): ParsedVideoUrl | null {
  // Try post format
  const postMatch = url.match(INSTAGRAM_POST_REGEX);
  if (postMatch) {
    const [, videoId] = postMatch;
    return {
      platform: 'instagram',
      videoId,
      originalUrl: url,
      normalizedUrl: `https://www.instagram.com/p/${videoId}/`,
    };
  }

  // Try reel format
  const reelMatch = url.match(INSTAGRAM_REEL_REGEX);
  if (reelMatch) {
    const [, videoId] = reelMatch;
    return {
      platform: 'instagram',
      videoId,
      originalUrl: url,
      normalizedUrl: `https://www.instagram.com/reel/${videoId}/`,
    };
  }

  return null;
}

export function parseVideoUrl(url: string): VideoUrlValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }

  const trimmedUrl = url.trim();

  // Length validation to prevent ReDoS attacks
  if (trimmedUrl.length > CPM_URL_LIMITS.MAX_URL_LENGTH) {
    return { isValid: false, error: 'URL is too long' };
  }

  // Validate URL format and strip query params for consistent duplicate detection
  let cleanUrl: string;
  try {
    const parsed = new URL(trimmedUrl);
    // Remove query params and hash for cleaner matching
    cleanUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Try TikTok
  const tiktokResult = parseTikTokUrl(cleanUrl);
  if (tiktokResult) {
    return { isValid: true, parsed: tiktokResult };
  }

  // Try Instagram
  const instagramResult = parseInstagramUrl(cleanUrl);
  if (instagramResult) {
    return { isValid: true, parsed: instagramResult };
  }

  return {
    isValid: false,
    error: 'URL must be a valid TikTok or Instagram post link',
  };
}

export function validateVideoUrlForPlatform(
  url: string,
  platform: SupportedPlatform
): VideoUrlValidationResult {
  const result = parseVideoUrl(url);

  if (!result.isValid) {
    return result;
  }

  if (result.parsed?.platform !== platform) {
    return {
      isValid: false,
      error: `URL must be from ${platform}, got ${result.parsed?.platform}`,
    };
  }

  return result;
}

export function isSupportedPlatformUrl(url: string): boolean {
  return parseVideoUrl(url).isValid;
}

export function getPlatformFromUrl(url: string): SupportedPlatform | null {
  const result = parseVideoUrl(url);
  return result.parsed?.platform ?? null;
}

export function normalizeVideoUrl(url: string): string | null {
  const result = parseVideoUrl(url);
  return result.parsed?.normalizedUrl ?? null;
}

export function getVideoIdFromUrl(url: string): string | null {
  const result = parseVideoUrl(url);
  return result.parsed?.videoId ?? null;
}

/**
 * Check if a URL is a TikTok short URL that needs to be resolved.
 *
 * Short URLs come from:
 * - TikTok app "Share" button: https://www.tiktok.com/t/ZThUyeeQe/
 * - VM short links: https://vm.tiktok.com/ZMkKLxHxH/
 *
 * These need to be resolved via HTTP redirect to get the full URL
 * with the numeric video ID before the RapidAPI can process them.
 */
export function isShortTikTokUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Check for tiktok.com/t/ format (app share)
  if (TIKTOK_MOBILE_SHARE_REGEX.test(trimmed)) return true;

  // Check for vm.tiktok.com format
  if (TIKTOK_SHORT_REGEX.test(trimmed)) return true;

  return false;
}
