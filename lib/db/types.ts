/**
 * Shared database entity type aliases.
 * These types are derived from the generated types/supabase.ts file.
 *
 * All database entity types should be imported from here rather than
 * defining them locally in each module.
 */

import { Database } from '@/types/supabase';

// ==============================================
// CORE IDENTITY TABLES
// ==============================================

/**
 * User entity from the users table.
 * Base authentication entity for all users (creators and brand members).
 */
export type User = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

// ==============================================
// BRAND ORGANIZATION & FINANCE TABLES
// ==============================================

/**
 * Brand Organization entity.
 * Represents a brand/company with subscription and billing information.
 */
export type BrandOrganization = Database['public']['Tables']['brand_organizations']['Row'];
export type BrandOrganizationInsert = Database['public']['Tables']['brand_organizations']['Insert'];
export type BrandOrganizationUpdate = Database['public']['Tables']['brand_organizations']['Update'];

/**
 * Brand Member entity.
 * Represents a user's membership in a brand organization, including role.
 */
export type BrandMember = Database['public']['Tables']['brand_members']['Row'];
export type BrandMemberInsert = Database['public']['Tables']['brand_members']['Insert'];
export type BrandMemberUpdate = Database['public']['Tables']['brand_members']['Update'];

/**
 * Brand Wallet entity.
 * Financial account for brand organizations.
 */
export type BrandWallet = Database['public']['Tables']['brand_wallet']['Row'];
export type BrandWalletInsert = Database['public']['Tables']['brand_wallet']['Insert'];
export type BrandWalletUpdate = Database['public']['Tables']['brand_wallet']['Update'];

/**
 * Brand Transaction entity.
 * Ledger movements per brand wallet.
 */
export type BrandTransaction = Database['public']['Tables']['brand_transactions']['Row'];
export type BrandTransactionInsert = Database['public']['Tables']['brand_transactions']['Insert'];
export type BrandTransactionUpdate = Database['public']['Tables']['brand_transactions']['Update'];

/**
 * Brand Invite entity.
 * Invitations for brand members.
 */
export type BrandInvite = Database['public']['Tables']['brand_invites']['Row'];
export type BrandInviteInsert = Database['public']['Tables']['brand_invites']['Insert'];
export type BrandInviteUpdate = Database['public']['Tables']['brand_invites']['Update'];

// ==============================================
// CREATOR PROFILE & EARNINGS TABLES
// ==============================================

/**
 * Creator Profile entity.
 * Extended profile information for creator accounts.
 */
export type CreatorProfile = Database['public']['Tables']['creator_profiles']['Row'];
export type CreatorProfileInsert = Database['public']['Tables']['creator_profiles']['Insert'];
export type CreatorProfileUpdate = Database['public']['Tables']['creator_profiles']['Update'];

/**
 * Creator Wallet entity.
 * Financial account for creators.
 */
export type CreatorWallet = Database['public']['Tables']['creator_wallet']['Row'];
export type CreatorWalletInsert = Database['public']['Tables']['creator_wallet']['Insert'];
export type CreatorWalletUpdate = Database['public']['Tables']['creator_wallet']['Update'];

/**
 * Creator Transaction entity.
 * Detailed wallet movements for creators.
 */
export type CreatorTransaction = Database['public']['Tables']['creator_transactions']['Row'];
export type CreatorTransactionInsert =
  Database['public']['Tables']['creator_transactions']['Insert'];
export type CreatorTransactionUpdate =
  Database['public']['Tables']['creator_transactions']['Update'];

// Note: creator_preferences and creator_experiences tables have been removed

/**
 * Creator Snapshot entity.
 * Time-series follower/heart/video counts for growth analytics.
 */
export type CreatorSnapshot = Database['public']['Tables']['creator_snapshots']['Row'];
export type CreatorSnapshotInsert = Database['public']['Tables']['creator_snapshots']['Insert'];
export type CreatorSnapshotUpdate = Database['public']['Tables']['creator_snapshots']['Update'];

// ==============================================
// SOCIAL MEDIA & CONTENT TABLES
// ==============================================

/**
 * Social Account entity (NEW connector table).
 * Links platform accounts (TikTok, Instagram) to ownership entities (creators, managed creators).
 * This is the unified abstraction layer for all social account ownership.
 */
