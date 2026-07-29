'use client';

import { useState } from 'react';
import { Users, UserPlus, Video, Zap, DollarSign } from 'lucide-react';
import type { CreatorDetailResponse } from '@/app/api/admin/creators/[id]/route';
import { AddBonusDialog } from './AddBonusDialog';

interface CreatorHubReferralsProps {
  referrals: CreatorDetailResponse['referrals'];
  creatorProfileId: string;
  creatorName: string;
  onOpenCreator?: (creatorProfileId: string) => void;
  onRefresh?: () => void;
}

const STAGE_LABEL: Record<string, { label: string; className: string }> = {
  signed_up: { label: 'Signed Up', className: 'text-muted-foreground' },
  video_submitted: { label: 'Video Submitted', className: 'text-muted-foreground' },
  active: { label: 'Active', className: 'text-foreground font-medium' },
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

function formatName(firstName: string | null, lastInitial: string | null): string {
  if (!firstName) return 'Anonymous';
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

export function CreatorHubReferrals({ referrals, creatorProfileId, creatorName, onOpenCreator, onRefresh }: CreatorHubReferralsProps) {
  const { funnel, users, count } = referrals;
  const [bonusTarget, setBonusTarget] = useState<{
    referredUserId: string;
    referredName: string;
    daysActive: number | null;
  } | null>(null);

  if (count === 0 && !referrals.shareCode) {
    return <div className="text-sm text-muted-foreground py-4">No share code assigned</div>;
  }

  return (
    <div className="space-y-4">
      {/* Funnel stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded-lg p-3 bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Signed Up</span>
          </div>
          <div className="text-lg font-semibold tabular-nums">{funnel.signedUp}</div>
        </div>
        <div className="border rounded-lg p-3 bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <Video className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Video Submitted</span>
          </div>
          <div className="text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">{funnel.videoSubmitted}</div>
        </div>
        <div className="border rounded-lg p-3 bg-background">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">{funnel.active}</div>
        </div>
      </div>

      {/* Share code */}
      {referrals.shareCode && (
        <div className="text-xs text-muted-foreground">
          Share code: <span className="font-mono font-medium text-foreground">{referrals.shareCode}</span>
        </div>
      )}

      {/* Referred creators list */}
      {users.length > 0 ? (
        <div className="border rounded-lg overflow-hidden bg-background">
          <div className="max-h-[320px] overflow-y-auto">
            {users.map((user) => {
              const stageInfo = STAGE_LABEL[user.stage];
              const name = formatName(user.firstName, user.lastInitial);
              const isActive = user.stage === 'active';
              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between px-4 py-2.5 border-b last:border-0 transition-colors ${
                    isActive ? 'hover:bg-muted/50 cursor-pointer' : 'hover:bg-muted/30'
                  }`}
                  onClick={isActive ? () => setBonusTarget({
                    referredUserId: user.id,
                    referredName: name,
                    daysActive: user.daysActive,
                  }) : undefined}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {onOpenCreator && user.creatorProfileId ? (
                      <button
                        className="text-sm font-medium truncate cursor-pointer hover:underline text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCreator(user.creatorProfileId!);
                        }}
                      >
                        {name}
                      </button>
                    ) : (
                      <span className="text-sm font-medium truncate">{name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-xs ${stageInfo.className}`}>
                      {stageInfo.label}
                    </span>
                    {user.daysActive != null && (
                      <span className="text-xs text-muted-foreground tabular-nums">{user.daysActive}d</span>
                    )}
                    {user.paidCents > 0 && (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums flex items-center gap-0.5">
                        <DollarSign className="h-3 w-3" />
                        {(user.paidCents / 100).toFixed(2)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                      {formatRelativeDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {count > users.length && (
            <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20">
              and {count - users.length} more
            </div>
          )}
        </div>
      ) : count === 0 ? (
        <div className="text-sm text-muted-foreground">No referrals yet</div>
      ) : null}

      {/* Bonus dialog for referral payouts */}
      {bonusTarget && (
        <AddBonusDialog
          open={!!bonusTarget}
          onOpenChange={(open) => { if (!open) setBonusTarget(null); }}
          creatorProfileId={creatorProfileId}
          creatorName={creatorName}
          referredUserId={bonusTarget.referredUserId}
          defaultDescription={`Referral bonus: ${bonusTarget.referredName}${bonusTarget.daysActive != null ? ` (${bonusTarget.daysActive}d active)` : ''}`}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
