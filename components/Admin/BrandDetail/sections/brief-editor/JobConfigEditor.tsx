'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { COUNTRIES } from '@/components/Admin/BrandDetail/shared';

interface JobData {
  job_title: string;
  job_slug: string;
  status: string;
  visibility: string;
  job_type: string;
  target_country: string | null;
  currency: string;
  payment_frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_approve_applications: boolean;
  priority: number;
  budget_per_creator: number | null;
  total_budget: number | null;
  budget_spent_cents: number | null;
  cpm_rate: number | null;
  cpm_base_pay: number | null;
  cpm_cap: number | null;
  cpm_payout_threshold: number | null;
  cpm_platforms_allowed: string[] | null;
  monthly_payout_cap: number | null;
  transcript: string | null;
}

interface JobConfigEditorProps {
  jobId: string;
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'pending_funding', label: 'Pending Funding' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'invite_only', label: 'Invite Only' },
  { value: 'country_restricted', label: 'Country Restricted' },
];

const PAYMENT_FREQ_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'post', label: 'Per post' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const PLATFORM_OPTIONS = ['tiktok', 'instagram', 'youtube'] as const;

function Field({
  label,
  children,
  hint,
  tooltip,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs font-normal normal-case tracking-normal">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function NumberField({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function CountryPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = search.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 10)
    : COUNTRIES.slice(0, 10);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm text-left outline-none focus:ring-1 focus:ring-ring flex items-center justify-between"
      >
        <span className={value ? '' : 'text-muted-foreground'}>
          {value ?? 'Select country...'}
        </span>
        {value && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
            className="text-muted-foreground hover:text-destructive text-xs ml-1"
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search countries..."
            autoFocus
            className="w-full border-b bg-transparent px-2.5 py-2 text-sm outline-none"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.name); setOpen(false); setSearch(''); }}
                className={`w-full px-2.5 py-1.5 text-sm text-left hover:bg-accent transition-colors ${
                  value === c.name ? 'bg-accent font-medium' : ''
                }`}
              >
                {c.name} <span className="text-muted-foreground">({c.code})</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CentsDisplay({ cents, currency }: { cents: number | null; currency: string }) {
  if (cents == null) return <span className="text-muted-foreground">—</span>;
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  return <span className="tabular-nums">{sym}{(cents / 100).toFixed(2)}</span>;
}

