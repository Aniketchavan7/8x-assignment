/**
 * Social Media Username Extraction Utilities
 *
 * Centralized utilities for extracting usernames from social media URLs and inputs.
 * Supports TikTok, Instagram, and YouTube platforms.
 *
 * These functions are used by:
 * - Frontend modals (AddTikTokAccountModal, AddInstagramAccountModal, AddYouTubeAccountModal)
 * - API routes (bulk account import)
 */

import type { SocialPlatform } from '@/lib/analytics/types';

/**
 * Extracts username from TikTok URL or returns the input if it's already a username
 *
 * Handles:
 * - https://www.tiktok.com/@username
 * - https://www.tiktok.com/@username/video/123
 * - https://tiktok.com/@username
 * - @username
 * - username
 *
 * @param input - TikTok URL or username string
 * @returns Normalized username (without @) or null if invalid
 */
export function extractTikTokUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check if it's a TikTok URL
  const urlMatch = trimmed.match(/tiktok\.com\/@([^/\s?#&]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Check if it's already a username (with or without @)
  const usernameMatch = trimmed.match(/^@?([a-zA-Z0-9._-]+)$/);
  if (usernameMatch && usernameMatch[1]) {
    return usernameMatch[1];
  }

  // If it doesn't match any pattern, return null
  return null;
}

/**
 * Extracts username from Instagram URL or returns the input if it's already a username
 *
 * Handles:
 * - https://www.instagram.com/username
 * - https://www.instagram.com/username/
 * - https://instagram.com/username
 * - https://www.instagram.com/username?igsh=xyz
 * - https://www.instagram.com/username/reel/ABC123/
 * - https://www.instagram.com/stories/username/
 * - @username
 * - username
 *
 * @param input - Instagram URL or username string
 * @returns Normalized username (without @) or null if invalid
 */
export function extractInstagramUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Path segments that indicate content, not usernames
  const contentPaths = ['reel', 'reels', 'p', 'tv'];
  // Path segments that should be completely skipped
  const systemPaths = ['explore', 'accounts', 'direct'];

  // Check if it's an Instagram URL
  if (trimmed.toLowerCase().includes('instagram.com')) {
    // Extract path after instagram.com/
    const pathMatch = trimmed.match(/instagram\.com\/([^?#]+)/i);
    if (pathMatch && pathMatch[1]) {
      // Split path into segments and find the username
      const segments = pathMatch[1].split('/').filter((s) => s.length > 0);

      // If first segment is a content path (reel, p, etc.), this URL has no username
      if (segments[0] && contentPaths.includes(segments[0].toLowerCase())) {
        return null;
      }

      // Handle stories URLs: instagram.com/stories/username/
      if (segments[0]?.toLowerCase() === 'stories' && segments[1]) {
        const username = segments[1].replace(/^@/, '');
        if (/^[a-zA-Z0-9._-]+$/.test(username)) {
          return username;
        }
      }

      // Skip system paths
      if (segments[0] && systemPaths.includes(segments[0].toLowerCase())) {
        return null;
      }

      // First segment should be the username for profile URLs
      if (segments[0]) {
        const cleanSegment = segments[0].replace(/^@/, '');
        if (/^[a-zA-Z0-9._-]+$/.test(cleanSegment)) {
          return cleanSegment;
        }
      }
    }
    return null;
  }

  // Check if it's already a username (with or without @)
  const usernameMatch = trimmed.match(/^@?([a-zA-Z0-9._-]+)$/);
  if (usernameMatch && usernameMatch[1]) {
    return usernameMatch[1];
  }

  return null;
}

/**
 * Extracts username from YouTube URL or returns the input if it's already a username
 *
 * Handles:
 * - https://www.youtube.com/@handle
 * - https://youtube.com/@handle
 * - @handle
 * - handle
 *
 * @param input - YouTube URL or username string
 * @returns Normalized username (without @) or null if invalid
 */
export function extractYouTubeUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // YouTube URL: youtube.com/@handle
  if (trimmed.toLowerCase().includes('youtube.com')) {
    const handleMatch = trimmed.match(/youtube\.com\/@([^/\s?#&]+)/i);
    if (handleMatch?.[1]) {
      return handleMatch[1];
    }
    return null;
  }

  // Already a username (with or without @)
  const usernameMatch = trimmed.match(/^@?([a-zA-Z0-9._-]+)$/);
  if (usernameMatch?.[1]) {
    return usernameMatch[1];
  }

  return null;
}

/**
 * Parses a multi-line text input into an array of usernames
 *
 * @param text - Text input with usernames/URLs, one per line
 * @param platform - The social platform to extract usernames for
 * @returns Array of normalized usernames (without @)
 */
export function parseUsernames(text: string, platform: SocialPlatform): string[] {
  const extractFn =
    platform === 'tiktok'
      ? extractTikTokUsername
      : platform === 'youtube'
      ? extractYouTubeUsername
      : extractInstagramUsername;

  return text
    .split('\n')
    .map((line) => extractFn(line))
    .filter((username): username is string => username !== null);
}

/**
 * Normalizes a username by removing @ prefix and trimming whitespace
 *
 * @param username - Username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '');
}

/**
 * Builds a profile URL for a given platform and username
 *
 * @param platform - The social platform
 * @param username - The username (with or without @)
 * @returns Full profile URL
 */
export function buildProfileUrl(platform: SocialPlatform, username: string): string {
  const normalizedUsername = normalizeUsername(username);

  if (platform === 'instagram') {
    return `https://www.instagram.com/${normalizedUsername}/`;
  }

  if (platform === 'youtube') {
    return `https://www.youtube.com/@${normalizedUsername}`;
  }

  // Default to TikTok
  return `https://www.tiktok.com/@${normalizedUsername}`;
}

/**
 * Validates and extracts a username from user input, returning an error message if invalid.
 *
 * Handles:
 * - Full URLs (extracts username)
 * - @username format (strips @)
 * - Plain username
 *
 * Rejects:
 * - Emails
 * - Usernames with spaces
 * - Non-Latin characters (cyrillic, etc.)
 * - Platform prefixes (instagram_, tiktok_)
 *
 * @param input - User input (URL, @username, or username)
 * @param platform - The social platform
 * @returns Object with either `username` (valid) or `error` (invalid)
 */
export function validateAndExtractUsername(
  input: string,
  platform: SocialPlatform
): { username: string } | { error: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { error: 'Username is required.' };
  }

  // Check for email pattern (has @ followed by domain)
  if (/@.*\./.test(trimmed)) {
    return { error: 'Please enter a username, not an email address.' };
  }

  // Check for spaces
  if (/\s/.test(trimmed)) {
    return { error: 'Username cannot contain spaces.' };
  }

  // Check for cyrillic or other non-Latin characters
  if (/[^\x00-\x7F]/.test(trimmed)) {
    return { error: 'Username can only contain letters, numbers, dots, and underscores.' };
  }

  // Check for platform prefixes
  if (/^(instagram_|tiktok_|ig_|tt_|youtube_|yt_)/i.test(trimmed)) {
    return { error: 'Please enter just the username without platform prefix.' };
  }

  // Use platform-specific extraction
  const extractFn =
    platform === 'tiktok'
      ? extractTikTokUsername
      : platform === 'youtube'
      ? extractYouTubeUsername
      : extractInstagramUsername;

  const username = extractFn(trimmed);

  if (!username) {
    return { error: 'Invalid username format. Enter a username or profile URL.' };
  }

  return { username };
}

/**
 * Returns a proxied URL for Instagram CDN images to bypass CORS, or the original URL otherwise
 */
export function getProxiedImageUrl(
  imageUrl: string | null | undefined,
  _platform?: SocialPlatform
): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.includes('cdninstagram.com')) {
    return `/api/proxy/image?url=${encodeURIComponent(imageUrl)}`;
  }
  return imageUrl;
}
