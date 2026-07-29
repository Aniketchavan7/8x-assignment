'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Inline `?` icon with a tooltip. Use next to any technical label that a
 * non-engineer (e.g. growth engineer with no DB context) wouldn't recognize.
 */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-3 w-3 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label="More info"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-normal text-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Wraps any element with a tooltip — for badges, status pills, anything with
 * an intrinsic label whose meaning isn't obvious.
 */
export function WithTooltip({
  children,
  text,
}: {
  children: React.ReactNode;
  text: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs whitespace-normal text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
