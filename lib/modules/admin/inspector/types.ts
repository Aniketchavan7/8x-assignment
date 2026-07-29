export type Platform = 'tiktok' | 'instagram' | 'youtube';

export interface AccountSummary {
  id: string;
  platform: Platform;
  username: string;
  profilePicUrl: string | null;
  profileUrl: string | null;
  followerCount: number | null;
  postCount: number;
  channelId: string | null; // youtube only
  videoCount: number | null; // youtube only
  trackingDisabled: boolean;
  trackingStatus: string | null;
  syncStatus: string | null;
  syncError: string | null;
  consecutiveSyncFailures: number | null;
  lastSyncedAt: string | null;
  lastPostsFetchedAt: string | null;
  backfillStatus: string | null;
  backfillCursor: string | null;
  syncStartedAt: string | null;
  createdAt: string | null;
}

export interface RelationshipMc {
  id: string;
  name: string;
  status: string;
  isActive: boolean | null;
  brandOrganizationId: string | null;
  brandName: string | null;
  basePayCents: number | null;
  fkLinked: boolean;
  linkedUserId: string | null;
}

export interface RelationshipBtsa {
  id: string;
  brandOrganizationId: string;
  brandName: string | null;
  campaign: string | null;
  frozen: boolean;
}

export interface RelationshipDuplicate {
  id: string;
  username: string;
  followerCount: number | null;
  postCount: number;
  lastSyncedAt: string | null;
  createdAt: string | null;
}

export interface RelationshipsPayload {
  managedCreators: RelationshipMc[];
  btsas: RelationshipBtsa[];
  duplicates: RelationshipDuplicate[];
}

export interface InspectorPost {
  id: string;
  platform: Platform;
  postUrl: string;
  thumbnailUrl: string | null;
  postedAt: string;
  lastFetchedAt: string | null;
  latestViews: number | null;
  latestLikes: number | null;
  latestComments: number | null;
  latestShares: number | null;
  isExcluded: boolean;
  // MCP
  mcpId: string | null;
  mcpManagedCreatorId: string | null;
  mcpManagedCreatorName: string | null;
  mcpBrandName: string | null;
  basePayCents: number | null;
  bonusCents: number | null;
  totalOwedCents: number | null;
  totalPaidCents: number | null;
  paymentStatus: string | null;
  // Video storage
  videoStorageUrl: string | null;
  videoStoredAt: string | null;
  // AI
  hasTranscript: boolean;
  hasSummary: boolean;
  hygieneChecks: unknown | null;
}

export interface DryRunPreview {
  count: number;
  sample: unknown[];
  summary: string;
}

export type InspectorActionType =
  | 'force_resync'
  | 'toggle_tracking'
  | 'reset_sync_state'
  | 'link_mc'
  | 'merge_duplicate'
  | 'reassign_mcp'
  | 'create_missing_mcp'
  | 'toggle_exclude_post'
  | 'edit_mcp_pay'
  | 'freeze_btsa';
