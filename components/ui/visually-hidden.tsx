'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * VisuallyHidden component for accessibility.
 * Hides content visually but keeps it available to screen readers.
 * Uses Tailwind's sr-only utility class.
 */
export function VisuallyHidden({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sr-only', className)} {...props} />;
}
