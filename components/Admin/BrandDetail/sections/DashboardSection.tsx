'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Edit2,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { BrandOrganizationWithMembers } from '@/app/api/admin/brands/route';
import type { ExtendedBrandDetails } from '@/app/api/admin/brands/[brandId]/details/route';
import type { SectionId } from '../BrandDetailSidebar';
import { useToast } from '@/hooks/use-toast';
import {
  CampaignFormDialog,
  EMPTY_FORM,
  campaignToForm,
  formToPayload,
  type CampaignFormData,
  type CampaignStatus,
} from '../CampaignFormDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardSectionProps {
  brand: BrandOrganizationWithMembers;
  extendedDetails?: ExtendedBrandDetails;
  onSectionChange: (section: SectionId) => void;
}

interface BonusMilestone {
  views: number;
  bonus_cents: number;
}

interface Campaign {
  id: string;
  brand_organization_id: string;
  job_id: string | null;
  name: string;
  status: CampaignStatus;
  country: string | null;
  platforms: string[];
  budget_cents: number | null;
  target_video_count: number | null;
  base_pay_per_video_cents: number | null;
  monthly_cap_cents: number | null;
  posting_frequency: string | null;
  min_views_threshold: number | null;
  min_views_pay_cents: number | null;
  bonus_milestones: BonusMilestone[] | null;
  referral_bonus_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  jobs: { id: string; job_title: string } | null;
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

function centsToDisplay(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(views % 1_000_000 === 0 ? 0 : 1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views % 1_000 === 0 ? 0 : 1)}K`;
  return String(views);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Campaign Card
// ---------------------------------------------------------------------------

function CampaignCard({
  campaign,
  onEdit,
  onDelete,
}: {
  campaign: Campaign;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this campaign?')) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const infoParts: string[] = [];
  if (campaign.country) {
    infoParts.push(`${countryFlag(campaign.country)} ${campaign.country}`);
  }
  if (campaign.platforms.length > 0) {
    infoParts.push(campaign.platforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', '));
  }
  if (campaign.posting_frequency) {
    infoParts.push(campaign.posting_frequency);
  }

  const budgetParts: string[] = [];
  if (campaign.budget_cents != null) {
    budgetParts.push(`Budget: ${centsToDisplay(campaign.budget_cents)}`);
  }
  if (campaign.target_video_count != null) {
    budgetParts.push(`${campaign.target_video_count} videos`);
  }

  const platformCount = campaign.platforms.length || 1;
  const payParts: string[] = [];
  if (campaign.base_pay_per_video_cents != null) {
    const baseDisplay = centsToDisplay(campaign.base_pay_per_video_cents);
    payParts.push(platformCount > 1
      ? `Base: ${baseDisplay}/video (${centsToDisplay(Math.round(campaign.base_pay_per_video_cents / platformCount))}/platform)`
      : `Base: ${baseDisplay}/video`);
  }
  if (campaign.monthly_cap_cents != null) {
    payParts.push(`Cap: ${centsToDisplay(campaign.monthly_cap_cents)}/mo`);
  }

  const minViewsLine = campaign.min_views_threshold != null
    ? `<${campaign.min_views_threshold.toLocaleString()} views → ${campaign.min_views_pay_cents != null ? centsToDisplay(campaign.min_views_pay_cents) : 'n/a'}`
    : null;

  const milestonesLine = campaign.bonus_milestones && campaign.bonus_milestones.length > 0
    ? `Bonuses: ${campaign.bonus_milestones.map((m) => `${formatViews(m.views)}→+${centsToDisplay(m.bonus_cents)}`).join('  ')}`
    : null;

  const referralLine = campaign.referral_bonus_cents != null
    ? `Referral: +${centsToDisplay(campaign.referral_bonus_cents)}`
    : null;

  const dateRange = campaign.start_date || campaign.end_date
    ? `${formatDate(campaign.start_date)}${campaign.start_date && campaign.end_date ? ' → ' : ''}${formatDate(campaign.end_date)}`
    : null;

  const jobLine = campaign.jobs
    ? `Job: "${campaign.jobs.job_title.length > 25 ? campaign.jobs.job_title.slice(0, 25) + '…' : campaign.jobs.job_title}"`
    : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{campaign.name}</CardTitle>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge className={STATUS_STYLES[campaign.status]}>{campaign.status}</Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {infoParts.length > 0 && (
          <p className="text-sm text-muted-foreground">{infoParts.join('  •  ')}</p>
        )}

        {budgetParts.length > 0 && (
          <p className="text-sm text-muted-foreground">{budgetParts.join('  •  ')}</p>
        )}

        {payParts.length > 0 && (
          <p className="text-sm text-muted-foreground">{payParts.join('  •  ')}</p>
        )}

        {minViewsLine && (
          <p className="text-sm text-muted-foreground">{minViewsLine}</p>
        )}

        {milestonesLine && (
          <p className="text-sm text-muted-foreground">{milestonesLine}</p>
        )}

        {referralLine && (
          <p className="text-sm text-muted-foreground">{referralLine}</p>
        )}

        {dateRange && (
          <p className="text-sm text-muted-foreground">
            {dateRange}
            {jobLine && `  •  ${jobLine}`}
          </p>
        )}

        {!dateRange && jobLine && (
          <p className="text-sm text-muted-foreground">{jobLine}</p>
        )}

        {campaign.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">Notes: {campaign.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardSection({
  brand,
  extendedDetails,
  onSectionChange,
}: DashboardSectionProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const queryKey = ['/api/admin/brand-campaigns', brand.id];

  const { data: campaignsResponse, isLoading } = useQuery<{ data: Campaign[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/brand-campaigns?brand_organization_id=${encodeURIComponent(brand.id)}`);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    staleTime: 15000,
  });

  const campaigns = campaignsResponse?.data ?? [];
  const jobs = extendedDetails?.all_jobs ?? [];

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    setEditingId(campaign.id);
    setForm(campaignToForm(campaign));
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = formToPayload(form);

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/brand-campaigns/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast({ title: 'Failed to update campaign', variant: 'destructive' });
          return;
        }
      } else {
        const res = await fetch('/api/admin/brand-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, brand_organization_id: brand.id }),
        });
        if (!res.ok) {
          toast({ title: 'Failed to create campaign', variant: 'destructive' });
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/admin/brand-campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast({ title: 'Failed to delete campaign', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey });
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            <Button variant="link" size="sm" className="mt-2" onClick={openCreate}>
              Create your first campaign &rarr;
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onEdit={() => openEdit(campaign)}
              onDelete={() => handleDelete(campaign.id)}
            />
          ))}
        </div>
      )}

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        saving={saving}
        title={editingId ? 'Edit Campaign' : 'New Campaign'}
        jobs={jobs}
      />
    </div>
  );
}
