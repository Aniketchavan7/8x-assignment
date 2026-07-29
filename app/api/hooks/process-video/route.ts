export const runtime = 'nodejs';
export const maxDuration = 300;

import { after } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { SYNC_CONFIG } from '@/lib/config/sync';
import { requireCronSecret } from '@/lib/cron/auth';
import { downloadAndStoreVideo, isPermanentError } from '@/lib/video/download';
import { transcribeVideo, analyzeVideo } from '@/lib/video/analyze';
import type { HygieneChecksOutput } from '@/lib/video/analyze';
import { runReplicationReview } from '@/lib/video/replication-review';
import { processReferenceVideo } from '@/lib/video/process-reference-video';
import { getOnboardingStorageUrl } from '@/lib/storage/url';
import { handleApiError } from '@/lib/utils/api-error';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { notifyOnVideoReview } from '@/lib/messaging/notify-on-video-review';
import type { Json } from '@/types/supabase';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

const MAX_RETRIES = SYNC_CONFIG.videoProcessing.maxRetries;
const MAX_REFERENCE_VIDEOS_TO_PROCESS = 5;

/**
 * POST /api/hooks/process-video
 *
 * Reactive video processing pipeline triggered by pg_net on post INSERT.
 * Downloads video to R2, transcribes with Groq Whisper, analyzes + hygiene with Gemini,
 * then runs replication review against brand reference videos.
 * Each step saves progress independently — partial results are preserved on failure.
 */
