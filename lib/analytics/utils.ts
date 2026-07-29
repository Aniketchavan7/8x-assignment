/**
 * Utility functions for analytics formatting and calculations
 */

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

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

export function calculateViewsPerformance(views: number, averageViews: number): string {
  if (averageViews === 0 || !averageViews) {
    return 'Usual amount of views';
  }

  const ratio = views / averageViews;

  if (ratio > 1.2) {
    return `${ratio.toFixed(1)}x more than usual`;
  } else if (ratio < 0.8) {
    return 'Less views than usual';
  } else {
    return 'Usual amount of views';
  }
}
