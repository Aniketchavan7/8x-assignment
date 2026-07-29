'use server';

import { SUPABASE_URL, EDGE_AUTH_KEY } from '@/lib/env';

/**
 * Result of triggering a CPM post fetch.
 * - `queued: true` means the request was sent (success or failure will be handled async by cron)
 * - `queued: false` means we couldn't even send the request (config error)
 */
export type TriggerCpmPostFetchResult =
  | { queued: true }
  | { queued: false; error: string };

/**
 * Triggers edge function to fetch video data for a CPM submission.
 * This is fire-and-forget - the edge function will update the submission status.
 * If the initial request fails, the cron job will retry.
 */
export async function triggerCpmPostFetch(
  submissionId: string,
  videoUrl: string,
  platform: 'tiktok' | 'instagram',
  creatorProfileId: string
): Promise<TriggerCpmPostFetchResult> {
  if (!SUPABASE_URL || !EDGE_AUTH_KEY) {
    console.error('[CPM] Missing Supabase configuration');
    return { queued: false, error: 'Server configuration error' };
  }

  const baseUrl = SUPABASE_URL.replace(/\/$/, '');
  const functionName =
    platform === 'tiktok' ? 'fetch-tiktok-post-data' : 'fetch-instagram-post-data';
  const edgeFunctionUrl = `${baseUrl}/functions/v1/${functionName}`;

  try {
    const bodyParam = platform === 'tiktok' ? 'video_url' : 'post_url';

    const provider = platform === 'tiktok' ? 'scraptik' : 'tiktok-api23';

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${EDGE_AUTH_KEY}`,
      },
      body: JSON.stringify({
        [bodyParam]: videoUrl,
        cpm_mode: {
          creator_profile_id: creatorProfileId,
          cpm_submission_id: submissionId,
        },
        ...(platform === 'tiktok' && { provider }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || `HTTP ${response.status}` };
      }
      // Log but don't fail - cron will retry pending_fetch submissions
      console.error('[CPM] Edge function error (will retry via cron):', errorData);
    }

    // Request was sent - async processing will handle success/failure
    return { queued: true };
  } catch (error) {
    // Log but don't fail - cron will retry pending_fetch submissions
    console.error('[CPM] Failed to trigger edge function (will retry via cron):', error);
    return { queued: true };
  }
}
