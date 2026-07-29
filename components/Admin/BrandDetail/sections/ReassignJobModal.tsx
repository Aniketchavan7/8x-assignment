'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { JobPickerList, countryToFlag } from '@/components/Admin/JobPickerList';
import { useToast } from '@/hooks/use-toast';
import type { BrandJobOption } from '@/app/api/admin/brands/[brandId]/jobs/route';

type Phase = 'picker' | 'loading-preview' | 'preview' | 'committing';

interface PreviewResponse {
  valid: boolean;
  error: string | null;
  mc_diff?: {
    job_title_old: string | null;
    job_title_new: string | null;
    base_pay_old_cents: number | null;
    base_pay_new_cents: number | null;
    cpm_rate_old: number | null;
    cpm_rate_new: number | null;
    max_pay_cents_old: number | null;
    max_pay_cents_new: number | null;
    milestones_old_count: number;
    milestones_new_count: number;
    platform_count_old: number;
    platform_count_new: number;
    per_video_old_cents: number | null;
    per_video_new_cents: number | null;
  };
  btsa_diff?: {
    country_old_iso: string | null;
    country_new_iso: string | null;
    affected_btsa_ids: string[];
  };
  unpaid_posts?: Array<{
    mcp_id: string;
    post_id: string;
    post_url: string | null;
    platform: string | null;
    views: number;
    payment_status: string;
    old_base_pay_cents: number;
    new_base_pay_cents: number;
    old_total_owed_cents: number;
    new_total_owed_cents: number;
  }>;
  paid_posts_summary?: {
    paid_count: number;
    partially_paid_count: number;
    total_paid_cents: number;
  };
}

interface ReassignJobModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedCreatorId: string | null;
  brandOrganizationId: string;
  currentJobId: string | null;
  creatorName: string | null;
  onSuccess: () => void;
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function DiffRow({
  label,
  oldValue,
  newValue,
}: {
  label: string;
  oldValue: React.ReactNode;
  newValue: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell className="py-2 text-xs text-muted-foreground w-40">{label}</TableCell>
      <TableCell className="py-2 text-xs tabular-nums">{oldValue}</TableCell>
      <TableCell className="py-2 text-xs tabular-nums font-medium">{newValue}</TableCell>
    </TableRow>
  );
}