export async function POST(request: Request) {
  const authError = requireCronSecret(request);
  if (authError) return authError;

  let payload: { post_id?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const postId = payload.post_id;
  if (!postId) {
    return Response.json({ error: 'post_id required' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('id, post_id, post_type, platform, tiktok_username, raw_data, video_storage_url, video_storage_retry_count, transcript, video_summary, video_processing_status, video_processing_retry_count, latest_views')
      .eq('id', postId)
      .single();

    if (fetchError || !post) {
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.platform !== 'tiktok' || post.post_type !== 'video') {
      return Response.json({ skipped: true, reason: 'Not a TikTok video' });
    }

    // Claim guard: only process if status is claimable.
    // Includes in-progress states (downloading/transcribing/analyzing) to recover from serverless crashes.
    const CLAIMABLE_STATUSES = [null, 'pending', 'failed', 'downloading', 'transcribing', 'analyzing'];
    const claimable = post.video_processing_retry_count < MAX_RETRIES
      && CLAIMABLE_STATUSES.includes(post.video_processing_status);

    if (!claimable) {
      return Response.json({ skipped: true, reason: 'Already processing or completed' });
    }

    await supabase
      .from('posts')
      .update({ video_processing_status: 'downloading' })
      .eq('id', post.id);

    // --- Resolve brand context early (needed for hygiene params) ---
    let brandName = 'Unknown';
    let brandOrgId: string | null = null;
    let mcpId: string | null = null;
    let mcJobId: string | null = null;
    let mcLinkedUserId: string | null = null;
    let customChecks: Array<{ id: string; label: string; prompt: string }> = [];

    const { data: mcp } = await supabase
      .from('managed_creator_posts')
      .select('id, managed_creator_id, managed_creators(brand_organization_id, job_id, linked_user_id)')
      .eq('post_id', post.id)
      .maybeSingle();

    if (mcp) {
      mcpId = mcp.id;
      const mc = mcp.managed_creators as { brand_organization_id: string; job_id: string | null; linked_user_id: string | null } | null;
      brandOrgId = mc?.brand_organization_id ?? null;
      mcJobId = mc?.job_id ?? null;
      mcLinkedUserId = mc?.linked_user_id ?? null;

      if (brandOrgId) {
        const { data: brand } = await supabase
          .from('brand_organizations')
          .select('organization_name, hygiene_checks')
          .eq('id', brandOrgId)
          .single();

        if (brand) {
          brandName = brand.organization_name;
          customChecks = (brand.hygiene_checks as any[]) || [];
        }
      }
    }

    // --- Step 1: Download video to R2 (if not already stored) ---
    let videoBuffer: Buffer;

    if (post.video_storage_url) {
      const r2Response = await fetch(post.video_storage_url, { signal: AbortSignal.timeout(120_000) });
      if (!r2Response.ok) throw new Error(`R2 download failed: HTTP ${r2Response.status}`);
      videoBuffer = Buffer.from(await r2Response.arrayBuffer());
    } else {
      // Resolve creator country for region-aware download
      let country: string | null = null;
      if (post.tiktok_username) {
        const { data: mc } = await supabase
          .from('managed_creators')
          .select('linked_user_id')
          .eq('tiktok_username', post.tiktok_username)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (mc?.linked_user_id) {
          const { data: user } = await supabase
            .from('users')
            .select('country')
            .eq('id', mc.linked_user_id)
            .single();
          country = user?.country ?? null;
        }
      }

      const downloadResult = await downloadAndStoreVideo({
        post_id: post.post_id!,
        tiktok_username: post.tiktok_username!,
        raw_data: post.raw_data as Record<string, unknown> | null,
        creator_country: country,
      });

      if (!downloadResult.success || !downloadResult.buffer || !downloadResult.storageUrl) {
        const retryCount = downloadResult.permanent ? MAX_RETRIES : post.video_processing_retry_count + 1;
        await supabase.from('posts').update({
          video_processing_status: 'failed',
          video_processing_error: downloadResult.error || 'Download failed',
          video_processing_retry_count: retryCount,
          video_storage_error: downloadResult.error || 'Download failed',
          video_storage_retry_count: downloadResult.permanent ? 3 : (post.video_storage_retry_count ?? 0) + 1,
        }).eq('id', post.id);

        return Response.json({ success: false, step: 'download', error: downloadResult.error });
      }

      await supabase.from('posts').update({
        video_storage_url: downloadResult.storageUrl,
        video_stored_at: new Date().toISOString(),
        video_storage_error: null,
        video_storage_retry_count: 0,
      }).eq('id', post.id);

      videoBuffer = downloadResult.buffer;
    }

    // --- Step 2: Transcribe with Groq Whisper ---
    let transcript = post.transcript;
    let transcribed = false;

    if (!transcript) {
      await supabase.from('posts').update({ video_processing_status: 'transcribing' }).eq('id', post.id);

      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) throw new Error('GROQ_API_KEY not configured');

      const groq = new Groq({ apiKey: groqApiKey });
      try {
        const result = await transcribeVideo(videoBuffer, post.post_id!, groq);

        await supabase.from('posts').update({
          transcript: result.transcript,
          transcript_segments: result.segments,
        }).eq('id', post.id);

        transcript = result.transcript;
        transcribed = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[process-video] Transcription failed for ${post.post_id}, continuing to analysis: ${msg}`);
        transcript = '';
      }
    }

    // --- Step 3: Analyze with Gemini (+ hygiene when brand context available) ---
    let analyzed = false;
    let videoSummary = post.video_summary;
    let hygieneResult: HygieneChecksOutput | null = null;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

    if (!videoSummary) {
      await supabase.from('posts').update({ video_processing_status: 'analyzing' }).eq('id', post.id);

      if (!ai) throw new Error('GEMINI_API_KEY not configured');

      const hygieneParams = mcpId && brandOrgId
        ? { brandName, customChecks }
        : undefined;

      try {
        const result = await analyzeVideo(videoBuffer, transcript ?? '', post.latest_views, ai, hygieneParams);
        // Clean up Gemini file immediately — not needed after combined call
        ai.files.delete({ name: result.geminiFileName }).catch(() => {});

        videoSummary = result.summary;
        hygieneResult = result.hygiene;

        await supabase.from('posts').update({ video_summary: result.summary }).eq('id', post.id);
        analyzed = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[process-video] Analysis failed for ${post.post_id}, marking failed: ${msg}`);
        const retryCount = (post.video_processing_retry_count ?? 0) + 1;
        await supabase.from('posts').update({
          video_processing_status: 'failed',
          video_processing_error: msg,
          video_processing_retry_count: retryCount,
        }).eq('id', post.id);
        return Response.json({ success: false, step: 'analysis', error: msg });
      }
    }

    // --- Step 4: Insert hygiene review into post_reviews ---
    if (hygieneResult && mcpId) {
      // Dedup check
      const { data: existingHygiene } = await supabase
        .from('post_reviews')
        .select('id')
        .eq('managed_creator_post_id', mcpId)
        .eq('reviewer_type', 'ai')
        .filter('metadata->>review_type', 'eq', 'hygiene')
        .maybeSingle();

      if (!existingHygiene) {
        const hygieneStatus = hygieneResult.all_passed ? 'approved' : 'needs_changes';
        const { error: insertError } = await supabase
          .from('post_reviews')
          .insert({
            managed_creator_post_id: mcpId,
            reviewer_type: 'ai',
            reviewer_id: null,
            status: hygieneStatus,
            feedback: hygieneResult.all_passed
              ? 'All hygiene checks passed.'
              : `Failed checks: ${hygieneResult.failed_checks.join(', ')}`,
            metadata: {
              review_type: 'hygiene',
              ...hygieneResult,
            } as unknown as Json,
          });

        if (insertError) {
          console.warn(`[process-video] Failed to insert hygiene review for ${post.post_id}:`, insertError);
        }
      }

      // Slack notification for failed hygiene
      if (!hygieneResult.all_passed) {
        after(async () => {
          const { notifyHygieneFailure } = await import('@/lib/notifications/admin-slack');
          await notifyHygieneFailure({
            username: post.tiktok_username || 'unknown',
            brandName,
            postUrl: `https://www.tiktok.com/@${post.tiktok_username}/video/${post.post_id}`,
            managedCreatorPostId: mcpId!,
            failedChecks: hygieneResult!.failed_checks,
            checkDetails: {
              ...hygieneResult!.checks,
              ...hygieneResult!.custom_checks,
            },
          }).catch(captureFireAndForget('hygiene_slack_notification'));
        });
      }

      console.log(
        `[process-video] Hygiene @${post.tiktok_username} ${post.post_id}: ` +
        `${hygieneResult.all_passed ? 'ALL PASS' : `FAILED: ${hygieneResult.failed_checks.join(', ')}`} ` +
        `(${hygieneResult.processing_time_ms}ms)`
      );
    }

    // --- Done with core processing ---
    await supabase.from('posts').update({
      video_processing_status: 'completed',
      video_processing_error: null,
      video_processed_at: new Date().toISOString(),
    }).eq('id', post.id);

    console.log(
      `[process-video] Completed @${post.tiktok_username} ${post.post_id}` +
      ` (${transcribed ? 'T' : '-'}${analyzed ? 'A' : '-'}) ${videoBuffer.length} bytes`
    );

    // --- Step 5: Replication review (after marking completed, non-blocking) ---
    if (mcpId && brandOrgId && mcJobId && videoSummary && ai) {
      after(async () => {
        try {
          // Dedup check
          const { data: existingReplication } = await supabase
            .from('post_reviews')
            .select('id')
            .eq('managed_creator_post_id', mcpId!)
            .eq('reviewer_type', 'ai')
            .filter('metadata->>review_type', 'eq', 'replication')
            .maybeSingle();

          if (existingReplication) return;

          // Fetch reference videos for this job
          const { data: refVideos } = await supabase
            .from('brand_reference_videos')
            .select('id, storage_path, transcript, notes, ai_transcript, video_summary, matching_summary, video_processing_status, job_ids')
            .eq('brand_organization_id', brandOrgId!);

          const jobRefVideos = (refVideos ?? []).filter((v) => {
            const ids = v.job_ids as string[] | null;
            return !ids || ids.length === 0 || ids.includes(mcJobId!);
          });

          if (jobRefVideos.length === 0) {
            console.log(`[process-video] Skipping replication for ${post.post_id}: no reference videos`);
            return;
          }

          // Process any unprocessed reference videos (lazy)
          let processed = 0;
          for (const rv of jobRefVideos) {
            if (rv.video_processing_status === 'completed' && rv.video_summary) continue;
            if (processed >= MAX_REFERENCE_VIDEOS_TO_PROCESS) break;
            await processReferenceVideo(rv.id).catch((err) =>
              console.warn(`[process-video] Failed to process ref video ${rv.id}: ${err}`)
            );
            processed++;
          }

          // Re-fetch after processing
          const { data: updatedRefVideos } = await supabase
            .from('brand_reference_videos')
            .select('id, storage_path, transcript, notes, ai_transcript, video_summary, matching_summary, video_processing_status, job_ids')
            .eq('brand_organization_id', brandOrgId!);

          const readyVideos = (updatedRefVideos ?? [])
            .filter((v) => {
              const ids = v.job_ids as string[] | null;
              const jobMatch = !ids || ids.length === 0 || ids.includes(mcJobId!);
              return jobMatch && (v.video_summary || v.matching_summary);
            });

          if (readyVideos.length === 0) {
            console.log(`[process-video] Skipping replication for ${post.post_id}: no processed reference videos`);
            return;
          }

          const result = await runReplicationReview({
            creatorSummary: videoSummary!,
            creatorTranscript: transcript ?? '',
            referenceVideos: readyVideos,
            getStorageUrl: getOnboardingStorageUrl,
            ai,
          });

          const { error: insertError } = await supabase
            .from('post_reviews')
            .insert({
              managed_creator_post_id: mcpId!,
              reviewer_type: 'ai',
              reviewer_id: null,
              status: result.status,
              feedback: result.replication_analysis,
              metadata: {
                review_type: 'replication',
                ...result,
              } as unknown as Json,
            });

          if (insertError) {
            console.error(`[process-video] Failed to insert replication review for ${post.post_id}:`, insertError);
            return;
          }

          await notifyOnVideoReview(supabase, {
            reviewStatus: result.status,
            managedCreatorPostId: mcpId!,
            linkedUserId: mcLinkedUserId,
            brandOrganizationId: brandOrgId,
            postUrl: `https://www.tiktok.com/@${post.tiktok_username}/video/${post.post_id}`,
            feedback: result.replication_analysis,
            reviewerType: 'ai',
          });

          console.log(
            `[process-video] Replication @${post.tiktok_username} ${post.post_id}: ` +
            `score=${result.replication_score}/10 match=${result.matched_reference_video_id ? `${result.match_confidence}%` : 'none'} ` +
            `status=${result.status} (${result.processing_time_ms}ms)`
          );
        } catch (err) {
          console.error(`[process-video] Replication review failed for ${post.post_id}:`, err);
        }
      });
    }

    return Response.json({ success: true, postId: post.post_id, transcribed, analyzed });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process-video] Failed for ${postId}: ${errorMessage}`);

    try {
      const permanent = isPermanentError(errorMessage);
      const { data: current } = await supabase
        .from('posts')
        .select('video_processing_retry_count')
        .eq('id', postId)
        .single();
      const currentRetries = current?.video_processing_retry_count ?? 0;

      await supabase.from('posts').update({
        video_processing_status: 'failed',
        video_processing_error: errorMessage,
        video_processing_retry_count: permanent ? MAX_RETRIES : currentRetries + 1,
      }).eq('id', postId);
    } catch (dbError) {
      console.error(`[process-video] Failed to update error state for ${postId}:`, dbError);
    }

    return handleApiError(error, { route: '/api/hooks/process-video', method: 'POST' });
  }
}
