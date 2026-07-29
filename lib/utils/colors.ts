/**
 * Shared Color Utilities
 *
 * Centralized color helper functions for consistent badge/indicator
 * coloring across the analytics dashboard.
 */

/**
 * Badge color class configuration
 */
export interface BadgeColorClasses {
  background: string;
  text: string;
  combined: string;
}

/**
 * Returns Tailwind CSS classes for engagement rate badges
 *
 * @param rate - The engagement rate percentage
 * @returns Combined Tailwind CSS class string
 *
 * @example
 * getEngagementColor(8) // "bg-blue-100 text-blue-700"
 * getEngagementColor(5) // "bg-purple-100 text-purple-700"
 * getEngagementColor(2) // "bg-gray-100 text-gray-700"
 */
export function getEngagementColor(rate: number | null): string {
  if (rate === null) return 'bg-gray-100 text-gray-700';
  if (rate > 7) return 'bg-blue-100 text-blue-700';
  if (rate > 4) return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

/**
 * Returns Tailwind CSS classes for outperforming rate badges
 *
 * @param rate - The outperforming rate percentage
 * @returns Combined Tailwind CSS class string
 *
 * @example
 * getOutperformingColor(25) // "bg-purple-100 text-purple-700"
 * getOutperformingColor(15) // "bg-blue-100 text-blue-700"
 * getOutperformingColor(5) // "bg-gray-100 text-gray-700"
 */
export function getOutperformingColor(rate: number | null): string {
  if (rate === null) return 'bg-gray-100 text-gray-700';
  if (rate > 20) return 'bg-purple-100 text-purple-700';
  if (rate > 10) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-700';
}

