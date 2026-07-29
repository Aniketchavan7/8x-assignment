import Groq, { toFile } from 'groq-sdk';
import { GoogleGenAI, createUserContent } from '@google/genai';
import { execFile } from 'child_process';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const GROQ_MODEL = 'whisper-large-v3';
export const GEMINI_MODEL = 'gemini-2.5-flash';

export const SYSTEM_PROMPT = `You are an expert short-form video analyst combining the precision of a professional video editor with the strategic thinking of a growth marketer. You notice every cut, every text animation, every sound design choice. Be factual and precise — describe what you SEE and HEAR, not what you assume.`;

export const ANALYSIS_PROMPT = `Analyze this short-form video. The transcript is provided for context — focus on VISUAL and AUDIO elements.

Transcript: {transcript}

---

## CREATOR (describe once)
Appearance, clothing, grooming, makeup, styling. Note their energy level, typical body language, and eye contact pattern. Only mention changes from this baseline in the shot log.

## SHOT-BY-SHOT TIMELINE
For EVERY distinct cut (even 1-second jump cuts), provide:

**[TIMESTAMP]** — Shot type (talking head / screen recording / B-roll / text-only / product demo / green screen / skit)
- **Camera**: selfie, rear, tripod, handheld, screen capture. Framing (close-up, medium, wide). Angle (eye-level, below, above).
- **Setting**: location, notable objects, background details
- **What's shown**: actions, gestures, expressions, props, products, logos. For screen recordings: app/website name, URL if visible, UI elements (buttons, sidebars, icons), what's being demonstrated
- **On-screen text**: EXACT words. Font style (bold sans-serif, handwritten, CapCut word-by-word highlight with bounce, manual overlay). Color, size, placement (top/center/bottom), animation type (pop-in, typewriter, fade, slide)
- **Audio**: Voice (tone, pace, emphasis on what words) | Music (genre, mood, volume vs voice) | SFX (pops, whooshes, bleeps, notification sounds)
- **Watermarks**: Any visible platform watermarks (TikTok, CapCut, Instagram, YouTube, etc.), their position and prominence
- **Transition out**: hard cut, jump cut, swipe, zoom, fade

Note ONLY changes from previous shot for repeated elements (don't repeat "same setting" — say "same" or note what changed).

## STRATEGIC ANALYSIS

**Format**: archetype (storytime, tutorial, hot take, skit, listicle, GRWM, product review, green screen reaction)

**Hook (first 3 seconds)**:
- What's the scroll-stop technique? (pattern interrupt, provocative text, mid-conversation, unexpected action, etc.)
- First frame as thumbnail — would this stop a scroll? Why/why not?
- Hook effectiveness: /10

**Retention mechanics**:
- Where are the "keep watching" triggers? (open loops, visual changes, curiosity gaps)
- Predicted viewer drop-off points with timestamps and why
- Caption/subtitle strategy — how does it aid retention? (style, animation, readability)

**Pacing**: total cuts, average shot duration, editing rhythm (snappy/moderate/slow). Likely editing app.

**Audio design**: Background music (genre, mood, changes throughout, trending sound?). Sound effects and their purpose. Voice delivery (pace, tone, energy, authenticity).

**Brand integration**:
- What brand/product elements appear, where, and how prominent?
- Naturalness: /10 (1=forced ad read, 10=organic mention)
- Does the brand help or hurt the content's entertainment value?

**CTA**: What's the ask? How delivered (verbal, text overlay, both)? Effectiveness: /10

**Production quality**: Lighting, color grading, audio quality. Overall: raw authentic <-> polished professional.

**Watermarks**: List all detected watermarks from other platforms. Are they cross-posted from another platform? This is a significant quality issue.

**What would you change?** One specific edit that would improve this video.

**Performance assessment**: This video got {views} views. Does that match what you'd expect? What elements could push it higher or are holding it back?`;