export type SocialAccount = Database['public']['Tables']['social_accounts']['Row'];
export type SocialAccountInsert = Database['public']['Tables']['social_accounts']['Insert'];
export type SocialAccountUpdate = Database['public']['Tables']['social_accounts']['Update'];

/**
 * Post entity.
 * Individual content posts with engagement metrics.
 */
export type Post = Database['public']['Tables']['posts']['Row'];
export type PostInsert = Database['public']['Tables']['posts']['Insert'];
export type PostUpdate = Database['public']['Tables']['posts']['Update'];

/**
 * Post Metadata entity.
 * Rich TikTok metadata for posts.
 */
export type PostMetadata = Database['public']['Tables']['post_metadata']['Row'];
export type PostMetadataInsert = Database['public']['Tables']['post_metadata']['Insert'];
export type PostMetadataUpdate = Database['public']['Tables']['post_metadata']['Update'];

/**
 * Post Engagement Metric entity.
 * Time-series engagement metrics per post.
 */
export type PostEngagementMetric = Database['public']['Tables']['post_engagement_metrics']['Row'];
export type PostEngagementMetricInsert =
  Database['public']['Tables']['post_engagement_metrics']['Insert'];
export type PostEngagementMetricUpdate =
  Database['public']['Tables']['post_engagement_metrics']['Update'];

/**
 * TikTok Account entity.
 * TikTok-specific account details.
 */
export type TikTokAccount = Database['public']['Tables']['tiktok_accounts']['Row'];
export type TikTokAccountInsert = Database['public']['Tables']['tiktok_accounts']['Insert'];
export type TikTokAccountUpdate = Database['public']['Tables']['tiktok_accounts']['Update'];

/**
 * Instagram Account entity.
 * Instagram-specific account details.
 */
export type InstagramAccount = Database['public']['Tables']['instagram_accounts']['Row'];
export type InstagramAccountInsert = Database['public']['Tables']['instagram_accounts']['Insert'];
export type InstagramAccountUpdate = Database['public']['Tables']['instagram_accounts']['Update'];

/**
 * YouTube Account entity.
 * YouTube-specific account details.
 */
export type YouTubeAccount = Database['public']['Tables']['youtube_accounts']['Row'];
export type YouTubeAccountInsert = Database['public']['Tables']['youtube_accounts']['Insert'];
export type YouTubeAccountUpdate = Database['public']['Tables']['youtube_accounts']['Update'];

// ==============================================
// JOBS & CONTRACTS TABLES
// ==============================================

/**
 * Job entity.
 * Campaign briefs with slug, visibility, and lifecycle timestamps.
 */
export type Job = Database['public']['Tables']['jobs']['Row'];
export type JobInsert = Database['public']['Tables']['jobs']['Insert'];
export type JobUpdate = Database['public']['Tables']['jobs']['Update'];

/**
 * Job Application entity.
 * Creator submissions for jobs.
 */
export type JobApplication = Database['public']['Tables']['job_applications']['Row'];
export type JobApplicationInsert = Database['public']['Tables']['job_applications']['Insert'];
export type JobApplicationUpdate = Database['public']['Tables']['job_applications']['Update'];

/**
 * Job Requirement entity.
 * Target creator filters for jobs.
 */
export type JobRequirement = Database['public']['Tables']['job_requirements']['Row'];
export type JobRequirementInsert = Database['public']['Tables']['job_requirements']['Insert'];
export type JobRequirementUpdate = Database['public']['Tables']['job_requirements']['Update'];

// Note: job_tracked_accounts table has been removed
// Use brand_tracked_social_accounts for all tracking purposes

/**
 * Application Video entity.
 * Videos attached to job applications.
 */
export type ApplicationVideo = Database['public']['Tables']['applications_videos']['Row'];
export type ApplicationVideoInsert = Database['public']['Tables']['applications_videos']['Insert'];
export type ApplicationVideoUpdate = Database['public']['Tables']['applications_videos']['Update'];

// ==============================================
// MESSAGING
// ==============================================

/**
 * Message entity (single-table messaging — see messaging-rebuild migration).
 */
export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageInsert = Database['public']['Tables']['messages']['Insert'];
export type MessageUpdate = Database['public']['Tables']['messages']['Update'];

