/**
 * Admin Lookup — input classifier.
 *
 * Pure function: takes a raw search input and returns a discriminated union
 * describing what the admin is looking for. The route handler is responsible
 * for resolving each variant to a canonical URL via DB queries.
 */

export type Platform = 'tiktok' | 'instagram' | 'youtube';

export type LookupTarget =
  | { kind: 'post-id'; id: string }
  | {
      kind: 'post-url';
      platform: Platform;
      nativePostId?: string;
      postUrl: string;
    }
  | { kind: 'ad-code'; adCode: string }
  | { kind: 'social-account-id'; id: string }
  | {
      kind: 'platform-account-id';
      platform: Platform;
      id: string;
    }
  | {
      kind: 'account-url';
      platform: Platform;
      username: string;
    }
  | { kind: 'username'; username: string }
  | { kind: 'unknown'; raw: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AD_CODE_RE = /^[A-Z0-9]{4,12}$/;

function tryUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    // Allow bare hostnames for known platforms: "tiktok.com/@user", "instagram.com/user/", etc.
    if (
      /^(www\.)?(m\.|vm\.)?(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\//i.test(
        raw
      )
    ) {
      try {
        return new URL(`https://${raw}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isPlatformAccountUuid(input: string): boolean {
  return UUID_RE.test(input);
}

/**
 * Classifier. Trims, lower-cases shape detection where appropriate,
 * preserves casing inside paths/usernames.
 *
 * Note: ad_code vs username collision: bare strings like `ABC123` (all upper,
 * 4-12 chars) classify as ad_code; otherwise as username. The DB resolver
 * may fall back to username if ad_code returns no results.
 */
export function classifyLookupInput(raw: string): LookupTarget {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'unknown', raw };

  // 1. UUID — could be posts.id, social_accounts.id, or a platform account id.
  //    The route handler tries posts first, then social_accounts, then
  //    tiktok/instagram/youtube_accounts. We classify as 'post-id' optimistically;
  //    the resolver downgrades to 'social-account-id' / 'platform-account-id' on miss.
  if (UUID_RE.test(trimmed)) {
    return { kind: 'post-id', id: trimmed };
  }

  // 2. URLs
  const url = tryUrl(trimmed);
  if (url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, ''); // trim trailing slash

    // TikTok
    if (host === 'tiktok.com' || host === 'm.tiktok.com' || host === 'vm.tiktok.com') {
      // /@user/video/<id>
      const videoMatch = path.match(/^\/@([^/]+)\/video\/(\d+)/);
      if (videoMatch) {
        return {
          kind: 'post-url',
          platform: 'tiktok',
          nativePostId: videoMatch[2],
          postUrl: trimmed,
        };
      }
      // /@user (account)
      const accountMatch = path.match(/^\/@([^/]+)$/);
      if (accountMatch) {
        return {
          kind: 'account-url',
          platform: 'tiktok',
          username: accountMatch[1],
        };
      }
      // vm.tiktok short links are sometimes stored as ad_code in posts.
      // Use the parsed url.href so bare-hostname inputs ("vm.tiktok.com/X/") and
      // full URLs ("https://vm.tiktok.com/X/") both lookup the same canonical value.
      if (host === 'vm.tiktok.com') {
        return { kind: 'ad-code', adCode: url.href };
      }
    }

    // Instagram
    if (host === 'instagram.com') {
      const postMatch = path.match(/^\/(?:p|reel|reels|tv)\/([^/]+)/);
      if (postMatch) {
        return {
          kind: 'post-url',
          platform: 'instagram',
          nativePostId: postMatch[1],
          postUrl: trimmed,
        };
      }
      const accountMatch = path.match(/^\/([^/]+)$/);
      if (accountMatch) {
        return {
          kind: 'account-url',
          platform: 'instagram',
          username: accountMatch[1],
        };
      }
    }

    // YouTube — youtube.com/watch?v=<id> | youtu.be/<id> | youtube.com/shorts/<id>
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (path === '/watch') {
        const v = url.searchParams.get('v');
        if (v) {
          return {
            kind: 'post-url',
            platform: 'youtube',
            nativePostId: v,
            postUrl: trimmed,
          };
        }
      }
      const shortsMatch = path.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) {
        return {
          kind: 'post-url',
          platform: 'youtube',
          nativePostId: shortsMatch[1],
          postUrl: trimmed,
        };
      }
      const channelMatch = path.match(/^\/@([^/]+)$/);
      if (channelMatch) {
        return {
          kind: 'account-url',
          platform: 'youtube',
          username: channelMatch[1],
        };
      }
    }

    if (host === 'youtu.be') {
      const id = path.replace(/^\//, '');
      if (id) {
        return {
          kind: 'post-url',
          platform: 'youtube',
          nativePostId: id,
          postUrl: trimmed,
        };
      }
    }
  }

  // 3. @username
  if (trimmed.startsWith('@')) {
    const username = trimmed.slice(1);
    if (username && !username.includes(' ')) {
      return { kind: 'username', username };
    }
  }

  // 4. ad_code
  // Modern TikTok disclosure ad code: #<base64-ish, 20+ chars>
  if (/^#[A-Za-z0-9+/=]{20,}$/.test(trimmed)) {
    return { kind: 'ad-code', adCode: trimmed };
  }
  // Legacy short ad code: AB12CD
  if (AD_CODE_RE.test(trimmed)) {
    return { kind: 'ad-code', adCode: trimmed };
  }

  // 5. Bare username (no spaces, no slashes, plausibly a handle)
  if (/^[A-Za-z0-9._]{2,30}$/.test(trimmed)) {
    return { kind: 'username', username: trimmed };
  }

  return { kind: 'unknown', raw };
}

/**
 * UUID validity helper, exported for resolver use.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export { isPlatformAccountUuid };
