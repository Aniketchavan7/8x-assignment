'use client';

/**
 * PostsLast7DaysChart Component
 *
 * A mini bar chart showing posts activity for the last 7 days.
 * Used in accounts tables to visualize posting frequency.
 */

interface PostsLast7DaysChartProps {
  /** Daily breakdown of posts (array of 7 numbers, one per day starting from Sunday) */
  dailyBreakdown: number[];
  /** Total post count for the 7-day period */
  count: number;
  /** Average posts per day */
  averagePerDay: number;
  /** Optional: Show empty state message when count is 0 */
  showEmptyMessage?: boolean;
  /** Optional: Custom empty message */
  emptyMessage?: string;
}

/**
 * Renders a mini bar chart showing posts activity for the last 7 days
 * with a summary of average posts per day.
 */
export function PostsLast7DaysChart({
  dailyBreakdown,
  count,
  averagePerDay,
  showEmptyMessage = false,
  emptyMessage = 'No posts in the last 7 days',
}: PostsLast7DaysChartProps) {
  const maxCount = Math.max(...dailyBreakdown, 1);
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Show empty state if requested and count is 0
  if (showEmptyMessage && count === 0) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{emptyMessage}</div>
        <div className="text-xs text-muted-foreground">0 in 7d</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-1.5 h-8">
        {dailyBreakdown.map((value, index) => {
          // Calculate bar height proportionally, with minimum visibility
          const barHeight = value > 0 ? `${Math.max((value / maxCount) * 100, 8)}%` : '3%';

          return (
            <div
              key={index}
              className={`w-4 rounded-t ${value > 0 ? 'bg-green-500' : 'bg-gray-200'}`}
              style={{
                height: barHeight,
                minHeight: '2px',
              }}
              title={`${dayLabels[index]}: ${value} post${value !== 1 ? 's' : ''}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Variant with count display (used in admin tables)
 */
export function PostsLast7DaysChartWithCount({
  dailyBreakdown,
  count,
  averagePerDay,
}: PostsLast7DaysChartProps) {
  const maxCount = Math.max(...dailyBreakdown, 1);
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  if (count === 0) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">No posts in the last 7 days</div>
        <div className="text-xs text-muted-foreground">0 in 7d</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-1.5 h-8">
        {dailyBreakdown.map((value, index) => {
          const barHeight = value > 0 ? `${Math.max((value / maxCount) * 100, 8)}%` : '3%';

          return (
            <div
              key={index}
              className={`w-4 rounded-t ${value > 0 ? 'bg-primary' : 'bg-gray-200'}`}
              style={{
                height: barHeight,
                minHeight: '2px',
              }}
              title={`${dayLabels[index]}: ${value} post${value !== 1 ? 's' : ''}`}
            />
          );
        })}
      </div>
      <div className="text-xs font-medium">{count} in 7d</div>
    </div>
  );
}
