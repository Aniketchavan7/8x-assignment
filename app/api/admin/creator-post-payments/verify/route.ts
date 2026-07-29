export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { getAdminRole } from '@/lib/modules/admin/queries';
import { PAYOUTS_ROLES, hasAccess } from '@/lib/modules/admin/roles';

const TIKTOK_API_HOST = 'tiktok-scraper7.p.rapidapi.com';
const INSTAGRAM_API_HOST = 'instagram-looter2.p.rapidapi.com';

const AUTO_VERIFY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_PAGES_PER_ACCOUNT = 5;

interface VerifyRequest {
  managed_creator_post_ids: string[];
}

type VerifyResult = 'verified' | 'not_found' | 'error';

// ── TikTok helpers ──────────────────────────────────────────────────

async function fetchTikTokPostIds(
  username: string,
  apiKey: string,
  maxPages: number
): Promise<{ postIds: Set<string>; apiError: boolean }> {
  const postIds = new Set<string>();
  let cursor = '0';
  let apiError = false;

  for (let page = 0; page < maxPages; page++) {
    try {
      const url = `https://${TIKTOK_API_HOST}/user/posts?unique_id=${encodeURIComponent(username)}&count=35&cursor=${cursor}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': TIKTOK_API_HOST,
        },
      });

      if (!res.ok) { apiError = true; break; }

      const data = await res.json();
      if (data.code !== 0) { apiError = true; break; }

      const videos = data.data?.videos || [];

      // Only use video_id — scraper7's aweme_id is an encoded form that doesn't match
      // posts.post_id (which other providers and the sync transformer write as the 19-digit
      // canonical video_id). See supabase/functions/_shared/tiktok-api.ts:transformScraper7Video.
      for (const video of videos) {
        if (video.video_id) postIds.add(String(video.video_id));
      }

      const hasMore = data.data?.hasMore ?? false;
      const nextCursor = data.data?.cursor;
      if (!hasMore || !nextCursor || nextCursor === '0') break;
      cursor = String(nextCursor);
    } catch {
      apiError = true;
      break;
    }
  }

  return { postIds, apiError };
}

// ── Instagram helpers ───────────────────────────────────────────────

async function fetchInstagramPostPks(
  username: string,
  apiKey: string,
  maxPages: number
): Promise<{ postPks: Set<string>; apiError: boolean }> {
  const postPks = new Set<string>();
  let apiError = false;

  const headers = {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': INSTAGRAM_API_HOST,
  };

  let userPk: string | null = null;
  try {
    const profileRes = await fetch(
      `https://${INSTAGRAM_API_HOST}/web-profile?username=${encodeURIComponent(username)}`,
      { signal: AbortSignal.timeout(15_000), headers }
    );
    if (!profileRes.ok) {
      return { postPks, apiError: true };
    }
    const profileData = await profileRes.json();
    userPk = profileData?.data?.user?.id ?? null;
    if (!userPk) {
      return { postPks, apiError: true };
    }
  } catch {
    return { postPks, apiError: true };
  }

  let maxId: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    try {
      const params = new URLSearchParams({ id: userPk, count: '50' });
      if (maxId) params.set('max_id', maxId);

      const res = await fetch(`https://${INSTAGRAM_API_HOST}/reels?${params}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
        headers,
      });

      if (!res.ok) { apiError = true; break; }

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      for (const item of items) {
        const pk = item?.media?.pk;
        if (pk) postPks.add(String(pk));
      }

      const moreAvailable = data?.paging_info?.more_available;
      const nextMaxId = data?.paging_info?.max_id;
      if (!moreAvailable || !nextMaxId || items.length === 0) break;
      maxId = String(nextMaxId);
    } catch {
      apiError = true;
      break;
    }
  }

  return { postPks, apiError };
}

// ── YouTube helpers (batch ID lookup — stays the same) ──────────────

async function verifyYouTubePosts(
  videoIds: string[],
  apiKey: string
): Promise<Map<string, VerifyResult>> {
  const results = new Map<string, VerifyResult>();

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?id=${batch.join(',')}&part=status&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

      if (!res.ok) {
        for (const id of batch) results.set(id, 'error');
        continue;
      }

      const data = await res.json();
      const foundIds = new Set<string>(
        (data.items || []).map((item: { id: string }) => item.id)
      );

      for (const id of batch) {
        results.set(id, foundIds.has(id) ? 'verified' : 'not_found');
      }
    } catch {
      for (const id of batch) results.set(id, 'error');
    }
  }

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractYouTubeVideoId(postUrl: string): string | null {
  const shortsMatch = postUrl.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) return shortsMatch[1];
  const vMatch = postUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  return vMatch?.[1] ?? null;
}

interface PostRecord {
  mcp_id: string;
  post_id: string;
  platform: string;
  post_url: string;
  username: string;
  last_fetched_at: string | null;
}

interface UnverifiedPost {
  mcp_id: string;
  post_url: string | null;
  platform: string;
  username: string;
  reason: 'not_found' | 'api_error';
}

/**
 * POST /api/admin/creator-post-payments/verify
 *
 * Account-based verification:
 * 1. Auto-verify posts synced within the last 6 hours (no API call needed)
 * 2. Group remaining TikTok/Instagram posts by account, fetch each account's post list once
 * 3. YouTube uses batch ID lookup (already efficient)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const adminRole = await getAdminRole(user.id);
    if (!adminRole || !hasAccess(adminRole, PAYOUTS_ROLES)) {
      return Response.json({ error: 'Forbidden: Your admin role does not have payout access' }, { status: 403 });
    }

    const body: VerifyRequest = await req.json();
    const { managed_creator_post_ids } = body;

    if (!managed_creator_post_ids?.length) {
      return Response.json({ error: 'managed_creator_post_ids is required' }, { status: 400 });
    }

    if (managed_creator_post_ids.length > 500) {
      return Response.json({ error: 'Maximum 500 posts per verification' }, { status: 400 });
    }

    const { data: postsData, error: postsError } = await supabase
      .from('managed_creator_posts')
      .select(`
        id,
        post_id,
        posts!inner(
          id,
          post_id,
          platform,
          post_url,
          tiktok_username,
          instagram_username,
          youtube_username,
          last_fetched_at
        )
      `)
      .in('id', managed_creator_post_ids);

    if (postsError) {
      return Response.json({ error: 'Failed to fetch post data' }, { status: 500 });
    }

    const tiktokApiKey = process.env.RAPIDAPI_KEY_TIKTOK;
    const instagramApiKey = process.env.RAPIDAPI_KEY_INSTAGRAM;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    const now = Date.now();
    const autoVerifiedIds: string[] = [];
    const tiktokAccountMap = new Map<string, PostRecord[]>();
    const instagramAccountMap = new Map<string, PostRecord[]>();
    const youtubePosts: Array<{ mcp_id: string; videoId: string; postUrl: string; username: string }> = [];
    const unverifiable: Array<{ mcp_id: string; post_url: string | null; reason: string }> = [];

    for (const mcp of postsData || []) {
      const post = mcp.posts as unknown as {
        id: string;
        post_id: string | null;
        platform: string;
        post_url: string;
        tiktok_username: string | null;
        instagram_username: string | null;
        youtube_username: string | null;
        last_fetched_at: string | null;
      };

      const platform = post.platform;
      const postUrl = post.post_url;

      // Step 1: Auto-verify if synced recently
      if (post.last_fetched_at) {
        const fetchedAt = new Date(post.last_fetched_at).getTime();
        if (now - fetchedAt < AUTO_VERIFY_WINDOW_MS) {
          autoVerifiedIds.push(mcp.id);
          continue;
        }
      }

      // Step 2: Group by platform + account
      if (platform === 'tiktok') {
        const username = post.tiktok_username;
        if (!username) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'No TikTok username' });
          continue;
        }
        if (!tiktokApiKey) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'TikTok API key not configured' });
          continue;
        }
        if (!post.post_id) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'No TikTok video ID' });
          continue;
        }
        const key = username.toLowerCase();
        if (!tiktokAccountMap.has(key)) tiktokAccountMap.set(key, []);
        tiktokAccountMap.get(key)!.push({
          mcp_id: mcp.id,
          post_id: post.post_id,
          platform,
          post_url: postUrl,
          username,
          last_fetched_at: post.last_fetched_at,
        });
      } else if (platform === 'instagram') {
        const username = post.instagram_username;
        if (!username) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'No Instagram username' });
          continue;
        }
        if (!instagramApiKey) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'Instagram API key not configured' });
          continue;
        }
        if (!post.post_id) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'No Instagram post ID' });
          continue;
        }
        const key = username.toLowerCase();
        if (!instagramAccountMap.has(key)) instagramAccountMap.set(key, []);
        instagramAccountMap.get(key)!.push({
          mcp_id: mcp.id,
          post_id: post.post_id,
          platform,
          post_url: postUrl,
          username,
          last_fetched_at: post.last_fetched_at,
        });
      } else if (platform === 'youtube') {
        const videoId = post.post_id || (postUrl ? extractYouTubeVideoId(postUrl) : null);
        if (!videoId) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'No YouTube video ID' });
          continue;
        }
        if (!youtubeApiKey) {
          unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: 'YouTube API key not configured' });
          continue;
        }
        youtubePosts.push({
          mcp_id: mcp.id,
          videoId,
          postUrl,
          username: post.youtube_username || 'unknown',
        });
      } else {
        unverifiable.push({ mcp_id: mcp.id, post_url: postUrl, reason: `Unsupported platform: ${platform}` });
      }
    }

    // Build account groups for SSE init
    const tiktokAccounts = Array.from(tiktokAccountMap.entries()).map(([username, posts]) => ({
      username,
      postCount: posts.length,
    }));
    const instagramAccounts = Array.from(instagramAccountMap.entries()).map(([username, posts]) => ({
      username,
      postCount: posts.length,
    }));

    const totalAccountsToCheck = tiktokAccounts.length + instagramAccounts.length + (youtubePosts.length > 0 ? 1 : 0);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        }

        try {
          send('init', {
            totalPosts: managed_creator_post_ids.length,
            autoVerified: {
              count: autoVerifiedIds.length,
              ids: autoVerifiedIds,
            },
            accountsToCheck: {
              tiktok: tiktokAccounts,
              instagram: instagramAccounts,
              youtube: youtubePosts.length,
            },
            totalAccounts: totalAccountsToCheck,
            unverifiable,
          });

          const verifiedIds: string[] = [...autoVerifiedIds];
          const unverifiedPosts: UnverifiedPost[] = [];
          let accountsChecked = 0;

          // ── TikTok: one API call per account ──
          for (const [username, posts] of tiktokAccountMap) {
            send('account_start', {
              platform: 'tiktok',
              username,
              postCount: posts.length,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });

            const accountVerified: string[] = [];
            const accountNotFound: string[] = [];
            let accountError = false;

            const { postIds: accountPostIds, apiError } = await fetchTikTokPostIds(
              username,
              tiktokApiKey!,
              MAX_PAGES_PER_ACCOUNT
            );

            if (apiError && accountPostIds.size === 0) {
              accountError = true;
              for (const p of posts) {
                unverifiedPosts.push({
                  mcp_id: p.mcp_id,
                  post_url: p.post_url,
                  platform: 'tiktok',
                  username: p.username,
                  reason: 'api_error',
                });
              }
            } else {
              if (apiError) accountError = true;
              for (const p of posts) {
                if (accountPostIds.has(p.post_id)) {
                  verifiedIds.push(p.mcp_id);
                  accountVerified.push(p.mcp_id);
                } else {
                  accountNotFound.push(p.mcp_id);
                  unverifiedPosts.push({
                    mcp_id: p.mcp_id,
                    post_url: p.post_url,
                    platform: 'tiktok',
                    username: p.username,
                    reason: apiError ? 'api_error' : 'not_found',
                  });
                }
              }
            }

            accountsChecked++;
            send('account_complete', {
              platform: 'tiktok',
              username,
              verified: accountVerified,
              notFound: accountNotFound,
              error: accountError,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });
          }

          // ── Instagram: one API call per account ──
          for (const [username, posts] of instagramAccountMap) {
            send('account_start', {
              platform: 'instagram',
              username,
              postCount: posts.length,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });

            const accountVerified: string[] = [];
            const accountNotFound: string[] = [];
            let accountError = false;

            const { postPks: accountPostPks, apiError } = await fetchInstagramPostPks(
              username,
              instagramApiKey!,
              MAX_PAGES_PER_ACCOUNT
            );

            if (apiError && accountPostPks.size === 0) {
              accountError = true;
              for (const p of posts) {
                unverifiedPosts.push({
                  mcp_id: p.mcp_id,
                  post_url: p.post_url,
                  platform: 'instagram',
                  username: p.username,
                  reason: 'api_error',
                });
              }
            } else {
              if (apiError) accountError = true;
              for (const p of posts) {
                if (accountPostPks.has(p.post_id)) {
                  verifiedIds.push(p.mcp_id);
                  accountVerified.push(p.mcp_id);
                } else {
                  accountNotFound.push(p.mcp_id);
                  unverifiedPosts.push({
                    mcp_id: p.mcp_id,
                    post_url: p.post_url,
                    platform: 'instagram',
                    username: p.username,
                    reason: apiError ? 'api_error' : 'not_found',
                  });
                }
              }
            }

            accountsChecked++;
            send('account_complete', {
              platform: 'instagram',
              username,
              verified: accountVerified,
              notFound: accountNotFound,
              error: accountError,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });
          }

          // ── YouTube: batch ID lookup (treat as single "account") ──
          if (youtubePosts.length > 0) {
            send('account_start', {
              platform: 'youtube',
              username: 'batch',
              postCount: youtubePosts.length,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });

            const ytIds = youtubePosts.map((p) => p.videoId);
            const ytResults = await verifyYouTubePosts(ytIds, youtubeApiKey!);

            const ytVerified: string[] = [];
            const ytNotFound: string[] = [];
            let ytError = false;

            for (const post of youtubePosts) {
              const result = ytResults.get(post.videoId) || 'error';
              if (result === 'verified') {
                verifiedIds.push(post.mcp_id);
                ytVerified.push(post.mcp_id);
              } else {
                if (result === 'error') ytError = true;
                ytNotFound.push(post.mcp_id);
                unverifiedPosts.push({
                  mcp_id: post.mcp_id,
                  post_url: post.postUrl,
                  platform: 'youtube',
                  username: post.username,
                  reason: result === 'not_found' ? 'not_found' : 'api_error',
                });
              }
            }

            accountsChecked++;
            send('account_complete', {
              platform: 'youtube',
              username: 'batch',
              verified: ytVerified,
              notFound: ytNotFound,
              error: ytError,
              accountIndex: accountsChecked,
              totalAccounts: totalAccountsToCheck,
            });
          }

          send('complete', { verifiedIds, unverifiedPosts });
          controller.close();
        } catch (err) {
          console.error('[verify] Stream error:', err);
          send('error', { message: 'Verification failed due to an unexpected error' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[verify] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
