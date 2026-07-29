import { z } from 'zod';

/**
 * Environment variable validation schema.
 * Validates all required environment variables at startup to ensure
 * edge/server bundles are consistent and fail fast with clear errors.
 *
 * Note: Supabase now uses "publishable" and "secret" terminology instead of
 * "anon" and "service_role", though both are functionally equivalent.
 */
const envSchema = z
  .object({
    // Supabase - Using new naming convention (publishable/secret)
    NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .min(1, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required'),
    SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY is required').optional(),

    // Dedicated bearer for invoking Supabase Edge Functions. Decoupled from
    // SUPABASE_SECRET_KEY so DB-access credentials and edge-function auth
    // can rotate independently.
    EDGE_AUTH_KEY: z.string().min(1, 'EDGE_AUTH_KEY is required').optional(),

    // Stripe (EU - Primary account for EU/UK creators)
    // Support both NEXT_PUBLIC_ prefixed (for client access) and non-prefixed (legacy) names
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
      .string()
      .min(1, 'STRIPE_PUBLISHABLE_KEY is required')
      .optional(),
    STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required').optional(),

    // Stripe US (Secondary account for US creators)
    STRIPE_PUBLISHABLE_KEY_US: z
      .string()
      .min(1, 'STRIPE_PUBLISHABLE_KEY_US is required')
      .optional(),
    STRIPE_SECRET_KEY_US: z.string().min(1, 'STRIPE_SECRET_KEY_US is required').optional(),
    STRIPE_WEBHOOK_SECRET_US: z.string().min(1, 'STRIPE_WEBHOOK_SECRET_US is required').optional(),

    // Google Translate
    GOOGLE_TRANSLATE_API_KEY: z.string().min(1, 'GOOGLE_TRANSLATE_API_KEY is required').optional(),

    // Application URLs
    BASE_URL: z.string().url('BASE_URL must be a valid URL').optional(), // Legacy - kept for backward compatibility
    NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL').optional(),
    NEXT_PUBLIC_MARKETING_URL: z
      .string()
      .url('NEXT_PUBLIC_MARKETING_URL must be a valid URL')
      .optional(),

    // Cron Jobs
    CRON_SECRET: z.string().min(1, 'CRON_SECRET is required').optional(),

    // Resend Email
    RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required').optional(),

    // Twilio (Phone Verification)
    TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required').optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required').optional(),
    TWILIO_VERIFY_SERVICE_SID: z
      .string()
      .min(1, 'TWILIO_VERIFY_SERVICE_SID is required')
      .optional(),
    TWILIO_PHONE_NUMBER: z.string().min(1, 'TWILIO_PHONE_NUMBER is required').optional(),

    // Slack Notifications (using Slack Web API)
    // Bot token for authentication
    SLACK_BOT_TOKEN: z.string().min(1, 'SLACK_BOT_TOKEN is required').optional(),
    // Channel IDs for different notification types
    SLACK_CHANNEL_ID_DEVELOPMENT: z
      .string()
      .min(1, 'SLACK_CHANNEL_ID_DEVELOPMENT is required')
      .optional(),
    SLACK_CHANNEL_ID_USERS: z.string().min(1, 'SLACK_CHANNEL_ID_USERS is required').optional(),
    SLACK_CHANNEL_ID_MESSAGES: z.string().min(1, 'SLACK_CHANNEL_ID_MESSAGES is required').optional(),
  })
  .passthrough(); // Allow additional env vars that aren't validated

/**
 * Validated environment variables.
 * Throws an error at startup if any required variables are missing.
 */
export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  EDGE_AUTH_KEY: process.env.EDGE_AUTH_KEY,
  // Fallback to STRIPE_PUBLISHABLE_KEY for backwards compatibility (server-side only)
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  // US Stripe account
  STRIPE_PUBLISHABLE_KEY_US: process.env.STRIPE_PUBLISHABLE_KEY_US,
  STRIPE_SECRET_KEY_US: process.env.STRIPE_SECRET_KEY_US,
  STRIPE_WEBHOOK_SECRET_US: process.env.STRIPE_WEBHOOK_SECRET_US,
  GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY,
  BASE_URL: process.env.BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID_DEVELOPMENT: process.env.SLACK_CHANNEL_ID_DEVELOPMENT,
  SLACK_CHANNEL_ID_USERS: process.env.SLACK_CHANNEL_ID_USERS,
  SLACK_CHANNEL_ID_MESSAGES: process.env.SLACK_CHANNEL_ID_MESSAGES,
});

// Export individual variables for convenience
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY;
export const EDGE_AUTH_KEY = env.EDGE_AUTH_KEY;
export const STRIPE_PUBLISHABLE_KEY = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
export const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_PUBLISHABLE_KEY_US = env.STRIPE_PUBLISHABLE_KEY_US;
export const STRIPE_SECRET_KEY_US = env.STRIPE_SECRET_KEY_US;
export const STRIPE_WEBHOOK_SECRET_US = env.STRIPE_WEBHOOK_SECRET_US;
export const GOOGLE_TRANSLATE_API_KEY = env.GOOGLE_TRANSLATE_API_KEY;
export const BASE_URL = env.BASE_URL; // Legacy - kept for backward compatibility
export const NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL;
export const NEXT_PUBLIC_MARKETING_URL = env.NEXT_PUBLIC_MARKETING_URL;
export const CRON_SECRET = env.CRON_SECRET;
export const RESEND_API_KEY = env.RESEND_API_KEY;
export const TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
export const TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
export const TWILIO_VERIFY_SERVICE_SID = env.TWILIO_VERIFY_SERVICE_SID;
export const TWILIO_PHONE_NUMBER = env.TWILIO_PHONE_NUMBER;
export const SLACK_BOT_TOKEN = env.SLACK_BOT_TOKEN;
export const SLACK_CHANNEL_ID_DEVELOPMENT = env.SLACK_CHANNEL_ID_DEVELOPMENT;
export const SLACK_CHANNEL_ID_USERS = env.SLACK_CHANNEL_ID_USERS;
export const SLACK_CHANNEL_ID_MESSAGES = env.SLACK_CHANNEL_ID_MESSAGES;
