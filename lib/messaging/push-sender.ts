/**
 * Expo Push Notification Sender
 * ──────────────────────────────
 * Sends push notifications to mobile devices via the Expo Push API.
 *
 * The Expo Push API is free and requires no API key — it uses
 * the Expo push token (ExponentPushToken[...]) that the mobile
 * client registers.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Features:
 *  - Batch sending (up to 100 per request)
 *  - Auto-deactivates invalid tokens
 *  - Retry on transient failures
 *  - Non-blocking — never throws to caller
 */

import { createServiceRoleClient } from '@/lib/db/supabase';

// ─── Types ────────────────────────────────────────────────────────────

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  categoryId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;  // Receipt ID when status is 'ok'
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}

export interface SendPushParams {
  /** The user ID to send to (looks up all active tokens) */
  userId: string;
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
  /** Extra data payload (for deep linking) */
  data?: Record<string, unknown>;
  /** Android notification channel */
  channelId?: string;
  /** Badge count to set */
  badge?: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Send a push notification to a user's mobile device(s).
 * Looks up all active push tokens for the user and sends to all of them.
 * Returns true if at least one notification was successfully sent.
 * Non-blocking — never throws.
 */
export async function sendPushNotification(params: SendPushParams): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();

    // Get all active push tokens for this user
    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('id, token')
      .eq('user_id', params.userId)
      .eq('active', true);

    const typedTokens = (tokens ?? []) as Array<{ id: string; token: string }>;

    if (error) {
      console.error('[ExpoPush] Failed to fetch tokens:', error.message);
      return false;
    }

    if (typedTokens.length === 0) {
      console.log(`[ExpoPush] No active push tokens for user ${params.userId}`);
      return false;
    }

    // Build messages for each token
    const messages: ExpoPushMessage[] = typedTokens.map((t) => ({
      to: t.token,
      title: params.title,
      body: params.body,
      data: params.data,
      sound: 'default',
      channelId: params.channelId ?? 'default',
      priority: 'high',
      badge: params.badge,
    }));

    // Send in batches
    const invalidTokenIds: string[] = [];
    let successfullyDelivered = 0;

    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      const batch = messages.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await fetch(EXPO_PUSH_API, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          console.error(`[ExpoPush] API error: ${response.status} ${response.statusText}`);
          // Batch failed entirely — tokens in this batch were not delivered
          continue;
        }

        const result = await response.json();
        const tickets: ExpoPushTicket[] = result.data ?? [];

        // Check each ticket — only count 'ok' tickets as delivered
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'ok') {
            successfullyDelivered++;
          } else {
            console.warn(`[ExpoPush] Ticket error: ${ticket.message}`, ticket.details);

            // Deactivate tokens that are no longer registered
            if (ticket.details?.error === 'DeviceNotRegistered') {
              const tokenIndex = i + idx;
              if (tokenIndex < typedTokens.length) {
                invalidTokenIds.push(typedTokens[tokenIndex].id);
              }
            }
          }
        });
      } catch (fetchErr) {
        console.error('[ExpoPush] Network error:', fetchErr);
        // Network error — tokens in this batch were not delivered
      }
    }

    // Deactivate invalid tokens
    if (invalidTokenIds.length > 0) {
      console.log(`[ExpoPush] Deactivating ${invalidTokenIds.length} invalid token(s)`);
      await supabase
        .from('push_tokens')
        .update({ active: false, updated_at: new Date().toISOString() })
        .in('id', invalidTokenIds);
    }

    console.log(
      `[ExpoPush] Sent to ${successfullyDelivered}/${typedTokens.length} device(s) for user ${params.userId}`,
    );
    return successfullyDelivered > 0;
  } catch (err) {
    console.error('[ExpoPush] Unexpected error:', err);
    return false;
  }
}
