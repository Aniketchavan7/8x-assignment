import type { JobStatus } from '@/lib/db/types';

interface JobBadgeProps {
  status: JobStatus | null;
  className?: string;
}

/**
 * Katana-style status badge with rounded-full and soft colors
 */
const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-200',
    label: 'Draft',
  },
  open: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    label: 'Open',
  },
  in_progress: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    label: 'In Progress',
  },
  closed: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    label: 'Closed',
  },
  completed: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    label: 'Completed',
  },
  cancelled: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    label: 'Cancelled',
  },
};

export function JobBadge({ status, className }: JobBadgeProps) {
  if (!status) return null;

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span
      className={`
        inline-flex items-center px-3 py-1
        ${config.bg} ${config.text}
        border ${config.border}
        rounded-full
        text-xs font-medium
        ${className || ''}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.text.replace('text-', 'bg-')} mr-2`} />
      {config.label}
    </span>
  );
}
