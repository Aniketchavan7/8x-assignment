/**
 * Handle Validation Service
 *
 * Verifies a creator-submitted social handle by hitting the platform's
 * public scraper API: the account must exist AND have zero posts.
 *
 * Used by the portal handle-submission flow (`saveHandles`) to block creators
 * from submitting accounts with existing post history — a fresh account is
 * required for every campaign.
 */
import {
  extractTikTokUsername,
  extractInstagramUsername,
  extractYouTubeUsername,
} from '@/lib/utils/social-username';

export type Platform = 'tiktok' | 'instagram' | 'youtube';
export type ValidationError = 'not_found' | 'has_posts' | 'api_error';

export interface ValidationResult {
  ok: boolean;
  exists: boolean;
  postCount: number;
  error?: ValidationError;
}

const TIKTOK_API_HOST = 'tiktok-scraper7.p.rapidapi.com';
const INSTAGRAM_API_HOST = 'instagram-looter2.p.rapidapi.com';

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [500, 1500]; // total ~3 attempts including the initial call

interface FetchResult {
  ok: boolean;
  exists: boolean;
  postCount: number;
}

type FetchFn = () => Promise<FetchResult | 'not_found' | 'api_error'>;

async function withRetries(fn: FetchFn): Promise<ValidationResult> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const result = await fn();
    if (result === 'not_found') {
      return { ok: false, exists: false, postCount: 0, error: 'not_found' };
    }
    if (result !== 'api_error') {
      const { exists, postCount } = result;
      if (!exists) return { ok: false, exists: false, postCount: 0, error: 'not_found' };
      if (postCount > 0) return { ok: false, exists: true, postCount, error: 'has_posts' };
      return { ok: true, exists: true, postCount: 0 };
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  return { ok: false, exists: false, postCount: 0, error: 'api_error' };
}

async function fetchTikTok(username: string, apiKey: string): ReturnType<FetchFn> {
  try {
    const url = `https://${TIKTOK_API_HOST}/user/info?unique_id=${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': TIKTOK_API_HOST,
      },
    });

    if (res.status === 404) return 'not_found';
    if (!res.ok) return 'api_error';

    const data = (await res.json()) as {
      code: number;
      msg?: string;
      data?: {
        user?: { secUid?: string };
        stats?: { videoCount?: number };
      };
    };

    if (data.code !== 0) {
      const msg = (data.msg || '').toLowerCase();
      const isNotFound =
        data.code === -1 ||
        msg.includes('not found') ||
        msg.includes('not exist') ||
        msg.includes('url parsing');
      return isNotFound ? 'not_found' : 'api_error';
    }

    if (!data.data?.user?.secUid) return 'not_found';
    const postCount = data.data.stats?.videoCount ?? 0;
    return { ok: true, exists: true, postCount };
  } catch {
    return 'api_error';
  }
}

async function fetchInstagram(username: string, apiKey: string): ReturnType<FetchFn> {
  try {
    const url = `https://${INSTAGRAM_API_HOST}/web-profile?username=${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': INSTAGRAM_API_HOST,
      },
    });

    if (res.status === 404) return 'not_found';
    if (!res.ok) return 'api_error';

    const data = (await res.json()) as {
      data?: {
        user?: {
          id?: string;
          username?: string;
          edge_owner_to_timeline_media?: { count?: number };
        };
      };
      error?: string;
      message?: string;
    };

    const apiError = data.error || data.message;
    if (apiError && !data.data?.user) return 'api_error';

    const user = data.data?.user;
    if (!user?.id && !user?.username) return 'not_found';
    const postCount = user.edge_owner_to_timeline_media?.count ?? 0;
    return { ok: true, exists: true, postCount };
  } catch {
    return 'api_error';
  }
}

async function fetchYouTube(handle: string, apiKey: string): ReturnType<FetchFn> {
  try {
    // NOTE: YouTube Data API doesn't support header-based auth, so the key has
    // to go in the query string. Treat it as exposed in upstream access logs
    // (Vercel function logs, CDN, error traces). Mitigations: rotate the key
    // regularly and restrict it by IP / HTTP referrer in the Google Cloud
    // Console.
    const url = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(
      handle,
    )}&part=statistics&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    if (res.status === 404) return 'not_found';
    if (!res.ok) return 'api_error';

    const data = (await res.json()) as {
      items?: Array<{ statistics?: { videoCount?: string } }>;
    };

    const item = data.items?.[0];
    if (!item) return 'not_found';

    const postCount = Number(item.statistics?.videoCount ?? 0);
    return { ok: true, exists: true, postCount: Number.isFinite(postCount) ? postCount : 0 };
  } catch {
    return 'api_error';
  }
}

/**
 * Validate that a creator-submitted handle exists on the platform and has
 * zero public posts. Retries up to ~3 attempts on transient API errors.
 *
 * Required env vars: RAPIDAPI_KEY_TIKTOK, RAPIDAPI_KEY_INSTAGRAM, YOUTUBE_API_KEY.
 */
export async function validateNewHandle(
  platform: Platform,
  rawHandle: string,
): Promise<ValidationResult> {
  const normalized =
    platform === 'tiktok'
      ? extractTikTokUsername(rawHandle)
      : platform === 'instagram'
        ? extractInstagramUsername(rawHandle)
        : extractYouTubeUsername(rawHandle);

  if (!normalized) {
    return { ok: false, exists: false, postCount: 0, error: 'not_found' };
  }

  if (platform === 'tiktok') {
    const apiKey = process.env.RAPIDAPI_KEY_TIKTOK;
    if (!apiKey) return { ok: false, exists: false, postCount: 0, error: 'api_error' };
    return withRetries(() => fetchTikTok(normalized, apiKey));
  }

  if (platform === 'instagram') {
    const apiKey = process.env.RAPIDAPI_KEY_INSTAGRAM;
    if (!apiKey) return { ok: false, exists: false, postCount: 0, error: 'api_error' };
    return withRetries(() => fetchInstagram(normalized, apiKey));
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { ok: false, exists: false, postCount: 0, error: 'api_error' };
  return withRetries(() => fetchYouTube(normalized, apiKey));
}
