/**
 * Shared email layout for all 8x notification emails.
 * Simple, consistent design: white card on gray, dark CTA button, no colored banners.
 */

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

interface EmailLayoutOptions {
  /** Pre-formatted HTML that goes inside the white card */
  body: string;
  /** Optional CTA button rendered below the body */
  cta?: { label: string; url: string };
  /** Override the default footer HTML */
  footerHtml?: string;
  /** If true, adds "Manage notifications" link to footer */
  isNotification?: boolean;
}

export const NOTIFICATION_MANAGE_URL = 'https://app.example.com/dashboard/profile';

export function emailLayout({ body, cta, footerHtml, isNotification }: EmailLayoutOptions): string {
  const ctaBlock = cta
    ? `<table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 24px;">
        <tr><td style="text-align: center;">
          <a href="${escapeHtml(cta.url)}" style="display: inline-block; background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">${escapeHtml(cta.label)}</a>
        </td></tr>
      </table>`
    : '';

  const defaultFooter = isNotification
    ? `<p style="margin: 0; font-size: 12px; color: #a1a1aa;">Sent by 8x &middot; <a href="${NOTIFICATION_MANAGE_URL}" style="color: #a1a1aa; text-decoration: underline;">Manage notifications</a></p>`
    : '<p style="margin: 0; font-size: 12px; color: #a1a1aa;">Sent by 8x</p>';

  const footer = footerHtml ?? defaultFooter;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f4f4f5; font-family: ${FONT_STACK};">
    <tr><td style="padding: 40px 20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 520px; margin: 0 auto;">
        <tr><td style="padding-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 800; color: #18181b; letter-spacing: -0.5px;">8x</span>
        </td></tr>
        <tr><td style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7;">
          <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
            <tr><td style="padding: 32px;">
              ${body}
              ${ctaBlock}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding: 24px 0 0; text-align: center;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Title-case a name: "NISHAN KHAN" → "Nishan Khan" */
export function toTitleCase(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Headers for notification emails — enables native unsubscribe in Gmail/Apple Mail */
export const LIST_UNSUBSCRIBE_HEADERS = {
  'List-Unsubscribe': `<${NOTIFICATION_MANAGE_URL}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
};

/** Gray inset block for quoted content (feedback, messages, etc.) */
export function emailBlockquote(content: string): string {
  return `<div style="padding: 12px 16px; background-color: #f4f4f5; border-radius: 6px; margin: 16px 0;">
    <div style="color: #3f3f46; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${content}</div>
  </div>`;
}
