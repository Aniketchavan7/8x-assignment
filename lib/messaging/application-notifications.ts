/**
 * Application Notification Service (post-messaging-rebuild)
 *
 * Wraps `notify()` so existing callers don't change. Push/email/Slack fan-out
 * happens automatically via lib/messaging/fanout. Non-blocking.
 */

import { after } from 'next/server';
import { notifyInsert, runFanout } from '@/lib/messaging/notify';
import type { EventType } from '@/lib/messaging/events';

export type ApplicationNotificationType =
  | 'application_submitted'
  | 'application_accepted'
  | 'application_rejected';

interface NotifyApplicationParams {
  type: ApplicationNotificationType;
  /** Creator's user_id (TEXT — matches users.id). */
  userId: string;
  /** job_applications.id */
  applicationId: string;
  jobTitle: string;
  jobSlug?: string;
  brandName?: string;
  brandSlug?: string;
  jobId?: string;
  brandOrganizationId?: string;
}

const TYPE_TO_EVENT: Record<ApplicationNotificationType, EventType> = {
  application_submitted: 'application_received',
  application_accepted: 'application_accepted',
  application_rejected: 'application_rejected',
};

const COPY: Record<ApplicationNotificationType, (jobTitle: string, brand?: string) => string> = {
  application_submitted: (jobTitle, brand) =>
    `Your application for ${jobTitle}${brand ? ` with ${brand}` : ''} has been submitted. We'll let you know when there's an update.`,
  application_accepted: (jobTitle, brand) =>
    `Great news! Your application for ${jobTitle}${brand ? ` with ${brand}` : ''} has been accepted. Open the app to get started.`,
  application_rejected: (jobTitle, brand) =>
    `Your application for ${jobTitle}${brand ? ` with ${brand}` : ''} was not selected this time. Keep applying — more opportunities are coming!`,
};

/**
 * MUST be called from within a Next.js request handler — uses `after()` to
 * defer fanout. Inserts the message inline (fast) and runs push/email/Slack
 * after the response is sent.
 */
export async function notifyApplicationEvent(params: NotifyApplicationParams): Promise<void> {
  let messageId: string;
  try {
    messageId = await notifyInsert({
      userId: params.userId,
      eventType: TYPE_TO_EVENT[params.type],
      brandOrganizationId: params.brandOrganizationId ?? null,
      body: COPY[params.type](params.jobTitle, params.brandName),
      data: {
        application_id: params.applicationId,
        job_id: params.jobId ?? null,
        job_slug: params.jobSlug ?? null,
        brand_slug: params.brandSlug ?? null,
      },
    });
  } catch (error) {
    console.error('[notifyApplicationEvent] notifyInsert() failed:', error);
    return;
  }
  after(() => runFanout(messageId));
}
