'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

interface VerifyPostsDialogProps {
  selectedIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (verifiedIds: string[]) => void;
}

type Phase = 'idle' | 'verifying' | 'results';

interface UnverifiedPost {
  mcp_id: string;
  post_url: string | null;
  platform: string;
  username: string;
  reason: 'not_found' | 'api_error';
}

interface UnverifiablePost {
  mcp_id: string;
  post_url: string | null;
  reason: string;
}

interface AccountProgress {
  platform: string;
  username: string;
  postCount: number;
  status: 'pending' | 'checking' | 'done';
  verifiedCount?: number;
  notFoundCount?: number;
  error?: boolean;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: '/assets/socials/Platform=TikTok, Color=Original.svg',
  instagram: '/assets/socials/Platform=Instagram, Color=Original.svg',
  youtube: '/assets/socials/Platform=YouTube, Color=Original.svg',
};

const PlatformIconSmall = ({ platform }: { platform: string }) => {
  const src = PLATFORM_ICONS[platform];
  if (!src) return null;
  return <img src={src} alt={platform} className="h-4 w-4 shrink-0" />;
};

export function VerifyPostsDialog({
  selectedIds,
  open,
  onOpenChange,
  onVerified,
}: VerifyPostsDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [autoVerifiedCount, setAutoVerifiedCount] = useState(0);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [accountsChecked, setAccountsChecked] = useState(0);
  const [accounts, setAccounts] = useState<AccountProgress[]>([]);
  const [verifiedIds, setVerifiedIds] = useState<string[]>([]);
  const [unverifiedPosts, setUnverifiedPosts] = useState<UnverifiedPost[]>([]);
  const [unverifiable, setUnverifiable] = useState<UnverifiablePost[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setAutoVerifiedCount(0);
    setTotalAccounts(0);
    setAccountsChecked(0);
    setAccounts([]);
    setVerifiedIds([]);
    setUnverifiedPosts([]);
    setUnverifiable([]);
    setServerError(null);
  }, []);

  const handleSSEEvent = useCallback((event: string, data: unknown) => {
    const d = data as Record<string, unknown>;

    switch (event) {
      case 'init': {
        const autoVerified = d.autoVerified as { count: number; ids: string[] };
        setAutoVerifiedCount(autoVerified.count);
        setTotalAccounts(d.totalAccounts as number);
        setUnverifiable(d.unverifiable as UnverifiablePost[]);

        // Build initial account list
        const accts: AccountProgress[] = [];
        const accountsToCheck = d.accountsToCheck as {
          tiktok: Array<{ username: string; postCount: number }>;
          instagram: Array<{ username: string; postCount: number }>;
          youtube: number;
        };
        for (const a of accountsToCheck.tiktok) {
          accts.push({ platform: 'tiktok', username: a.username, postCount: a.postCount, status: 'pending' });
        }
        for (const a of accountsToCheck.instagram) {
          accts.push({ platform: 'instagram', username: a.username, postCount: a.postCount, status: 'pending' });
        }
        if (accountsToCheck.youtube > 0) {
          accts.push({ platform: 'youtube', username: 'batch', postCount: accountsToCheck.youtube, status: 'pending' });
        }
        setAccounts(accts);
        break;
      }

      case 'account_start': {
        const platform = d.platform as string;
        const username = d.username as string;
        setAccounts((prev) =>
          prev.map((a) =>
            a.platform === platform && a.username === username
              ? { ...a, status: 'checking' as const }
              : a
          )
        );
        break;
      }

      case 'account_complete': {
        const platform = d.platform as string;
        const username = d.username as string;
        const verified = d.verified as string[];
        const notFound = d.notFound as string[];
        const error = d.error as boolean;
        setAccountsChecked((prev) => prev + 1);
        setAccounts((prev) =>
          prev.map((a) =>
            a.platform === platform && a.username === username
              ? {
                  ...a,
                  status: 'done' as const,
                  verifiedCount: verified.length,
                  notFoundCount: notFound.length,
                  error,
                }
              : a
          )
        );
        break;
      }

      case 'complete':
        setVerifiedIds(d.verifiedIds as string[]);
        setUnverifiedPosts(d.unverifiedPosts as UnverifiedPost[]);
        setPhase('results');
        break;

      case 'error':
        setServerError((d.message as string) || 'Verification failed');
        setPhase('results');
        break;
    }
  }, []);

  const startVerification = useCallback(async () => {
    reset();
    setPhase('verifying');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/admin/creator-post-payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managed_creator_post_ids: selectedIds }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        setServerError(errData.error || `Server error (${res.status})`);
        console.error('[VerifyPosts] Server error:', errData.error);
        setPhase('results');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              handleSSEEvent(currentEvent, parsed);
            } catch {
              // Skip malformed SSE events
            }
          }
        }
      }

      // Fallback: if stream closed without 'complete' or 'error' (e.g. Vercel timeout)
      setPhase((p) => p === 'verifying' ? 'results' : p);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[VerifyPosts] Error:', err);
        setPhase('results');
      }
    }
  }, [selectedIds, reset, handleSSEEvent]);

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      abortRef.current?.abort();
      reset();
    }
    onOpenChange(newOpen);
  };

  const handleDone = () => {
    // On server error, verifiedIds is [] — calling onVerified would deselect
    // every row the admin had selected. Skip that signal on failure.
    if (!serverError) onVerified(verifiedIds);
    handleClose(false);
  };

  const progressPct = totalAccounts > 0 ? Math.round((accountsChecked / totalAccounts) * 100) : 0;
  const needsReviewCount = unverifiedPosts.length + unverifiable.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" onCloseAutoFocus={(e) => e.preventDefault()}>
        {phase === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Verify Posts Before Payment
              </DialogTitle>
              <DialogDescription>
                This will verify {selectedIds.length} posts across TikTok, Instagram, and
                YouTube. Recently synced posts are auto-verified. Remaining posts are checked
                per account.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={startVerification}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Start Verification
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'verifying' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                Verifying Posts...
              </DialogTitle>
              <DialogDescription>
                Checking accounts on each platform
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Auto-verified banner */}
              {autoVerifiedCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {autoVerifiedCount} post{autoVerifiedCount !== 1 ? 's' : ''} auto-verified (synced recently)
                </div>
              )}

              {/* Account progress bar */}
              {totalAccounts > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {accountsChecked} / {totalAccounts} account{totalAccounts !== 1 ? 's' : ''} checked
                    </span>
                    <span className="font-mono text-sm font-medium">{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Account list */}
              {accounts.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {accounts.map((acct) => (
                    <div
                      key={`${acct.platform}-${acct.username}`}
                      className="px-3 py-2 flex items-center gap-3"
                    >
                      <PlatformIconSmall platform={acct.platform} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {acct.platform === 'youtube' ? `${acct.postCount} videos` : `@${acct.username}`}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {acct.postCount} post{acct.postCount !== 1 ? 's' : ''}
                      </span>
                      {acct.status === 'pending' && (
                        <span className="text-xs text-muted-foreground">Waiting</span>
                      )}
                      {acct.status === 'checking' && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      )}
                      {acct.status === 'done' && !acct.error && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      )}
                      {acct.status === 'done' && acct.error && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {phase === 'results' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {serverError ? (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                ) : needsReviewCount === 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                {serverError ? 'Verification Failed' : 'Verification Complete'}
              </DialogTitle>
              <DialogDescription>
                {serverError
                  ? 'Could not complete verification. You can retry or pay directly from the grid.'
                  : (
                    <>
                      {verifiedIds.length} post{verifiedIds.length !== 1 ? 's' : ''} verified
                      {needsReviewCount > 0 &&
                        `, ${needsReviewCount} need${needsReviewCount !== 1 ? '' : 's'} manual review`}
                    </>
                  )}
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {serverError && (
                <div className="border border-red-200 dark:border-red-900 rounded-lg p-3 bg-red-50 dark:bg-red-950/30">
                  <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>
                </div>
              )}

              {/* Summary stats */}
              {!serverError && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-green-600 font-mono">{verifiedIds.length}</p>
                    <p className="text-xs text-green-700 dark:text-green-400">Verified</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-amber-600 font-mono">{unverifiedPosts.length}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">Not Found / Error</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-muted-foreground font-mono">{unverifiable.length}</p>
                    <p className="text-xs text-muted-foreground">Unverifiable</p>
                  </div>
                </div>
              )}

              {/* Auto-verified note */}
              {!serverError && autoVerifiedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {autoVerifiedCount} of {verifiedIds.length} verified posts were auto-verified (synced within 6 hours).
                </p>
              )}

              {/* Needs manual review section */}
              {unverifiedPosts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Needs Manual Review ({unverifiedPosts.length})
                  </p>
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {unverifiedPosts.map((post) => (
                      <div
                        key={post.mcp_id}
                        className="px-3 py-2 flex items-center gap-3"
                      >
                        <PlatformIconSmall platform={post.platform} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">@{post.username}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {post.reason === 'not_found' ? 'Not Found' : 'API Error'}
                        </span>
                        {post.post_url && (
                          <a
                            href={post.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unverifiable posts */}
              {unverifiable.length > 0 && (
                <div className="border border-muted rounded-lg p-3">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Could Not Verify ({unverifiable.length})
                  </p>
                  <div className="space-y-1">
                    {unverifiable.map((post) => (
                      <p key={post.mcp_id} className="text-xs text-muted-foreground">
                        {post.reason}
                        {post.post_url && (
                          <>
                            {' — '}
                            <a
                              href={post.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View post
                            </a>
                          </>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleDone}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
