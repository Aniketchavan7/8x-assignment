'use client';

import { useState, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import posthog from 'posthog-js';
import { shouldShowClientLogs } from '@/lib/utils/env-detection';

/**
 * Hook-based utilities for use within React components.
 * Use this hook when you have access to the PostHog context.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const posthog = usePostHogClient();
 *   posthog?.capture('button_clicked');
 * }
 * ```
 */
export function usePostHogClient() {
  const posthogClient = usePostHog();
  return posthogClient;
}

/**
 * Identify a user with PostHog.
 * PostHog queues events even before fully loaded, so these calls are safe.
 *
 * @param userId - The unique identifier for the user
 * @param properties - Optional user properties to set
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  // PostHog queues events even before fully loaded, so this is safe
  try {
    posthog.identify(userId, properties);
  } catch (error) {
    if (shouldShowClientLogs()) {
      console.warn('PostHog identify failed:', error);
    }
  }
}

/**
 * Track an event with PostHog.
 * PostHog queues events even before fully loaded, so these calls are safe.
 *
 * @param eventName - The name of the event to track
 * @param properties - Optional event properties
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  // PostHog queues events even before fully loaded, so this is safe
  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    if (shouldShowClientLogs()) {
      console.warn('PostHog capture failed:', error);
    }
  }
}

/**
 * Reset PostHog (useful for logout flows).
 */
export function reset() {
  if (typeof window === 'undefined') return;

  try {
    if (typeof posthog.reset === 'function') {
      posthog.reset();
    }
  } catch (error) {
    if (shouldShowClientLogs()) {
      console.warn('PostHog reset failed:', error);
    }
  }
}

// Feature flags that should be enabled in local development
const LOCAL_DEV_ENABLED_FLAGS: string[] = [];

/**
 * Hook to check if a feature flag is enabled.
 * Returns undefined while loading, then true/false once loaded.
 *
 * In local development (APP_ENV=development or localhost), certain flags
 * like 'cpm-campaign' are automatically enabled for testing.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isEnabled = useFeatureFlag('my-feature');
 *   if (isEnabled === undefined) return null; // Loading
 *   if (!isEnabled) return null; // Not enabled
 *   return <FeatureContent />;
 * }
 * ```
 */
export function useFeatureFlag(flagKey: string): boolean | undefined {
  const posthogClient = usePostHog();
  const [isEnabled, setIsEnabled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Check if we're in local development
    const isLocalDev =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        process.env.NEXT_PUBLIC_APP_ENV === 'development');

    // Auto-enable certain flags in local development
    if (isLocalDev && LOCAL_DEV_ENABLED_FLAGS.includes(flagKey)) {
      setIsEnabled(true);
      return;
    }

    if (!posthogClient) {
      setIsEnabled(false);
      return;
    }

    // Check if flags are already loaded
    const checkFlag = () => {
      const value = posthogClient.isFeatureEnabled(flagKey);
      setIsEnabled(value ?? false);
    };

    // PostHog may not have loaded flags yet
    if (posthogClient.isFeatureEnabled(flagKey) !== undefined) {
      checkFlag();
    } else {
      // Wait for flags to load
      posthogClient.onFeatureFlags(checkFlag);
    }
  }, [posthogClient, flagKey]);

  return isEnabled;
}
