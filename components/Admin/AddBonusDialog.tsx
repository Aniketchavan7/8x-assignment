'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';

const isCreatorDetail = (d: unknown): d is CreatorDetailResponse =>
  !!d && typeof d === 'object' && 'profile' in d && 'referrals' in d;

interface AddBonusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorProfileId: string;
  creatorName: string;
  defaultDescription?: string;
  defaultAmountCents?: number;
  referredUserId?: string;
  /** Fired after the bonus is recorded and the dialog has closed; host wires this to its exact-key refresh. */
  onSuccess?: () => void;
}

export function AddBonusDialog({
  open,
  onOpenChange,
  creatorProfileId,
  creatorName,
  defaultDescription = '',
  defaultAmountCents,
  referredUserId,
  onSuccess,
}: AddBonusDialogProps) {
  const [amount, setAmount] = useState(defaultAmountCents ? (defaultAmountCents / 100).toString() : '');
  const [description, setDescription] = useState(defaultDescription);
  const [offplatformMethod, setOffplatformMethod] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const creatorQueryKey = ['/api/admin/creators', creatorProfileId];

  const mutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(parseFloat(amount) * 100);
      const res = await fetch(`/api/admin/creators/${creatorProfileId}/bonus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: amountCents,
          description,
          offplatform_method: offplatformMethod.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add bonus');
      }
      return res.json();
    },
    onSuccess: () => {
      const amountCents = Math.round(parseFloat(amount) * 100);
      toast({ title: 'Bonus added', description: `$${parseFloat(amount).toFixed(2)} bonus recorded for ${creatorName}` });
      if (referredUserId) {
        // Match by cached profile id so the bump lands in both open modes (creator-profile and managed-creator keyed).
        queryClient.setQueriesData<CreatorDetailResponse>(
          {
            predicate: (q) =>
              q.queryKey[0] === '/api/admin/creators' &&
              isCreatorDetail(q.state.data) &&
              q.state.data.profile.id === creatorProfileId,
          },
          (prev) =>
            prev
              ? {
                  ...prev,
                  referrals: {
                    ...prev.referrals,
                    users: prev.referrals.users.map((u) =>
                      u.id === referredUserId
                        ? { ...u, paidCents: u.paidCents + amountCents }
                        : u
                    ),
                  },
                }
              : prev
        );
      }
      // Close first so the dialog doesn't linger on stale state while the refetch runs.
      handleClose();
      if (onSuccess) {
        onSuccess();
      } else {
        queryClient.invalidateQueries({ queryKey: creatorQueryKey });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setStep('form');
    },
  });

  function handleClose() {
    setStep('form');
    setAmount(defaultAmountCents ? (defaultAmountCents / 100).toString() : '');
    setDescription(defaultDescription);
    setOffplatformMethod('');
    onOpenChange(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      handleClose();
    } else {
      // Reset to defaults when opening
      setAmount(defaultAmountCents ? (defaultAmountCents / 100).toString() : '');
      setDescription(defaultDescription);
      setOffplatformMethod('');
      setStep('form');
      onOpenChange(true);
    }
  }

  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0 && description.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{step === 'confirm' ? 'Confirm Bonus' : 'Add Bonus'}</DialogTitle>
          <DialogDescription>
            {step === 'confirm'
              ? 'Please confirm the bonus details below.'
              : `Record a bonus payment for ${creatorName}.`}
          </DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="bonus-amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="bonus-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="5.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bonus-description">Description</Label>
              <Input
                id="bonus-description"
                placeholder="e.g. Referral bonus, performance bonus..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOffplatformMethod('')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                    offplatformMethod === ''
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  }`}
                >
                  8x (Stripe)
                </button>
                {(['Wise', 'PayPal', 'SideShift'] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOffplatformMethod(label)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      offplatformMethod.toLowerCase().startsWith(label.toLowerCase())
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-background text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {offplatformMethod !== '' && (
                <Input
                  placeholder="e.g. Wise TXN-12345"
                  value={offplatformMethod}
                  onChange={(e) => setOffplatformMethod(e.target.value)}
                  maxLength={100}
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep('confirm')} disabled={!isValid}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4 pt-2">
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creator</span>
                <span className="font-medium">{creatorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium font-mono">${parsedAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium text-right max-w-[200px] truncate">{description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium">{offplatformMethod.trim() || '8x (Stripe)'}</span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {offplatformMethod.trim()
                ? `This will record a $${parsedAmount.toFixed(2)} off-platform bonus for ${creatorName} paid via ${offplatformMethod.trim()}. No Stripe transfer will occur.`
                : `This will add $${parsedAmount.toFixed(2)} to ${creatorName}\u2019s pending balance.`}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('form')} disabled={mutation.isPending}>Back</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm & Pay
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
