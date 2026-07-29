export type PhoneValidationResult = {
  valid: boolean;
  e164?: string;
  country?: string;
  error?: string;
};

export type SendCodeResult = { success: boolean; error?: string };
export type VerifyCodeResult = { success: boolean; error?: string };

export type RateLimitResult = { allowed: boolean; retryAfterMs?: number };
