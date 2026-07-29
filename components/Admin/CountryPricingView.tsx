'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

type BonusMilestone = {
  threshold_views?: number;
  bonus_cents?: number;
};

type Row = {
  country_code: string;
  country_name: string;
  tier: number;
  creator_base_pay_cents: number;
  suggested_brand_charge_cents: number;
  max_monthly_per_campaign_cents: number | null;
  bonus_milestones: BonusMilestone[] | null;
  gni_per_capita_ppp: number | null;
  notes: string | null;
  active: boolean;
};

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
  4: 'Tier 4',
  5: 'Tier 5',
  6: 'Tier 6',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(views % 1_000_000 === 0 ? 0 : 1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views % 1_000 === 0 ? 0 : 1)}K`;
  return String(views);
}

function formatBonuses(milestones: BonusMilestone[] | null): string {
  if (!milestones || milestones.length === 0) return '—';
  return milestones
    .filter((m) => m.threshold_views != null && m.bonus_cents != null)
    .map((m) => `${formatViews(m.threshold_views!)}→${formatCents(m.bonus_cents!)}`)
    .join(', ');
}

function countryCodeToFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const base = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(base + code.charCodeAt(0), base + code.charCodeAt(1));
}

function parseBonusMilestones(value: unknown): BonusMilestone[] | null {
  if (!Array.isArray(value)) return null;
  return value as BonusMilestone[];
}

async function fetchCountryPricing(): Promise<Row[]> {
  const res = await fetch('/api/admin/country-pricing');
  if (!res.ok) throw new Error('Failed to fetch country pricing');
  const json = (await res.json()) as { data: Array<Omit<Row, 'bonus_milestones'> & { bonus_milestones: unknown }> };
  return json.data.map((row) => ({
    ...row,
    bonus_milestones: parseBonusMilestones(row.bonus_milestones),
  }));
}

export function CountryPricingView() {
  const [query, setQuery] = useState('');

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['/api/admin/country-pricing'],
    queryFn: fetchCountryPricing,
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      return (
        row.country_code.toLowerCase().includes(q) ||
        row.country_name.toLowerCase().includes(q) ||
        TIER_LABELS[row.tier]?.toLowerCase().includes(q) ||
        String(row.tier) === q ||
        (row.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading country pricing…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">Failed to load pricing: {(error as Error).message}</p>
      </div>
    );
  }

  const total = rows?.length ?? 0;

  return (
    <div className="p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Country Pricing Tiers</h2>
        <p className="text-sm text-muted-foreground mt-1">
          PPP-anchored recommended pricing. Minimum brand charge is 3× creator pay.
          Edit directly via SQL for now.
        </p>
      </div>

      <Input
        type="search"
        placeholder="Search by country, code, tier, or notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Tier</TableHead>
              <TableHead className="w-[90px]">Code</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Creator Pay</TableHead>
              <TableHead className="text-right">Min Brand Charge</TableHead>
              <TableHead className="text-right">Max / Month</TableHead>
              <TableHead>Bonus Structure</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {total === 0 ? 'No country pricing configured yet.' : `No countries match "${query}"`}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.country_code}>
                  <TableCell className="font-medium">
                    {TIER_LABELS[row.tier] ?? row.tier}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.country_code}</TableCell>
                  <TableCell>
                    <span className="mr-2" aria-hidden>
                      {countryCodeToFlag(row.country_code)}
                    </span>
                    {row.country_name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.creator_base_pay_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(row.suggested_brand_charge_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.max_monthly_per_campaign_cents == null
                      ? '—'
                      : formatCents(row.max_monthly_per_campaign_cents)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono tabular-nums">
                    {formatBonuses(row.bonus_milestones)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {total} {total === 1 ? 'country' : 'countries'}
      </p>
    </div>
  );
}
