'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Banknote, Loader2, CheckCircle2, XCircle, AlertTriangle, Ban } from 'lucide-react';
import type { CreatorPostPaymentGridData } from '@/components/Admin/AdminGrid';

const QUICK_METHODS = [
  { label: 'Wise', value: 'Wise' },
  { label: 'SideShift', value: 'SideShift' },
  { label: 'PayPal', value: 'PayPal' },
] as const;

const NO_PAYOUT = 'No Payout' as const;

interface Props {
  rows: CreatorPostPaymentGridData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface PayResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ mcp_id: string; success: boolean; error?: string }>;
}

interface UnsignedCreator {
  managed_creator_id: string;
  creator_name: string;
  job_title: string | null;
  contract_version: string | null;
  post_count: number;
}

interface ContractNotSignedError {
  error: 'contract_not_signed';
  minimum_contract_version: string;
  unsigned_creators: UnsignedCreator[];
}

interface UndisclosedPost {
  managed_creator_post_id: string;
  creator_name: string;
  post_url: string;
  platform: string;
}

interface DisclosureMissingError {
  error: 'disclosure_missing';
  undisclosed_posts: UndisclosedPost[];
}

export function MarkPaidOffPlatformDialog({ rows, open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState('');
  const [noPayoutReason, setNoPayoutReason] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [overrideState, setOverrideState] = useState<{
    open: boolean;
    minimumVersion: string;
    unsigned: UnsignedCreator[];
    acknowledged: boolean;
  } | null>(null);
  const [disclosureOverrideState, setDisclosureOverrideState] = useState<{
    open: boolean;
    posts: UndisclosedPost[];
    acknowledged: boolean;
  } | null>(null);
  const [acknowledgedContractOverride, setAcknowledgedContractOverride] = useState(false);
  const [acknowledgedDisclosureOverride, setAcknowledgedDisclosureOverride] = useState(false);

  const isNoPayout = method === NO_PAYOUT;
  const effectiveMethod = isNoPayout
    ? (noPayoutReason.trim() ? `${NO_PAYOUT}: ${noPayoutReason.trim()}` : NO_PAYOUT)
    : method.trim();

  const creatorBreakdowns = useMemo(() => {
    const byCreator = new Map<string, { managed_creator_id: string; creator_name: string; post_count: number; total_cents: number }>();
    for (const row of rows) {
      const key = row.managed_creator_id;
      const existing = byCreator.get(key) || { managed_creator_id: key, creator_name: row.creator_name, post_count: 0, total_cents: 0 };
      existing.post_count += 1;
      existing.total_cents += row.outstanding_cents;
      byCreator.set(key, existing);
    }
    return Array.from(byCreator.values()).sort((a, b) => a.creator_name.localeCompare(b.creator_name));
  }, [rows]);

  const grandTotalCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.outstanding_cents, 0),
    [rows]
  );

  const mutation = useMutation({
    mutationFn: async (args: {
      ids: string[];
      overrideContract: boolean;
      overrideDisclosure: boolean;
    }) => {
      const res = await fetch('/api/admin/creator-post-payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          managed_creator_post_ids: args.ids,
          offplatform_method: effectiveMethod,
          ...(args.overrideContract ? { override_contract_check: true } : {}),
          ...(args.overrideDisclosure ? { override_disclosure_check: true } : {}),
        }),
      });
      if (res.status === 422) {
        const data = (await res.json()) as ContractNotSignedError | DisclosureMissingError;
        if (data.error === 'contract_not_signed') {
          throw Object.assign(new Error('contract_not_signed'), { contractError: data });
        }
        if (data.error === 'disclosure_missing') {
          throw Object.assign(new Error('disclosure_missing'), { disclosureError: data });
        }
        throw new Error((data as { error?: string }).error || 'Failed to mark payments');
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mark payments');
      }
      return res.json() as Promise<PayResponse>;
    },
    onSuccess: (data) => {
      setShowResult(true);
      queryClient.invalidateQueries({ queryKey: ['admin-creator-post-payments'] });
      if (data.succeeded > 0) onSuccess?.();
      if (data.succeeded === data.processed) {
        setTimeout(() => {
          setShowResult(false);
          setMethod('');
          setNoPayoutReason('');
          handleClose(false);
        }, 2000);
      }
    },
    onError: (err) => {
      const contractError = (err as { contractError?: ContractNotSignedError }).contractError;
      if (contractError) {
        setOverrideState({
          open: true,
          minimumVersion: contractError.minimum_contract_version,
          unsigned: contractError.unsigned_creators,
          acknowledged: false,
        });
        return;
      }
      const disclosureError = (err as { disclosureError?: DisclosureMissingError }).disclosureError;
      if (disclosureError) {
        setDisclosureOverrideState({
          open: true,
          posts: disclosureError.undisclosed_posts,
          acknowledged: false,
        });
      }
    },
  });

  const handleConfirm = () => {
    mutation.mutate({
      ids: rows.map((r) => r.id),
      overrideContract: acknowledgedContractOverride,
      overrideDisclosure: acknowledgedDisclosureOverride,
    });
  };

  const handleOverrideConfirm = () => {
    setOverrideState(null);
    setAcknowledgedContractOverride(true);
    mutation.mutate({
      ids: rows.map((r) => r.id),
      overrideContract: true,
      overrideDisclosure: acknowledgedDisclosureOverride,
    });
  };

  const handleOverrideCancel = () => {
    setOverrideState(null);
    mutation.reset();
  };

  const handleDisclosureOverrideConfirm = () => {
    setDisclosureOverrideState(null);
    setAcknowledgedDisclosureOverride(true);
    mutation.mutate({
      ids: rows.map((r) => r.id),
      overrideContract: acknowledgedContractOverride,
      overrideDisclosure: true,
    });
  };

  const handleDisclosureOverrideCancel = () => {
    setDisclosureOverrideState(null);
    mutation.reset();
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      mutation.reset();
      setShowResult(false);
      setMethod('');
      setNoPayoutReason('');
      setOverrideState(null);
      setDisclosureOverrideState(null);
      setAcknowledgedContractOverride(false);
      setAcknowledgedDisclosureOverride(false);
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
          const failedResults = mutation.data?.results?.filter(r => !r.success) || [];

          return (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              {allFailed ? (
                <XCircle className="w-12 h-12 text-red-500" />
              ) : someFailed ? (
                <AlertTriangle className="w-12 h-12 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-12 h-12 text-green-500" />
              )}
              <p className="text-lg font-medium">
                {allFailed ? 'Failed' : someFailed ? 'Partially Marked' : 'Marked as Paid'}
              </p>
              <p className="text-sm text-muted-foreground">
                {succeeded} of {processed} posts marked via {effectiveMethod}
              </p>
              {failedResults.length > 0 && (
                <div className="mt-2 w-full px-4">
                  <p className="text-sm font-medium text-red-600">Errors:</p>
                  {failedResults.map((r) => {
                    const row = rows.find((row) => row.id === r.mcp_id);
                    return (
                      <p key={r.mcp_id} className="text-xs text-red-600 mt-1">
                        {row ? `${row.creator_name}: ` : ''}{r.error || 'Unknown error'}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })() : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-blue-600" />
                Mark as Paid Off-Platform
              </DialogTitle>
              <DialogDescription>
                Record payments made outside Stripe
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_METHODS.map((qm) => (
                    <button
                      key={qm.value}
                      type="button"
                      onClick={() => setMethod(qm.value)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                        method.toLowerCase().startsWith(qm.value.toLowerCase())
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {qm.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMethod(method === NO_PAYOUT ? '' : NO_PAYOUT)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors flex items-center gap-1.5 ${
                      isNoPayout
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    No Payout
                  </button>
                </div>

                {!isNoPayout && (
                  <Input
                    placeholder="e.g. Wise TXN-12345"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    maxLength={100}
                  />
                )}

                {isNoPayout && (
                  <div className="space-y-1">
                    <Label htmlFor="no-payout-reason" className="text-xs text-muted-foreground">
                      Reason (optional)
                    </Label>
                    <Textarea
                      id="no-payout-reason"
                      placeholder="e.g. Video was deleted, duplicate post, etc."
                      value={noPayoutReason}
                      onChange={(e) => setNoPayoutReason(e.target.value)}
                      maxLength={89}
                      rows={2}
                      className="resize-none"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {creatorBreakdowns.map((creator) => (
                  <div key={creator.managed_creator_id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{creator.creator_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {creator.post_count} {creator.post_count === 1 ? 'post' : 'posts'}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-medium ml-4">
                      ${(creator.total_cents / 100).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-lg">
                <p className="font-medium">Total</p>
                <p className="font-mono text-lg font-bold text-blue-600">
                  ${(grandTotalCents / 100).toFixed(2)}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={mutation.isPending || !effectiveMethod}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Banknote className="w-4 h-4 mr-2" />
                    Confirm
                  </>
                )}
              </Button>
            </DialogFooter>

            {mutation.isError &&
              !(mutation.error as { contractError?: unknown })?.contractError &&
              !(mutation.error as { disclosureError?: unknown })?.disclosureError && (
              <p className="text-sm text-destructive mt-2">
                {mutation.error instanceof Error ? mutation.error.message : 'Failed to mark payments'}
              </p>
            )}
          </>
        )}
      </DialogContent>
      {overrideState && (
        <Dialog
          open={overrideState.open}
          onOpenChange={(next) => {
            if (!next) handleOverrideCancel();
          }}
        >
          <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Contract not signed
              </DialogTitle>
              <DialogDescription>
                The following creators have not signed contract v{overrideState.minimumVersion} or newer.
                Paying them anyway requires explicit acknowledgement.
              </DialogDescription>
            </DialogHeader>

            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto my-2">
              {overrideState.unsigned.map((uc) => (
                <div key={uc.managed_creator_id} className="px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <p className="font-medium">{uc.creator_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {uc.post_count} {uc.post_count === 1 ? 'post' : 'posts'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {uc.job_title ? `${uc.job_title} · ` : ''}
                    Contract: {uc.contract_version ? `v${uc.contract_version}` : 'never signed'}
                  </p>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideState.acknowledged}
                onChange={(e) =>
                  setOverrideState((s) => (s ? { ...s, acknowledged: e.target.checked } : s))
                }
                className="mt-0.5"
              />
              <span>
                I acknowledge these creators haven&apos;t signed the required contract version and want to pay them anyway.
              </span>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={handleOverrideCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleOverrideConfirm}
                disabled={!overrideState.acknowledged}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirm payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {disclosureOverrideState && (
        <Dialog
          open={disclosureOverrideState.open}
          onOpenChange={(next) => {
            if (!next) handleDisclosureOverrideCancel();
          }}
        >
          <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Ad disclosure missing
              </DialogTitle>
              <DialogDescription>
                The following posts do not include the required ad disclosure (e.g. <code>#ad</code>).
                Paying them anyway requires explicit acknowledgement.
              </DialogDescription>
            </DialogHeader>

            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto my-2">
              {disclosureOverrideState.posts.map((p) => (
                <div key={p.managed_creator_post_id} className="px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium truncate">{p.creator_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.platform}</p>
                  </div>
                  <a
                    href={p.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-0.5 block truncate"
                  >
                    {p.post_url}
                  </a>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={disclosureOverrideState.acknowledged}
                onChange={(e) =>
                  setDisclosureOverrideState((s) => (s ? { ...s, acknowledged: e.target.checked } : s))
                }
                className="mt-0.5"
              />
              <span>
                I acknowledge these posts are missing the required ad disclosure and want to pay them anyway.
              </span>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={handleDisclosureOverrideCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleDisclosureOverrideConfirm}
                disabled={!disclosureOverrideState.acknowledged}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Confirm payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
