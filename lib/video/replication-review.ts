import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL } from '@/lib/video/analyze';

export interface ReferenceVideo {
  id: string;
  storage_path: string | null;
  transcript: string | null;
  notes: string | null;
  ai_transcript: string | null;
  video_summary: string | null;
  matching_summary: string | null;
}

export interface ReplicationReviewResult {
  matched_reference_video_id: string | null;
  matched_reference_video_url: string | null;
  match_confidence: number;
  match_reasoning: string;
  replication_score: number;
  replication_analysis: string;
  suggestions: string[];
  status: 'approved' | 'needs_changes';
  reference_videos_considered: number;
  processing_time_ms: number;
}

const MATCH_THRESHOLD = 50;

/**
 * Run replication review by comparing a creator's video against brand reference videos.
 * Pure function — no DB access. All inputs provided by caller.
 *
 * Flow:
 * 1. Match creator video to a reference video (transcript tier + summary tier)
 * 2. If matched above threshold: score replication 1-10
 * 3. If no match: replication_score = 0
 */
export async function runReplicationReview(params: {
  creatorSummary: string;
  creatorTranscript: string;
  referenceVideos: ReferenceVideo[];
  getStorageUrl: (storagePath: string) => string;
  ai: GoogleGenAI;
}): Promise<ReplicationReviewResult> {
  const { creatorSummary, creatorTranscript, referenceVideos, getStorageUrl, ai } = params;
  const startTime = Date.now();
  const jsonConfig = { responseMimeType: 'application/json' as const };

  type MatchResult = { matched_id: string | null; confidence: number; reasoning: string };
  const candidates: MatchResult[] = [];

  // Tier 1: Transcript comparison
  const refsWithTranscripts = referenceVideos.filter((v) => v.ai_transcript || v.transcript);
  if (creatorTranscript && refsWithTranscripts.length > 0) {
    const transcriptList = refsWithTranscripts.map((v) =>
      `ID: ${v.id}\nTranscript: ${v.ai_transcript || v.transcript}`
    ).join('\n\n');

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: jsonConfig,
      contents: `Compare this creator's transcript against reference video transcripts. Which reference video (if any) is the creator replicating? If the creator went completely off-script and their video has nothing to do with any reference, return null.

Creator transcript:
${creatorTranscript}

Reference transcripts:
${transcriptList}

Respond with JSON: { "matched_id": "<ID or null>", "confidence": <0-100>, "reasoning": "<brief>" }`,
    });
    try { candidates.push(JSON.parse(result.text || '{}')); } catch { /* skip */ }
  }

  // Tier 2: Summary/matching_summary structural comparison
  const summaryList = referenceVideos.map((v) =>
    `ID: ${v.id}\n${v.matching_summary || v.video_summary?.slice(0, 500) || '(no summary)'}`
  ).join('\n\n');

  const tier2Result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    config: jsonConfig,
    contents: `You are comparing a creator's video against a set of brand reference videos to determine which one (if any) the creator was trying to replicate.

## Creator's Video Analysis
${creatorSummary.slice(0, 3000)}

## Creator's Transcript
${creatorTranscript || '(no transcript)'}

## Reference Videos
${summaryList}

## Instructions
Determine which reference video the creator was most likely trying to replicate based on format, structure, transcript similarity, visual elements, and overall approach.

Respond ONLY with valid JSON (no markdown fences):
{
  "matched_id": "<reference video ID or null if no clear match>",
  "confidence": <0-100>,
  "reasoning": "<1-2 sentence explanation>"
}`,
  });
  try { candidates.push(JSON.parse(tier2Result.text || '{}')); } catch { /* skip */ }

  // Pick highest confidence, apply threshold
  const bestMatch = candidates
    .filter((c) => c.matched_id && c.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)[0];

  const matchData: MatchResult = bestMatch && bestMatch.confidence >= MATCH_THRESHOLD
    ? bestMatch
    : { matched_id: null, confidence: bestMatch?.confidence ?? 0, reasoning: bestMatch?.reasoning || 'No match — creator went off-script' };

  const matchedVideo = matchData.matched_id
    ? referenceVideos.find((v) => v.id === matchData.matched_id) ?? null
    : null;

  // Score replication if matched
  let replicationScore = 0;
  let replicationAnalysis = 'No clear match to any reference video.';
  let suggestions: string[] = [];

  if (matchedVideo) {
    const scoreResult = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: jsonConfig,
      contents: `You are a video content coach for a creator marketplace. A creator replicated a brand reference video. Score how well they did.

## Creator's Video Analysis
${creatorSummary.slice(0, 3000)}

## Creator's Transcript
${creatorTranscript || '(no transcript)'}

## Matched Reference Video
${matchedVideo.video_summary?.slice(0, 3000) || '(no summary)'}

## Reference Notes
${matchedVideo.notes || matchedVideo.transcript || '(none)'}

Score replication quality 1-10. How closely did they follow the reference format, pacing, structure, and style? Also provide 3-5 specific, actionable suggestions for improvement.

Respond ONLY with valid JSON (no markdown fences):
{
  "replication_score": <1-10>,
  "replication_analysis": "<2-3 sentences>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>", ...]
}`,
    });

    try {
      const parsed = JSON.parse(scoreResult.text || '{}');
      replicationScore = parsed.replication_score ?? 0;
      replicationAnalysis = parsed.replication_analysis || '';
      suggestions = parsed.suggestions || [];
    } catch (err) {
      console.warn(`[replication-review] Failed to parse scoring JSON: ${err}`);
    }
  }

  const status: 'approved' | 'needs_changes' = replicationScore >= 8 ? 'approved' : 'needs_changes';

  const matchedUrl = matchedVideo?.storage_path
    ? getStorageUrl(matchedVideo.storage_path)
    : null;

  return {
    matched_reference_video_id: matchData.matched_id,
    matched_reference_video_url: matchedUrl,
    match_confidence: matchData.confidence,
    match_reasoning: matchData.reasoning,
    replication_score: replicationScore,
    replication_analysis: replicationAnalysis,
    suggestions,
    status,
    reference_videos_considered: referenceVideos.length,
    processing_time_ms: Date.now() - startTime,
  };
}
