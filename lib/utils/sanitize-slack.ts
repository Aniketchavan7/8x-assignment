/**
 * Escape special Slack mrkdwn characters in user-controlled text.
 * Prevents injection of links, mentions, or formatting via `<`, `>`, `&`.
 */
export function sanitizeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
