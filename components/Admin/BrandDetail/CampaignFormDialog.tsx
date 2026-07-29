'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COUNTRIES } from './shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CampaignStatus = 'active' | 'paused' | 'completed';

export interface MilestoneFormRow {
  views: string;
  bonus: string;
}

export interface CampaignFormData {
  name: string;
  status: CampaignStatus;
  country: string;
  platforms: string[];
  budget_cents: string;
  target_video_count: string;
  base_pay_per_video_cents: string;
  monthly_cap_cents: string;
  posting_frequency: string;
  min_views_threshold: string;
  min_views_pay_cents: string;
  bonus_milestones: MilestoneFormRow[];
  referral_bonus_cents: string;
  start_date: string;
  end_date: string;
  notes: string;
  job_id: string;
  brand_organization_id: string;
}

export const EMPTY_FORM: CampaignFormData = {
  name: '',
  status: 'active',
  country: '',
  platforms: [],
  budget_cents: '',
  target_video_count: '',
  base_pay_per_video_cents: '',
  monthly_cap_cents: '',
  posting_frequency: '',
  min_views_threshold: '',
  min_views_pay_cents: '',
  bonus_milestones: [],
  referral_bonus_cents: '',
  start_date: '',
  end_date: '',
  notes: '',
  job_id: '',
  brand_organization_id: '',
};

