import { Resend } from 'resend';
import { RESEND_API_KEY } from '@/lib/env';
import {
  emailLayout,
  escapeHtml,
  toTitleCase,
  LIST_UNSUBSCRIBE_HEADERS,
} from '@/lib/notifications/email-layout';

export interface SendMessageEmailParams {
  to: string;
  recipientName?: string;
  title: string;
  body: string;
  ctaUrl?: string;
}

export async function sendMessageEmail(params: SendMessageEmailParams): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[messaging/email] Skipping — RESEND_API_KEY not configured');
    return;
  }

  const recipientName = params.recipientName
    ? toTitleCase(params.recipientName)
    : 'there';

  const greeting = `<p style="margin:0 0 16px;color:#18181b;font-size:15px;line-height:1.6;">Hi ${escapeHtml(
    recipientName
  )},</p>`;
  const messageHtml = `<div style="padding:12px 16px;background-color:#f4f4f5;border-radius:6px;color:#3f3f46;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(
    params.body
  )}</div>`;

  const html = emailLayout({
    body: `${greeting}${messageHtml}`,
    cta: params.ctaUrl ? { label: 'Open in 8x', url: params.ctaUrl } : undefined,
    isNotification: true,
  });

  const text = `${params.title}\n\nHi ${recipientName},\n\n${params.body}${
    params.ctaUrl ? `\n\nOpen: ${params.ctaUrl}` : ''
  }\n\n— 8x`;

  try {
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: 'Notifications <notifications@example.com>',
      to: params.to,
      subject: params.title,
      html,
      text,
      headers: LIST_UNSUBSCRIBE_HEADERS,
    });
  } catch (error) {
    console.error('[messaging/email] Failed:', error);
  }
}
