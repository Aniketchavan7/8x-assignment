'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Eye, Heart, MessageCircle, Share2, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatNumber } from '@/lib/analytics/utils';
import { TikTokIcon, InstagramIcon } from '@/components/Admin/BrandDetail/shared';
import type { PipelineGridData } from '@/components/Admin/AdminGrid/pipelineColumnDefs';
import type { CreatorPost } from '@/app/api/admin/managed-creators/[id]/posts/route';

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

interface CreatorPostsPanelProps {
  row: PipelineGridData;
  onClose: () => void;
}

const PLATFORM_CONFIG = {
  tiktok: { label: 'TikTok', Icon: TikTokIcon, adCodeLabel: 'Spark Code' },
  instagram: { label: 'Instagram', Icon: InstagramIcon, adCodeLabel: 'Whitelist Code' },
  youtube: { label: 'YouTube', Icon: YouTubeIcon, adCodeLabel: 'Ad Code' },
} as const;

type Platform = keyof typeof PLATFORM_CONFIG;

export function CreatorPostsPanel({ row, onClose }: CreatorPostsPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hiddenPlatforms, setHiddenPlatforms] = useState<Set<Platform>>(new Set());

  const queryKey = useMemo(
    () => ['/api/admin/managed-creators', row.id, 'posts'],
    [row.id],
  );

  const { data, isLoading } = useQuery<{ data: CreatorPost[]; base_pay: number | null }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/managed-creators/${row.id}/posts`);
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
  });

  const posts = data?.data ?? [];
  const basePay = data?.base_pay ?? null;

  const groupedByPlatform = useMemo(() => {
    const groups: Record<Platform, CreatorPost[]> = { tiktok: [], instagram: [], youtube: [] };
    for (const post of posts) {
      if (post.platform in groups) {
        groups[post.platform as Platform].push(post);
      }
    }
    return groups;
  }, [posts]);

  const platformsWithPosts = useMemo(
    () => (Object.keys(groupedByPlatform) as Platform[]).filter((p) => groupedByPlatform[p].length > 0),
    [groupedByPlatform],
  );

  const togglePlatform = useCallback((platform: Platform) => {
    setHiddenPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }, []);

  const handleFieldUpdate = useCallback(
    async (postId: string, field: 'ad_code' | 'cost', value: string) => {
      const body: Record<string, unknown> = {};
      if (field === 'ad_code') {
        body.ad_code = value;
      } else {
        body.cost = value === '' ? null : parseFloat(value);
      }

      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey });
      } else {
        toast({ title: 'Failed to save', description: `Could not update ${field === 'ad_code' ? 'ad code' : 'cost'}`, variant: 'destructive' });
        queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient, queryKey, toast],
  );

  const visiblePlatforms = platformsWithPosts.filter((p) => !hiddenPlatforms.has(p));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-semibold truncate">
            Posts — {row.name}
          </h3>
          <div className="flex items-center gap-1.5">
            {platformsWithPosts.map((platform) => {
              const cfg = PLATFORM_CONFIG[platform];
              const hidden = hiddenPlatforms.has(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-opacity ${hidden ? 'opacity-30' : 'opacity-100'}`}
                >
                  <cfg.Icon className="h-3 w-3" />
                  {groupedByPlatform[platform].length}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-accent transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content — no vertical scroll, rows expand to fill */}
      <div className="flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex items-center justify-center flex-1">
            <p className="text-sm text-muted-foreground">No posts found</p>
          </div>
        ) : (
          visiblePlatforms.map((platform) => {
            const platformPosts = groupedByPlatform[platform];
            const cfg = PLATFORM_CONFIG[platform];
            return (
              <PlatformRow
                key={platform}
                platform={platform}
                label={cfg.label}
                Icon={cfg.Icon}
                adCodeLabel={cfg.adCodeLabel}
                posts={platformPosts}
                basePay={basePay}
                onFieldUpdate={handleFieldUpdate}
                singleRow={visiblePlatforms.length === 1}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function PlatformRow({
  label,
  Icon,
  adCodeLabel,
  posts,
  basePay,
  onFieldUpdate,
  singleRow,
}: {
  platform: Platform;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  adCodeLabel: string;
  posts: CreatorPost[];
  basePay: number | null;
  onFieldUpdate: (postId: string, field: 'ad_code' | 'cost', value: string) => Promise<void>;
  singleRow: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`flex flex-col px-3 pt-2 ${singleRow ? 'flex-1 min-h-0' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1.5 flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground/60">{posts.length} posts</span>
      </div>
      <div
        ref={scrollRef}
        className={`flex gap-2.5 overflow-x-auto pb-2 ${singleRow ? 'flex-1 min-h-0' : ''}`}
      >
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            basePay={basePay}
            adCodeLabel={adCodeLabel}
            onFieldUpdate={onFieldUpdate}
            expandHeight={singleRow}
          />
        ))}
      </div>
    </div>
  );
}

function PostCard({
  post,
  basePay,
  adCodeLabel,
  onFieldUpdate,
  expandHeight,
}: {
  post: CreatorPost;
  basePay: number | null;
  adCodeLabel: string;
  onFieldUpdate: (postId: string, field: 'ad_code' | 'cost', value: string) => Promise<void>;
  expandHeight: boolean;
}) {
  const [adCode, setAdCode] = useState(post.ad_code ?? '');
  const [cost, setCost] = useState(
    post.cost != null ? String(post.cost) : basePay != null ? String(basePay / 100) : '',
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [editingAdCode, setEditingAdCode] = useState(false);
  const [editingCost, setEditingCost] = useState(false);

  const handleBlur = useCallback(
    async (field: 'ad_code' | 'cost', value: string) => {
      const original = field === 'ad_code'
        ? (post.ad_code ?? '')
        : (post.cost != null ? String(post.cost) : basePay != null ? String(basePay / 100) : '');
      if (field === 'ad_code') setEditingAdCode(false);
      if (field === 'cost') setEditingCost(false);
      if (value === original) return;

      setSaving(field);
      await onFieldUpdate(post.id, field, value);
      setSaving(null);
    },
    [post.id, post.ad_code, post.cost, basePay, onFieldUpdate],
  );

  const dateStr = new Date(post.posted_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Build compact metrics string
  const metrics: { icon: React.ReactNode; value: string }[] = [];
  if (post.latest_views != null) metrics.push({ icon: <Eye className="h-3 w-3" />, value: formatNumber(post.latest_views) });
  if (post.latest_likes != null) metrics.push({ icon: <Heart className="h-3 w-3" />, value: formatNumber(post.latest_likes) });
  if (post.latest_comments != null) metrics.push({ icon: <MessageCircle className="h-3 w-3" />, value: formatNumber(post.latest_comments) });
  if (post.latest_shares != null) metrics.push({ icon: <Share2 className="h-3 w-3" />, value: formatNumber(post.latest_shares) });

  return (
    <div className={`flex-shrink-0 w-[200px] rounded-lg border bg-card overflow-hidden flex flex-col ${expandHeight ? 'h-full' : ''}`}>
      {/* Thumbnail — fills card width, grows to fill available height */}
      <a
        href={post.post_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block relative bg-muted overflow-hidden group ${expandHeight ? 'flex-1 min-h-0' : 'aspect-[9/16] max-h-[160px]'}`}
      >
        {post.thumbnail_url ? (
          <img
            src={post.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-2xl">
            ▶
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
          {dateStr}
        </span>
      </a>

      {/* Metrics — compact row below thumbnail */}
      {metrics.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-muted-foreground border-t">
          {metrics.map((m, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {m.icon} {m.value}
            </span>
          ))}
        </div>
      )}

      {/* Ad Code — button when empty, input when editing/has value */}
      <div className="px-2 py-1 border-t">
        {!adCode && !editingAdCode ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px] uppercase tracking-wider"
            onClick={() => setEditingAdCode(true)}
          >
            {adCodeLabel}
          </Button>
        ) : (
          <Input
            autoFocus={editingAdCode && !adCode}
            value={adCode}
            onChange={(e) => setAdCode(e.target.value)}
            onBlur={() => handleBlur('ad_code', adCode)}
            placeholder={`${adCodeLabel}...`}
            className="h-6 text-[11px] px-1.5"
            disabled={saving === 'ad_code'}
          />
        )}
      </div>

      {/* Cost — button when empty, input when editing/has value */}
      <div className="px-2 py-1 pb-2">
        {!cost && !editingCost ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px] uppercase tracking-wider"
            onClick={() => setEditingCost(true)}
          >
            Cost
          </Button>
        ) : (
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
            <Input
              autoFocus={editingCost && !cost}
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onBlur={() => handleBlur('cost', cost)}
              placeholder="0.00"
              className="h-6 text-[11px] pl-4 pr-1.5"
              disabled={saving === 'cost'}
            />
          </div>
        )}
      </div>
    </div>
  );
}
