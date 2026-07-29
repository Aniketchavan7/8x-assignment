'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { RelationshipsPayload } from '@/lib/modules/admin/inspector/types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  managedCreators: RelationshipsPayload['managedCreators'];
  onSelect: (mcId: string) => void;
}

export function McPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  managedCreators,
  onSelect,
}: Props) {
  const handleSelect = (mcId: string) => {
    onSelect(mcId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl z-[200] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs">{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="border-t max-h-[420px] overflow-auto">
          {managedCreators.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground italic">
              No managed_creators linked to this account. Use Link MC first.
            </div>
          ) : (
            <ul className="divide-y">
              {managedCreators.map((mc, idx) => (
                <li key={mc.id}>
                  <button
                    autoFocus={idx === 0}
                    onClick={() => handleSelect(mc.id)}
                    className="w-full text-left px-6 py-3 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none flex items-start gap-3 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{mc.name}</span>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {mc.status}
                        </Badge>
                        {mc.isActive === false && (
                          <span className="text-[10px] text-muted-foreground">
                            inactive
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {mc.brandName ?? "No brand"} ·{' '}
                        {mc.basePayCents != null
                          ? `$${(mc.basePayCents / 100).toFixed(2)} base pay`
                          : 'no base pay set'}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 font-mono truncate mt-0.5">
                        {mc.id}
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
