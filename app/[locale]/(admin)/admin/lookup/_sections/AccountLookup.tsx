import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { loadAccountLookup, loadAccountPosts, platformOf } from '@/lib/admin/lookup/queries';
import { Badge } from '@/components/ui/badge';
import { CollapsibleSection } from '../_components/CollapsibleSection';
import { RawRow } from '../_components/RawRow';
import { Hint, WithTooltip } from '../_components/Hint';
import { AccountActionBar } from '../_components/AccountActionBar';
import { AccountPostsTable } from '../_components/AccountPostsTable';

interface Props {
  socialAccountId: string;
}

export async function AccountLookup({ socialAccountId }: Props) {
  const supabase = createServiceRoleClient();
  const data = await loadAccountLookup(supabase, socialAccountId);
  if (!data) notFound();

  const { socialAccount, tiktokAccount, instagramAccount, youtubeAccount, trackedBy, managedCreators, syncJobs } =
    data;
  const platform = platformOf(socialAccount);
  const platformAccount = tiktokAccount ?? instagramAccount ?? youtubeAccount;
  const handle =
    tiktokAccount?.tiktok_username ??
    instagramAccount?.instagram_username ??
    youtubeAccount?.youtube_username ??
    null;

  const { rows: posts, total: totalPosts } = await loadAccountPosts(supabase, socialAccount, {
    limit: 50,
    offset: 0,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-6">
      <AccountActionBar
        socialAccountId={socialAccount.id}
        handle={handle}
        platform={platform}
      />

      {/* 1. Identity */}
      <CollapsibleSection
        title="Identity"
        defaultOpen
        hint="Who this account is + the IDs that connect them to our internal account graph. The 'Raw row' expanders dump the full database row if you want to see every field."
      >
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <KV k="Handle" v={handle ? `@${handle}` : '—'} />
          <KV k="Platform" v={platform ? <Badge>{platform}</Badge> : '—'} />
          <KV
            k="social_accounts.id"
            hint="The connector row that ties this platform identity into our system."
            v={<span className="font-mono text-xs">{socialAccount.id}</span>}
          />
          <KV
            k="account_type"
            hint="'tracked_only' = we only have public stats; 'creator_owned' = the creator has signed in and connected this account themselves."
            v={socialAccount.account_type ?? '—'}
          />
          <KV
            k="tiktok_account_id"
            hint="FK to tiktok_accounts. Empty = this connector isn't linked to a TikTok account."
            v={
              <span className="font-mono text-xs">
                {socialAccount.tiktok_account_id ?? '—'}
              </span>
            }
          />
          <KV
            k="instagram_account_id"
            hint="FK to instagram_accounts."
            v={
              <span className="font-mono text-xs">
                {socialAccount.instagram_account_id ?? '—'}
              </span>
            }
          />
          <KV
            k="youtube_account_id"
            hint="FK to youtube_accounts."
            v={
              <span className="font-mono text-xs">
                {socialAccount.youtube_account_id ?? '—'}
              </span>
            }
          />
          <KV
            k="creator_profile_id"
            hint="If the creator has a profile in 8x (signed up, did onboarding), this links to it."
            v={
              <span className="font-mono text-xs">
                {socialAccount.creator_profile_id ?? '—'}
              </span>
            }
          />
          <KV
            k="managed_creator_id"
            hint="If this account belongs to a creator we're paying for a brand campaign, this is the link to that managed_creators row."
            v={
              <span className="font-mono text-xs">
                {socialAccount.managed_creator_id ?? '—'}
              </span>
            }
          />
          <KV k="Created at" v={fmtDate(socialAccount.created_at)} />
          {platformAccount && (
            <>
              <KV
                k="Tracking disabled"
                hint="If true, our sync crons skip this account. Usually toggled when an account goes private, gets banned, or the creator opts out."
                v={
                  platformAccount.tracking_disabled ? (
                    <WithTooltip text="Sync crons skip this account.">
                      <Badge variant="destructive" className="text-[10px]">
                        disabled
                      </Badge>
                    </WithTooltip>
                  ) : (
                    'no'
                  )
                }
              />
              <KV
                k="Status"
                hint="The platform account's overall state in our system."
                v={platformAccount.status ?? '—'}
              />
              <KV
                k="Sync status"
                hint="Where the most recent sync run is — syncing / completed / failed."
                v={platformAccount.sync_status ?? '—'}
              />
              <KV
                k="Follower count"
                hint="Last known follower count from the platform. Refreshed when this account is synced."
                v={
                  'follower_count' in platformAccount && platformAccount.follower_count !== null
                    ? platformAccount.follower_count.toLocaleString()
                    : '—'
                }
              />
              <KV
                k="Last synced"
                hint="When we last successfully pulled new data from the platform for this account."
                v={fmtDate(platformAccount.last_synced_at ?? null)}
              />
              <KV
                k="Consecutive failures"
                hint="How many sync runs have failed in a row. A high number usually means the account went private, got deleted, or our credentials/region is wrong."
                v={
                  'consecutive_sync_failures' in platformAccount
                    ? String(platformAccount.consecutive_sync_failures ?? 0)
                    : '—'
                }
              />
            </>
          )}
        </div>
        <RawRow label="Raw social_accounts row" data={socialAccount} />
        {tiktokAccount && <RawRow label="Raw tiktok_accounts row" data={tiktokAccount} />}
        {instagramAccount && (
          <RawRow label="Raw instagram_accounts row" data={instagramAccount} />
        )}
        {youtubeAccount && (
          <RawRow label="Raw youtube_accounts row" data={youtubeAccount} />
        )}
      </CollapsibleSection>

      {/* 2. Tracking */}
      <CollapsibleSection
        title={`Tracking (${trackedBy.length} brands, ${managedCreators.length} managed creators)`}
        hint="Which brands have this account on their analytics dashboards (brand_tracked_social_accounts), plus any managed_creators rows referencing it. 'Frozen' on a brand row means the brand removed it but we kept history."
      >
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Brand tracked accounts
            </h3>
            {trackedBy.length === 0 ? (
              <p className="text-sm text-muted-foreground">No brands track this account.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {trackedBy.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-card p-2"
                  >
                    {row.brand_organization ? (
                      <Link
                        href={`/admin/brands/${row.brand_organization.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {row.brand_organization.organization_name ?? '(no name)'}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.brand_organization_id}</span>
                    )}
                    {row.frozen && (
                      <WithTooltip text="The brand removed this account from their dashboard. We kept the row so historical analytics still resolve, but it doesn't show up in their UI anymore.">
                        <Badge variant="destructive" className="text-[10px]">
                          frozen
                        </Badge>
                      </WithTooltip>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {fmtDate(row.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              Managed creators
            </h3>
            {managedCreators.length === 0 ? (
              <p className="text-sm text-muted-foreground">No managed creator rows.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {managedCreators.map((mc) => (
                  <li
                    key={mc.id}
                    className="flex flex-wrap items-center gap-2 rounded border bg-card p-2"
                  >
                    <span className="font-medium">{mc.name}</span>
                    <WithTooltip text="The creator's status in this campaign — applied / warming up / active / dropped / etc.">
                      <Badge variant="outline" className="text-[10px]">
                        {mc.status}
                      </Badge>
                    </WithTooltip>
                    {mc.brand_organization && (
                      <Link
                        href={`/admin/brands/${mc.brand_organization.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {mc.brand_organization.organization_name ?? '(no name)'}
                      </Link>
                    )}
                    {mc.job?.job_title && (
                      <span className="text-muted-foreground">· {mc.job.job_title}</span>
                    )}
                    {mc.base_pay !== null && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        ${(Number(mc.base_pay) / 100).toFixed(2)} base
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* 3. Posts */}
      <CollapsibleSection
        title={`Posts (${totalPosts})`}
        defaultOpen
        hint="The 50 most recent posts we've synced from this account. Click any row to open the post's full lookup view in a side drawer."
      >
        <AccountPostsTable posts={posts} />
      </CollapsibleSection>

      {/* 4. Timeline */}
      <CollapsibleSection
        title={`Recent sync jobs (${syncJobs.length})`}
        hint="Last 20 sync runs that touched this account. Failed runs with errors are the first place to look when an account looks stale."
      >
        {syncJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync jobs.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {syncJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-2 rounded border bg-card p-2 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  {fmtDate(j.created_at)}
                </span>
                <span>{j.cron_name ?? j.job_type ?? '—'}</span>
                <Badge
                  variant={
                    j.status === 'failed'
                      ? 'destructive'
                      : j.status === 'completed'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-[10px]"
                >
                  {j.status}
                </Badge>
                {j.error && (
                  <span className="ml-auto line-clamp-1 max-w-md text-red-600">{j.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}

function KV({
  k,
  v,
  hint,
}: {
  k: string;
  v: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        {k}
        {hint && <Hint>{hint}</Hint>}
      </span>
      <span className="min-w-0 truncate">{v}</span>
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
}