const PLATFORM_OPTIONS = ['tiktok', 'instagram', 'youtube'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToDisplay(cents: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export interface CampaignLike {
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
  bonus_milestones: Array<{ views?: number; min_views?: number; bonus_cents?: number; amount_cents?: number }> | null;
  referral_bonus_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  job_id?: string | null;
}

export function campaignToForm(c: CampaignLike): CampaignFormData {
  return {
    name: c.name,
    status: c.status,
    country: c.country || '',
    platforms: c.platforms,
    budget_cents: c.budget_cents != null ? String(c.budget_cents / 100) : '',
    target_video_count: c.target_video_count != null ? String(c.target_video_count) : '',
    base_pay_per_video_cents: c.base_pay_per_video_cents != null ? String(c.base_pay_per_video_cents / 100) : '',
    monthly_cap_cents: c.monthly_cap_cents != null ? String(c.monthly_cap_cents / 100) : '',
    posting_frequency: c.posting_frequency || '',
    min_views_threshold: c.min_views_threshold != null ? String(c.min_views_threshold) : '',
    min_views_pay_cents: c.min_views_pay_cents != null ? String(c.min_views_pay_cents / 100) : '',
    bonus_milestones: (c.bonus_milestones ?? []).map((m) => ({
      views: String(m.views ?? m.min_views ?? ''),
      bonus: String(((m.bonus_cents ?? m.amount_cents ?? 0) / 100)),
    })),
    referral_bonus_cents: c.referral_bonus_cents != null ? String(c.referral_bonus_cents / 100) : '',
    start_date: c.start_date || '',
    end_date: c.end_date || '',
    notes: c.notes || '',
    job_id: c.job_id || '',
    brand_organization_id: '',
  };
}

export function formToPayload(form: CampaignFormData) {
  const milestones = form.bonus_milestones
    .filter((m) => m.views && m.bonus)
    .map((m) => ({ views: parseInt(m.views), bonus_cents: Math.round(parseFloat(m.bonus) * 100) }));

  return {
    name: form.name.trim(),
    status: form.status,
    country: form.country || null,
    platforms: form.platforms,
    budget_cents: form.budget_cents ? Math.round(parseFloat(form.budget_cents) * 100) : null,
    target_video_count: form.target_video_count ? parseInt(form.target_video_count) : null,
    base_pay_per_video_cents: form.base_pay_per_video_cents ? Math.round(parseFloat(form.base_pay_per_video_cents) * 100) : null,
    monthly_cap_cents: form.monthly_cap_cents ? Math.round(parseFloat(form.monthly_cap_cents) * 100) : null,
    posting_frequency: form.posting_frequency.trim() || null,
    min_views_threshold: form.min_views_threshold ? parseInt(form.min_views_threshold) : null,
    min_views_pay_cents: form.min_views_pay_cents ? Math.round(parseFloat(form.min_views_pay_cents) * 100) : null,
    bonus_milestones: milestones.length > 0 ? milestones : null,
    referral_bonus_cents: form.referral_bonus_cents ? Math.round(parseFloat(form.referral_bonus_cents) * 100) : null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    notes: form.notes.trim() || null,
    job_id: form.job_id || null,
  };
}

// ---------------------------------------------------------------------------
// Brand Combobox
// ---------------------------------------------------------------------------

function BrandCombobox({
  brands,
  value,
  onChange,
  disabled,
}: {
  brands: Array<{ id: string; organization_name: string }>;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedBrand = brands.find((b) => b.id === value);

  const filtered = search
    ? brands.filter((b) => b.organization_name.toLowerCase().includes(search.toLowerCase()))
    : brands;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open]);

  return (
    <div className="space-y-1.5">
      <Label>Brand *</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between font-normal h-9"
            disabled={disabled}
          >
            {selectedBrand ? selectedBrand.organization_name : 'Select brand...'}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              placeholder="Search brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No brands found</p>
            ) : (
              filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer text-left"
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                >
                  <Check className={`h-3.5 w-3.5 flex-shrink-0 ${value === b.id ? 'opacity-100' : 'opacity-0'}`} />
                  {b.organization_name}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  saving,
  title,
  jobs,
  brands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CampaignFormData;
  setForm: React.Dispatch<React.SetStateAction<CampaignFormData>>;
  onSubmit: () => void;
  saving: boolean;
  title: string;
  jobs?: Array<{ id: string; job_title: string; status: string }>;
  brands?: Array<{ id: string; organization_name: string }>;
}) {
  const togglePlatform = (platform: string) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Name *</Label>
            <Input
              id="campaign-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Q2 TikTok Brazil"
              disabled={saving}
            />
          </div>

          {brands && brands.length > 0 && (
            <BrandCombobox
              brands={brands}
              value={form.brand_organization_id}
              onChange={(id) => setForm((prev) => ({ ...prev, brand_organization_id: id }))}
              disabled={saving}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-status">Status</Label>
              <Select
                id="campaign-status"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as CampaignStatus }))}
                disabled={saving}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-country">Country</Label>
              <Select
                id="campaign-country"
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                disabled={saving}
              >
                <option value="">None</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Platforms</Label>
            <div className="flex gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={form.platforms.includes(p) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => togglePlatform(p)}
                  disabled={saving}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {jobs && jobs.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="campaign-job">Linked Job</Label>
              <Select
                id="campaign-job"
                value={form.job_id}
                onChange={(e) => setForm((prev) => ({ ...prev, job_id: e.target.value }))}
                disabled={saving}
              >
                <option value="">None</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_title} ({j.status})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-budget">Budget</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="campaign-budget"
                  inputMode="numeric"
                  value={form.budget_cents}
                  onChange={(e) => setForm((prev) => ({ ...prev, budget_cents: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="5000"
                  disabled={saving}
                  className="pl-6"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-videos">Target Videos</Label>
              <Input
                id="campaign-videos"
                inputMode="numeric"
                value={form.target_video_count}
                onChange={(e) => setForm((prev) => ({ ...prev, target_video_count: e.target.value.replace(/\D/g, '') }))}
                placeholder="50"
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-pay">Base $/Video</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="campaign-pay"
                  inputMode="numeric"
                  value={form.base_pay_per_video_cents}
                  onChange={(e) => setForm((prev) => ({ ...prev, base_pay_per_video_cents: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="7.50"
                  disabled={saving}
                  className="pl-6"
                />
              </div>
              {form.platforms.length > 1 && form.base_pay_per_video_cents && (
                <p className="text-xs text-muted-foreground">
                  = {centsToDisplay(Math.round(parseFloat(form.base_pay_per_video_cents) * 100 / form.platforms.length))}/platform
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-cap">Monthly Cap</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="campaign-cap"
                  inputMode="numeric"
                  value={form.monthly_cap_cents}
                  onChange={(e) => setForm((prev) => ({ ...prev, monthly_cap_cents: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="750"
                  disabled={saving}
                  className="pl-6"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-frequency">Posting Frequency</Label>
              <Input
                id="campaign-frequency"
                value={form.posting_frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, posting_frequency: e.target.value }))}
                placeholder="1 per day"
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-min-views">Min Views Threshold</Label>
              <Input
                id="campaign-min-views"
                inputMode="numeric"
                value={form.min_views_threshold}
                onChange={(e) => setForm((prev) => ({ ...prev, min_views_threshold: e.target.value.replace(/\D/g, '') }))}
                placeholder="300"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-min-pay">Pay Below Threshold</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="campaign-min-pay"
                  inputMode="numeric"
                  value={form.min_views_pay_cents}
                  onChange={(e) => setForm((prev) => ({ ...prev, min_views_pay_cents: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="0.00"
                  disabled={saving}
                  className="pl-6"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-referral">Referral Bonus</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="campaign-referral"
                  inputMode="numeric"
                  value={form.referral_bonus_cents}
                  onChange={(e) => setForm((prev) => ({ ...prev, referral_bonus_cents: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="10"
                  disabled={saving}
                  className="pl-6"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Bonus Milestones</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  bonus_milestones: [...prev.bonus_milestones, { views: '', bonus: '' }],
                }))}
                disabled={saving}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            {form.bonus_milestones.length > 0 && (
              <div className="space-y-2">
                {form.bonus_milestones.map((milestone, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      inputMode="numeric"
                      value={milestone.views}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setForm((prev) => {
                          const updated = [...prev.bonus_milestones];
                          updated[idx] = { ...updated[idx], views: value };
                          return { ...prev, bonus_milestones: updated };
                        });
                      }}
                      placeholder="Views (e.g. 50000)"
                      disabled={saving}
                      className="flex-1"
                    />
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <Input
                        inputMode="numeric"
                        value={milestone.bonus}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setForm((prev) => {
                            const updated = [...prev.bonus_milestones];
                            updated[idx] = { ...updated[idx], bonus: value };
                            return { ...prev, bonus_milestones: updated };
                          });
                        }}
                        placeholder="Bonus"
                        disabled={saving}
                        className="pl-6"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          bonus_milestones: prev.bonus_milestones.filter((_, i) => i !== idx),
                        }));
                      }}
                      disabled={saving}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-start">Start Date</Label>
              <Input
                id="campaign-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-end">End Date</Label>
              <Input
                id="campaign-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="campaign-notes">Notes</Label>
            <Textarea
              id="campaign-notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Internal notes about this campaign..."
              disabled={saving}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
