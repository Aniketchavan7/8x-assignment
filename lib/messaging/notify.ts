import { createServiceRoleClient } from '@/lib/db/supabase';
import { fanoutMessage } from './fanout';
import type { EventType } from './events';
import type { Json } from '@/types/supabase';

export interface NotifyInput {
  /** Inbox owner — the creator who sees this message. */
  userId: string;
  /** Lifecycle event. Omit for plain text replies (admin or creator-sent). */
  eventType?: EventType;
  /** NULL/undefined = the 8x system thread. */
  brandOrganizationId?: string | null;
  /** NULL/undefined = system event. Set for creator-sent or admin replies. */
  senderUserId?: string | null;
  /** Pre-rendered body (locale-aware copy lives at the call site). */
  body: string;
  /**
   * Override the default title used for push notification + email subject.
   * When omitted, fanout falls back to the eventType default in DEFAULT_TITLES.
   * Stored on `data._title` so it travels with the message row.
   */
  titleOverride?: string;
  data?: Record<string, unknown>;
}

const MAX_BODY_LENGTH = 4000;

/**
 * Single entrypoint for every messaging side-effect.
 *
 * Performs the INSERT inline, then runs push/email/Slack fan-out inline.
 * Total latency: ~1-3s including external API calls. Callers that want a
 * fast response should call `notifyInsert()` to get back the message id,
 * then schedule `after(() => runFanout(id))` themselves.
 *
 * RLS is bypassed via the service-role client because system events
 * legitimately cross user boundaries; callers are responsible for authz.
 */
export async function notify(input: NotifyInput): Promise<string> {
  const id = await notifyInsert(input);
  try {
    await fanoutMessage(id);
  } catch (err) {
    console.error('[notify] fanoutMessage failed:', err);
  }
  return id;
}

/**
 * Insert-only variant. Use when the caller wants the message id back fast
 * (e.g. an admin reply that returns the id in the HTTP response) and is
 * willing to schedule fan-out themselves with `after(() => runFanout(id))`.
 */
export async function notifyInsert(input: NotifyInput): Promise<string> {
  if (input.body.length > MAX_BODY_LENGTH) {
    throw new Error(`notify(): body exceeds ${MAX_BODY_LENGTH} chars`);
  }

  const baseData = (input.data ?? {}) as Record<string, unknown>;
  const mergedData: Record<string, unknown> = input.titleOverride
    ? { ...baseData, _title: input.titleOverride }
    : baseData;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: input.userId,
      brand_organization_id: input.brandOrganizationId ?? null,
      sender_user_id: input.senderUserId ?? null,
      event_type: input.eventType ?? null,
      body: input.body,
      data: mergedData as Json,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`notify(): insert failed: ${error?.message ?? 'no row returned'}`);
  }

  return data.id;
}

/** Re-exported for callers that defer fanout via `after()`. */
export { fanoutMessage as runFanout } from './fanout';
