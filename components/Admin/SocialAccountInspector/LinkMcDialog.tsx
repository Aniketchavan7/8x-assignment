'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, AlertTriangle } from 'lucide-react';
import type { Platform } from '@/lib/modules/admin/inspector/types';

interface McSearchRow {
  id: string;
  name: string;
  status: string;
  email: string | null;
  brandName: string | null;
  fkSet: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  platform: Platform;
  /** Pre-filter to MCs already linked to this user (the common "fix missing FK" case). */
  linkedUserId?: string | null;
  onSelect: (mcId: string) => void;
}

export function LinkMcDialog({
  open,
  onOpenChange,
  platform,
  linkedUserId,
  onSelect,
}: Props) {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'linkedUser' | 'search'>(
    linkedUserId ? 'linkedUser' : 'search'
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQ('');
      setMode(linkedUserId ? 'linkedUser' : 'search');
    }
  }, [open, linkedUserId]);

  const params = new URLSearchParams({ platform });
  if (mode === 'linkedUser' && linkedUserId) params.set('linked_user_id', linkedUserId);
  else if (q) params.set('q', q);

  const { data, isLoading } = useQuery<{ rows: McSearchRow[] }>({
    queryKey: ['/api/admin/inspector/search-mcs', params.toString()],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/admin/inspector/search-mcs?${params}`);
      return res.json();
    },
  });

  const rows = data?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl z-[200] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Link to managed_creator</DialogTitle>
          <DialogDescription className="text-xs">
            Sets <code className="font-mono">managed_creators.{platform}_account_id</code>{' '}
            on the selected row.
          </DialogDescription>
        </DialogHeader>

        {linkedUserId && (
          <div className="px-6 pb-2 flex gap-2">
            <button
              className={`text-xs px-2.5 py-1 rounded ${mode === 'linkedUser' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('linkedUser')}
            >
              MCs for this creator
            </button>
            <button
              className={`text-xs px-2.5 py-1 rounded ${mode === 'search' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              onClick={() => setMode('search')}
            >
              Search all
            </button>
          </div>
        )}

        {mode === 'search' && (
          <div className="px-6 pb-3 relative">
            <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        <div className="border-t max-h-[420px] overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground italic">
              {mode === 'search' && !q
                ? 'Type to search managed creators.'
                : 'No matches.'}
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id)}
                    className="w-full text-left px-6 py-3 hover:bg-muted/40 flex items-start gap-3 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.name}</span>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {r.status}
                        </Badge>
                        {r.fkSet && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-yellow-700 dark:text-yellow-400">
                            <AlertTriangle className="h-3 w-3" />
                            {platform} FK already set
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {r.brandName ? `${r.brandName} · ` : ''}
                        {r.email ?? '—'}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 font-mono truncate mt-0.5">
                        {r.id}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
