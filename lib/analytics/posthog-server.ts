import { PostHog } from 'posthog-node';
import { shouldShowLogs, getAppEnvironment } from '@/lib/utils/env-detection';

let posthogClient: PostHog | null = null;
const appEnv = getAppEnvironment();

export function getPostHogClient(): PostHog | null {
  if (posthogClient) {
    return posthogClient;
  }

  const posthogKey = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost =
    process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!posthogKey) {
    if (shouldShowLogs()) {
      console.warn('PostHog key not found. Server-side analytics will be disabled.');
    }
    return null;
  }

  posthogClient = new PostHog(posthogKey, {
    host: posthogHost,
    flushAt: 20,
    flushInterval: 10000,
  });

  return posthogClient;
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  const client = getPostHogClient();
  if (client) {
    client.identify({
      distinctId: userId,
      properties: {
        environment: appEnv,
        ...properties,
      },
    });
  }
}

export function trackEvent(
  distinctId: string,
  eventName: string,
  properties?: Record<string, unknown>
) {
  const client = getPostHogClient();
  if (client) {
    client.capture({
      distinctId,
      event: eventName,
      properties: {
        environment: appEnv,
        ...properties,
      },
    });
  }
}

export async function getFeatureFlag(
  flagKey: string,
  distinctId: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const client = getPostHogClient();
  if (!client) return defaultValue;
  try {
    const result = await client.isFeatureEnabled(flagKey, distinctId);
    return result ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Get the variant key of a multivariate feature flag.
 * Returns the variant string or `defaultValue` if the flag is missing, boolean, or errors.
 *
 * `personProperties` lets callers pass attributes (e.g. `{ country: 'Mexico' }`)
 * so PostHog cohort-targeting rules can evaluate without the distinct id
 * needing to be an ingested person.
 */
export async function getFeatureFlagVariant(
  flagKey: string,
  distinctId: string,
  defaultValue: string,
  personProperties?: Record<string, string>
): Promise<string> {
  const client = getPostHogClient();
  if (!client) return defaultValue;
  try {
    const result = await client.getFeatureFlag(
      flagKey,
      distinctId,
      personProperties ? { personProperties } : undefined
    );
    if (typeof result === 'string') return result;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function shutdown() {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
