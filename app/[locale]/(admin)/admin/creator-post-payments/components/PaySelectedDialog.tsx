'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DollarSign, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { CreatorPostPaymentGridData } from '@/components/Admin/AdminGrid';

interface PaySelectedDialogProps {
  rows: CreatorPostPaymentGridData[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (succeededMcpIds: string[]) => void;
}

interface CreatorBreakdown {
  creator_name: string;
  creator_profile_id: string | null;
  managed_creator_id: string;
  post_count: number;
  total_cents: number;
  advance_balance: number;
  advance_applied: number;
  stripe_transfer: number;
}

interface PayResponse {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    mcp_id: string;
    success: boolean;
    error?: string;
  }>;
  transfers: Array<{
    creator_profile_id: string;
    transferred: boolean;
    error?: string;
  }>;
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

export function PaySelectedDialog({ rows, open, onOpenChange, onSuccess }: PaySelectedDialogProps) {
  const queryClient = useQueryClient();
  const [showSuccess, setShowSuccess] = useState(false);
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

  const managedCreatorIds = useMemo(
    () => [...new Set(rows.map((r) => r.managed_creator_id))],
    [rows]
  );

  const { data: advanceData } = useQuery({
    queryKey: ['advance-balances', managedCreatorIds],
    queryFn: async () => {
      const res = await fetch('/api/admin/managed-creators/advance-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managed_creator_ids: managedCreatorIds }),
      });
      if (!res.ok) return {};
      return res.json() as Promise<Record<string, number>>;
    },
    enabled: open && managedCreatorIds.length > 0,
  });

  // Group rows by creator for breakdown display
  const creatorBreakdowns: CreatorBreakdown[] = useMemo(() => {
    const byCreator = new Map<string, CreatorBreakdown>();
    for (const row of rows) {
      const key = row.managed_creator_id;
      const existing = byCreator.get(key) || {
        creator_name: row.creator_name,
        creator_profile_id: row.creator_profile_id,
        managed_creator_id: row.managed_creator_id,
        post_count: 0,
        total_cents: 0,
        advance_balance: 0,
        advance_applied: 0,
        stripe_transfer: 0,
      };
      existing.post_count += 1;
      existing.total_cents += row.outstanding_cents;
      byCreator.set(key, existing);
    }

    for (const [mcId, breakdown] of byCreator) {
      const advance = advanceData?.[mcId] ?? 0;
      breakdown.advance_balance = advance;
      breakdown.advance_applied = Math.min(advance, breakdown.total_cents);
      breakdown.stripe_transfer = breakdown.total_cents - breakdown.advance_applied;
    }

    return Array.from(byCreator.values()).sort((a, b) => a.creator_name.localeCompare(b.creator_name));
  }, [rows, advanceData]);

  const grandTotalCents = useMemo(
    () => rows.reduce((sum, row) => sum + row.outstanding_cents, 0),
    [rows]
  );

  const totalAdvanceApplied = useMemo(
    () => creatorBreakdowns.reduce((sum, c) => sum + c.advance_applied, 0),
    [creatorBreakdowns]
  );

  const totalStripeTransfer = useMemo(
    () => creatorBreakdowns.reduce((sum, c) => sum + c.stripe_transfer, 0),
    [creatorBreakdowns]
  );

