import { z } from 'zod';

export const MANAGED_CREATOR_STATUSES = [
  'applied',
  'test_videos_submitted',
  'accepted',
  'warming_up',
  'active',
  'ghosted',
  'rejected',
  'dropped',
  'unclear',
] as const;

export type ManagedCreatorStatus = (typeof MANAGED_CREATOR_STATUSES)[number];

export const managedCreatorStatusSchema = z.enum([...MANAGED_CREATOR_STATUSES]);

/** Individual status constants to avoid hardcoded strings. */
export const MC_STATUS = {
  APPLIED: 'applied',
  TEST_VIDEOS_SUBMITTED: 'test_videos_submitted',
  ACCEPTED: 'accepted',
  WARMING_UP: 'warming_up',
  ACTIVE: 'active',
  GHOSTED: 'ghosted',
  REJECTED: 'rejected',
  DROPPED: 'dropped',
  UNCLEAR: 'unclear',
} as const satisfies Record<string, ManagedCreatorStatus>;

/** Statuses where the creator can access the content brief, contract, and content tabs. */
export const CONTENT_ACCESSIBLE_STATUSES: readonly ManagedCreatorStatus[] = [
  MC_STATUS.ACCEPTED,
  MC_STATUS.WARMING_UP,
  MC_STATUS.ACTIVE,
  MC_STATUS.GHOSTED,
  MC_STATUS.UNCLEAR,
] as const;

export const MANAGED_CREATOR_STATUS_LABELS: Record<ManagedCreatorStatus, string> = {
  applied: 'Applied',
  test_videos_submitted: 'Video Submitted',
  accepted: 'Accepted',
  warming_up: 'Warming Up',
  active: 'Active',
  ghosted: 'Ghosted',
  rejected: 'Rejected',
  dropped: 'Dropped',
  unclear: 'Unclear',
};
