import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { WarmupScreenshotContentType } from './constants';

export type WarmupPlatform = 'tiktok' | 'instagram' | 'youtube';
export type WarmupAiStatus = 'pending' | 'pass' | 'fail' | 'needs_review';
export type WarmupReviewStatus = 'unreviewed' | 'approved' | 'rejected';

export const VerdictSchema = z.object({
  is_screen_time_screen: z.boolean(),
  source: z.enum(['tiktok', 'instagram', 'youtube', 'unknown']),
  day_minutes: z.number().int().min(0).nullable(),
  week_total_minutes: z.number().int().min(0).nullable(),
  meets_threshold: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(1000),
});

export type ScreenTimeVerdict = z.infer<typeof VerdictSchema>;

const SYSTEM_PROMPT = `You verify creator account warmup evidence.

Read the attached screenshot and decide whether it shows Screen Time / Time Watched usage for the requested platform. Return only valid JSON:
{
  "is_screen_time_screen": boolean,
  "source": "tiktok" | "instagram" | "youtube" | "unknown",
  "day_minutes": number | null,
  "week_total_minutes": number | null,
  "meets_threshold": boolean,
  "confidence": number,
  "reason": string
}

Threshold: at least 30 minutes for the day or 210 minutes for the week. Convert hours to minutes. Only native app screen time pages are acceptable: TikTok Screen time, Instagram Time spent, or YouTube Time watched. iOS Screen Time and Android Digital Wellbeing screenshots are not acceptable evidence. If text is unclear, lower confidence and explain what is missing.`;

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

function getReportedMinutes(verdict: ScreenTimeVerdict): number | null {
  if (verdict.day_minutes != null) return verdict.day_minutes;
  if (verdict.week_total_minutes != null) return Math.round(verdict.week_total_minutes / 7);
  return null;
}

function classifyVerdict(
  verdict: ScreenTimeVerdict,
  platform: WarmupPlatform
): Exclude<WarmupAiStatus, 'pending'> {
  const sourceMatches = verdict.source === platform;
  const reportedMinutes = getReportedMinutes(verdict);

  if (
    verdict.meets_threshold &&
    verdict.confidence >= 0.75 &&
    verdict.is_screen_time_screen &&
    sourceMatches
  ) {
    return 'pass';
  }

  if (!verdict.is_screen_time_screen || !sourceMatches) {
    return 'fail';
  }

  if (
    verdict.confidence >= 0.75 &&
    reportedMinutes != null &&
    reportedMinutes < 30 &&
    (verdict.week_total_minutes == null || verdict.week_total_minutes < 210)
  ) {
    return 'fail';
  }

  return 'needs_review';
}

export async function verifyScreenTimeScreenshot({
  imageBytes,
  contentType,
  platform,
}: {
  imageBytes: Uint8Array;
  contentType: WarmupScreenshotContentType;
  platform: WarmupPlatform;
}): Promise<{
  aiStatus: Exclude<WarmupAiStatus, 'pending'>;
  aiReportedMinutesSpent: number | null;
  verdict: ScreenTimeVerdict;
}> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType,
              data: Buffer.from(imageBytes).toString('base64'),
            },
          },
          {
            type: 'text',
            text: `Requested platform: ${platform}. Return only JSON.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI did not return a text response');
  }

  const parsed = VerdictSchema.parse(JSON.parse(stripJsonFences(textBlock.text)));
  return {
    aiStatus: classifyVerdict(parsed, platform),
    aiReportedMinutesSpent: getReportedMinutes(parsed),
    verdict: parsed,
  };
}