  const payMutation = useMutation({
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
        throw new Error((data as { error?: string }).error || 'Failed to process payments');
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process payments');
      }
      return res.json() as Promise<PayResponse>;
    },
    onSuccess: (data) => {
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['admin-creator-post-payments'] });
      const succeededIds = data.results.filter((r) => r.success).map((r) => r.mcp_id);
      if (succeededIds.length > 0) onSuccess?.(succeededIds);
      // Only auto-close if all succeeded and no transfer errors — advance-only (no error) is fine
      if (data.succeeded === data.processed && !data.transfers?.some(t => !t.transferred && t.error)) {
        setTimeout(() => {
          setShowSuccess(false);
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
    const ids = rows.map((r) => r.id);
    payMutation.mutate({
      ids,
      overrideContract: acknowledgedContractOverride,
      overrideDisclosure: acknowledgedDisclosureOverride,
    });
  };

  const handleOverrideConfirm = () => {
    const ids = rows.map((r) => r.id);
    setOverrideState(null);
    setAcknowledgedContractOverride(true);
    payMutation.mutate({
      ids,
      overrideContract: true,
      overrideDisclosure: acknowledgedDisclosureOverride,
    });
  };

  const handleOverrideCancel = () => {
    setOverrideState(null);
    payMutation.reset();
    // Row selection is owned by the grid — intentionally not touched here.
  };

  const handleDisclosureOverrideConfirm = () => {
    const ids = rows.map((r) => r.id);
    setDisclosureOverrideState(null);
    setAcknowledgedDisclosureOverride(true);
    payMutation.mutate({
      ids,
      overrideContract: acknowledgedContractOverride,
      overrideDisclosure: true,
    });
  };

  const handleDisclosureOverrideCancel = () => {
    setDisclosureOverrideState(null);
    payMutation.reset();
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      payMutation.reset();
      setShowSuccess(false);
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
        {showSuccess ? (() => {
          const succeeded = payMutation.data?.succeeded ?? 0;
          const processed = payMutation.data?.processed ?? 0;
          const failed = payMutation.data?.failed ?? 0;
          const allFailed = succeeded === 0 && processed > 0;
          const someFailed = failed > 0 && succeeded > 0;
          const failedResults = payMutation.data?.results?.filter(r => !r.success) || [];

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
                {allFailed ? 'Payments Failed' : someFailed ? 'Partially Processed' : 'Payments Processed'}
              </p>
              <p className="text-sm text-muted-foreground">
                {succeeded} of {processed} posts paid successfully
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
              {payMutation.data?.transfers?.some(t => !t.transferred && t.error) && (
                <div className="mt-2 w-full px-4">
                  <p className="text-sm font-medium text-amber-600">Transfer warnings:</p>
                  {payMutation.data.transfers.filter(t => !t.transferred && t.error).map((t) => {
                    const breakdown = creatorBreakdowns.find(b => b.creator_profile_id === t.creator_profile_id);
                    return (
                      <p key={t.creator_profile_id} className="text-xs text-amber-600 mt-1">
                        {breakdown ? `${breakdown.creator_name}: ` : ''}{t.error}
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
                <DollarSign className="w-5 h-5 text-green-600" />
                Confirm Post Payments
              </DialogTitle>
              <DialogDescription>
                Review the payment breakdown before confirming
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              {/* Per-creator breakdown */}
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {creatorBreakdowns.map((creator) => (
                  <div
                    key={creator.managed_creator_id}
                    className="px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
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
                    {creator.advance_applied > 0 && (
                      <div className="mt-1 ml-4 space-y-0.5">
                        <div className="flex justify-between text-xs text-amber-600">
                          <span>Applied from advance</span>
                          <span className="font-mono">-${(creator.advance_applied / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-medium">
                          <span>Stripe transfer</span>
                          <span className="font-mono">
                            {creator.stripe_transfer > 0
                              ? `$${(creator.stripe_transfer / 100).toFixed(2)}`
                              : '$0.00'}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Advance remaining</span>
                          <span className="font-mono">
                            ${((creator.advance_balance - creator.advance_applied) / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Grand total */}
              <div className="px-3 py-2 bg-muted rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Total owed</p>
                  <p className="font-mono text-sm font-medium">
                    ${(grandTotalCents / 100).toFixed(2)}
                  </p>
                </div>
                {totalAdvanceApplied > 0 && (
                  <div className="flex items-center justify-between text-amber-600">
                    <p className="text-sm">From advance</p>
                    <p className="font-mono text-sm">-${(totalAdvanceApplied / 100).toFixed(2)}</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="font-medium">Stripe transfer</p>
                  <p className="font-mono text-lg font-bold text-green-600">
                    ${(totalStripeTransfer / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Payments will be transferred to each creator's Stripe account. Creators without Stripe connected will have earnings recorded but not transferred.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={payMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={payMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {payMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Confirm Payment
                  </>
                )}
              </Button>
            </DialogFooter>

            {payMutation.isError &&
              !(payMutation.error as { contractError?: unknown })?.contractError &&
              !(payMutation.error as { disclosureError?: unknown })?.disclosureError && (
              <p className="text-sm text-destructive mt-2">
                {payMutation.error instanceof Error
                  ? payMutation.error.message
                  : 'Failed to process payments'}
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
