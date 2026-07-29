'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageZoom } from '@/components/ui/image-zoom';
import {
  Mail,
  MapPin,
  Calendar,
  X,
  ArrowLeft,
  KeyRound,
  CreditCard,
  ExternalLink,
  Banknote,
  TrendingUp,
  ArrowDownToLine,
  Clock,
  Loader2,
  StickyNote,
  MessageSquare,
  PanelRightClose,
  Flame,
  Eye,
  Heart,
  MessageCircle,
  Bookmark,
  Zap,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { useAdminContext } from '@/lib/contexts/AdminContext';
import { hasAccess, PAYOUTS_ROLES } from '@/lib/modules/admin/roles';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitlePrimitive,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { CACHE_TIMES } from '@/lib/modules/cache-constants';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import type { AccountSource, CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';
import type { CreatorPost } from '@/app/api/admin/managed-creators/[id]/posts/route';
import { CreatorHubPostPayments } from './CreatorHubPostPayments';
import { CreatorHubCampaignsGrid } from './CreatorHubCampaignsGrid';
import { CreatorHubReferrals } from './CreatorHubReferrals';
import { AddBonusDialog } from './AddBonusDialog';
import { SocialAccountInspector } from './SocialAccountInspector';
import { AddCreatorToJobDialog } from './AddCreatorToJobDialog';
import { WarmupContent } from './CreatorWarmup/WarmupContent';

interface CreatorDetailModalProps {
  creatorProfileId?: string;
  managedCreatorId?: string;
  /** Brand context for defaulting Posts brand tab and messages */
  defaultBrandId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActiveView = 'overview' | 'posts' | 'warmup';
type RightPanel = 'notes' | null;

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-5 rounded-full bg-primary" />
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h3>
      {count != null && (
        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

export function CreatorDetailModal({
  creatorProfileId,
  managedCreatorId,
  defaultBrandId,
  open,
  onOpenChange,
}: CreatorDetailModalProps) {
  const id = creatorProfileId || managedCreatorId;
  const source = managedCreatorId && !creatorProfileId ? 'managed_creator' : undefined;

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<CreatorDetailResponse>({
    queryKey: ['/api/admin/creators', id, source],
    queryFn: async () => {
      const params = source ? `?source=${source}` : '';
      const res = await fetch(`/api/admin/creators/${id}${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch creator');
      return res.json();
    },
    enabled: !!id && open,
    staleTime: CACHE_TIMES.CREATORS,
    gcTime: 10 * 60 * 1000,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/creators', id, source] });
  }, [queryClient, id, source]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="!fixed !inset-0 !w-screen !h-screen !max-w-none !max-h-none !m-0 !rounded-none !border-0 !p-0 !translate-x-0 !translate-y-0 !top-0 !left-0 !bg-background overflow-hidden [&>button]:hidden">
        {isLoading || !data ? (
          <LoadingState onClose={() => onOpenChange(false)} />
        ) : (
          <FullPageContent
            key={id}
            data={data}
            defaultBrandId={defaultBrandId}
            onClose={() => onOpenChange(false)}
            onRefresh={handleRefresh}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadingState({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 bg-background border-b z-10">
        <div className="max-w-6xl mx-auto px-8 py-5 flex items-center justify-between">
          <VisuallyHidden>
            <DialogTitle>Loading creator details</DialogTitle>
          </VisuallyHidden>
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function FullPageContent({
  data,
  defaultBrandId,
  onClose,
  onRefresh,
}: {
  data: CreatorDetailResponse;
  defaultBrandId?: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { profile } = data;
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [isGeneratingOtp, setIsGeneratingOtp] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banAction, setBanAction] = useState<'suspended' | 'active'>('suspended');
  const [isBanLoading, setIsBanLoading] = useState(false);

  const email = data.user?.email || profile.email;

  const handleSignInAs = useCallback(async () => {
    if (!email) return;
    const reason = window.prompt(
      'Reason for impersonating this creator? (required, logged to audit trail)'
    );
    if (!reason || !reason.trim()) return;
    setIsGeneratingOtp(true);
    try {
      const res = await fetch('/api/admin/generate-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason: reason.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to generate impersonation link');

      toast({
        title: 'Impersonation link copied',
        description: `Open in incognito to sign in as ${profile.display_name}`,
      });
      try {
        await navigator.clipboard.writeText(result.url);
      } catch {
        toast({
          title: 'Copy this URL manually',
          description: result.url,
        });
      }
    } catch (error) {
      toast({
        title: 'Failed to generate impersonation link',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingOtp(false);
    }
  }, [email, profile.display_name, toast]);

  const handleBanAction = useCallback(async () => {
    setIsBanLoading(true);
    try {
      const res = await fetch(`/api/admin/creators/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_status: banAction }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || `Failed to update account status (${res.status})`);
      }
      const result = await res.json();
      toast({
        title: banAction === 'suspended' ? 'Account suspended' : 'Account reactivated',
      });
      if (result.warning) {
        toast({
          title: 'Auth sync warning',
          description: result.warning,
          variant: 'destructive',
        });
      }
      onRefresh();
    } catch (error) {
      toast({
        title: 'Failed to update account status',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsBanLoading(false);
      setBanDialogOpen(false);
    }
  }, [profile.id, banAction, toast, onRefresh]);

  // Determine which managed creator to use for notes (prefer defaultBrandId context)
  const notesCreator = defaultBrandId
    ? data.managedCreators.find((mc) => mc.brand_organization_id === defaultBrandId)
    : data.managedCreators[0];

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((prev) => (prev === panel ? null : panel));
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-background border-b z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <ImageZoom src={profile.profile_picture} alt={profile.display_name}>
              <Avatar className="h-14 w-14 ring-2 ring-border">
                <AvatarImage src={profile.profile_picture || undefined} />
                <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                  {profile.display_name?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
            </ImageZoom>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {profile.display_name}
                </DialogTitle>
                {(profile.account_status === 'suspended' ||
                  profile.account_status === 'deactivated') && (
                  <span className="text-sm text-destructive font-medium capitalize">
                    {profile.account_status}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {(data.user?.email || profile.email) && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{data.user?.email || profile.email}</span>
                  </span>
                )}
                {(profile.location || data.user?.country) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {profile.location || data.user?.country}
                  </span>
                )}
                {profile.created_at && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    Joined {new Date(profile.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* View nav */}
            <nav className="flex items-center gap-6 ml-8">
              {(data.managedCreators.some((mc) => mc.brand_organization_id)
                ? (['overview', 'posts', 'warmup'] as const)
                : (['overview', 'posts'] as const)
              ).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={cn(
                    'text-sm pb-0.5 transition-colors capitalize',
                    activeView === view
                      ? 'font-semibold text-foreground border-b-2 border-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {view === 'warmup' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5" />
                      Warmup
                    </span>
                  ) : (
                    view
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {email && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleSignInAs}
                disabled={isGeneratingOtp}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Sign In As
              </Button>
            )}
            {profile.user_id && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[100]">
                  {!profile.account_status || profile.account_status === 'active' ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => {
                        setBanAction('suspended');
                        setBanDialogOpen(true);
                      }}
                    >
                      Suspend Account
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => {
                        setBanAction('active');
                        setBanDialogOpen(true);
                      }}
                    >
                      Reactivate Account
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body: content + right panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-muted/40">
          {activeView === 'overview' && <OverviewContent data={data} onRefresh={onRefresh} />}
          {activeView === 'posts' && (
            <PostsContent managedCreators={data.managedCreators} defaultBrandId={defaultBrandId} />
          )}
          {activeView === 'warmup' && (
            <WarmupContent managedCreators={data.managedCreators} defaultBrandId={defaultBrandId} />
          )}
        </div>

        {/* Right panel toolbar */}
        <div className="w-10 border-l flex flex-col items-center pt-3 gap-2 flex-shrink-0 bg-background">
          {notesCreator && (
            <button
              onClick={() => togglePanel('notes')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                rightPanel === 'notes'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
              title="Notes"
            >
              <StickyNote className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Expanded right panel */}
        {rightPanel === 'notes' && notesCreator && (
          <NotesPanel
            managedCreatorId={notesCreator.id}
            initialNotes={notesCreator.notes ?? ''}
            onClose={() => setRightPanel(null)}
          />
        )}
      </div>

      <AlertDialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitlePrimitive>
              {banAction === 'suspended'
                ? `Suspend ${profile.display_name}?`
                : `Reactivate ${profile.display_name}?`}
            </AlertDialogTitlePrimitive>
            <AlertDialogDescription>
              {banAction === 'suspended'
                ? 'This will ban the user from accessing 8x. They will be immediately logged out and unable to sign in.'
                : "This will restore the user's access to 8x. They will be able to sign in again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBanLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBanAction();
              }}
              disabled={isBanLoading}
              className={
                banAction === 'suspended'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {isBanLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {banAction === 'suspended' ? 'Suspend' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Content (existing sections minus Messages which moved to right panel)
// ---------------------------------------------------------------------------

function OverviewContent({
  data,
  onRefresh,
}: {
  data: CreatorDetailResponse;
  onRefresh: () => void;
}) {
  const [nestedCreatorId, setNestedCreatorId] = useState<string | null>(null);
  const [addToJobOpen, setAddToJobOpen] = useState(false);

  const existingBrandIds = data.managedCreators
    .map((mc) => mc.brand_organization_id)
    .filter((id): id is string => !!id);

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 space-y-10">
      <section>
        <div className="flex items-center justify-between">
          <SectionHeader title="Campaigns" count={data.managedCreators.length} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setAddToJobOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add to job
          </Button>
        </div>
        {data.managedCreators.length > 0 ? (
          <CreatorHubCampaignsGrid
            managedCreators={data.managedCreators}
            creatorProfile={data.profile}
            onRefresh={onRefresh}
          />
        ) : (
          <div className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
            No campaigns yet — add this creator to a brand and job.
          </div>
        )}
      </section>

      <AddCreatorToJobDialog
        open={addToJobOpen}
        onOpenChange={setAddToJobOpen}
        creatorProfileId={data.profile.id}
        creatorName={data.profile.display_name || 'Creator'}
        existingBrandIds={existingBrandIds}
        onSuccess={onRefresh}
      />

      {data.connectedAccounts.length > 0 && (
        <section>
          <SectionHeader title="Connected Accounts" count={data.connectedAccounts.length} />
          <ConnectedAccountsTable accounts={data.connectedAccounts} />
        </section>
      )}

      {data.postPayments.length > 0 && (
        <section>
          <SectionHeader title="Videos & Post Payments" count={data.postPayments.length} />
          <CreatorHubPostPayments postPayments={data.postPayments} onRefresh={onRefresh} />
        </section>
      )}

      <section>
        <SectionHeader title="Payments" />
        <PaymentsSection
          wallet={data.wallet}
          stripe={data.stripe}
          transactions={data.transactions}
          postPayments={data.postPayments}
          creatorProfileId={data.profile.id}
          creatorName={data.profile.display_name || 'Creator'}
          onRefresh={onRefresh}
        />
      </section>

      {data.referrals.shareCode && (
        <section>
          <SectionHeader title="Referrals" count={data.referrals.count} />
          <CreatorHubReferrals
            referrals={data.referrals}
            creatorProfileId={data.profile.id}
            creatorName={data.profile.display_name || 'Creator'}
            onOpenCreator={setNestedCreatorId}
            onRefresh={onRefresh}
          />
        </section>
      )}

      {data.managedCreators.length > 0 && (
        <section>
          <SectionHeader title="Admin Info" />
          <div className="space-y-3">
            {data.managedCreators.map((mc: any) => (
              <SlackUserIdField
                key={mc.id}
                managedCreatorId={mc.id}
                managedCreatorName={mc.name}
                initialSlackUserId={mc.slack_user_id || ''}
              />
            ))}
          </div>
        </section>
      )}

      <div className="h-8" />

      {nestedCreatorId && (
        <CreatorDetailModal
          creatorProfileId={nestedCreatorId}
          open={!!nestedCreatorId}
          onOpenChange={(open) => {
            if (!open) setNestedCreatorId(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Posts Content
// ---------------------------------------------------------------------------

function PostsContent({
  managedCreators,
  defaultBrandId,
}: {
  managedCreators: CreatorDetailResponse['managedCreators'];
  defaultBrandId?: string;
}) {
  const creatorsWithBrand = managedCreators.filter((mc) => mc.brand_organization_id);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(
    defaultBrandId || creatorsWithBrand[0]?.brand_organization_id || null
  );

  const activeMc = creatorsWithBrand.find((mc) => mc.brand_organization_id === activeBrandId);

  if (creatorsWithBrand.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        No campaigns found
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      {/* Brand tabs */}
      {creatorsWithBrand.length > 1 && (
        <div className="flex gap-1 border-b mb-6">
          {creatorsWithBrand.map((mc) => (
            <button
              key={mc.id}
              onClick={() => setActiveBrandId(mc.brand_organization_id)}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                activeBrandId === mc.brand_organization_id
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mc.brand_name || 'Unknown'}
            </button>
          ))}
        </div>
      )}

      {activeMc ? (
        <PostsGrid managedCreatorId={activeMc.id} />
      ) : (
        <div className="text-sm text-muted-foreground py-8 text-center">Select a brand</div>
      )}
    </div>
  );
}

const POSTS_PAGE_SIZE = 20;

function PostsGrid({ managedCreatorId }: { managedCreatorId: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<{
    data: CreatorPost[];
    base_pay: number | null;
    hasMore?: boolean;
    total?: number;
  }>({
    queryKey: ['/api/admin/managed-creators', managedCreatorId, 'posts-paginated'],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/posts?limit=${POSTS_PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? (lastPageParam as number) + POSTS_PAGE_SIZE : undefined,
  });

  const posts = data?.pages.flatMap((p) => p.data) ?? [];
  const basePay = data?.pages[0]?.base_pay ?? 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        No posts found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} basePay={basePay} />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2 pb-8">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, basePay }: { post: CreatorPost; basePay: number | null }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!post.video_storage_url) return;
    if (playing) {
      videoRef.current?.pause();
      setPlaying(false);
    } else {
      videoRef.current?.play();
      setPlaying(true);
    }
  };

  const cost = post.cost ?? basePay ?? 0;

  return (
    <div className="group bg-card rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Video/Thumbnail — 9:16 */}
      <div
        className="relative aspect-[9/16] bg-muted overflow-hidden cursor-pointer"
        onClick={post.video_storage_url ? handleVideoClick : undefined}
      >
        {playing && post.video_storage_url ? (
          <video
            ref={videoRef}
            src={post.video_storage_url}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            playsInline
            onEnded={() => setPlaying(false)}
          />
        ) : post.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail_url}
            alt={post.caption || ''}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/30">
            <Eye className="h-10 w-10" />
          </div>
        )}

        {/* Platform badge — top left */}
        <div className="absolute top-2 left-2">
          <Badge
            variant="secondary"
            className="text-[10px] font-medium capitalize backdrop-blur-sm"
          >
            {post.platform}
          </Badge>
        </div>

        {/* Payment — top right */}
        {cost > 0 && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-emerald-500/90 hover:bg-emerald-500/90 text-white backdrop-blur-sm border-0 text-[11px] font-semibold px-2 py-0.5">
              ${(cost / 100).toFixed(0)}
            </Badge>
          </div>
        )}

        {/* Stats overlay — bottom */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pt-10 pb-2.5 px-2.5">
          <div className="flex items-center gap-2 text-white/90 text-[11px] flex-wrap">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatNumber(post.latest_views ?? 0)}
            </span>
            {(post.latest_likes ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {formatNumber(post.latest_likes!)}
              </span>
            )}
            {(post.latest_comments ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {formatNumber(post.latest_comments!)}
              </span>
            )}
            {(post.latest_saves ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Bookmark className="h-3 w-3" />
                {formatNumber(post.latest_saves!)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info below */}
      <div className="p-2.5 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {new Date(post.posted_at).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-1.5">
            {post.ad_code ? (
              <span title="Has spark code" className="text-emerald-600">
                <Zap className="h-3 w-3 fill-current" />
              </span>
            ) : (
              <span title="No spark code" className="text-muted-foreground/40">
                <Zap className="h-3 w-3" />
              </span>
            )}
            <a
              href={post.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        {post.caption && (
          <p className="text-[12px] leading-snug line-clamp-2 text-muted-foreground">
            {post.caption}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right Panel: Notes
// ---------------------------------------------------------------------------

function NotesPanel({
  managedCreatorId,
  initialNotes,
  onClose,
}: {
  managedCreatorId: string;
  initialNotes: string;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const pendingRef = useRef<string | null>(null);
  const lastSavedRef = useRef(initialNotes);

  const saveNotes = useCallback(
    async (value: string) => {
      if (value === lastSavedRef.current) {
        pendingRef.current = null;
        return;
      }
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/admin/managed-creators/${managedCreatorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
          keepalive: true,
        });
        if (!res.ok) throw new Error('Save failed');
        lastSavedRef.current = value;
        pendingRef.current = null;
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    },
    [managedCreatorId]
  );

  const debouncedSave = useDebouncedCallback((value: string) => {
    saveNotes(value);
  }, 1500);

  const handleChange = (value: string) => {
    setNotes(value);
    pendingRef.current = value;
    setSaveStatus('idle');
    debouncedSave(value);
  };

  useEffect(() => {
    return () => {
      if (pendingRef.current != null && pendingRef.current !== lastSavedRef.current) {
        fetch(`/api/admin/managed-creators/${managedCreatorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: pendingRef.current }),
          keepalive: true,
        });
      }
    };
  }, [managedCreatorId]);

  return (
    <div className="w-80 border-l flex flex-col flex-shrink-0 bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Notes</span>
          {saveStatus === 'saving' && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
          {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved</span>}
          {saveStatus === 'error' && <span className="text-xs text-destructive">Error saving</span>}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add notes about this creator..."
        maxLength={50000}
        className="flex-1 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm focus:outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

// MessagesPanel removed in messaging rebuild (Phase 1.2). Admin reply UI is
// being rebuilt as a global page at /admin/messages in Phase 5.

// ---------------------------------------------------------------------------
// Existing Section Components (unchanged)
// ---------------------------------------------------------------------------

function SlackUserIdField({
  managedCreatorId,
  managedCreatorName,
  initialSlackUserId,
}: {
  managedCreatorId: string;
  managedCreatorName: string;
  initialSlackUserId: string;
}) {
  const [value, setValue] = useState(initialSlackUserId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/managed-creators/${managedCreatorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_user_id: value.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to save');
        return;
      }

      setSuccess('Saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        Slack User ID — {managedCreatorName}
      </label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="U0ABC123DEF"
          className="font-mono text-xs h-8"
        />
        <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-green-600">{success}</p>}
    </div>
  );
}

const PLATFORM_STYLES: Record<string, { text: string }> = {
  tiktok: { text: 'text-foreground' },
  instagram: { text: 'text-pink-700 dark:text-pink-300' },
  youtube: { text: 'text-red-700 dark:text-red-300' },
};

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type ConnectedAccountRow = CreatorDetailResponse['connectedAccounts'][number];

const SOURCE_LABELS: Record<AccountSource, string> = {
  fk_creator_profile: 'Creator profile FK',
  fk_managed_creator: 'MC FK',
  mc_text_platform: 'MC handle',
  mc_text_only: 'MC handle (no account row)',
  btsa_orphan_handle: 'Orphan — handle match',
  btsa_same_brand: 'Orphan — same brand',
};

// Most authoritative first. Determines what to show when collapsing.
const SOURCE_PRIORITY: AccountSource[] = [
  'fk_creator_profile',
  'fk_managed_creator',
  'mc_text_platform',
  'btsa_orphan_handle',
  'btsa_same_brand',
  'mc_text_only',
];

function sortSources(sources: AccountSource[]): AccountSource[] {
  return [...sources].sort((a, b) => SOURCE_PRIORITY.indexOf(a) - SOURCE_PRIORITY.indexOf(b));
}

function getAccountStatus(acc: ConnectedAccountRow): {
  label: string;
  tone: 'muted' | 'warn' | 'danger';
  title: string;
} {
  // Orphan sources: btsa_orphan_handle can only coexist with mc_text_platform / btsa_same_brand
  // (never with fk_* sources, since the connector has both FKs null). Always surface the warning.
  if (acc.sources.includes('btsa_orphan_handle')) {
    return {
      label: 'Orphan — needs link',
      tone: 'danger',
      title:
        'Connector is orphan (no creator/MC FK), but handle matches this creator\u2019s MC text. Should be linked.',
    };
  }
  // btsa_same_brand without any FK source means it's a pure orphan tracked by her brand
  if (
    acc.sources.includes('btsa_same_brand') &&
    !acc.sources.includes('fk_creator_profile') &&
    !acc.sources.includes('fk_managed_creator')
  ) {
    return {
      label: 'Orphan — review',
      tone: 'warn',
      title:
        'Connector is orphan and tracked by a brand this creator works with, but handle does not match any MC text. Manual review needed.',
    };
  }
  if (!acc.hasAccountRow) {
    return {
      label: 'No account row',
      tone: 'danger',
      title:
        'MC text has this handle but there is no row in the platform accounts table. Sync has never found this account.',
    };
  }
  if (acc.fkMismatch) {
    return {
      label: 'FK mismatch',
      tone: 'warn',
      title:
        'A managed_creator record has this handle in its text field but its platform FK points to a different account.',
    };
  }
  if (acc.sourcedFromMcText && acc.trackedBy.length === 0 && !acc.linked) {
    return {
      label: 'Untracked',
      tone: 'danger',
      title:
        'Handle exists in MC text but no BTSA tracking and no MC FK points to it. Posts from this handle will not sync.',
    };
  }
  if (acc.linked) {
    return {
      label: 'Linked',
      tone: 'muted',
      title: 'A managed_creator FK points to this account.',
    };
  }
  return { label: '\u2014', tone: 'muted', title: '' };
}

function ConnectedAccountsTable({
  accounts,
}: {
  accounts: CreatorDetailResponse['connectedAccounts'];
}) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <SocialAccountInspector
        accountId={inspectId}
        open={!!inspectId}
        onOpenChange={(o) => !o && setInspectId(null)}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Platform
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Username
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Status
            </th>
            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Followers
            </th>
            <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Posts
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Type
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Tracked By
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Source
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Last Synced
            </th>
            <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
              Added
            </th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => {
            const style = PLATFORM_STYLES[acc.platform] ?? { text: 'text-foreground' };
            const status = getAccountStatus(acc);
            const toneClass =
              status.tone === 'danger'
                ? 'text-red-600 dark:text-red-400'
                : status.tone === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground';
            return (
              <tr
                key={acc.id}
                className={cn(
                  'border-b last:border-0 transition-colors',
                  acc.hasAccountRow &&
                    !acc.id.startsWith('mctext:') &&
                    !acc.id.startsWith('btsa_orphan:')
                    ? 'hover:bg-muted/60 cursor-pointer'
                    : ''
                )}
                onClick={() => {
                  if (
                    acc.hasAccountRow &&
                    !acc.id.startsWith('mctext:') &&
                    !acc.id.startsWith('btsa_orphan:')
                  ) {
                    setInspectId(acc.id);
                  }
                }}
                title={
                  acc.hasAccountRow &&
                  !acc.id.startsWith('mctext:') &&
                  !acc.id.startsWith('btsa_orphan:')
                    ? 'Open in Social Account Inspector'
                    : undefined
                }
              >
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium capitalize ${style.text}`}>
                    {acc.platform}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate max-w-[180px]">@{acc.username}</span>
                    {acc.profileUrl && (
                      <a
                        href={acc.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!acc.isActive && acc.hasAccountRow && (
                      <span className="text-[10px] text-muted-foreground">(inactive)</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${toneClass}`} title={status.title}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {acc.followerCount != null ? formatFollowers(acc.followerCount) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {acc.postCount}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">
                    {acc.accountType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {acc.trackedBy.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {acc.trackedBy.map((t) => (
                        <span key={t.brandOrganizationId} className="text-xs text-muted-foreground">
                          {t.brandName}
                          {t.frozen ? ' (frozen)' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {acc.sources.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {sortSources(acc.sources).map((s) => (
                        <span key={s} className="text-xs text-muted-foreground">
                          {SOURCE_LABELS[s]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{'\u2014'}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                  {acc.lastSyncedAt ? formatRelativeDate(acc.lastSyncedAt) : '\u2014'}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                  {acc.createdAt ? formatRelativeDate(acc.createdAt) : '\u2014'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsSection({
  wallet,
  stripe,
  transactions,
  postPayments,
  creatorProfileId,
  creatorName,
  onRefresh,
}: {
  wallet: CreatorDetailResponse['wallet'];
  stripe: CreatorDetailResponse['stripe'];
  transactions: CreatorDetailResponse['transactions'];
  postPayments: CreatorDetailResponse['postPayments'];
  creatorProfileId: string;
  creatorName: string;
  onRefresh: () => void;
}) {
  const [bonusOpen, setBonusOpen] = useState(false);
  const { adminRole } = useAdminContext();
  const canPayout = hasAccess(adminRole, PAYOUTS_ROLES);
  const postPaymentMap = useMemo(
    () => new Map(postPayments.map((pp) => [pp.id, pp])),
    [postPayments]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {stripe?.account_id && (
            <>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Stripe Connect</span>
              <Badge variant={stripe.payouts_enabled ? 'default' : 'secondary'} className="text-xs">
                {stripe.payouts_enabled ? 'Payouts Enabled' : 'Not Enabled'}
              </Badge>
              {stripe.region && (
                <Badge variant="outline" className="text-xs">
                  {stripe.region.toUpperCase()}
                </Badge>
              )}
            </>
          )}
        </div>
        {canPayout && (
          <Button variant="outline" size="sm" onClick={() => setBonusOpen(true)}>
            Add Bonus
          </Button>
        )}
      </div>

      {wallet && (
        <div className="grid grid-cols-4 gap-3">
          <WalletStat
            label="Available"
            value={wallet.available_balance}
            icon={Banknote}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <WalletStat
            label="Pending"
            value={wallet.pending_balance}
            icon={Clock}
            accent="text-amber-600 dark:text-amber-400"
          />
          <WalletStat
            label="Total Earned"
            value={wallet.total_earned}
            icon={TrendingUp}
            accent="text-blue-600 dark:text-blue-400"
          />
          <WalletStat
            label="Withdrawn"
            value={wallet.total_withdrawn}
            icon={ArrowDownToLine}
            accent="text-muted-foreground"
          />
        </div>
      )}

      {transactions.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Description
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Post
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const pp = tx.managed_creator_post_id
                  ? postPaymentMap.get(tx.managed_creator_post_id)
                  : null;
                const postLabel = pp
                  ? `${pp.platform ?? 'post'}${pp.native_id ? ` · ${pp.native_id}` : ''}${pp.brand_name ? ` — ${pp.brand_name}` : ''}`
                  : null;
                return (
                  <tr
                    key={tx.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <div className="text-muted-foreground whitespace-normal break-words">
                        {tx.description || '\u2014'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top text-xs">
                      {pp ? (
                        pp.post_url ? (
                          <a
                            href={pp.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {postLabel}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">{postLabel}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2.5 align-top text-right font-mono tabular-nums font-medium ${tx.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}
                    >
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <Badge variant="outline" className="text-xs">
                        {tx.status || '\u2014'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground tabular-nums">
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '\u2014'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canPayout && (
        <AddBonusDialog
          open={bonusOpen}
          onOpenChange={setBonusOpen}
          creatorProfileId={creatorProfileId}
          creatorName={creatorName}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}

function WalletStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-semibold font-mono tabular-nums ${accent}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value == null) return '\u2014';
  return `$${(value / 100).toFixed(2)}`;
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
