'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Plus, Loader2 } from 'lucide-react';
import type { CreatorPayoutData } from './types/creator-payouts';

interface AddFundsDialogProps {
  creator: CreatorPayoutData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Dialog for adding funds to a creator's Stripe balance.
 * Self-contained with its own form state and mutation logic.
 */
export function AddFundsDialog({ creator, open, onOpenChange, onSuccess }: AddFundsDialogProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Small delay to allow animation to complete
      const timer = setTimeout(() => {
        setAmount('');
        setDescription('');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const addFundsMutation = useMutation({
    mutationFn: async ({
      creatorId,
      amountCents,
      description,
      currency,
    }: {
      creatorId: string;
      amountCents: number;
      description: string;
      currency: string;
    }) => {
      const res = await fetch(`/api/admin/payouts/${creatorId}/add-funds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountCents, description, currency }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add funds');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    if (!creator || !amount) return;
    const amountCents = Math.round(parseFloat(amount) * 100);
    // All admin transfers use USD (single US Stripe account)
    addFundsMutation.mutate({
      creatorId: creator.id,
      amountCents,
      description: description || `Admin transfer to ${creator.display_name}`,
      currency: 'usd',
    });
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      addFundsMutation.reset();
    }
    onOpenChange(newOpen);
  };

  // All admin transfers use USD (single US Stripe account)
  const currencySymbol = '$';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-600" />
            Add Funds to Creator
          </DialogTitle>
          <DialogDescription>
            Transfer money to {creator?.display_name}'s Stripe balance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-10 w-10">
              <AvatarImage src={creator?.profile_picture || undefined} />
              <AvatarFallback>{creator?.display_name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{creator?.display_name}</p>
              <p className="text-sm text-muted-foreground">{creator?.email}</p>
            </div>
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800"
            >
              Accepts USD
            </Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-funds-amount">Amount ({currencySymbol})</Label>
            <Input
              id="add-funds-amount"
              type="number"
              placeholder="100.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              All transfers are processed in USD
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-funds-description">Description (optional)</Label>
            <Input
              id="add-funds-description"
              placeholder="Payment for campaign..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!amount || addFundsMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {addFundsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add {currencySymbol}
                {amount || '0'}
              </>
            )}
          </Button>
        </DialogFooter>

        {addFundsMutation.isError && (
          <p className="text-sm text-destructive mt-2">
            {addFundsMutation.error instanceof Error
              ? addFundsMutation.error.message
              : 'Failed to add funds'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
