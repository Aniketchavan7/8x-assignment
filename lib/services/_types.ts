/**
 * Shared types for the services layer.
 *
 * Services are pure async functions:
 *   (ctx: ServiceContext, input: T) => Promise<R>
 *
 * They do not read cookies/headers/env, and they do not call
 * revalidatePath/redirect. The web and mobile wrappers inject a Supabase
 * client and a user, then translate thrown ServiceErrors to their own
 * response envelopes (ActionState vs. JSON).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type ServiceSupabase = SupabaseClient<Database>;

export interface ServiceUser {
  id: string;
  email?: string | null;
  share_code?: string | null;
}

export interface ServiceContext {
  user: ServiceUser;
  supabase: ServiceSupabase;
  /**
   * Optional elevated client for operations that cross RLS boundaries
   * (e.g. writing to `managed_creators` from a creator-scoped web session).
   * Wrappers inject a service-role client here when needed. Mobile wrappers
   * pass service-role for `supabase`, so this usually stays undefined there.
   */
  elevatedSupabase?: ServiceSupabase;
}

/**
 * Known error codes emitted by services. Wrappers use these to pick
 * the right HTTP status or UI message without pattern-matching strings.
 */
export type ServiceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'bad_request'
  | 'upstream_failure'
  | 'internal';

const CODE_STATUS: Record<ServiceErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  bad_request: 400,
  // Upstream (Stripe, etc.) failures return 500 to preserve pre-refactor
  // status codes — the API route handlers have always returned 500 on
  // Stripe payout/transfer failures; clients branch on status code for
  // retry/error-rendering decisions. Switch to 502 would be more correct
  // per HTTP semantics but would regress that client contract.
  upstream_failure: 500,
  internal: 500,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ServiceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = CODE_STATUS[code];
    this.details = details;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
