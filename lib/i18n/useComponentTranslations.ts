'use client';

import { useMessages } from 'next-intl';
import { useMemo } from 'react';

/**
 * Deep merge two objects, with the second object taking precedence for conflicts.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (result[key] || {}) as Record<string, unknown>,
        source[key] as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = source[key] as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Hook to access component translations from NextIntl context.
 * Messages are loaded on the server and passed through NextIntlClientProvider,
 * avoiding client-side dynamic imports and blocking rendering.
 *
 * This hook reads messages from the NextIntl context, merges shared translations
 * with component-specific translations, and returns the merged result.
 *
 * @param componentPath - Path to the component (e.g., "Dashboard", "Login")
 * @returns Merged translations object (never null, always returns at least an empty object)
 */
export function useComponentTranslations<T = Record<string, unknown>>(componentPath: string): T {
  const messages = useMessages() as Record<string, unknown> | undefined;

  // Access messages from NextIntl context
  // Messages are structured as: { common: {...}, [componentName]: {...}, shared: {...} }
  const translations = useMemo(() => {
    // Get shared translations (fallback to empty object if not available)
    // messages.shared contains the full shared translations object (which includes 'common')
    const sharedTranslations = (messages?.shared || messages?.common || {}) as Record<
      string,
      unknown
    >;

    // Get component-specific translations
    const componentTranslations = (messages?.[componentPath] || {}) as Record<string, unknown>;

    // Merge: shared translations first, then component-specific (which override)
    // This ensures components have access to both common.* and component-specific keys
    return deepMerge(sharedTranslations, componentTranslations) as T;
  }, [messages, componentPath]);

  return translations;
}
