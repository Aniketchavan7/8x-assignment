import { z } from 'zod';

// Enum values matching Supabase enums
// These must match Database['public']['Enums'] exactly
const PLATFORM_VALUES = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'linkedin',
] as const;
const JOB_STATUS_VALUES = [
  'draft',
  'open',
  'in_progress',
  'closed',
  'completed',
  'cancelled',
] as const;
const JOB_VISIBILITY_VALUES = ['public', 'private', 'invite_only'] as const;

// Zod schemas using Supabase enum values
export const JobStatusSchema = z.enum(['draft', 'open']); // Only 'draft' and 'open' are used in forms
export const JobVisibilitySchema = z.enum(JOB_VISIBILITY_VALUES);
export const PlatformSchema = z.enum(['instagram', 'tiktok', 'youtube', 'twitter']); // Only these platforms are used in job forms

// FAQ schema
export const FAQSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  answer: z.string().min(1, 'Answer is required'),
});

// Media schema (images and videos)
export const MediaItemSchema = z.object({
  url: z.string().url('Invalid media URL'),
  type: z.enum(['image', 'video']),
});

// Main job form schema — unified CPM model
export const JobFormDataSchema = z.object({
  // Essential fields only
  jobTitle: z.string().min(1, 'Job title is required'),
  description: z.string().min(1, 'Job description is required'),
  targetCountries: z.array(z.string()).min(1, 'At least one country is required'),
  platformsRequired: z.array(PlatformSchema).min(1, 'At least one platform is required'),
  // CPM bonus fields
  cpmBasePay: z.string().default(''),
  cpmRate: z.string().default(''),
  cpmCap: z.string().default(''),
  cpmPayoutThreshold: z.string().default('1000'),
  cpmPlatformsAllowed: z.array(z.string()).default(['tiktok', 'instagram']),
  autoApproveApplications: z.boolean().default(true),
  monthlyPayoutCap: z.string().default(''),
  // FAQs
  faqs: z.array(FAQSchema).default([]),
  // Media (optional - up to 5 images/videos)
  media: z.array(MediaItemSchema).max(5, 'Maximum 5 media items allowed').default([]),
  // Status defaults
  status: JobStatusSchema.default('open'),
  visibility: JobVisibilitySchema.default('public'),
});

// Schema for API request payload (transformed from JobFormData)
export const CreateJobRequestSchema = z.object({
  job_title: z.string().min(1),
  description: z.string().min(1),
  job_type: z.literal('cpm'),
  platforms_required: z.array(PlatformSchema),
  target_country: z.string(),
  // CPM fields (in cents)
  cpm_rate: z.number(),
  cpm_cap: z.number(),
  cpm_base_pay: z.number(),
  cpm_payout_threshold: z.number(),
  cpm_platforms_allowed: z.array(z.string()),
  auto_approve_applications: z.boolean(),
  monthly_payout_cap: z.number().nullable().optional(),
  status: z.enum(JOB_STATUS_VALUES).optional(),
  visibility: JobVisibilitySchema.optional(),
  // Store FAQs as JSON string in content_guidelines field for now
  faqs: z.array(FAQSchema).optional(),
  // Media URLs (optional)
  media: z.array(MediaItemSchema).optional(),
});

// Type exports
export type JobFormData = z.infer<typeof JobFormDataSchema>;
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type FAQ = z.infer<typeof FAQSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;

// Default values derived from schema
export const defaultJobFormData: JobFormData = {
  jobTitle: '',
  description: '',
  targetCountries: [],
  platformsRequired: ['instagram', 'tiktok', 'youtube', 'twitter'], // All platforms selected by default
  cpmBasePay: '',
  cpmRate: '',
  cpmCap: '',
  cpmPayoutThreshold: '1000',
  cpmPlatformsAllowed: ['tiktok', 'instagram'],
  autoApproveApplications: true,
  monthlyPayoutCap: '',
  faqs: [],
  media: [],
  status: 'open',
  visibility: 'public',
};

// Admin-specific defaults (different CPM defaults for admin job creation)
export const defaultAdminJobFormData: JobFormData = {
  ...defaultJobFormData,
  platformsRequired: ['instagram', 'tiktok'],
  cpmBasePay: '5',
  cpmRate: '1',
  cpmCap: '100',
  cpmPayoutThreshold: '5000',
};
