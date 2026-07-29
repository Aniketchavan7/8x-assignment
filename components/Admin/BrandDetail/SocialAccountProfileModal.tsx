'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
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
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, ExternalLink, LayoutDashboard, Snowflake, Trash2 } from 'lucide-react';
import { TikTokProfileEmbed } from '@/components/shared/TikTokProfileEmbed';
import { useToast } from '@/hooks/use-toast';

const PLATFORM_LABELS = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
} as const;

interface SocialAccountProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: 'tiktok' | 'instagram' | 'youtube' | null;
  username: string | null;
  isTracked: boolean;
  isFrozen: boolean;
  brandId: string;
  trackedAccountId: string | null;
  onTrackingChanged: (action: 'added' | 'removed') => void;
  onFreezeChanged: (frozen: boolean) => void;
  managedCreatorId?: string | null;
  onHandleDeleted?: () => void;
}

export function SocialAccountProfileModal({
  open,
  onOpenChange,
  platform,
  username,
  isTracked,
  isFrozen,
  brandId,
  trackedAccountId,
  onTrackingChanged,
  onFreezeChanged,
  managedCreatorId,
  onHandleDeleted,
}: SocialAccountProfileModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setIsLoading(true);
      setShowDeleteDialog(false);
    }
    onOpenChange(newOpen);
  };

  const handleAddToDashboard = async () => {
    if (!username || !platform) return;
    setIsSubmitting('dashboard');

    const endpoint = platform === 'tiktok'
      ? '/api/brand/track/accounts/bulk'
      : platform === 'instagram'
        ? '/api/brand/track/instagram-accounts/bulk'
        : '/api/brand/track/youtube-accounts/bulk';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-view-as-brand': brandId,
        },
        body: JSON.stringify({ usernames: [username], campaign: 'general' }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Failed to add account',
          description: data.error || 'Could not add account to dashboard',
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Account added to client dashboard' });
      onTrackingChanged('added');
    } catch {
      toast({
        title: 'Failed to add account',
        description: 'Network error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleRemoveFromDashboard = async () => {
    if (!trackedAccountId) return;
    setIsSubmitting('dashboard');

    try {
      const res = await fetch(`/api/brand/track/accounts/${trackedAccountId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-view-as-brand': brandId,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Failed to remove account',
          description: data.error || 'Could not remove account from dashboard',
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Account removed from client dashboard' });
      onTrackingChanged('removed');
    } catch {
      toast({
        title: 'Failed to remove account',
        description: 'Network error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleToggleFreeze = async () => {
    if (!trackedAccountId) return;
    setIsSubmitting('freeze');

    const newFrozen = !isFrozen;

    try {
      const res = await fetch('/api/brand/track/accounts/freeze', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-view-as-brand': brandId,
        },
        body: JSON.stringify({ accountIds: [trackedAccountId], freeze: newFrozen }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: `Failed to ${newFrozen ? 'freeze' : 'unfreeze'} account`,
          description: data.error || 'Could not update freeze status',
          variant: 'destructive',
        });
        return;
      }

      toast({ title: newFrozen ? 'Account frozen' : 'Account unfrozen' });
      onFreezeChanged(newFrozen);
    } catch {
      toast({
        title: `Failed to ${newFrozen ? 'freeze' : 'unfreeze'} account`,
        description: 'Network error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleDeleteHandle = async () => {
    // Freeze BTSA if the account is tracked so syncs stop
    if (isTracked && trackedAccountId) {
      await fetch('/api/brand/track/accounts/freeze', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-view-as-brand': brandId,
        },
        body: JSON.stringify({ accountIds: [trackedAccountId], freeze: true }),
      }).catch(() => {});
      onFreezeChanged(true);
    }

    if (onHandleDeleted) {
      onHandleDeleted();
      toast({ title: `@${username} handle removed` });
    }
    setShowDeleteDialog(false);
  };

  if (!platform || !username) return null;

  const platformLabel = PLATFORM_LABELS[platform];
  const encodedUsername = encodeURIComponent(username);
  const profileUrl = platform === 'tiktok'
    ? `https://tiktok.com/@${encodedUsername}`
    : platform === 'instagram'
      ? `https://instagram.com/${encodedUsername}`
      : `https://www.youtube.com/@${encodedUsername}`;

  const instagramEmbedUrl = `https://www.instagram.com/${encodedUsername}/embed/?cr=1&v=14&wp=6`;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="p-0 gap-0 w-fit h-fit max-w-none max-h-[90vh] flex flex-col">
          <VisuallyHidden>
            <DialogTitle>
              {platformLabel} Profile - @{username}
            </DialogTitle>
          </VisuallyHidden>

          {/* Embed */}
          <div className="relative overflow-hidden">
            {platform === 'tiktok' ? (
              <TikTokProfileEmbed url={username} className="relative" />
            ) : platform === 'youtube' ? (
              <div className="relative flex items-center justify-center" style={{ width: '500px', height: '300px' }}>
                <div className="text-center text-muted-foreground">
                  <p className="text-sm font-medium mb-2">YouTube Profile</p>
                  <p className="text-xs">@{username}</p>
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-3"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View on YouTube
                  </a>
                </div>
              </div>
            ) : (
              <div className="relative" style={{ width: '500px', height: '482px' }}>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <iframe
                  className="instagram-media instagram-media-rendered"
                  src={instagramEmbedUrl}
                  allowFullScreen
                  frameBorder="0"
                  height="485"
                  scrolling="no"
                  onLoad={() => setIsLoading(false)}
                  style={{
                    background: 'white',
                    width: '100%',
                    borderRadius: '3px',
                    border: '1px solid #dbdbdb',
                    margin: '0px',
                    minWidth: '326px',
                    padding: '0px',
                  }}
                />
              </div>
            )}
          </div>

          {/* Status section */}
          <div className="px-4 pt-3 pb-2 border-t">
            <p className="text-sm font-medium">@{username}</p>
            <div className="flex items-center gap-3 mt-1">
              {isTracked ? (
                <span className="text-xs text-green-600">On Client Dashboard</span>
              ) : (
                <span className="text-xs text-muted-foreground">Not on Client Dashboard</span>
              )}
              {isTracked && (
                <>
                  <span className="text-xs text-muted-foreground/40">·</span>
                  {isFrozen ? (
                    <span className="text-xs text-blue-600">Frozen</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Active</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action toolbar */}
          <TooltipProvider delayDuration={300}>
            <div className="flex items-center gap-2 px-4 pb-3 pt-1 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in {platformLabel}
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Opens the profile on {platformLabel} in a new tab
                </TooltipContent>
              </Tooltip>

              {isTracked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveFromDashboard}
                      disabled={isSubmitting !== null || !trackedAccountId}
                    >
                      {isSubmitting === 'dashboard' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Remove from Dashboard
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Stop tracking this account on the brand's dashboard. Historical data is preserved.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleAddToDashboard}
                      disabled={isSubmitting !== null}
                    >
                      {isSubmitting === 'dashboard' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Add to Dashboard
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Track this account on the brand's client dashboard
                  </TooltipContent>
                </Tooltip>
              )}

              {isTracked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={isFrozen ? 'border-blue-300 text-blue-600 hover:text-blue-700' : ''}
                      onClick={handleToggleFreeze}
                      disabled={isSubmitting !== null || !trackedAccountId}
                    >
                      {isSubmitting === 'freeze' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Snowflake className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {isFrozen ? 'Unfreeze' : 'Freeze'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFrozen
                      ? 'Resume syncing this account'
                      : 'Pause sync for this brand without removing from dashboard. Posts and analytics stay visible.'}
                  </TooltipContent>
                </Tooltip>
              )}

              {managedCreatorId && onHandleDeleted && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={isSubmitting !== null}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete Handle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Remove this handle from the managed creator record
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete @{username}'s {platformLabel} handle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the {platformLabel} handle from the managed creator record.
              {isTracked && ' Tracking will be frozen on the client dashboard.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteHandle}
            >
              Delete Handle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
