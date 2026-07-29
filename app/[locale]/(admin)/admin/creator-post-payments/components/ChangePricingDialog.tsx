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
import { Loader2, DollarSign, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { CreatorPostPaymentGridData } from '@/components/Admin/AdminGrid';

interface Props {
  rows: CreatorPostPaymentGridData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (args: {
    succeededIds: string[];
    basePayCents?: number;
    bonusCents?: number;
  }) => void;
}

interface UpdateResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ mcp_id: string; success: boolean; error?: string }>;
}

type Step = 'form' | 'confirm' | 'result';

function parseDollarInput(str: string): number | undefined {
  if (str === '') return undefined;
  const n = Number(str);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

export function ChangePricingDialog({ rows, open, onOpenChange, onSuccess }: Props) {
  const [baseStr, setBaseStr] = useState('');
  const [bonusStr, setBonusStr] = useState('');
  const [step, setStep] = useState<Step>('form');

  const baseCents = parseDollarInput(baseStr);
  const bonusCents = parseDollarInput(bonusStr);
  const hasBase = baseCents !== undefined;
  const hasBonus = bonusCents !== undefined;

  const touchedPaidCount = useMemo(
    () => rows.filter((r) => r.payment_status === 'paid' || r.payment_status === 'partially_paid').length,
    [rows]
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/creator-post-payments/update-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managed_creator_post_ids: rows.map((r) => r.id),
          ...(hasBase ? { base_pay_cents: baseCents } : {}),
          ...(hasBonus ? { bonus_cents: bonusCents } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || 'Failed');
      }
      return res.json() as Promise<UpdateResponse>;
    },
    onSuccess: (data) => {
      setStep('result');
      const succeededIds = data.results.filter((r) => r.success).map((r) => r.mcp_id);
      if (succeededIds.length > 0) {
        onSuccess?.({
          succeededIds,
          basePayCents: hasBase ? baseCents : undefined,
          bonusCents: hasBonus ? bonusCents : undefined,
        });
      }
    },
  });

  const canSubmit =
    !mutation.isPending &&
    (hasBase || hasBonus) &&
    (!hasBase || baseCents! >= 0) &&
    (!hasBonus || bonusCents! >= 0);

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      mutation.reset();
      setStep('form');
      setBaseStr('');
      setBonusStr('');
    }
    onOpenChange(newOpen);
  };

  const onSubmit = () => {
    if (touchedPaidCount > 0) {
      setStep('confirm');
    } else {
      mutation.mutate();
    }
  };

  const summaryParts: string[] = [];
  if (hasBase) summaryParts.push(`base to $${(baseCents! / 100).toFixed(2)}`);
  if (hasBonus) summaryParts.push(`bonus to $${(bonusCents! / 100).toFixed(2)}`);
  const summary = summaryParts.join(' and ');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-600" />
                Change pricing
              </DialogTitle>
              <DialogDescription>
                Update base pay and/or bonus for {rows.length} selected post{rows.length === 1 ? '' : 's'}.
                Leave a field blank to keep its current value. Totals and payment status recompute.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <Label htmlFor="base-pay">Base pay ($)</Label>
                <Input
                  id="base-pay"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Leave blank to keep current"
                  value={baseStr}
                  onChange={(e) => setBaseStr(e.target.value)}
                  disabled={mutation.isPending}
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="bonus">Bonus ($)</Label>
                <Input
                  id="bonus"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Leave blank to keep current"
                  value={bonusStr}
                  onChange={(e) => setBonusStr(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>

              {touchedPaidCount > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-800 dark:text-amber-400">
                    {touchedPaidCount} selected post{touchedPaidCount === 1 ? ' is' : 's are'} already paid or partially paid.
                    Pricing will change but no transactions are reversed.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={!canSubmit}>
                Update pricing
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Confirm update
              </DialogTitle>
              <DialogDescription>
                This includes {touchedPaidCount} already-paid post{touchedPaidCount === 1 ? '' : 's'}.
                Existing creator transactions will not be adjusted.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('form')} disabled={mutation.isPending}>
                Back
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  `Yes, update ${rows.length} post${rows.length === 1 ? '' : 's'}`
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'result' && (() => {
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
                  {allFailed ? 'Failed' : someFailed ? 'Partial Success' : 'Pricing Updated'}
                </DialogTitle>
                <DialogDescription>
                  {succeeded} of {processed} posts updated{summary ? ` — ${summary}` : ''}
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
        })()}

        {mutation.isError && step !== 'result' && (
          <p className="text-sm text-destructive mt-2">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
