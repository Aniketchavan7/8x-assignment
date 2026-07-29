/**
 * Safe localStorage utilities with proper SSR guards.
 *
 * All localStorage access should go through these utilities to prevent
 * "localStorage is not defined" errors during server-side rendering.
 */

/**
 * Safely get an item from localStorage.
 * Returns null if localStorage is not available or if the key doesn't exist.
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Ensure localStorage exists
    if (!window.localStorage) {
      return null;
    }

    // Ensure getItem is a function (handles cases where polyfill might not be complete)
    const getItem = window.localStorage.getItem;
    if (typeof getItem !== 'function') {
      return null;
    }

    return getItem.call(window.localStorage, key);
  } catch (error) {
    console.error(`Failed to get item "${key}" from localStorage:`, error);
    return null;
  }
}

/**
 * Safely set an item in localStorage.
 * Silently fails if localStorage is not available.
 */
export function safeSetItem(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Ensure localStorage exists
    if (!window.localStorage) {
      return;
    }

    // Ensure setItem is a function
    const setItem = window.localStorage.setItem;
    if (typeof setItem !== 'function') {
      return;
    }

    setItem.call(window.localStorage, key, value);
  } catch (error) {
    console.error(`Failed to set item "${key}" in localStorage:`, error);
  }
}

/**
 * Safely remove an item from localStorage.
 * Silently fails if localStorage is not available.
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Ensure localStorage exists
    if (!window.localStorage) {
      return;
    }

    // Ensure removeItem is a function
    const removeItem = window.localStorage.removeItem;
    if (typeof removeItem !== 'function') {
      return;
    }

    removeItem.call(window.localStorage, key);
  } catch (error) {
    console.error(`Failed to remove item "${key}" from localStorage:`, error);
  }
}

/**
 * Safely clear all items from localStorage.
 * Silently fails if localStorage is not available.
 */
export function safeClear(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Ensure localStorage exists
    if (!window.localStorage) {
      return;
    }

    // Ensure clear is a function
    const clear = window.localStorage.clear;
    if (typeof clear !== 'function') {
      return;
    }

    clear.call(window.localStorage);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
}
