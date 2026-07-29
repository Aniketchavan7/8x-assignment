/**
 * Lifecycle event types for the single-table messaging system.
 * Every messaging side-effect routes through `notify()` (lib/messaging/notify.ts)
 * with one of these `event_type` values, OR `null` for plain text replies.
 *
 * Adding a new event: append to EVENT_TYPES + add a default title in
 * `lib/messaging/fanout.ts:defaultTitles`. Decide whether it's transactional.
 */
export const EVENT_TYPES = [
  'application_received',
  'application_accepted',
  'application_rejected',
  'creator_dropped',
  'campaign_reassigned',
  'payment_terms_changed',
  'payment_sent',
  'video_approved',
  'video_needs_changes',
  'video_rejected',
] as const;

export type EventType = typeof EVENT_TYPES[number];

/**
 * Transactional events ignore the user's marketing-style opt-outs
 * (`message_notifications_consent`). Non-transactional events respect it.
 */
export const EVENT_TRANSACTIONAL: ReadonlySet<EventType> = new Set<EventType>([
  'payment_sent',
  'application_accepted',
  'application_rejected',
  'creator_dropped',
  'campaign_reassigned',
  'payment_terms_changed',
]);
