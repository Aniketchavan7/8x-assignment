/**
 * Shared Formatting Utilities
 *
 * Centralized formatting functions used across the analytics dashboard
 * for displaying numbers, dates, and time-related values.
 */

/**
 * Formats a number to a compact representation (K, M, B)
 *
 * @param num - The number to format
 * @returns Formatted string (e.g., "1.2K", "3.5M", "2.1B")
 *
 * @example
 * formatNumber(1234) // "1.2K"
 * formatNumber(1234567) // "1.2M"
 * formatNumber(1234567890) // "1.2B"
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Formats a number as a percentage
 *
 * @param num - The number to format
 * @returns Formatted percentage string (e.g., "12.5%")
 */
export function formatPercentage(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  return `${num.toFixed(1)}%`;
}

/**
 * Formats a date string to DD/MM/YYYY format
 *
 * @param dateString - ISO date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
}

/**
 * Translation strings for time ago formatting
 */
export interface TimeAgoTranslations {
  justNow?: string;
  never?: string;
  minutesAgo?: string;
  hoursAgo?: string;
  daysAgo?: string;
}

/**
 * Formats a date string to a relative time string (e.g., "5 minutes ago")
 *
 * @param dateString - ISO date string to format
 * @param translations - Optional translation strings
 * @returns Relative time string
 */
export function formatTimeAgo(
  dateString: string | null,
  translations?: TimeAgoTranslations
): string {
  if (!dateString) return translations?.never || 'Never';

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return translations?.justNow || 'Just now';

    if (diffMins < 60) {
      const plural = diffMins > 1 ? 's' : '';
      return (translations?.minutesAgo || '{count} minute{plural} ago')
        .replace('{count}', diffMins.toString())
        .replace('{plural}', plural);
    }

    if (diffHours < 24) {
      const plural = diffHours > 1 ? 's' : '';
      return (translations?.hoursAgo || '{count} hour{plural} ago')
        .replace('{count}', diffHours.toString())
        .replace('{plural}', plural);
    }

    if (diffDays < 7) {
      const plural = diffDays > 1 ? 's' : '';
      return (translations?.daysAgo || '{count} day{plural} ago')
        .replace('{count}', diffDays.toString())
        .replace('{plural}', plural);
    }

    // For dates older than 7 days, show the formatted date
    return formatDate(dateString);
  } catch {
    return dateString;
  }
}

/**
 * Creates a time ago formatter function with pre-bound translations
 *
 * @param translations - Translation strings for time ago formatting
 * @returns A function that formats date strings to relative time
 */
export function createTimeAgoFormatter(
  translations?: TimeAgoTranslations
): (dateString: string | null) => string {
  return (dateString: string | null) => formatTimeAgo(dateString, translations);
}

/**
 * Formats a snake_case status string to Title Case
 *
 * @param status - The status string (e.g., "under_review")
 * @returns Title-cased string (e.g., "Under Review")
 */
export function formatStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Formats a compact time ago (e.g., "5m ago", "2h ago", "3d ago")
 * Used in tables where space is limited
 *
 * @param dateString - ISO date string to format
 * @returns Compact relative time string
 */
export function formatTimeAgoCompact(dateString: string | null): string {
  if (!dateString) return 'Never';

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDate(dateString);
  } catch {
    return dateString;
  }
}