export async function transcribeVideo(
  buffer: Buffer,
  postId: string,
  groq: Groq
): Promise<{ transcript: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const file = await toFile(buffer, `${postId}.mp4`, { type: 'video/mp4' });

  let transcription;
  try {
    transcription = await groq.audio.transcriptions.create({
      file,
      model: GROQ_MODEL,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('413') && !msg.includes('Too Large') && !msg.includes('request_too_large')) {
      throw err;
    }

    console.log(`[analyze] Video too large for Groq, extracting audio for ${postId}`);
    const mp4Path = join(tmpdir(), `pv-${postId}.mp4`);
    const mp3Path = join(tmpdir(), `pv-${postId}.mp3`);
    try {
      await fsPromises.writeFile(mp4Path, buffer);
      await execFileAsync('ffmpeg', ['-i', mp4Path, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', mp3Path, '-y']);
      const mp3Buffer = await fsPromises.readFile(mp3Path);
      const audioFile = await toFile(mp3Buffer, `${postId}.mp3`, { type: 'audio/mpeg' });
      transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: GROQ_MODEL,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });
    } finally {
      await fsPromises.unlink(mp4Path).catch(() => {});
      await fsPromises.unlink(mp3Path).catch(() => {});
    }
  }

  const segments = (transcription as unknown as { segments?: Array<{ start: number; end: number; text: string }> }).segments || [];

  return {
    transcript: transcription.text || '',
    segments: segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  };
}

export interface HygieneCheckResult {
  pass: boolean;
  detail: string;
}

export interface HygieneChecksOutput {
  version: 1;
  checked_at: string;
  processing_time_ms: number;
  brand_name: string;
  has_speech: boolean;
  checks: {
    has_captions: HygieneCheckResult;
    no_dead_spots: HygieneCheckResult;
    has_dynamic_hook: HygieneCheckResult;
    has_brand_presence: HygieneCheckResult;
  };
  custom_checks: Record<string, HygieneCheckResult>;
  all_passed: boolean;
  failed_checks: string[];
}

export interface HygieneParams {
  brandName: string;
  customChecks?: Array<{ id: string; label: string; prompt: string }>;
}

export interface AnalyzeVideoResult {
  summary: string;
  hygiene: HygieneChecksOutput | null;
  /** Gemini file URI — caller must delete via ai.files.delete() when done */
  geminiFileUri: string;
  /** Gemini file name — needed for deletion */
  geminiFileName: string;
  /** Only present when referenceVideos were passed */
  matchedReferenceId: string | null;
  replicationScore: number | null;
  replicationAnalysis: string | null;
  suggestions: string[];
}

function buildHygienePromptSection(
  brandName: string,
  transcript: string,
  hasSpeech: boolean,
  customChecks: Array<{ id: string; label: string; prompt: string }>
): string {
  const captionCheck = hasSpeech
    ? `1. **has_captions**: Does the video have on-screen text captions/subtitles visible throughout that follow the speech? Not just titles or overlays — actual subtitles.`
    : `1. **has_captions**: Auto-pass — no speech detected in this video, so captions are not expected. Set pass to true with detail "No speech detected, captions not required."`;

  const customItems = customChecks
    .map((c, i) => `${i + 5}. **${c.id}**: ${c.prompt}`)
    .join('\n\n');

  const customJsonFields = customChecks
    .map((c) => `      "${c.id}": { "pass": true/false, "detail": "<1 sentence>" }`)
    .join(',\n');

  const customSection = customChecks.length > 0
    ? `\n\n## Custom Brand Checks\n\n${customItems}`
    : '';

  const customJsonSection = customChecks.length > 0
    ? `,\n    "custom_checks": {\n${customJsonFields}\n    }`
    : `\n    "custom_checks": {}`;

  return `

---

## HYGIENE CHECKS

Evaluate this creator's video against these hygiene checks for brand "${brandName}".
Transcript: ${transcript || '(no speech detected)'}

### Universal Checks

${captionCheck}

2. **no_dead_spots**: Is there continuous activity throughout the video? No long pauses, awkward silences, or periods where nothing is happening. Every second should have either speech, movement, text changes, or visual transitions.

3. **has_dynamic_hook**: Do the first 2-3 seconds have something captivating — movement, text pop-in, pattern interrupt, unexpected visual, or energetic delivery? Would it stop a scroll?

4. **has_brand_presence**: Is the brand "${brandName}" present in ANY of these ways:
   - Mentioned verbally in the audio/transcript
   - Shown as on-screen text or logo
   - Product/platform demo or screen recording visible
   Any ONE of these is enough to pass.
${customSection}

Include a "hygiene" key in your JSON response:
  "hygiene": {
    "checks": {
      "has_captions": { "pass": true/false, "detail": "<1 sentence>" },
      "no_dead_spots": { "pass": true/false, "detail": "<1 sentence>" },
      "has_dynamic_hook": { "pass": true/false, "detail": "<1 sentence>" },
      "has_brand_presence": { "pass": true/false, "detail": "<1 sentence>" }
    }${customJsonSection}
  }`;
}

function buildReplicationPromptSection(
  references: Array<{ id: string; matching_summary: string | null; video_summary: string | null; ai_transcript: string | null; hintId?: string }>,
  hintId: string | undefined
): string {
  const refList = references
    .map((r) => `ID: ${r.id}\n${r.matching_summary || r.video_summary?.slice(0, 500) || r.ai_transcript?.slice(0, 300) || '(no summary)'}`)
    .join('\n\n');

  const hintLine = hintId
    ? `The transcript pre-screen suggests they most likely replicated reference ID: ${hintId}. Confirm or override this if visual evidence points elsewhere.`
    : '';

  return `

---

## REPLICATION REVIEW

The creator was asked to replicate one of the following brand reference videos.
${hintLine}

Reference videos:
${refList}

Add these fields to your JSON response:
  "matched_reference_id": "<ID of the reference they replicated, or null>",
  "replication_score": <1-10>,
  "replication_analysis": "<2-3 sentences>",
  "suggestions": ["<suggestion 1>", ...]

Score 1-10 on how closely they followed format, pacing, structure, and style. Reserve 9-10 for near-identical replications, 6-7 for clear attempts with notable deviations, 3-5 for loose interpretations, 1-2 for unrelated content.`;
}

function buildJsonAnalysisPrompt(
  transcript: string,
  views: number | null,
  hygieneSection: string,
  replicationSection: string
): string {
  const viewsStr = views ? views.toLocaleString() : 'unknown';
  return `Analyze this short-form video. The transcript is provided for context — focus on VISUAL and AUDIO elements.

Transcript: ${transcript || '(no transcript available)'}

Return a JSON object with two top-level keys: "analysis" and "hygiene".

The "analysis" key should contain a string with your full video analysis covering:
- Creator description (appearance, energy, body language)
- Shot-by-shot timeline with timestamps, camera, setting, on-screen text (exact words), audio, watermarks, transitions
- Format archetype
- Hook effectiveness (first 3 seconds) with score out of 10
- Retention mechanics and predicted drop-off points
- Pacing (total cuts, average shot duration, editing rhythm)
- Audio design (music, SFX, voice delivery)
- Brand integration and naturalness score out of 10
- CTA and effectiveness score out of 10
- Production quality assessment
- Watermarks from other platforms
- One specific improvement suggestion
- Performance assessment for ${viewsStr} views
${hygieneSection}${replicationSection}`;
}

/**
 * Gemini JSON mode sometimes produces unescaped double quotes inside long string values.
 * This extracts the analysis text and hygiene JSON separately using known structure.
 */
function repairGeminiJson(rawText: string): Record<string, unknown> {
  // Find the start of the analysis value (after "analysis": ")
  const analysisStart = rawText.indexOf('"analysis"');
  if (analysisStart === -1) throw new Error('No analysis key found');

  // Find the hygiene key — this marks where the analysis string ends.
  // Assumes "hygiene" appears exactly once at the top level (not inside the analysis string);
  // replication fields (matched_reference_id, replication_score, etc.) must follow it in the same object.
  const hygieneKeyPattern = /,\s*"hygiene"\s*:\s*\{/;
  const hygieneMatch = rawText.match(hygieneKeyPattern);
  if (!hygieneMatch || hygieneMatch.index == null) throw new Error('No hygiene key found');

  // Extract the raw analysis text between the opening quote and the hygiene key
  const afterAnalysisKey = rawText.indexOf(':', analysisStart);
  const openQuote = rawText.indexOf('"', afterAnalysisKey + 1);
  const analysisRaw = rawText.slice(openQuote + 1, hygieneMatch.index);

  // Trim trailing quote (the closing " before the comma)
  const analysisText = analysisRaw.replace(/"\s*$/, '');

  // Extract the hygiene JSON block (from "hygiene": to the end)
  const hygieneStart = hygieneMatch.index! + 1; // skip the comma
  const hygieneJson = rawText.slice(hygieneStart).replace(/\}\s*$/, ''); // trim outer closing brace
  const hygieneObj = JSON.parse(`{${hygieneJson}}`);

  return {
    analysis: analysisText,
    ...hygieneObj,
  };
}

/**
 * Analyze a video with Gemini. When hygieneParams is provided, uses JSON response mode
 * to return both the analysis and hygiene checks in a single call. When omitted (reference
 * video processing), returns text-only analysis.
 *
 * When referenceVideos is provided, the single Gemini call also performs replication scoring,
 * replacing the separate runReplicationReview calls.
 */
export async function analyzeVideo(
  videoBuffer: Buffer,
  transcript: string,
  views: number | null,
  ai: GoogleGenAI,
  hygieneParams?: HygieneParams,
  referenceVideos?: Array<{ id: string; matching_summary: string | null; video_summary: string | null; ai_transcript: string | null; hintId?: string }>
): Promise<AnalyzeVideoResult> {
  const startTime = Date.now();
  const basePrompt = ANALYSIS_PROMPT
    .replace('{transcript}', transcript || '(no transcript available)')
    .replace('{views}', views ? views.toLocaleString() : 'unknown');

  const useJson = !!hygieneParams;
  let prompt: string;

  if (useJson) {
    const hasSpeech = (transcript ?? '').trim().length > 10;
    const hygieneSection = buildHygienePromptSection(
      hygieneParams.brandName,
      transcript,
      hasSpeech,
      (hygieneParams.customChecks ?? []).slice(0, 5)
    );
    const hintId = referenceVideos?.find((r) => r.hintId)?.hintId;
    const replicationSection = referenceVideos?.length
      ? buildReplicationPromptSection(referenceVideos, hintId)
      : '';
    prompt = buildJsonAnalysisPrompt(transcript, views, hygieneSection, replicationSection);
  } else {
    prompt = basePrompt;
  }

  const uploadedFile = await ai.files.upload({
    file: new Blob([videoBuffer], { type: 'video/mp4' }),
    config: { mimeType: 'video/mp4' },
  });

  if (!uploadedFile.uri) throw new Error('Gemini file upload returned no URI');

  let file = uploadedFile;
  let pollAttempts = 0;
  const MAX_POLL_ATTEMPTS = 60;
  while (file.state === 'PROCESSING' && pollAttempts++ < MAX_POLL_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state !== 'ACTIVE') {
    ai.files.delete({ name: uploadedFile.name! }).catch(() => {});
    throw new Error(`Gemini file stuck in state: ${file.state}`);
  }

  let result;
  try {
    result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        ...(useJson ? { responseMimeType: 'application/json' as const } : {}),
      },
      contents: createUserContent([
        { fileData: { mimeType: 'video/mp4', fileUri: file.uri! } },
        prompt,
      ]),
    });
  } catch (err) {
    ai.files.delete({ name: uploadedFile.name! }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API error: ${msg}`);
  }

  const rawText = result.text || '';
  if (!rawText) {
    ai.files.delete({ name: uploadedFile.name! }).catch(() => {});
    const finishReason = result.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned empty response (finishReason: ${finishReason ?? 'unknown'})`);
  }

  let summary: string;
  let hygiene: HygieneChecksOutput | null = null;
  let matchedReferenceId: string | null = null;
  let replicationScore: number | null = null;
  let replicationAnalysis: string | null = null;
  let suggestions: string[] = [];

  if (useJson) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Gemini JSON mode sometimes produces unescaped quotes inside string values.
      // Attempt to repair by extracting the hygiene JSON block and parsing it separately.
      try {
        parsed = repairGeminiJson(rawText);
      } catch {
        ai.files.delete({ name: uploadedFile.name! }).catch(() => {});
        throw new Error('Gemini returned invalid JSON despite responseMimeType');
      }
    }

    summary = (parsed.analysis as string) || '';
    if (!summary) {
      ai.files.delete({ name: uploadedFile.name! }).catch(() => {});
      throw new Error('Gemini JSON response missing "analysis" field');
    }

    const hygieneData = parsed.hygiene as Record<string, unknown> | undefined;
    const checks = (hygieneData?.checks || {}) as Record<string, HygieneCheckResult>;
    const custom = (hygieneData?.custom_checks || {}) as Record<string, HygieneCheckResult>;

    const failedChecks: string[] = [];
    for (const [key, val] of Object.entries(checks)) {
      if (!val.pass) failedChecks.push(key);
    }
    for (const [key, val] of Object.entries(custom)) {
      if (!val.pass) failedChecks.push(key);
    }

    const hasSpeech = (transcript ?? '').trim().length > 10;
    hygiene = {
      version: 1,
      checked_at: new Date().toISOString(),
      processing_time_ms: Date.now() - startTime,
      brand_name: hygieneParams!.brandName,
      has_speech: hasSpeech,
      checks: {
        has_captions: checks.has_captions || { pass: true, detail: 'Not evaluated' },
        no_dead_spots: checks.no_dead_spots || { pass: true, detail: 'Not evaluated' },
        has_dynamic_hook: checks.has_dynamic_hook || { pass: true, detail: 'Not evaluated' },
        has_brand_presence: checks.has_brand_presence || { pass: true, detail: 'Not evaluated' },
      },
      custom_checks: custom,
      all_passed: failedChecks.length === 0,
      failed_checks: failedChecks,
    };

    if (referenceVideos?.length) {
      matchedReferenceId = (parsed.matched_reference_id as string | null) ?? null;
      replicationScore = typeof parsed.replication_score === 'number' ? parsed.replication_score : null;
      replicationAnalysis = (parsed.replication_analysis as string | null) ?? null;
      suggestions = Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]) : [];
    }
  } else {
    summary = rawText;
  }

  return {
    summary,
    hygiene,
    geminiFileUri: file.uri!,
    geminiFileName: uploadedFile.name!,
    matchedReferenceId,
    replicationScore,
    replicationAnalysis,
    suggestions,
  };
}
