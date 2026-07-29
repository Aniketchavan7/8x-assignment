/**
 * @deprecated This file is kept for backwards compatibility.
 * Please import from domain-specific modules instead:
 * - lib/modules/auth/queries.ts
 * - lib/modules/team/queries.ts
 * - lib/modules/billing/queries.ts
 * - lib/modules/activity/queries.ts
 */

// Re-export from domain-specific modules for backwards compatibility
export { getUser } from '@/lib/modules/auth/queries';
export { getTeamForUser, getTeamByStripeCustomerId } from '@/lib/modules/team/queries';
export { updateTeamSubscription } from '@/lib/modules/billing/queries';