export function ReassignJobModal({
  open,
  onOpenChange,
  managedCreatorId,
  brandOrganizationId,
  currentJobId,
  creatorName,
  onSuccess,
}: ReassignJobModalProps) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('picker');
  const [selected, setSelected] = useState<BrandJobOption | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ data: BrandJobOption[] }>({
    queryKey: ['/api/admin/brands', brandOrganizationId, 'jobs'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brandOrganizationId}/jobs`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load jobs');
      return res.json();
    },
    enabled: open && !!brandOrganizationId,
    staleTime: 30_000,
  });

  const jobs = jobsData?.data ?? [];

  // Reset internal state when closing
  useEffect(() => {
    if (!open) {
      setPhase('picker');
      setSelected(null);
      setPreview(null);
      setError(null);
    }
  }, [open]);

  const handleJobSelect = async (job: BrandJobOption) => {
    setSelected(job);
    setError(null);

    if (!managedCreatorId || job.id === currentJobId) {
      return;
    }

    setPhase('loading-preview');
    try {
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/reassign-job/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_job_id: job.id }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load preview');
      }
      if (!json.valid) {
        setError(json.error || 'Cannot reassign to this job');
        setPhase('picker');
        return;
      }
      setPreview(json);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
      setPhase('picker');
    }
  };

  const handleConfirm = async () => {
    if (!managedCreatorId || !selected) return;
    setPhase('committing');
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/managed-creators/${managedCreatorId}/reassign-job`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_job_id: selected.id }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to reassign job');
      }
      toast({
        title: 'Job reassigned',
        description: `Updated ${json.updated_mcp_count} post${json.updated_mcp_count === 1 ? '' : 's'}${
          json.updated_btsa_count > 0 ? ` and ${json.updated_btsa_count} tracked account${json.updated_btsa_count === 1 ? '' : 's'}` : ''
        }.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign job');
      setPhase('preview');
    }
  };

  const handleBack = () => {
    setPhase('picker');
    setPreview(null);
  };

  const mc = preview?.mc_diff;
  const btsa = preview?.btsa_diff;
  const summary = preview?.paid_posts_summary;
  const unpaidPosts = preview?.unpaid_posts ?? [];
  const partiallyPaidWarning = (summary?.partially_paid_count ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            Reassign job{creatorName ? ` — ${creatorName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {phase === 'picker' && (
            <>
              <div className="text-sm text-muted-foreground">
                Select a different job under this brand. The next step shows the full set of
                changes before anything is written.
              </div>

              {jobsLoading ? (
                <div className="text-sm text-muted-foreground">Loading jobs…</div>
              ) : (
                <JobPickerList
                  jobs={jobs}
                  selectedId={selected?.id ?? null}
                  currentId={currentJobId}
                  onSelect={handleJobSelect}
                />
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}

          {phase === 'loading-preview' && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading preview…
            </div>
          )}

          {(phase === 'preview' || phase === 'committing') && mc && (
            <>
              {/* Creator-level diff */}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Creator fields
                </div>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Field</TableHead>
                        <TableHead className="h-8 text-xs">Old</TableHead>
                        <TableHead className="h-8 text-xs">New</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <DiffRow
                        label="Job"
                        oldValue={mc.job_title_old ?? '—'}
                        newValue={mc.job_title_new ?? '—'}
                      />
                      <DiffRow
                        label="Base pay"
                        oldValue={formatCents(mc.base_pay_old_cents)}
                        newValue={formatCents(mc.base_pay_new_cents)}
                      />
                      <DiffRow
                        label="Per-video pay"
                        oldValue={`${formatCents(mc.per_video_old_cents)} (${mc.platform_count_old} platform${mc.platform_count_old === 1 ? '' : 's'})`}
                        newValue={`${formatCents(mc.per_video_new_cents)} (${mc.platform_count_new} platform${mc.platform_count_new === 1 ? '' : 's'})`}
                      />
                      <DiffRow
                        label="CPM rate"
                        oldValue={mc.cpm_rate_old != null ? `$${(mc.cpm_rate_old / 100).toFixed(2)}/1k` : '—'}
                        newValue={mc.cpm_rate_new != null ? `$${(mc.cpm_rate_new / 100).toFixed(2)}/1k` : '—'}
                      />
                      <DiffRow
                        label="Max pay"
                        oldValue={formatCents(mc.max_pay_cents_old)}
                        newValue={formatCents(mc.max_pay_cents_new)}
                      />
                      <DiffRow
                        label="Bonus milestones"
                        oldValue={`${mc.milestones_old_count} tier${mc.milestones_old_count === 1 ? '' : 's'}`}
                        newValue={`${mc.milestones_new_count} tier${mc.milestones_new_count === 1 ? '' : 's'}`}
                      />
                      {btsa && (
                        <DiffRow
                          label="Tracked country"
                          oldValue={
                            btsa.country_old_iso ? (
                              <>
                                <span className="mr-1">{countryToFlag(btsa.country_old_iso)}</span>
                                {btsa.country_old_iso}
                              </>
                            ) : '—'
                          }
                          newValue={
                            btsa.country_new_iso ? (
                              <>
                                <span className="mr-1">{countryToFlag(btsa.country_new_iso)}</span>
                                {btsa.country_new_iso}
                                {btsa.affected_btsa_ids.length > 0 && (
                                  <span className="text-muted-foreground ml-2">
                                    ({btsa.affected_btsa_ids.length} account{btsa.affected_btsa_ids.length === 1 ? '' : 's'})
                                  </span>
                                )}
                              </>
                            ) : '—'
                          }
                        />
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Unpaid posts table */}
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Posts to re-price ({unpaidPosts.length})
                </div>
                {unpaidPosts.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-3 py-4 text-center border rounded-md">
                    No unpaid posts to re-price.
                  </div>
                ) : (
                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Post</TableHead>
                          <TableHead className="h-8 text-xs">Platform</TableHead>
                          <TableHead className="h-8 text-xs text-right">Views</TableHead>
                          <TableHead className="h-8 text-xs text-right">Old $</TableHead>
                          <TableHead className="h-8 text-xs text-right">New $</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unpaidPosts.map((p) => (
                          <TableRow key={p.mcp_id}>
                            <TableCell className="py-1.5 text-xs">
                              {p.post_url ? (
                                <a
                                  href={p.post_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <span className="truncate max-w-[180px]">
                                    {p.post_url.replace(/^https?:\/\//, '')}
                                  </span>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {p.payment_status === 'excluded' && (
                                <span className="ml-1 text-[10px] text-muted-foreground uppercase">(excluded)</span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs capitalize">{p.platform ?? '—'}</TableCell>
                            <TableCell className="py-1.5 text-xs text-right tabular-nums">
                              {p.views.toLocaleString()}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right tabular-nums text-muted-foreground">
                              {formatCents(p.old_total_owed_cents)}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium">
                              {formatCents(p.new_total_owed_cents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Paid summary */}
              {summary && summary.paid_count > 0 && (
                <div className="text-xs text-muted-foreground">
                  {summary.paid_count} paid post{summary.paid_count === 1 ? '' : 's'} — unchanged.
                  Total: {formatCents(summary.total_paid_cents)} already transferred.
                </div>
              )}

              {/* Partially-paid warning */}
              {partiallyPaidWarning && (
                <div className="flex items-start gap-2 p-2 rounded-md border border-destructive/40 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive">
                    {summary!.partially_paid_count} partially-paid post{summary!.partially_paid_count === 1 ? '' : 's'} will NOT be re-priced.
                    Resolve manually if needed.
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 pt-3 border-t">
          {(phase === 'preview' || phase === 'committing') && (
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={phase === 'committing'}>
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === 'committing'}>
            Cancel
          </Button>
          {(phase === 'preview' || phase === 'committing') && (
            <Button onClick={handleConfirm} disabled={phase === 'committing'}>
              {phase === 'committing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying…
                </>
              ) : (
                'Confirm reassignment'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