// ==============================================
// ENUMS
// ==============================================

/**
 * Account type enum.
 */
export type AccountType = Database['public']['Enums']['account_type'];

/**
 * Platform enum.
 */
export type Platform = Database['public']['Enums']['platform'];

/**
 * Post type enum.
 */
export type PostType = Database['public']['Enums']['post_type'];

/**
 * Content type enum.
 * Represents creator content creation types (ugc, ai_generated, clipping).
 */
export type ContentType = Database['public']['Enums']['content_type'];

/**
 * Post status enum.
 */
export type PostStatus = Database['public']['Enums']['post_status'];

/**
 * Job status enum.
 */
export type JobStatus = Database['public']['Enums']['job_status'];

/**
 * Job visibility enum.
 */
export type JobVisibility = Database['public']['Enums']['job_visibility'];

/**
 * Payment frequency enum.
 */
export type PaymentFrequency = Database['public']['Enums']['payment_frequency'];

/**
 * Application status enum.
 */
export type ApplicationStatus = Database['public']['Enums']['application_status'];

/**
 * Social account status enum.
 */
export type SocialAccountStatus = Database['public']['Enums']['social_account_status'];

/**
 * Social account type enum.
 */
export type SocialAccountType = Database['public']['Enums']['social_account_type'];

/**
 * Brand account status enum.
 */
export type BrandAccountStatus = Database['public']['Enums']['brand_account_status'];

/**
 * Brand activity status enum.
 */
export type BrandActivityStatus = Database['public']['Enums']['brand_activity_status'];

/**
 * Brand member role enum.
 */
export type BrandMemberRole = Database['public']['Enums']['brand_member_role'];

/**
 * Brand onboarding status enum.
 */
export type BrandOnboardingStatus = Database['public']['Enums']['brand_onboarding_status'];

/**
 * Creator account status enum.
 */
export type CreatorAccountStatus = Database['public']['Enums']['creator_account_status'];

/**
 * Creator onboarding status enum.
 */
export type CreatorOnboardingStatus = Database['public']['Enums']['creator_onboarding_status'];

/**
 * Work status enum.
 */
export type WorkStatus = Database['public']['Enums']['work_status'];

/**
 * Accepted currency enum.
 */
export type AcceptedCurrency = Database['public']['Enums']['accepted_currency'];

/**
 * Account preference enum.
 */
export type AccountPreference = Database['public']['Enums']['account_preference'];

/**
 * Willing to show face enum.
 */
export type WillingToShowFace = Database['public']['Enums']['willing_to_show_face'];

/**
 * Proficiency level enum.
 */
export type ProficiencyLevel = Database['public']['Enums']['proficiency_level'];

/**
 * Experience source type enum.
 */
export type ExperienceSourceType = Database['public']['Enums']['experience_source_type'];

/**
 * Interest enum.
 */
export type Interest = Database['public']['Enums']['interest'];

/**
 * Language enum.
 */
export type Language = Database['public']['Enums']['language'];

/**
 * Invitation status enum.
 */
export type InvitationStatus = Database['public']['Enums']['invitation_status'];

/**
 * Sentiment enum.
 */
export type Sentiment = Database['public']['Enums']['sentiment'];

/**
 * Transaction status enum.
 */
export type TransactionStatus = Database['public']['Enums']['transaction_status'];

/**
 * Brand transaction type enum.
 */
export type BrandTransactionType = Database['public']['Enums']['brand_transaction_type'];

/**
 * Creator transaction type enum.
 */
export type CreatorTransactionType = Database['public']['Enums']['creator_transaction_type'];

// ==============================================
// CPM CAMPAIGN TABLES
// ==============================================

/**
 * CPM Submission entity.
 * Tracks video submissions for CPM campaigns with view counts and earnings.
 */
export type CpmSubmission = Database['public']['Tables']['cpm_submissions']['Row'];
export type CpmSubmissionInsert = Database['public']['Tables']['cpm_submissions']['Insert'];
export type CpmSubmissionUpdate = Database['public']['Tables']['cpm_submissions']['Update'];

/**
 * CPM Submission Status enum.
 */
export type CpmSubmissionStatus = Database['public']['Enums']['cpm_submission_status'];
