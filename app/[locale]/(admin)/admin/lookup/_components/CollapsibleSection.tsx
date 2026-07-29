'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Hint } from './Hint';

interface Props {
  title: string;
  defaultOpen?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, hint, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-accent/50">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2"
        >
          <span className="flex items-center gap-1.5">{title}</span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {hint && <Hint>{hint}</Hint>}
      </div>
      <div className={cn('border-t px-4 py-3', !open && 'hidden')}>{children}</div>
    </section>
  );
}
