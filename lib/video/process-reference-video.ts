import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { getOnboardingStorageUrl } from '@/lib/storage/url';
import { transcribeVideo, analyzeVideo, GEMINI_MODEL } from '@/lib/video/analyze';
import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

const MATCHING_SUMMARY_PROMPT = `Condense this video analysis into a ~200 word structural summary optimized for matching against other videos. Focus on:
- Format archetype (tutorial, skit, storytime, GRWM, product review, etc.)
- Hook technique (first 3 seconds)
- Key visual setup (setting, camera style, props)
- Structure and pacing (number of scenes, shot types, editing rhythm)
- Brand/product integration approach
- On-screen text style and placement
- Audio design (music genre, voice delivery style)
- CTA approach

Be specific and factual. This summary will be compared against creator videos to determine which reference they replicated.

Analysis:
{analysis}`;

type ReferenceVideoRow = {
  id: string;
  storage_path: string | null;
  transcript: string | null;
  notes: string | null;
  onscreen_text: string | null;
  music: string | null;
  disclaimer: string | null;
  video_processing_status: string | null;
  video_summary: string | null;
  file_hash: string | null;
};

/**
 * Process a single brand reference video: download → transcribe → analyze.
 *
 * If the video has no storage_path, builds a synthetic summary from the manual fields.
 * Idempotent — skips if already completed.
 */
