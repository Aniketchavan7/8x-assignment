'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { JobPickerList } from './JobPickerList';
import type { BrandJobOption } from '@/app/api/admin/brands/[brandId]/jobs/route';
import type { BrandsApiResponse } from '@/app/api/admin/brands/route';

interface AddCreatorToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorProfileId: string;
  creatorName: string;
  /** Brand IDs the creator is already attached to — surfaced as disabled in results. */
  existingBrandIds: string[];
  onSuccess: () => void;
}

interface BrandResult {
  id: string;
  organization_name: string;
  organization_slug: string | null;
}

export function AddCreatorToJobDialog({
  open,
  onOpenChange,
  creatorProfileId,
  creatorName,
  existingBrandIds,
  onSuccess,
}: AddCreatorToJobDialogProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [brand, setBrand] = useState<BrandResult | null>(null);
  const [job, setJob] = useState<BrandJobOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setBrand(null);
      setJob(null);
      setSubmitting(false);
    }
  }, [open]);

  const existingSet = new Set(existingBrandIds);

  const { data: brandsData, isFetching: brandsFetching, isError: brandsError } = useQuery<BrandsApiResponse>({
    queryKey: ['/api/admin/brands', 'search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/admin/brands?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load brands');
      return res.json();
    },
    enabled: open && !brand,
    staleTime: 0,
  });

  const { data: jobsData, isFetching: jobsFetching, isError: jobsError } = useQuery<{ data: BrandJobOption[] }>({
    queryKey: ['/api/admin/brands', brand?.id, 'jobs'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/brands/${brand!.id}/jobs`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load jobs');
      return res.json();
    },
    enabled: open && !!brand,
    staleTime: 0,
  });

  const handleSubmit = async () => {
    if (!brand || !job) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/creators/${creatorProfileId}/managed-creator`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_organization_id: brand.id,
            job_id: job.id,
          }),
        },
      );
      if (res.status === 409) {
        toast({
          title: 'Already on this brand',
          description: `${creatorName} is already a managed creator for ${brand.organization_name}.`,
        });
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed to add creator (${res.status})`);
      }
      toast({
        title: 'Creator added',
        description: `${creatorName} added to ${brand.organization_name} — ${job.job_title ?? 'job'}.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to add creator',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {brand ? `Add ${creatorName} to ${brand.organization_name}` : `Add ${creatorName} to a job`}
          </DialogTitle>
        </DialogHeader>

        {!brand ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Pick a brand for this creator. A managed_creators row will be created so they
              show up under that brand&apos;s campaigns immediately.
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brands…"
                className="pl-8"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
              {brandsError ? (
                <div className="text-sm text-destructive px-3 py-4 text-center">
                  Failed to load brands. Try again.
                </div>
              ) : brandsFetching && !brandsData ? (
                <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                  Loading brands…
                </div>
              ) : (brandsData?.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                  No brands found.
                </div>
              ) : (
                brandsData!.data.map((b) => {
                  const isExisting = existingSet.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={isExisting}
                      onClick={() =>
                        setBrand({
                          id: b.id,
                          organization_name: b.organization_name,
                          organization_slug: b.organization_slug,
                        })
                      }
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{b.organization_name}</div>
                        {b.organization_slug && (
                          <div className="text-xs text-muted-foreground truncate">
                            {b.organization_slug}
                          </div>
                        )}
                      </div>
                      {isExisting && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          already on this brand
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Pick a job under {brand.organization_name}. The creator is created with
              status <span className="font-mono">applied</span> and base pay <span className="font-mono">$0</span>;
              update base pay on the campaign row after adding.
            </div>

            {jobsError ? (
              <div className="text-sm text-destructive px-3 py-4 text-center border rounded-md">
                Failed to load jobs. Try again.
              </div>
            ) : jobsFetching && !jobsData ? (
              <div className="text-sm text-muted-foreground px-3 py-4 text-center border rounded-md">
                Loading jobs…
              </div>
            ) : (
              <JobPickerList
                jobs={jobsData?.data ?? []}
                selectedId={job?.id ?? null}
                currentId={null}
                onSelect={setJob}
              />
            )}

            <div className="flex justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setBrand(null);
                  setJob(null);
                }}
              >
                ← Change brand
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!job || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    `Add to ${brand.organization_name}`
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
