'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Loader2, X } from 'lucide-react';
import type {
  AdminWarmupScreenshotPayload,
  AdminWarmupScreenshotsResponse,
} from '@/app/api/admin/managed-creators/[id]/warmup-screenshots/route';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ReviewDecision = 'approved' | 'rejected';
type ReviewVariables = {
  screenshot: AdminWarmupScreenshotPayload;
  decision: ReviewDecision;
};

export function WarmupScreenshotReview({ managedCreatorId }: { managedCreatorId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<AdminWarmupScreenshotPayload | null>(null);
  const [selectedImageFailed, setSelectedImageFailed] = useState(false);

  const queryKey = ['/api/admin/managed-creators', managedCreatorId, 'warmup-screenshots'];
  const query = useQuery<AdminWarmupScreenshotsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/warmup-screenshots`,
        {
          cache: 'no-store',
        }
      );
      if (!res.ok) throw new Error('Failed to fetch warmup screenshots');
      return res.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ screenshot, decision }: ReviewVariables) => {
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/warmup-screenshots/${screenshot.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to review screenshot');
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: 'Screenshot review saved' });
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast({
        title: 'Failed to save review',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-background py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading screenshots...
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
        Failed to load screenshots.
      </div>
    );
  }

  const reviewingId = reviewMutation.isPending
    ? reviewMutation.variables?.screenshot.id
    : undefined;
  const openScreenshot = (screenshot: AdminWarmupScreenshotPayload) => {
    setSelectedImageFailed(false);
    setSelected(screenshot);
  };

  return (
    <div className="space-y-6">
      {query.data.flaggedForReview.length > 0 && (
        <ScreenshotSection
          title="Flagged for review"
          emptyText="No screenshots need review."
          screenshots={query.data.flaggedForReview}
          onOpen={openScreenshot}
          onReview={(screenshot, decision) => reviewMutation.mutate({ screenshot, decision })}
          reviewingId={reviewingId}
        />
      )}
      <ScreenshotSection
        title="All screenshots"
        emptyText="No screenshots submitted yet."
        screenshots={query.data.others}
        onOpen={openScreenshot}
        onReview={(screenshot, decision) => reviewMutation.mutate({ screenshot, decision })}
        reviewingId={reviewingId}
      />

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setTimeout(() => {
              if (document.body.style.pointerEvents === 'none') {
                document.body.style.pointerEvents = '';
              }
            }, 300);
          }
        }}
      >
        <DialogContent className="z-[200] max-h-[92vh] max-w-4xl overflow-hidden border-0 bg-transparent p-0 shadow-none [&>button]:bg-background [&>button]:shadow-sm">
          {selected && (
            <>
              <VisuallyHidden>
                <DialogTitle className="capitalize">
                  {selected.platform} screenshot, window {selected.windowIndex}
                </DialogTitle>
              </VisuallyHidden>

              {selected.screenshotUrl && !selectedImageFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.screenshotUrl}
                  alt={`${selected.platform} warmup screenshot`}
                  className="max-h-[92vh] w-full rounded-lg bg-background object-contain shadow-2xl"
                  onError={() => setSelectedImageFailed(true)}
                />
              ) : (
                <div className="flex h-80 max-w-md items-center justify-center rounded-lg bg-background px-10 text-center text-sm text-muted-foreground shadow-2xl">
                  Screenshot image unavailable. Local dev needs R2 credentials for the private
                  managed-creators bucket.
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScreenshotSection({
  title,
  emptyText,
  screenshots,
  onOpen,
  onReview,
  reviewingId,
}: {
  title: string;
  emptyText: string;
  screenshots: AdminWarmupScreenshotPayload[];
  onOpen: (screenshot: AdminWarmupScreenshotPayload) => void;
  onReview: (screenshot: AdminWarmupScreenshotPayload, decision: ReviewDecision) => void;
  reviewingId?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {screenshots.length}
        </span>
      </div>
      {screenshots.length === 0 ? (
        <div className="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {screenshots.map((screenshot) => (
            <ScreenshotCard
              key={screenshot.id}
              screenshot={screenshot}
              onOpen={onOpen}
              onReview={onReview}
              isReviewing={reviewingId === screenshot.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ScreenshotCard({
  screenshot,
  onOpen,
  onReview,
  isReviewing,
}: {
  screenshot: AdminWarmupScreenshotPayload;
  onOpen: (screenshot: AdminWarmupScreenshotPayload) => void;
  onReview: (screenshot: AdminWarmupScreenshotPayload, decision: ReviewDecision) => void;
  isReviewing: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const canReview =
    screenshot.aiStatus === 'needs_review' && screenshot.reviewStatus === 'unreviewed';
  const openScreenshot = () => onOpen(screenshot);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openScreenshot}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openScreenshot();
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-lg border bg-background shadow-sm outline-none transition hover:border-primary/35 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${screenshot.platform} screenshot`}
    >
      <div className="relative h-24 overflow-hidden bg-muted">
        {screenshot.screenshotUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshot.screenshotUrl}
            alt={`${screenshot.platform} warmup screenshot preview`}
            className="h-full w-full object-cover object-top opacity-90 transition-transform group-hover:scale-[1.03]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Screenshot image unavailable
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/95 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <Badge className="bg-background/95 px-1.5 py-0 text-[10px] text-foreground shadow-sm capitalize hover:bg-background">
            {screenshot.platform}
          </Badge>
          {screenshot.reviewStatus !== 'unreviewed' && (
            <ReviewStatusBadge status={screenshot.reviewStatus} />
          )}
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold">Window {screenshot.windowIndex}</h4>
            <AiStatusBadge status={screenshot.aiStatus} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {screenshot.periodStart} to {screenshot.periodEnd}
          </p>
        </div>

        <AiReason reason={screenshot.aiVerdict?.reason ?? null} />

        {canReview && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1"
              onClick={(event) => {
                event.stopPropagation();
                onReview(screenshot, 'rejected');
              }}
              disabled={isReviewing}
            >
              {isReviewing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="mr-2 h-3.5 w-3.5" />
              )}
              Reject
            </Button>
            <Button
              size="sm"
              className="h-8 flex-1"
              onClick={(event) => {
                event.stopPropagation();
                onReview(screenshot, 'approved');
              }}
              disabled={isReviewing}
            >
              {isReviewing ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-2 h-3.5 w-3.5" />
              )}
              Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AiReason({ reason }: { reason: string | null }) {
  if (!reason) {
    return (
      <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
        No AI reason yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Reason
      </p>
      <p className="mt-0.5 max-h-24 overflow-y-auto pr-1 text-xs leading-relaxed text-foreground">
        {reason}
      </p>
    </div>
  );
}

function AiStatusBadge({ status }: { status: AdminWarmupScreenshotPayload['aiStatus'] }) {
  if (status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 capitalize">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  return (
    <Badge
      className={cn(
        'capitalize',
        status === 'pass' && 'bg-emerald-600 text-white hover:bg-emerald-600',
        status === 'fail' && 'bg-red-600 text-white hover:bg-red-600',
        status === 'needs_review' && 'bg-amber-500 text-white hover:bg-amber-500'
      )}
    >
      {status.replace('_', ' ')}
    </Badge>
  );
}

function ReviewStatusBadge({ status }: { status: AdminWarmupScreenshotPayload['reviewStatus'] }) {
  return (
    <Badge
      className={cn(
        'capitalize',
        status === 'approved' && 'bg-emerald-600 text-white hover:bg-emerald-600',
        status === 'rejected' && 'bg-red-600 text-white hover:bg-red-600'
      )}
      variant={status === 'unreviewed' ? 'secondary' : 'default'}
    >
      {status}
    </Badge>
  );
}
