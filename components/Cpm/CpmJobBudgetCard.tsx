'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Wallet,
  Plus,
  Minus,
  Rocket,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { formatEarnings } from '@/lib/modules/cpm/utils';
import { CPM_BUDGET, wouldDelistCampaign } from '@/lib/modules/cpm';
import {
  fundCpmCampaign,
  withdrawCpmBudget,
  publishCpmCampaign,
} from '@/lib/modules/cpm/budget-actions';
import { useToast } from '@/hooks/use-toast';

interface CpmJobBudgetCardProps {
  jobId: string;
  jobTitle: string;
  status: string;
  budgetCents: number;
  budgetSpentCents: number;
  walletBalanceCents?: number;
  onBudgetUpdated?: () => void;
}

export function CpmJobBudgetCard({
  jobId,
  jobTitle,
  status,
  budgetCents,
  budgetSpentCents,
  walletBalanceCents = 0,
  onBudgetUpdated,
}: CpmJobBudgetCardProps) {
  const { toast } = useToast();
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isFunding, setIsFunding] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showDelistWarning, setShowDelistWarning] = useState(false);
  const [pendingWithdrawAmount, setPendingWithdrawAmount] = useState(0);

  const remainingBudget = budgetCents - budgetSpentCents;
  const spentPercentage = budgetCents > 0 ? (budgetSpentCents / budgetCents) * 100 : 0;
  const isPendingFunding = status === 'pending_funding';
  const canPublish = remainingBudget >= CPM_BUDGET.MIN_FUNDING_CENTS;
  const minFundingDollars = CPM_BUDGET.MIN_FUNDING_CENTS / 100;

  const handleFund = async () => {
    const amountDollars = parseFloat(fundAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      toast({ title: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    const amountCents = Math.round(amountDollars * 100);
    if (amountCents > walletBalanceCents) {
      toast({ title: 'Insufficient wallet balance', variant: 'destructive' });
      return;
    }

    setIsFunding(true);
    try {
      const formData = new FormData();
      formData.append('jobId', jobId);
      formData.append('amountCents', amountCents.toString());

      const result = await fundCpmCampaign({ jobId, amountCents }, formData);

      if ('error' in result) {
        toast({ title: result.error, variant: 'destructive' });
      } else {
        toast({ title: `Successfully funded ${formatEarnings(amountCents)}`, variant: 'success' });
        setFundAmount('');
        setShowFundDialog(false);
        onBudgetUpdated?.();
      }
    } catch (error) {
      toast({ title: 'Failed to fund campaign', variant: 'destructive' });
      console.error('[CpmJobBudgetCard] Fund error:', error);
    } finally {
      setIsFunding(false);
    }
  };

  const handleWithdraw = async (amountCents: number) => {
    setIsWithdrawing(true);
    try {
      const formData = new FormData();
      formData.append('jobId', jobId);
      formData.append('amountCents', amountCents.toString());

      const result = await withdrawCpmBudget({ jobId, amountCents }, formData);

      if ('error' in result) {
        toast({ title: result.error, variant: 'destructive' });
      } else {
        if (result.campaignDelisted) {
          toast({ title: `Withdrew ${formatEarnings(amountCents)} - campaign has been delisted`, variant: 'default' });
        } else {
          toast({ title: `Successfully withdrew ${formatEarnings(amountCents)}`, variant: 'success' });
        }
        setWithdrawAmount('');
        setShowWithdrawDialog(false);
        setShowDelistWarning(false);
        onBudgetUpdated?.();
      }
    } catch (error) {
      toast({ title: 'Failed to withdraw budget', variant: 'destructive' });
      console.error('[CpmJobBudgetCard] Withdraw error:', error);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleWithdrawClick = () => {
    const amountDollars = parseFloat(withdrawAmount);
    if (isNaN(amountDollars) || amountDollars <= 0) {
      toast({ title: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    const amountCents = Math.round(amountDollars * 100);
    if (amountCents > remainingBudget) {
      toast({ title: 'Cannot withdraw more than remaining budget', variant: 'destructive' });
      return;
    }

    // Check if this would delist the campaign
    if (wouldDelistCampaign(remainingBudget, amountCents) && !isPendingFunding) {
      setPendingWithdrawAmount(amountCents);
      setShowDelistWarning(true);
    } else {
      handleWithdraw(amountCents);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const formData = new FormData();
      formData.append('jobId', jobId);

      const result = await publishCpmCampaign({ jobId }, formData);

      if ('error' in result) {
        toast({ title: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Campaign published successfully!', variant: 'success' });
        onBudgetUpdated?.();
      }
    } catch (error) {
      toast({ title: 'Failed to publish campaign', variant: 'destructive' });
      console.error('[CpmJobBudgetCard] Publish error:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Campaign Budget</CardTitle>
            </div>
            {isPendingFunding && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                Pending Funding
              </Badge>
            )}
            {!isPendingFunding && remainingBudget <= 0 && (
              <Badge variant="destructive">
                Budget Exhausted
              </Badge>
            )}
            {!isPendingFunding && remainingBudget > 0 && remainingBudget < CPM_BUDGET.MIN_FUNDING_CENTS && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                Low Budget
              </Badge>
            )}
          </div>
          <CardDescription>
            Manage the budget for your CPM campaign
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Budget Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="h-4 w-4" />
                Allocated
              </div>
              <p className="text-xl font-semibold mt-1">{formatEarnings(budgetCents)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingDown className="h-4 w-4" />
                Spent
              </div>
              <p className="text-xl font-semibold mt-1">{formatEarnings(budgetSpentCents)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="h-4 w-4" />
                Remaining
              </div>
              <p className="text-xl font-semibold mt-1 text-primary">{formatEarnings(remainingBudget)}</p>
            </div>
          </div>

          {/* Progress Bar */}
          {budgetCents > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Budget Usage</span>
                <span>{spentPercentage.toFixed(1)}% used</span>
              </div>
              <Progress value={spentPercentage} className="h-2" />
            </div>
          )}

          {/* Publish Alert for Pending Funding */}
          {isPendingFunding && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Campaign not published
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Fund your campaign with at least ${minFundingDollars} to make it visible to creators.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setShowFundDialog(true)}
              disabled={walletBalanceCents <= 0}
              className="flex-1 min-w-[120px]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Budget
            </Button>

            {remainingBudget > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowWithdrawDialog(true)}
                className="flex-1 min-w-[120px]"
              >
                <Minus className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            )}

            {isPendingFunding && canPublish && (
              <Button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700"
              >
                <Rocket className="h-4 w-4 mr-2" />
                {isPublishing ? 'Publishing...' : 'Publish Campaign'}
              </Button>
            )}
          </div>

          {/* Wallet Balance Info */}
          <p className="text-sm text-muted-foreground">
            Your wallet balance: {formatEarnings(walletBalanceCents)}
          </p>
        </CardContent>
      </Card>

      {/* Fund Dialog */}
      <AlertDialog open={showFundDialog} onOpenChange={setShowFundDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fund Campaign Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Add funds to &quot;{jobTitle}&quot; from your wallet.
              {isPendingFunding && remainingBudget < CPM_BUDGET.MIN_FUNDING_CENTS && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Add at least ${(CPM_BUDGET.MIN_FUNDING_CENTS - remainingBudget) / 100} to publish this campaign.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Label htmlFor="fund-amount">Amount (USD)</Label>
            <div className="relative mt-1.5">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="fund-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="50.00"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Available: {formatEarnings(walletBalanceCents)}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleFund} disabled={isFunding}>
                {isFunding ? 'Funding...' : 'Fund Campaign'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Withdraw Dialog */}
      <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw Campaign Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Return funds from &quot;{jobTitle}&quot; to your wallet.
              {!isPendingFunding && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Withdrawing more than ${((remainingBudget - CPM_BUDGET.MIN_BALANCE_BEFORE_DELIST_CENTS) / 100).toFixed(2)} will delist the campaign.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Label htmlFor="withdraw-amount">Amount (USD)</Label>
            <div className="relative mt-1.5">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="withdraw-amount"
                type="number"
                min="0"
                step="0.01"
                max={(remainingBudget / 100).toFixed(2)}
                placeholder={(remainingBudget / 100).toFixed(2)}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Available to withdraw: {formatEarnings(remainingBudget)}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleWithdrawClick} disabled={isWithdrawing}>
                {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delist Warning Dialog */}
      <AlertDialog open={showDelistWarning} onOpenChange={setShowDelistWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Campaign Will Be Delisted
            </AlertDialogTitle>
            <AlertDialogDescription>
              Withdrawing {formatEarnings(pendingWithdrawAmount)} will leave less than ${minFundingDollars} in the campaign budget.
              <span className="block mt-2 font-medium text-foreground">
                This will delist the campaign and hide it from creators until you add more budget.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => handleWithdraw(pendingWithdrawAmount)}
                disabled={isWithdrawing}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isWithdrawing ? 'Withdrawing...' : 'Withdraw and Delist'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
