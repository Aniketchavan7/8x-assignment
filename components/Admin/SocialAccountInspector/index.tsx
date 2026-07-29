'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  RowApiModule,
  ColumnApiModule,
  ValidationModule,
  CellStyleModule,
  RowSelectionModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type SelectionColumnDef,
} from 'ag-grid-community';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  HelpCircle,
  Snowflake,
  Link2,
  GitMerge,
  AlertCircle,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAdminContext } from '@/lib/contexts/AdminContext';
import { hasAccess, PAYOUTS_ROLES } from '@/lib/modules/admin/roles';
import type {
  AccountSummary,
  RelationshipsPayload,
  InspectorPost,
  InspectorActionType,
  Platform,
} from '@/lib/modules/admin/inspector/types';
import { PlatformIcon, PLATFORM_COLOR_CLASS } from './PlatformIcon';
import { ProfilePreviewModal } from './ProfilePreviewModal';
import { LinkMcDialog } from './LinkMcDialog';
import { McPickerDialog } from './McPickerDialog';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  RowApiModule,
  ColumnApiModule,
  CellStyleModule,
  RowSelectionModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

const inspectorPostsTheme = themeQuartz.withParams({
  borderRadius: 6,
  headerHeight: 36,
  rowHeight: 56,
  spacing: 6,
});

const POSTS_ROW_SELECTION = {
  mode: 'multiRow' as const,
  checkboxes: true,
  headerCheckbox: true,
  enableClickSelection: false,
};

const POSTS_SELECTION_COLUMN_DEF: SelectionColumnDef = {
  pinned: 'left',
  width: 50,
  minWidth: 50,
  maxWidth: 50,
  suppressHeaderMenuButton: true,
};

interface InspectorResponse {
  account: AccountSummary;
  relationships: RelationshipsPayload;
  posts: InspectorPost[];
}

