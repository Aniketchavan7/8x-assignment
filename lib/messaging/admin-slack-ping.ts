import { SLACK_CHANNELS } from '@/lib/notifications/slack/channels';
import { sendSlackMessage } from '@/lib/notifications/slack/client';
import { NEXT_PUBLIC_APP_URL } from '@/lib/env';

export interface NotifyAdminMessageParams {
  messageId: string;
  userId: string;
  creatorName?: string | null;
  brandOrganizationId: string | null;
  brandName?: string | null;
  preview: string;
}

/**
 * Plain-text Slack ping to #messages when a creator sends a reply.
 * Block Kit was removed in PR #661 — keep this plain text only.
 */
export async function notifyAdminMessage(params: NotifyAdminMessageParams): Promise<void> {
  const baseUrl = NEXT_PUBLIC_APP_URL ?? 'https://app.example.com';
  const link = `${baseUrl}/admin/messages`;
  const preview = params.preview.length > 280 ? `${params.preview.slice(0, 280)}…` : params.preview;
  const creatorLabel = params.creatorName ?? params.userId;
  const brandLabel = params.brandName
    ? ` (about ${params.brandName})`
    : params.brandOrganizationId
      ? ` (brand ${params.brandOrganizationId})`
      : '';
  const text = `${creatorLabel} replied${brandLabel}: "${preview}" — ${link}`;

  await sendSlackMessage({ channelId: SLACK_CHANNELS.MESSAGES, text });
}
