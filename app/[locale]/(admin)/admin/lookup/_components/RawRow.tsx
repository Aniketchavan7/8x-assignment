'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  label: string;
  data: unknown;
}

export function RawRow({ label, data }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-2 max-h-96 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] leading-tight">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