interface Props {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SocialAccountInspector({ accountId, open, onOpenChange }: Props) {
  const { data, isLoading, isError, error, refetch } = useQuery<InspectorResponse>({
    queryKey: ['/api/admin/inspector/account', accountId],
    enabled: !!accountId && open,
    queryFn: async () => {
      const res = await fetch(`/api/admin/inspector/account/${accountId}`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      return res.json();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !w-screen !h-screen !max-w-none !max-h-none !m-0 !rounded-none !border-0 !p-0 !translate-x-0 !translate-y-0 !top-0 !left-0 !bg-background overflow-hidden [&>button]:hidden flex flex-col z-[60]">
        <VisuallyHidden>
          <DialogTitle>Social Account Inspector</DialogTitle>
        </VisuallyHidden>
        {isError ? (
          <div className="p-8 max-w-7xl mx-auto w-full space-y-4">
            <p className="text-destructive">
              Failed to load account: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        ) : !accountId || isLoading || !data ? (
          <div className="p-8 max-w-7xl mx-auto w-full space-y-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <InspectorBody data={data} onRefresh={refetch} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InspectorBody({
  data,
  onRefresh,
  onClose,
}: {
  data: InspectorResponse;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [selectedPost, setSelectedPost] = useState<InspectorPost | null>(null);
  const [selectedPosts, setSelectedPosts] = useState<InspectorPost[]>([]);
  const gridApiRef = useRef<GridApi<InspectorPost> | null>(null);

  const clearSelection = useCallback(() => {
    gridApiRef.current?.deselectAll();
    setSelectedPosts([]);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-background">
        <InspectorHeader
          account={data.account}
          onRefresh={onRefresh}
          onClose={onClose}
        />
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-8 py-6 space-y-6">
            <RelationshipsPanel
              account={data.account}
              relationships={data.relationships}
              onRefresh={onRefresh}
            />
            <PostsSection
              posts={data.posts}
              selectedPosts={selectedPosts}
              setSelectedPosts={setSelectedPosts}
              clearSelection={clearSelection}
              gridApiRef={gridApiRef}
              onOpenDetail={(p) => setSelectedPost(p)}
              relationships={data.relationships}
              onRefresh={onRefresh}
            />
          </div>
        </div>
        {selectedPost && (
          <PostDetailSidebar
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            onRefresh={onRefresh}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ───────────────────────── Header ─────────────────────────

function InspectorHeader({
  account,
  onRefresh,
  onClose,
}: {
  account: AccountSummary;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { adminRole } = useAdminContext();
  const canWrite = hasAccess(adminRole, PAYOUTS_ROLES);

  return (
    <div className="border-b bg-background sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-8 py-5 flex items-start gap-6">
        <button
          onClick={onClose}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Close"
          aria-label="Close inspector"
        >
          <X className="h-5 w-5" />
        </button>

        <PlatformAvatar
          platform={account.platform}
          username={account.username}
          profileUrl={account.profileUrl}
          profilePicUrl={account.profilePicUrl}
          channelId={account.channelId}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-semibold truncate tracking-tight">
              @{account.username}
            </h1>
            {account.trackingDisabled ? (
              <Badge variant="destructive" className="text-xs">tracking disabled</Badge>
            ) : (
              <Badge className="bg-green-600 hover:bg-green-700 text-xs">
                tracking active
              </Badge>
            )}
          </div>
          <div className="flex gap-x-5 gap-y-1 text-xs text-muted-foreground mt-1.5 flex-wrap">
            <span className="tabular-nums">
              <span className="font-medium text-foreground">
                {account.followerCount?.toLocaleString() ?? '—'}
              </span>{' '}
              followers
            </span>
            <span className="tabular-nums">
              <span className="font-medium text-foreground">{account.postCount}</span> posts
            </span>
            {account.videoCount != null && (
              <span className="tabular-nums">
                <span className="font-medium text-foreground">{account.videoCount}</span> videos
              </span>
            )}
            {account.channelId && <CopyField label="channel_id" value={account.channelId} />}
          </div>
          <SyncHealthStrip account={account} />
        </div>

        <div className="shrink-0 flex flex-col items-stretch gap-1.5 w-[180px]">
          <AccountActionButtons
            account={account}
            canWrite={canWrite}
            onRefresh={onRefresh}
            stacked
          />
        </div>
      </div>
    </div>
  );
}

function PlatformAvatar({
  platform,
  username,
  profileUrl,
  profilePicUrl,
  channelId,
}: {
  platform: Platform;
  username: string;
  profileUrl: string | null;
  profilePicUrl: string | null;
  channelId?: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const clickTimer = useRef<number | null>(null);

  const openInNewTab = useCallback(() => {
    const url =
      profileUrl ??
      (platform === 'tiktok'
        ? `https://www.tiktok.com/@${username}`
        : platform === 'instagram'
          ? `https://www.instagram.com/${username}`
          : channelId
            ? `https://www.youtube.com/channel/${channelId}`
            : `https://www.youtube.com/@${username}`);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [platform, username, profileUrl, channelId]);

  // Differentiate single vs double click without delaying double-click action.
  const handleClick = () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      openInNewTab();
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setPreviewOpen(true);
    }, 220);
  };

  const tooltip = `Click to preview · Double-click to open on ${platform}`;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className="relative shrink-0 h-14 w-14 rounded-full overflow-hidden bg-muted ring-2 ring-border hover:ring-foreground/30 transition-all focus:outline-none focus:ring-2 focus:ring-primary group"
            aria-label={`Preview @${username} on ${platform}`}
          >
            {profilePicUrl ? (
              <img
                src={profilePicUrl}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`h-full w-full flex items-center justify-center text-muted-foreground ${PLATFORM_COLOR_CLASS[platform]}`}>
                <PlatformIcon platform={platform} className="h-6 w-6" />
              </div>
            )}

            {/* Platform badge in the corner */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-background border-2 border-background flex items-center justify-center shadow-sm ${PLATFORM_COLOR_CLASS[platform]}`}
            >
              <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs z-[100]">
          <div className="font-medium">{tooltip}</div>
          {profileUrl && (
            <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">
              {profileUrl}
            </div>
          )}
        </TooltipContent>
      </Tooltip>

      <ProfilePreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        platform={platform}
        username={username}
        profileUrl={profileUrl}
        channelId={channelId}
      />
    </>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast({ title: 'Copied', description: value });
      }}
    >
      <span>
        {label}: <code className="font-mono text-[10px]">{value}</code>
      </span>
      <Copy className="h-3 w-3" />
    </button>
  );
}

function SyncHealthStrip({ account }: { account: AccountSummary }) {
  const warn = (account.consecutiveSyncFailures ?? 0) > 0 || !!account.syncError;
  const stuck =
    account.backfillStatus === 'in_progress' &&
    account.syncStartedAt &&
    Date.now() - new Date(account.syncStartedAt).getTime() > 30 * 60 * 1000;

  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <Pill
        tone={account.lastSyncedAt ? 'ok' : 'warn'}
        label="last synced"
        value={formatRel(account.lastSyncedAt)}
      />
      <Pill
        tone={stuck ? 'err' : account.backfillStatus === 'completed' ? 'ok' : 'warn'}
        label="backfill"
        value={account.backfillStatus ?? '—'}
      />
      <Pill
        tone={(account.consecutiveSyncFailures ?? 0) > 0 ? 'err' : 'ok'}
        label="failures"
        value={String(account.consecutiveSyncFailures ?? 0)}
      />
      {warn && account.syncError && (
        <span className="text-destructive truncate max-w-md">
          <AlertTriangle className="inline h-3 w-3 mr-1" />
          {account.syncError}
        </span>
      )}
    </div>
  );
}

function Pill({
  tone,
  label,
  value,
}: {
  tone: 'ok' | 'warn' | 'err';
  label: string;
  value: string;
}) {
  const color =
    tone === 'ok'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'warn'
        ? 'text-yellow-700 dark:text-yellow-400'
        : 'text-destructive';
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className={color}>{value}</span>
    </span>
  );
}

function formatRel(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

// ───────────────────────── Account actions ─────────────────────────

function AccountActionButtons({
  account,
  canWrite,
  onRefresh,
  iconOnly = false,
  stacked = false,
}: {
  account: AccountSummary;
  canWrite: boolean;
  onRefresh: () => void;
  iconOnly?: boolean;
  stacked?: boolean;
}) {
  const iconSize = iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const extraClass = stacked ? 'justify-start w-full' : undefined;
  return (
    <>
      <ActionButton
        icon={<RefreshCw className={iconSize} />}
        label="Re-sync"
        tooltip="Invokes the platform sync edge function directly. Updates follower/view counts and pulls newest posts."
        canWrite={canWrite}
        action="force_resync"
        payload={{ accountId: account.id, platform: account.platform }}
        onRefresh={onRefresh}
        iconOnly={iconOnly}
        className={extraClass}
      />
      <ActionButton
        icon={
          account.trackingDisabled ? (
            <CheckCircle2 className={iconSize} />
          ) : (
            <XCircle className={iconSize} />
          )
        }
        label={account.trackingDisabled ? 'Enable' : 'Disable'}
        tooltip={`Flips tracking_disabled on the ${account.platform}_accounts row. Disabled accounts are skipped by sync crons.`}
        canWrite={canWrite}
        action="toggle_tracking"
        payload={{ accountId: account.id, disabled: !account.trackingDisabled }}
        onRefresh={onRefresh}
        iconOnly={iconOnly}
        className={extraClass}
      />
      <ActionButton
        icon={<AlertCircle className={iconSize} />}
        label="Reset"
        tooltip="Clears consecutive_sync_failures, sync_error, backfill_cursor. Sets sync_status = pending so the next cron run will treat this account as fresh."
        canWrite={canWrite}
        action="reset_sync_state"
        payload={{ accountId: account.id }}
        onRefresh={onRefresh}
        iconOnly={iconOnly}
        className={extraClass}
      />
      <LinkMcActionButton
        account={account}
        canWrite={canWrite}
        onRefresh={onRefresh}
        iconOnly={iconOnly}
        extraClass={extraClass}
        iconSize={iconSize}
      />
    </>
  );
}

function LinkMcActionButton({
  account,
  canWrite,
  onRefresh,
  iconOnly,
  extraClass,
  iconSize,
  linkedUserIdHint,
}: {
  account: AccountSummary;
  canWrite: boolean;
  onRefresh: () => void;
  iconOnly?: boolean;
  extraClass?: string;
  iconSize: string;
  linkedUserIdHint?: string | null;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMcId, setSelectedMcId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ summary: string; count: number; sample: unknown[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const openPicker = () => setPickerOpen(true);

  const handleSelectMc = async (mcId: string) => {
    setSelectedMcId(mcId);
    setPickerOpen(false);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inspector/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_mc',
          dryRun: true,
          payload: { accountId: account.id, managedCreatorId: mcId },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: 'Dry run failed', description: body.error, variant: 'destructive' });
        return;
      }
      setPreview(body.result);
      setConfirmOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!selectedMcId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inspector/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link_mc',
          dryRun: false,
          payload: { accountId: account.id, managedCreatorId: selectedMcId },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: 'Link failed', description: body.error, variant: 'destructive' });
      } else {
        toast({ title: 'Linked', description: preview?.summary ?? 'MC updated' });
        onRefresh();
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      setSelectedMcId(null);
    }
  };

  const disabled = !canWrite;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size={iconOnly ? 'icon' : 'sm'}
              disabled={disabled || busy}
              onClick={openPicker}
              className={cn(iconOnly && 'h-9 w-9', extraClass)}
              aria-label="Link to managed_creator"
            >
              <Link2 className={iconSize} />
              {!iconOnly && <span className="ml-1.5 text-xs">Link MC</span>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs z-[100]">
          <div className="font-medium mb-1">Link to managed_creator</div>
          Opens a picker to choose a managed_creator row, then sets its{' '}
          {account.platform}_account_id to this account. Fixes the portal-onboarding gap
          where handles are saved as text but no FK is set.
        </TooltipContent>
      </Tooltip>

      <LinkMcDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        platform={account.platform}
        linkedUserId={linkedUserIdHint ?? null}
        onSelect={handleSelectMc}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm: Link MC</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div className="font-medium text-foreground">{preview?.summary}</div>
                {preview?.sample && preview.sample.length > 0 && (
                  <pre className="text-[10px] bg-muted rounded p-2 max-h-48 overflow-auto">
                    {JSON.stringify(preview.sample, null, 2)}
                  </pre>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={execute} disabled={busy}>
              {busy ? 'Working…' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  canWrite: boolean;
  action: InspectorActionType;
  payload: Record<string, unknown>;
  prompt?: (ctx: Record<string, unknown>) => Record<string, unknown> | null;
  onRefresh: () => void;
  variant?: 'default' | 'outline' | 'destructive';
  /** Render just the icon with tooltip instead of icon+label */
  iconOnly?: boolean;
  /** Extra classes for the button */
  className?: string;
}

function ActionButton({
  icon,
  label,
  tooltip,
  canWrite,
  action,
  payload,
  prompt,
  onRefresh,
  variant = 'outline',
  iconOnly = false,
  className,
}: ActionButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<{ summary: string; count: number; sample: unknown[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [finalPayload, setFinalPayload] = useState(payload);
  const { toast } = useToast();

  const handleClick = async () => {
    let resolvedPayload = payload;
    if (prompt) {
      const next = prompt(payload);
      if (!next) return;
      resolvedPayload = next;
    }
    setFinalPayload(resolvedPayload);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inspector/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, dryRun: true, payload: resolvedPayload }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: 'Dry run failed',
          description: body.error ?? res.statusText,
          variant: 'destructive',
        });
        return;
      }
      setPreview(body.result);
      setConfirmOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/inspector/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, dryRun: false, payload: finalPayload }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: 'Action failed', description: body.error, variant: 'destructive' });
      } else {
        toast({ title: 'Done', description: preview?.summary ?? 'Action executed' });
        onRefresh();
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const disabled = !canWrite;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant={variant}
              size={iconOnly ? 'icon' : 'sm'}
              disabled={disabled || busy}
              onClick={handleClick}
              className={cn(iconOnly && 'h-9 w-9', className)}
              aria-label={label}
            >
              {icon}
              {!iconOnly && <span className="ml-1.5 text-xs">{label}</span>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs z-[100]">
          <div className="font-medium mb-1">{label}</div>
          {tooltip}
          {disabled && (
            <div className="mt-1 italic text-destructive">Contact admin — read-only for your role</div>
          )}
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm: {label}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div className="font-medium text-foreground">{preview?.summary}</div>
                <div className="text-xs text-muted-foreground">
                  Affects {preview?.count ?? 0} row(s)
                </div>
                {preview?.sample && preview.sample.length > 0 && (
                  <pre className="text-[10px] bg-muted rounded p-2 max-h-48 overflow-auto">
                    {JSON.stringify(preview.sample, null, 2)}
                  </pre>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={execute} disabled={busy}>
              {busy ? 'Working…' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ───────────────────────── Relationships ─────────────────────────

function RelationshipsPanel({
  account,
  relationships,
  onRefresh,
}: {
  account: AccountSummary;
  relationships: RelationshipsPayload;
  onRefresh: () => void;
}) {
  const { adminRole } = useAdminContext();
  const canWrite = hasAccess(adminRole, PAYOUTS_ROLES);

  return (
    <div className="space-y-4">
      <Section title="Managed Creators" count={relationships.managedCreators.length}>
        {relationships.managedCreators.length === 0 ? (
          <EmptyHint text="No managed_creator rows point at this account." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-1.5">Name</th>
                <th className="text-left py-1.5">Brand</th>
                <th className="text-left py-1.5">Status</th>
                <th className="text-right py-1.5">Base pay</th>
                <th className="text-left py-1.5">Linked user</th>
              </tr>
            </thead>
            <tbody>
              {relationships.managedCreators.map((mc) => (
                <tr key={mc.id} className="border-b last:border-0">
                  <td className="py-1.5">{mc.name}</td>
                  <td className="py-1.5">{mc.brandName ?? '—'}</td>
                  <td className="py-1.5">
                    <Badge variant="outline" className="capitalize text-xs">
                      {mc.status}
                    </Badge>
                    {mc.isActive === false && (
                      <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {mc.basePayCents != null ? `$${(mc.basePayCents / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {mc.linkedUserId ?? 'none'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="BTSAs" count={relationships.btsas.length}>
        {relationships.btsas.length === 0 ? (
          <EmptyHint text="No brand_tracked_social_accounts rows for this connector." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-1.5">Brand</th>
                <th className="text-left py-1.5">Campaign</th>
                <th className="text-left py-1.5">Frozen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {relationships.btsas.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="py-1.5">{b.brandName ?? '—'}</td>
                  <td className="py-1.5 text-xs">{b.campaign ?? '—'}</td>
                  <td className="py-1.5">
                    {b.frozen ? (
                      <Badge variant="outline" className="text-xs">
                        <Snowflake className="h-3 w-3 mr-1" />
                        frozen
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <ActionButton
                      icon={<Snowflake className="h-3 w-3" />}
                      label={b.frozen ? 'Unfreeze' : 'Freeze'}
                      tooltip="Flip brand_tracked_social_accounts.frozen. Frozen BTSAs are hidden from the brand's analytics dashboard. Sync crons continue to run."
                      canWrite={canWrite}
                      action="freeze_btsa"
                      payload={{ btsaId: b.id, frozen: !b.frozen }}
                      onRefresh={onRefresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {account.platform === 'youtube' && relationships.duplicates.length > 0 && (
        <Section title="Duplicates (same channel_id)" count={relationships.duplicates.length}>
          <div className="mb-2 text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Multiple youtube_accounts rows share this channel_id — posts may be split.
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-1.5">Username</th>
                <th className="text-right py-1.5">Followers</th>
                <th className="text-right py-1.5">Posts</th>
                <th className="text-left py-1.5">Last synced</th>
                <th className="text-left py-1.5">Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {relationships.duplicates.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-1.5">@{d.username}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {d.followerCount?.toLocaleString() ?? '—'}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{d.postCount}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {formatRel(d.lastSyncedAt)}
                  </td>
                  <td className="py-1.5 text-xs text-muted-foreground">
                    {formatRel(d.createdAt)}
                  </td>
                  <td className="py-1.5 text-right">
                    <ActionButton
                      icon={<GitMerge className="h-3 w-3" />}
                      label="Merge into this"
                      tooltip="Reassigns every post with youtube_account_id = duplicate.id to this account, then disables tracking on the duplicate. Safe: source row and its MCs stay intact, just tracking_disabled = true."
                      canWrite={canWrite}
                      action="merge_duplicate"
                      payload={{ fromAccountId: d.id, intoAccountId: account.id }}
                      onRefresh={onRefresh}
                      variant="destructive"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        {count != null && (
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>;
}

// ───────────────────────── Posts ─────────────────────────

function ThumbCellRenderer({ data }: ICellRendererParams<InspectorPost>) {
  if (!data) return null;
  if (!data.thumbnailUrl) return <div className="h-12 w-8 bg-muted rounded" />;
  return (
    <a
      href={data.postUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-block"
    >
      <img src={data.thumbnailUrl} alt="" className="h-12 w-8 object-cover rounded" />
    </a>
  );
}

function McCellRenderer({ data }: ICellRendererParams<InspectorPost>) {
  if (!data) return null;
  if (!data.mcpManagedCreatorName) {
    return <Badge variant="destructive" className="text-[10px]">unattributed</Badge>;
  }
  return (
    <div className="text-xs leading-tight">
      <div className="truncate">{data.mcpManagedCreatorName}</div>
      <div className="text-muted-foreground truncate">{data.mcpBrandName ?? '—'}</div>
    </div>
  );
}

function PaymentCellRenderer({ value }: ICellRendererParams<InspectorPost>) {
  if (!value) return <span>—</span>;
  return <Badge variant="outline" className="text-[10px]">{value}</Badge>;
}

function VideoCellRenderer({ data }: ICellRendererParams<InspectorPost>) {
  if (!data) return null;
  return data.videoStorageUrl
    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
    : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function AiCellRenderer({ data }: ICellRendererParams<InspectorPost>) {
  if (!data) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {data.hasTranscript ? 'T' : '·'}/{data.hasSummary ? 'S' : '·'}
    </span>
  );
}

function PostsSection({
  posts,
  selectedPosts,
  setSelectedPosts,
  clearSelection,
  gridApiRef,
  onOpenDetail,
  relationships,
  onRefresh,
}: {
  posts: InspectorPost[];
  selectedPosts: InspectorPost[];
  setSelectedPosts: (posts: InspectorPost[]) => void;
  clearSelection: () => void;
  gridApiRef: React.MutableRefObject<GridApi<InspectorPost> | null>;
  onOpenDetail: (p: InspectorPost) => void;
  relationships: RelationshipsPayload;
  onRefresh: () => void;
}) {
  const { adminRole } = useAdminContext();
  const canWrite = hasAccess(adminRole, PAYOUTS_ROLES);

  const [filter, setFilter] = useState<'all' | 'unattributed' | 'excluded'>('all');

  const filtered = useMemo(
    () =>
      posts.filter((p) => {
        if (filter === 'unattributed') return !p.mcpId;
        if (filter === 'excluded') return p.isExcluded;
        return true;
      }),
    [posts, filter],
  );

  const columnDefs = useMemo<ColDef<InspectorPost>[]>(
    () => [
      {
        colId: 'thumb',
        headerName: 'Thumb',
        width: 72,
        sortable: false,
        cellRenderer: ThumbCellRenderer,
      },
      {
        colId: 'posted',
        headerName: 'Posted',
        field: 'postedAt',
        flex: 1,
        minWidth: 100,
        valueFormatter: (p) => formatRel(p.value),
        comparator: (a, b) => new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime(),
      },
      {
        colId: 'views',
        headerName: 'Views',
        field: 'latestViews',
        flex: 1,
        minWidth: 90,
        type: 'rightAligned',
        valueFormatter: (p) => p.value?.toLocaleString() ?? '—',
      },
      {
        colId: 'mc',
        headerName: 'MC',
        flex: 2,
        minWidth: 160,
        sortable: false,
        cellRenderer: McCellRenderer,
      },
      {
        colId: 'payment',
        headerName: 'Payment',
        field: 'paymentStatus',
        flex: 1,
        minWidth: 110,
        cellRenderer: PaymentCellRenderer,
      },
      {
        colId: 'owed',
        headerName: 'Owed',
        field: 'totalOwedCents',
        flex: 1,
        minWidth: 90,
        type: 'rightAligned',
        valueFormatter: (p) => (p.value != null ? `$${(p.value / 100).toFixed(2)}` : '—'),
      },
      {
        colId: 'video',
        headerName: 'Video',
        width: 72,
        sortable: false,
        cellRenderer: VideoCellRenderer,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
      {
        colId: 'ai',
        headerName: 'AI',
        width: 72,
        sortable: false,
        cellRenderer: AiCellRenderer,
        cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
      },
    ],
    [],
  );

  return (
    <Section title={`Posts (${posts.length})`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {(['all', 'unattributed', 'excluded'] as const).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={filter === v ? 'default' : 'outline'}
            onClick={() => setFilter(v)}
          >
            {v}
          </Button>
        ))}

        {selectedPosts.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selectedPosts.length} selected</span>
            <BulkActions
              postIds={selectedPosts.map((p) => p.id)}
              canWrite={canWrite}
              onRefresh={() => {
                clearSelection();
                onRefresh();
              }}
              managedCreators={relationships.managedCreators}
            />
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div style={{ height: 540 }}>
        <AgGridReact<InspectorPost>
          theme={inspectorPostsTheme}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, sortable: true, suppressMovable: true }}
          rowSelection={POSTS_ROW_SELECTION}
          selectionColumnDef={POSTS_SELECTION_COLUMN_DEF}
          onRowClicked={(e) => {
            if (!e.data) return;
            const target = e.event?.target as HTMLElement | undefined;
            if (target?.closest('a, button, .ag-selection-checkbox, .ag-checkbox')) return;
            onOpenDetail(e.data);
          }}
          onSelectionChanged={(e) => setSelectedPosts(e.api.getSelectedRows())}
          onGridReady={(e) => {
            gridApiRef.current = e.api;
          }}
          getRowId={(p) => p.data.id}
          getRowClass={(p) => (p.data?.isExcluded ? 'opacity-60' : '')}
          animateRows={true}
          suppressCellFocus={true}
          overlayNoRowsTemplate={`<span class="text-sm text-muted-foreground">No posts match.</span>`}
        />
      </div>
    </Section>
  );
}

function BulkActions({
  postIds,
  canWrite,
  onRefresh,
  managedCreators,
}: {
  postIds: string[];
  canWrite: boolean;
  onRefresh: () => void;
  managedCreators: RelationshipsPayload['managedCreators'];
}) {
  return (
    <>
      <ReassignMcpsButton
        postIds={postIds}
        canWrite={canWrite}
        managedCreators={managedCreators}
        onRefresh={onRefresh}
      />
      <CreateMissingMcpsButton
        postIds={postIds}
        canWrite={canWrite}
        managedCreators={managedCreators}
        onRefresh={onRefresh}
      />
      <ActionButton
        icon={<XCircle className="h-3 w-3" />}
        label="Exclude"
        tooltip="Sets posts.is_excluded = true. Excluded posts don't count toward payments or analytics."
        canWrite={canWrite}
        action="toggle_exclude_post"
        payload={{ postIds, excluded: true }}
        onRefresh={onRefresh}
      />
    </>
  );
}

interface PickerButtonProps {
  postIds: string[];
  canWrite: boolean;
  managedCreators: RelationshipsPayload['managedCreators'];
  onRefresh: () => void;
}

function usePickerAction({
  action,
  mcIdField,
  successToast,
  failureToast,
}: {
  action: InspectorActionType;
  mcIdField: 'toManagedCreatorId' | 'managedCreatorId';
  successToast: string;
  failureToast: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMcId, setSelectedMcId] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    { summary: string; count: number; sample: unknown[] } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const runCall = async (mcId: string, postIds: string[], dryRun: boolean) => {
    const res = await fetch('/api/admin/inspector/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        dryRun,
        payload: { postIds, [mcIdField]: mcId },
      }),
    });
    return { ok: res.ok, body: await res.json() };
  };

  const onSelectMc = async (mcId: string, postIds: string[]) => {
    setSelectedMcId(mcId);
    setBusy(true);
    try {
      const { ok, body } = await runCall(mcId, postIds, true);
      if (!ok) {
        toast({ title: 'Dry run failed', description: body.error, variant: 'destructive' });
        return;
      }
      setPreview(body.result);
      setConfirmOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const execute = async (postIds: string[], onRefresh: () => void) => {
    if (!selectedMcId) return;
    setBusy(true);
    try {
      const { ok, body } = await runCall(selectedMcId, postIds, false);
      if (!ok) {
        toast({ title: failureToast, description: body.error, variant: 'destructive' });
      } else {
        toast({ title: successToast, description: preview?.summary ?? 'Done' });
        onRefresh();
      }
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      setSelectedMcId(null);
      setPreview(null);
    }
  };

  return {
    pickerOpen,
    setPickerOpen,
    confirmOpen,
    setConfirmOpen,
    preview,
    busy,
    onSelectMc,
    execute,
  };
}

function ReassignMcpsButton({
  postIds,
  canWrite,
  managedCreators,
  onRefresh,
}: PickerButtonProps) {
  const state = usePickerAction({
    action: 'reassign_mcp',
    mcIdField: 'toManagedCreatorId',
    successToast: 'Reassigned',
    failureToast: 'Reassign failed',
  });

  const label = 'Reassign MCPs';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite || state.busy}
              onClick={() => state.setPickerOpen(true)}
              aria-label={label}
            >
              <Link2 className="h-3 w-3" />
              <span className="ml-1.5 text-xs">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs z-[100]">
          <div className="font-medium mb-1">{label}</div>
          Move managed_creator_posts rows for the selected posts to a different MC.
          Useful when posts were attributed to a dropped MC that's stealing them from
          the active one.
          {!canWrite && (
            <div className="mt-1 italic text-destructive">
              Contact admin — read-only for your role
            </div>
          )}
        </TooltipContent>
      </Tooltip>

      <McPickerDialog
        open={state.pickerOpen}
        onOpenChange={state.setPickerOpen}
        title={label}
        description={`Reassign ${postIds.length} post(s) to a different managed_creator.`}
        managedCreators={managedCreators}
        onSelect={(mcId) => state.onSelectMc(mcId, postIds)}
      />

      <AlertDialog open={state.confirmOpen} onOpenChange={state.setConfirmOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm: {label}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div className="font-medium text-foreground">{state.preview?.summary}</div>
                <div className="text-xs text-muted-foreground">
                  Affects {state.preview?.count ?? 0} row(s)
                </div>
                {state.preview?.sample && state.preview.sample.length > 0 && (
                  <pre className="text-[10px] bg-muted rounded p-2 max-h-48 overflow-auto">
                    {JSON.stringify(state.preview.sample, null, 2)}
                  </pre>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => state.execute(postIds, onRefresh)}
              disabled={state.busy}
            >
              {state.busy ? 'Working…' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateMissingMcpsButton({
  postIds,
  canWrite,
  managedCreators,
  onRefresh,
}: PickerButtonProps) {
  const state = usePickerAction({
    action: 'create_missing_mcp',
    mcIdField: 'managedCreatorId',
    successToast: 'Created',
    failureToast: 'Create failed',
  });

  const label = 'Create missing MCPs';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite || state.busy}
              onClick={() => state.setPickerOpen(true)}
              aria-label={label}
            >
              <AlertCircle className="h-3 w-3" />
              <span className="ml-1.5 text-xs">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs text-xs z-[100]">
          <div className="font-medium mb-1">{label}</div>
          For selected posts without an MCP row, insert one pointing at the chosen MC.
          Base pay snapshots from the MC's current base_pay.
          {!canWrite && (
            <div className="mt-1 italic text-destructive">
              Contact admin — read-only for your role
            </div>
          )}
        </TooltipContent>
      </Tooltip>

      <McPickerDialog
        open={state.pickerOpen}
        onOpenChange={state.setPickerOpen}
        title={label}
        description={`Create MCPs for up to ${postIds.length} selected post(s) under the chosen managed_creator.`}
        managedCreators={managedCreators}
        onSelect={(mcId) => state.onSelectMc(mcId, postIds)}
      />

      <AlertDialog open={state.confirmOpen} onOpenChange={state.setConfirmOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm: {label}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div className="font-medium text-foreground">{state.preview?.summary}</div>
                <div className="text-xs text-muted-foreground">
                  Affects {state.preview?.count ?? 0} row(s)
                </div>
                {state.preview?.sample && state.preview.sample.length > 0 && (
                  <pre className="text-[10px] bg-muted rounded p-2 max-h-48 overflow-auto">
                    {JSON.stringify(state.preview.sample, null, 2)}
                  </pre>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => state.execute(postIds, onRefresh)}
              disabled={state.busy}
            >
              {state.busy ? 'Working…' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ───────────────────────── Post detail ─────────────────────────

function PostDetailSidebar({
  post,
  onClose,
  onRefresh,
}: {
  post: InspectorPost;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { adminRole } = useAdminContext();
  const canWrite = hasAccess(adminRole, PAYOUTS_ROLES);

  const { data: engagement } = useQuery<{
    history: Array<{
      tracked_at: string;
      views: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
    }>;
  }>({
    queryKey: ['/api/admin/inspector/post/engagement', post.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/inspector/post/${post.id}/engagement`);
      return res.json();
    },
  });

  return (
    <Sheet open onOpenChange={(v) => (!v ? onClose() : null)}>
      <SheetContent className="w-[560px] sm:max-w-[560px] p-0 flex flex-col gap-0 z-[70]">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-sm font-semibold">Post</SheetTitle>
            <Badge variant="outline" className="capitalize text-[10px]">
              {post.platform}
            </Badge>
            {post.isExcluded && (
              <Badge variant="destructive" className="text-[10px]">excluded</Badge>
            )}
          </div>
          <a
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open on {post.platform}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Thumbnail + stats strip */}
        <div className="border-b px-6 py-4 flex gap-4">
          {post.thumbnailUrl ? (
            <img
              src={post.thumbnailUrl}
              alt=""
              className="h-32 w-20 rounded object-cover bg-muted shrink-0"
            />
          ) : (
            <div className="h-32 w-20 rounded bg-muted shrink-0" />
          )}
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-y-2 gap-x-4 text-sm self-center">
            <Stat label="Views" value={post.latestViews?.toLocaleString() ?? '—'} />
            <Stat label="Likes" value={post.latestLikes?.toLocaleString() ?? '—'} />
            <Stat label="Comments" value={post.latestComments?.toLocaleString() ?? '—'} />
            <Stat label="Shares" value={post.latestShares?.toLocaleString() ?? '—'} />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="attribution" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 pb-0 border-b">
            <TabsList className="w-full justify-start gap-1 bg-transparent p-0 h-auto">
              {(['attribution', 'engagement', 'details', 'video', 'ai'] as const).map((k) => (
                <TabsTrigger
                  key={k}
                  value={k}
                  className="capitalize px-3 py-2 text-xs rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {k}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="attribution" className="p-6 space-y-4 m-0">
              {post.mcpId ? (
                <div className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-2.5 bg-muted/20">
                    <KV label="Managed Creator" value={post.mcpManagedCreatorName ?? '—'} />
                    <KV label="Brand" value={post.mcpBrandName ?? '—'} />
                    <KV label="Payment status" value={post.paymentStatus ?? '—'} />
                  </div>

                  <div className="rounded-lg border divide-y">
                    <MoneyRow label="Base pay" cents={post.basePayCents} />
                    <MoneyRow label="Bonus" cents={post.bonusCents} />
                    <MoneyRow label="Total owed" cents={post.totalOwedCents} emphasis />
                    <MoneyRow label="Total paid" cents={post.totalPaidCents} />
                  </div>

                  <EditPayRow mcpId={post.mcpId} canWrite={canWrite} onRefresh={onRefresh} />
                </div>
              ) : (
                <EmptyCard text="No managed_creator_post row exists for this post." />
              )}
            </TabsContent>

            <TabsContent value="engagement" className="p-6 m-0">
              {engagement?.history && engagement.history.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
                        <th className="px-4 py-2 font-medium">Tracked</th>
                        <th className="px-4 py-2 font-medium text-right">Views</th>
                        <th className="px-4 py-2 font-medium text-right">Likes</th>
                        <th className="px-4 py-2 font-medium text-right">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {engagement.history.map((h, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-4 py-2 text-xs text-muted-foreground">{formatRel(h.tracked_at)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {h.views?.toLocaleString() ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {h.likes?.toLocaleString() ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {h.comments?.toLocaleString() ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyCard text="No engagement history tracked." />
              )}
            </TabsContent>

            <TabsContent value="details" className="p-6 m-0">
              <div className="rounded-lg border divide-y">
                <KVRow label="Platform" value={post.platform} />
                <KVRow label="Posted" value={formatRel(post.postedAt)} />
                <KVRow label="Last fetched" value={formatRel(post.lastFetchedAt)} />
                <KVRow label="Excluded" value={post.isExcluded ? 'yes' : 'no'} />
              </div>
            </TabsContent>

            <TabsContent value="video" className="p-6 m-0">
              <div className="rounded-lg border divide-y">
                <KVRow
                  label="Storage URL"
                  value={
                    post.videoStorageUrl ? (
                      <a
                        href={post.videoStorageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate inline-block max-w-[280px]"
                      >
                        {post.videoStorageUrl}
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
                <KVRow label="Stored at" value={formatRel(post.videoStoredAt)} />
              </div>
            </TabsContent>

            <TabsContent value="ai" className="p-6 m-0 space-y-4">
              <div className="rounded-lg border divide-y">
                <KVRow label="Transcript" value={post.hasTranscript ? '✓' : '—'} />
                <KVRow label="Summary" value={post.hasSummary ? '✓' : '—'} />
              </div>
              {post.hygieneChecks != null && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Hygiene checks
                  </div>
                  <pre className="text-[11px] font-mono px-4 py-3 overflow-auto">
                    {JSON.stringify(post.hygieneChecks, null, 2)}
                  </pre>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right truncate max-w-[320px] font-medium">{value}</span>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right truncate max-w-[320px]">{value}</span>
    </div>
  );
}

function MoneyRow({
  label,
  cents,
  emphasis,
}: {
  label: string;
  cents: number | null;
  emphasis?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 ${emphasis ? 'bg-muted/30' : ''}`}>
      <span className={`text-xs ${emphasis ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${emphasis ? 'font-semibold' : 'font-medium text-sm'}`}>
        {cents != null ? `$${(cents / 100).toFixed(2)}` : '—'}
      </span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground italic">
      {text}
    </div>
  );
}

function EditPayRow({
  mcpId,
  canWrite,
  onRefresh,
}: {
  mcpId: string;
  canWrite: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [basePay, setBasePay] = useState('');
  const [bonus, setBonus] = useState('');
  const { toast } = useToast();

  if (!canWrite) return null;

  const submit = async () => {
    const payload: Record<string, unknown> = { mcpId };
    if (basePay) payload.basePayCents = Math.round(parseFloat(basePay) * 100);
    if (bonus) payload.bonusCents = Math.round(parseFloat(bonus) * 100);
    const res = await fetch('/api/admin/inspector/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit_mcp_pay', dryRun: false, payload }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast({ title: 'Edit failed', description: body.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Pay updated' });
    setOpen(false);
    setBasePay('');
    setBonus('');
    onRefresh();
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit pay
      </Button>
    );
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="text-xs font-medium">Edit MCP pay (dollars)</div>
      <Input
        placeholder="base pay, e.g. 5.00"
        value={basePay}
        onChange={(e) => setBasePay(e.target.value)}
      />
      <Input
        placeholder="bonus, e.g. 2.50"
        value={bonus}
        onChange={(e) => setBonus(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={submit}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