function BonusTiersEditor({
  tiers,
  onChange,
  currency,
}: {
  tiers: { views: number; amount: number }[];
  onChange: (tiers: { views: number; amount: number }[]) => void;
  currency: string;
}) {
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-muted-foreground border-b uppercase tracking-wider">
            <th className="text-left font-medium py-1 pr-2">Views</th>
            <th className="text-left font-medium py-1 pr-2">Bonus ({sym})</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => (
            <tr key={i} className="border-b border-dashed last:border-0 group">
              <td className="py-1 pr-2">
                <input
                  type="number"
                  value={tier.views || ''}
                  onChange={(e) => {
                    const next = [...tiers];
                    next[i] = { ...tier, views: Number(e.target.value) || 0 };
                    onChange(next);
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  value={tier.amount || ''}
                  onChange={(e) => {
                    const next = [...tiers];
                    next[i] = { ...tier, amount: Number(e.target.value) || 0 };
                    onChange(next);
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </td>
              <td className="py-1 text-center">
                <button
                  onClick={() => onChange(tiers.filter((_, j) => j !== i))}
                  className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => onChange([...tiers, { views: 0, amount: 0 }])}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        + Add tier
      </button>
    </div>
  );
}

export function JobConfigEditor({ jobId }: JobConfigEditorProps) {
  const [local, setLocal] = useState<JobData | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data, isLoading, error } = useQuery<JobData>({
    queryKey: ['job-config', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error('Failed to fetch job');
      return res.json();
    },
    enabled: !!jobId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (data && !local) setLocal(data);
  }, [data, local]);

  const saveJob = useCallback(
    async (updates: Partial<JobData>) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    },
    [jobId]
  );

  const debouncedSave = useDebouncedCallback(saveJob, 1500);

  const update = useCallback(
    (field: keyof JobData, value: unknown) => {
      if (!local) return;
      const next = { ...local, [field]: value };
      setLocal(next);
      debouncedSave({ [field]: value });
    },
    [local, debouncedSave]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-destructive">Failed to load job settings. Check that the job exists and you have access.</p>
      </div>
    );
  }

  if (isLoading || !local) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCpm = local.job_type === 'cpm';

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Job-level settings stored on the jobs table. Changes auto-save.
          </p>
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-destructive">Error saving</span>
          )}
        </div>

        {/* ─── Core ─── */}
        <div className="rounded-xl border p-4 space-y-4">
          <h4 className="text-sm font-semibold">Core</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Job Title" tooltip="The title shown to creators in the job feed and portal landing page.">
              <TextField
                value={local.job_title}
                onChange={(v) => update('job_title', v)}
              />
            </Field>
            <Field label="Target Country" tooltip="Which country this job targets. Used for country-based routing on portals and filtering in the creator job feed.">
              <CountryPicker
                value={local.target_country}
                onChange={(v) => update('target_country', v)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status" tooltip="Lifecycle stage. Draft = not live. Open/In Progress = visible in feed and accepting applications. Completed/Cancelled = no longer active. Pending Funding = waiting for brand deposit.">
              <SelectField
                value={local.status}
                onChange={(v) => update('status', v)}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Field label="Visibility" tooltip="Who can discover this job. Public = visible to everyone in the feed. Country Restricted = only creators in the target country. Private = hidden from feed entirely. Invite Only = shared via direct link only.">
              <SelectField
                value={local.visibility}
                onChange={(v) => update('visibility', v)}
                options={VISIBILITY_OPTIONS}
              />
            </Field>
            <Field label="Priority" hint="Higher = more prominent" tooltip="Numeric priority value. Not currently used for feed sorting (feed sorts by published_at).">
              <NumberField
                value={local.priority}
                onChange={(v) => update('priority', v ?? 0)}
              />
            </Field>
          </div>
        </div>

        {/* ─── Payment ─── */}
        <div className="rounded-xl border p-4 space-y-4">
          <h4 className="text-sm font-semibold">Payment</h4>

          {/* CPM Platforms — only for CPM jobs */}
          {isCpm && (
            <Field label="CPM Platforms" tooltip="Which platforms are accepted for CPM video submissions. Videos from other platforms will be rejected.">
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map((p) => {
                  const selected = (local.cpm_platforms_allowed ?? []).includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        const current = local.cpm_platforms_allowed ?? [];
                        const next = selected
                          ? current.filter((x) => x !== p)
                          : [...current, p];
                        update('cpm_platforms_allowed', next);
                      }}
                      className={`rounded-lg border px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
                        selected
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-muted text-muted-foreground hover:border-muted-foreground/30'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Payment Frequency" tooltip="How often creators are paid. Per post = paid per approved video. Weekly/Monthly/Yearly = recurring payments.">
              <SelectField
                value={local.payment_frequency ?? ''}
                onChange={(v) => update('payment_frequency', v || null)}
                options={PAYMENT_FREQ_OPTIONS}
              />
            </Field>
            <Field label="Budget Per Creator" tooltip="Maximum amount a single creator can earn from this job. Shown on the job card in the feed.">
              <NumberField
                value={local.budget_per_creator}
                onChange={(v) => update('budget_per_creator', v)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Total Budget" tooltip="Total budget allocated for this job across all creators.">
              <NumberField
                value={local.total_budget}
                onChange={(v) => update('total_budget', v)}
                placeholder="0.00"
              />
            </Field>
          </div>

          {/* CPM-specific fields */}
          {isCpm && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="CPM Rate" hint="Cents per 1K views" tooltip="Amount paid per 1,000 views, in cents. e.g. 100 = $1.00/1K views. Displayed on the job card in the feed.">
                <NumberField
                  value={local.cpm_rate}
                  onChange={(v) => update('cpm_rate', v)}
                  placeholder="100"
                />
              </Field>
              <Field label="Base Pay" hint="Fixed cents per video" tooltip="Guaranteed minimum payment per video, regardless of views. Paid on top of CPM earnings.">
                <NumberField
                  value={local.cpm_base_pay}
                  onChange={(v) => update('cpm_base_pay', v)}
                  placeholder="0"
                />
              </Field>
              <Field label="Payout Threshold" hint="Min views before payout" tooltip="Minimum number of views a video must reach before CPM earnings are paid out.">
                <NumberField
                  value={local.cpm_payout_threshold}
                  onChange={(v) => update('cpm_payout_threshold', v)}
                  placeholder="1000"
                />
              </Field>
              <Field label="CPM Cap" hint="Max CPM payout per creator (cents)" tooltip="Maximum total CPM earnings a creator can receive from this job. Prevents runaway costs on viral videos.">
                <NumberField
                  value={local.cpm_cap}
                  onChange={(v) => update('cpm_cap', v)}
                  placeholder="100000"
                />
              </Field>
              <Field label="Monthly Payout Cap" hint="Monthly max (cents)" tooltip="Maximum a creator can earn per month from this job. Shown on the creator's contract page.">
                <NumberField
                  value={local.monthly_payout_cap}
                  onChange={(v) => update('monthly_payout_cap', v)}
                />
              </Field>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={local.auto_approve_applications}
                onChange={(e) => update('auto_approve_applications', e.target.checked)}
                className="rounded border-gray-300"
              />
              Auto-approve applications
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  When enabled, creator applications are automatically accepted without admin review. Commonly used for CPM jobs.
                </TooltipContent>
              </Tooltip>
            </label>
          </div>

          {/* Budget tracking (read-only) */}
          {isCpm && local.budget_spent_cents != null && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Budget spent: <CentsDisplay cents={local.budget_spent_cents} currency={local.currency} />
            </div>
          )}
        </div>

        {/* ─── Dates ─── */}
        <div className="rounded-xl border p-4 space-y-4">
          <h4 className="text-sm font-semibold">Dates</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" tooltip="When the campaign begins. Note: cycle deadline tracking in the admin dashboard uses the brand org's contract_start_date, not this field.">
              <input
                type="date"
                value={local.start_date ?? ''}
                onChange={(e) => update('start_date', e.target.value || null)}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="End Date" tooltip="When the campaign ends. Optional — leave blank for ongoing campaigns.">
              <input
                type="date"
                value={local.end_date ?? ''}
                onChange={(e) => update('end_date', e.target.value || null)}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