export async function processReferenceVideo(referenceVideoId: string): Promise<{
  success: boolean;
  summary: string | null;
  error?: string;
}> {
  const supabase = createServiceRoleClient();

  const { data: video, error: fetchError } = await supabase
    .from('brand_reference_videos')
    .select('id, storage_path, transcript, notes, onscreen_text, music, disclaimer, video_processing_status, video_summary, file_hash')
    .eq('id', referenceVideoId)
    .single();

  if (fetchError || !video) {
    return { success: false, summary: null, error: 'Reference video not found' };
  }

  // Already fully processed (summary + hash) — skip
  if (video.video_processing_status === 'completed' && video.video_summary && video.file_hash) {
    return { success: true, summary: video.video_summary };
  }

  // Completed but missing hash — fast path: just download and hash
  if (video.video_processing_status === 'completed' && video.video_summary && !video.file_hash && video.storage_path) {
    try {
      const videoUrl = getOnboardingStorageUrl(video.storage_path);
      const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
      if (response.ok) {
        const videoBuffer = Buffer.from(await response.arrayBuffer());
        const fileHash = createHash('sha256').update(videoBuffer).digest('hex');
        const { error: updateError } = await supabase.from('brand_reference_videos').update({ file_hash: fileHash }).eq('id', video.id);
        if (updateError) {
          console.warn(`[process-reference-video] Hash backfill DB update failed for ${video.id}: ${updateError.message}`);
        } else {
          console.log(`[process-reference-video] Backfilled hash for ${video.id}`);
        }
      } else {
        console.warn(`[process-reference-video] Hash backfill download failed for ${video.id}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.warn(`[process-reference-video] Hash backfill failed for ${video.id}: ${err}`);
    }
    return { success: true, summary: video.video_summary };
  }

  // Guard against concurrent processing — only proceed if status is claimable
  const CLAIMABLE = [null, 'failed'];
  if (!CLAIMABLE.includes(video.video_processing_status)) {
    return { success: false, summary: null, error: 'Already processing or completed' };
  }

  // Atomic claim via conditional update (avoids PostgREST .or() bug on mutations)
  const { data: claimed } = await supabase
    .from('brand_reference_videos')
    .update({ video_processing_status: 'downloading' })
    .eq('id', video.id)
    .is('video_processing_status', null)
    .select('id');

  // If status was 'failed', claim with eq instead
  if (!claimed?.length && video.video_processing_status === 'failed') {
    await supabase
      .from('brand_reference_videos')
      .update({ video_processing_status: 'downloading' })
      .eq('id', video.id)
      .eq('video_processing_status', 'failed');
  } else if (!claimed?.length) {
    return { success: false, summary: null, error: 'Already claimed by another process' };
  }

  try {
    // No storage_path → build synthetic summary from manual fields
    if (!video.storage_path) {
      const summary = buildSyntheticSummary(video);
      await supabase.from('brand_reference_videos').update({
        video_summary: summary,
        matching_summary: summary,
        video_processing_status: 'completed',
        video_processed_at: new Date().toISOString(),
        video_processing_error: null,
      }).eq('id', video.id);

      return { success: true, summary };
    }

    // Has storage_path → full processing pipeline (already claimed as 'downloading' above)

    const videoUrl = getOnboardingStorageUrl(video.storage_path);
    const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      throw new Error(`Storage download failed: HTTP ${response.status}`);
    }
    const videoBuffer = Buffer.from(await response.arrayBuffer());

    // Compute SHA-256 hash for duplicate detection
    const fileHash = createHash('sha256').update(videoBuffer).digest('hex');

    // Transcribe
    await supabase.from('brand_reference_videos').update({
      video_processing_status: 'transcribing',
    }).eq('id', video.id);

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) throw new Error('GROQ_API_KEY not configured');

    const groq = new Groq({ apiKey: groqApiKey });
    let aiTranscript = '';
    let aiTranscriptSegments: Array<{ start: number; end: number; text: string }> = [];

    try {
      const result = await transcribeVideo(videoBuffer, video.id, groq);
      aiTranscript = result.transcript;
      aiTranscriptSegments = result.segments;

      await supabase.from('brand_reference_videos').update({
        ai_transcript: aiTranscript,
        ai_transcript_segments: aiTranscriptSegments,
      }).eq('id', video.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[process-reference-video] Transcription failed for ${video.id}, continuing: ${msg}`);
    }

    // Analyze with Gemini
    await supabase.from('brand_reference_videos').update({
      video_processing_status: 'analyzing',
    }).eq('id', video.id);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured');

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const analysisResult = await analyzeVideo(videoBuffer, aiTranscript, null, ai);
    const summary = analysisResult.summary;

    // Clean up Gemini file (not needed for reference videos)
    ai.files.delete({ name: analysisResult.geminiFileName }).catch(() => {});

    // Generate matching summary (text-only, no video upload)
    const matchingSummary = await generateMatchingSummary(ai, summary);

    await supabase.from('brand_reference_videos').update({
      video_summary: summary,
      matching_summary: matchingSummary,
      file_hash: fileHash,
      video_processing_status: 'completed',
      video_processing_error: null,
      video_processed_at: new Date().toISOString(),
    }).eq('id', video.id);

    console.log(`[process-reference-video] Completed ${video.id} (${videoBuffer.length} bytes)`);
    return { success: true, summary };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process-reference-video] Failed for ${video.id}: ${errorMessage}`);

    await supabase.from('brand_reference_videos').update({
      video_processing_status: 'failed',
      video_processing_error: errorMessage,
    }).eq('id', video.id);

    return { success: false, summary: null, error: errorMessage };
  }
}

function buildSyntheticSummary(video: ReferenceVideoRow): string {
  const parts: string[] = [];

  if (video.transcript) {
    parts.push(`## Transcript\n${video.transcript}`);
  }
  if (video.notes) {
    parts.push(`## Notes\n${video.notes}`);
  }
  if (video.onscreen_text) {
    parts.push(`## On-Screen Text\n${video.onscreen_text}`);
  }
  if (video.music) {
    parts.push(`## Music\n${video.music}`);
  }
  if (video.disclaimer) {
    parts.push(`## Disclaimer\n${video.disclaimer}`);
  }

  if (parts.length === 0) {
    return '(No content available for this reference video)';
  }

  return `# Reference Video Summary (from manual fields)\n\n${parts.join('\n\n')}`;
}

async function generateMatchingSummary(ai: GoogleGenAI, fullAnalysis: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: MATCHING_SUMMARY_PROMPT.replace('{analysis}', fullAnalysis),
    });
    return result.text || fullAnalysis.slice(0, 1000);
  } catch (err) {
    console.warn(`[process-reference-video] Matching summary generation failed, using truncated analysis: ${err}`);
    return fullAnalysis.slice(0, 1000);
  }
}
