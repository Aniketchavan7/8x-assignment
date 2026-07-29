import { createServiceRoleClient } from '@/lib/db/supabase';
import { sendPushNotification } from './push-sender';
import { NEXT_PUBLIC_APP_URL } from '@/lib/env';
import { sendMessageEmail } from './message-email';
import { notifyAdminMessage } from './admin-slack-ping';
import { EVENT_TRANSACTIONAL, type EventType } from './events';

interface MessageRow {
  id: string;
  user_id: string;
  brand_organization_id: string | null;
  sender_user_id: string | null;
  event_type: string | null;
  body: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

interface RecipientRow {
  id: string;
  email: string | null;
  message_notifications_consent: boolean | null;
}

const DEFAULT_TITLES: Record<EventType, string> = {
  application_received: 'Application received',
  application_accepted: "You've been accepted",
  application_rejected: 'Application update',
  creator_dropped: 'Campaign update',
  campaign_reassigned: 'Campaign reassigned',
  payment_terms_changed: 'Payment terms updated',
  payment_sent: 'Payment sent',
  video_approved: 'Video approved',
  video_needs_changes: 'Video needs changes',
  video_rejected: 'Video not approved',
};

function titleFromMessage(message: MessageRow): string {
  const override = message.data?._title;
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  if (!message.event_type) return 'New message';
  return DEFAULT_TITLES[message.event_type as EventType] ?? 'Update from 8x';
}

function ctaUrlFromMessage(message: MessageRow): string {
  const base = NEXT_PUBLIC_APP_URL ?? 'https://app.example.com';
  const fragment = `#m-${message.id}`;
  return message.brand_organization_id
    ? `${base}/dashboard/messages?brand=${message.brand_organization_id}${fragment}`
    : `${base}/dashboard/messages${fragment}`;
}

/**
 * Fan out push, email, and Slack notifications for a single message row.
 * Runs after the inbound HTTP response is sent (Vercel `after()`); never throws
 * to the caller, but logs failures for observability.
 */
export async function fanoutMessage(messageId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: message } = await supabase
    .from('messages')
    .select('id, user_id, brand_organization_id, sender_user_id, event_type, body, data, created_at')
    .eq('id', messageId)
    .single();
  if (!message) return;

  const messageRow = message as unknown as MessageRow;

  // Creator-sent messages (creator → admin) only need a Slack ping;
  // we don't echo push/email back to the sender.
  const isCreatorOutbound = messageRow.sender_user_id === messageRow.user_id;

  if (isCreatorOutbound) {
    // Resolve creator display name for a more useful Slack ping.
    const { data: profile } = await supabase
      .from('creator_profiles')
      .select('display_name')
      .eq('user_id', messageRow.user_id)
      .maybeSingle();
    let brandName: string | null = null;
    if (messageRow.brand_organization_id) {
      const { data: brand } = await supabase
        .from('brand_organizations')
        .select('organization_name')
        .eq('id', messageRow.brand_organization_id)
        .maybeSingle();
      brandName = brand?.organization_name ?? null;
    }
    try {
      await notifyAdminMessage({
        messageId: messageRow.id,
        userId: messageRow.user_id,
        creatorName: profile?.display_name ?? null,
        brandOrganizationId: messageRow.brand_organization_id,
        brandName,
        preview: messageRow.body.slice(0, 300),
      });
    } catch (err) {
      console.error('[messaging/fanout] slack ping failed:', err);
    }
    return;
  }

  const { data: recipient } = await supabase
    .from('users')
    .select('id, email, message_notifications_consent')
    .eq('id', messageRow.user_id)
    .single();
  if (!recipient) return;

  const recipientRow = recipient as unknown as RecipientRow;

  // Unread count for the device badge — inbound only (system or admin).
  // Excludes the user's own outbound replies which would inflate the count.
  const { count: unreadCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', messageRow.user_id)
    .is('read_at', null)
    .or(`sender_user_id.is.null,sender_user_id.neq.${messageRow.user_id}`);

  const transactional = messageRow.event_type
    ? EVENT_TRANSACTIONAL.has(messageRow.event_type as EventType)
    : false;
  const wantsEmail = transactional || recipientRow.message_notifications_consent === true;

  // Push: sendPushNotification looks up active tokens itself, no need to
  // pre-fetch here. It returns false (no error) when there are no tokens.
  try {
    await sendPushNotification({
      userId: messageRow.user_id,
      title: titleFromMessage(messageRow),
      body: messageRow.body.slice(0, 200),
      badge: unreadCount ?? 0,
      data: {
        message_id: messageRow.id,
        event_type: messageRow.event_type,
        brand_organization_id: messageRow.brand_organization_id,
      },
    });
  } catch (err) {
    console.error('[messaging/fanout] push failed:', err);
  }

  if (wantsEmail && recipientRow.email) {
    try {
      await sendMessageEmail({
        to: recipientRow.email,
        title: titleFromMessage(messageRow),
        body: messageRow.body,
        ctaUrl: ctaUrlFromMessage(messageRow),
      });
    } catch (err) {
      console.error('[messaging/fanout] email failed:', err);
    }
  }
}
