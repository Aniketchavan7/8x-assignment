'use client';

import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Eye, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { CreatorPostPaymentGridData } from '@/components/Admin/AdminGrid';

interface Props {
  rows: CreatorPostPaymentGridData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (args: { succeededIds: string[]; basePayCents: number }) => void;
}

interface UpdateResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ mcp_id: string; success: boolean; error?: string }>;
}

export function MinViewsCheckDialog({ rows, open, onOpenChange, onSuccess }: Props) {
  const [minViewsStr, setMinViewsStr] = useState('1000');
  const [amountStr, setAmountStr] = useState('4');
  const [showResult, setShowResult] = useState(false);

  const minViews = Number(minViewsStr) || 0;
  const amountCents = Math.round((Number(amountStr) || 0) * 100);

  const belowThreshold = useMemo(
    () => rows.filter((r) => (r.latest_views ?? 0) < minViews),
    [rows, minViews]
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const ids = belowThreshold.map((r) => r.id);
      const res = await fetch('/api/admin/creator-post-payments/update-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managed_creator_post_ids: ids,
          base_pay_cents: amountCents,
          bonus_cents: 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || 'Failed');
      }
      return res.json() as Promise<UpdateResponse>;
    },
    onSuccess: (data) => {
      setShowResult(true);
      const succeededIds = data.results.filter((r) => r.success).map((r) => r.mcp_id);
      onSuccess?.({ succeededIds, basePayCents: amountCents });
    },
  });

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      mutation.reset();
      setShowResult(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        {showResult ? (() => {
          const succeeded = mutation.data?.succeeded ?? 0;
          const processed = mutation.data?.processed ?? 0;
          const failed = mutation.data?.failed ?? 0;
          const allFailed = succeeded === 0 && processed > 0;
          const someFailed = failed > 0 && succeeded > 0;
          const failedResults = mutation.data?.results?.filter((r) => !r.success) || [];

          return (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {allFailed ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : someFailed ? (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                  {allFailed ? 'Failed' : someFailed ? 'Partial Success' : 'Base updated'}
                </DialogTitle>
                <DialogDescription>
                  {succeeded} of {processed} posts now have base ${(amountCents / 100).toFixed(2)} (bonuses zeroed). They&apos;re still selected — hit Pay to pay them out at the new amount.
                </DialogDescription>
              </DialogHeader>
              {failedResults.length > 0 && (
                <div className="py-3">
                  <p className="text-sm font-medium text-red-600 mb-1">Errors:</p>
                  {failedResults.map((r) => {
                    const row = rows.find((row) => row.id === r.mcp_id);
                    return (
                      <p key={r.mcp_id} className="text-xs text-red-600">
                        {row ? `${row.creator_name}: ` : ''}
                        {r.error || 'Unknown error'}
                      </p>
                    );
                  })}
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => handleClose(false)}>Close</Button>
              </DialogFooter>
            </>
          );
        })() : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                Minimum views
              </DialogTitle>
              <DialogDescription>
                Lower base pay for posts below a view threshold. Bonuses are zeroed. Doesn&apos;t pay anyone — hit Pay afterwards.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="min-views">Minimum views</Label>
                  <Input
                    id="min-views"
                    type="number"
                    min={0}
                    step={1}
                    value={minViewsStr}
                    onChange={(e) => setMinViewsStr(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">New base pay ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">{belowThreshold.length}</span> of{' '}
                  <span className="font-medium">{rows.length}</span> selected posts have fewer than{' '}
                  <span className="font-medium">{minViews.toLocaleString()}</span> views.
                </p>
                {belowThreshold.length > 0 && (
                  <p className="text-muted-foreground text-xs mt-1">
                    Their base will become ${(amountCents / 100).toFixed(2)} and bonuses will be zeroed.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || belowThreshold.length === 0}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  `Lower base on ${belowThreshold.length} post${belowThreshold.length === 1 ? '' : 's'}`
                )}
              </Button>
            </DialogFooter>

            {mutation.isError && (
              <p className="text-sm text-destructive mt-2">
                {mutation.error instanceof Error ? mutation.error.message : 'Failed'}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
