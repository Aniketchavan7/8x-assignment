import { notFound } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { loadPostLookup } from '@/lib/admin/lookup/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { PostActionBar } from '../_components/PostActionBar';
import { CollapsibleSection } from '../_components/CollapsibleSection';
import { RawRow } from '../_components/RawRow';
import { Hint, WithTooltip } from '../_components/Hint';

interface Props {
  postId: string;
  embedded?: boolean;
}

export async function PostLookup({ postId, embedded = false }: Props) {
  const supabase = createServiceRoleClient();
  const data = await loadPostLookup(supabase, postId);
  if (!data) notFound();
  const { post, socialAccount, managedCreatorPosts, syncJobs, transactions } = data;

  const platformAccount =
    socialAccount.tiktokAccount ?? socialAccount.instagramAccount ?? socialAccount.youtubeAccount;
  const handle =
    socialAccount.tiktokAccount?.tiktok_username ??
    socialAccount.instagramAccount?.instagram_username ??
    socialAccount.youtubeAccount?.youtube_username ??
    null;

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto w-full max-w-4xl space-y-4 px-4 py-6'}>
      <PostActionBar
        postId={post.id}
        platform={post.platform}
        currentViewCount={post.latest_views ?? null}
        embedded={embedded}
      />

      {/* 1. Identity */}
      <CollapsibleSection
        title="Identity"
        defaultOpen
        hint="Who/what this post is, where it lives on the platform, and any flags we've put on it (deleted, ad-disclosure, etc.)."
      >
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <KV k="Platform" v={<Badge>{post.platform}</Badge>} />
          <KV
            k="Post URL"
            v={
              <a
                href={post.post_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <span className="truncate">{post.post_url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            }
          />
          <KV
            k="posts.id"
            hint="Our internal UUID for this post. Use it when you're searching the database directly or sharing the row with another admin."
            v={<span className="font-mono text-xs">{post.id}</span>}
          />
          <KV
            k="Native post id"
            hint="The platform's own ID for this post (TikTok aweme_id, IG media id, YouTube video id). What you'd see in the URL on TikTok/IG/YT."
            v={<span className="font-mono text-xs">{post.post_id ?? '—'}</span>}
          />
          <KV k="Posted at" v={fmtDate(post.posted_at)} />
          <KV k="Created at" v={fmtDate(post.created_at)} />
          {post.deleted_at && (
            <KV
              k="Deleted at"
              v={<span className="text-red-600">{fmtDate(post.deleted_at)}</span>}
            />
          )}
          <KV
            k="Ad code"
            hint="A short code we generate per brand campaign for tracking — e.g. SPARK. If a creator drops it in their caption, we tag this post to that campaign automatically."
            v={post.ad_code ? <span className="font-mono">{post.ad_code}</span> : '—'}
          />
          <KV
            k="Disclosure"
            hint="Whether the post discloses paid promotion (#ad, paid partnership tag, hasPaidProductPlacement on YT). FTC compliance signal."
            v={
              <div className="flex flex-wrap gap-1">
                {post.is_sponsored ? (
                  <Badge variant="secondary">#ad / sponsored</Badge>
                ) : (
                  <span className="text-muted-foreground">none detected</span>
                )}
              </div>
            }
          />
          <KV
            k="Lifecycle status"
            hint="Where the post is in our lifecycle. New posts are 'discovered' until they get reviewed/paid/etc."
            v={post.lifecycle_status ?? '—'}
          />
          <KV
            k="Tracking status"
            hint="Whether we're still pulling stats from the platform for this post. 'deleted' means we've stopped because it's gone."
            v={post.tracking_status ?? '—'}
          />
          <KV
            k="Latest views"
            hint="View count from the most recent platform sync. Click 'Refresh stats' to re-fetch live."
            v={post.latest_views?.toLocaleString() ?? '—'}
          />
        </div>
        <RawRow label="Raw posts row" data={post} />
      </CollapsibleSection>

      {/* 2. Media file */}
      <CollapsibleSection
        title="Media file"
        hint="The downloaded thumbnail + video stored in our object storage, plus AI-processing status. We download and re-host so we have a stable URL even if the platform deletes the post."
      >
        <div className="space-y-3 text-sm">
          {post.thumbnail_url ? (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Thumbnail</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.thumbnail_url}
                alt="thumbnail"
                className="max-h-64 rounded border"
              />
            </div>
          ) : (
            <p className="text-muted-foreground">No thumbnail.</p>
          )}
          {post.video_storage_url ? (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Stored video</p>
              <video
                src={post.video_storage_url}
                controls
                className="max-h-96 w-full max-w-md rounded border bg-black"
              />
            </div>
          ) : (
            <p className="text-muted-foreground">Video not downloaded.</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <KV
              k="Storage url"
              hint="Where the video lives in our Supabase storage bucket. If empty, we never downloaded it."
              v={
                post.video_storage_url ? (
                  <span className="break-all font-mono text-xs">{post.video_storage_url}</span>
                ) : (
                  '—'
                )
              }
            />
            <KV
              k="Processing status"
              hint="State of the AI processing job for this video (transcript, summary, on-screen text). 'pending' = waiting, 'completed' = done, 'failed' = the AI errored."
              v={post.video_processing_status ?? '—'}
            />
            <KV
              k="Stored at"
              hint="When we finished downloading the video into our storage."
              v={post.video_stored_at ? fmtDate(post.video_stored_at) : '—'}
            />
            <KV
              k="Processed at"
              hint="When the AI pipeline finished extracting transcript + summary."
              v={post.video_processed_at ? fmtDate(post.video_processed_at) : '—'}
            />
            <KV
              k="Storage retries"
              hint="How many times we've tried to download this video. High = a flaky platform CDN or expired URL."
              v={post.video_storage_retry_count.toString()}
            />
            <KV
              k="Processing retries"
              hint="How many times we've tried to AI-process this video. High = a flaky transcoder or unsupported format."
              v={post.video_processing_retry_count.toString()}
            />
          </div>
          {post.video_storage_error && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              Storage error: {post.video_storage_error}
            </p>
          )}
          {post.video_processing_error && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
              Processing error: {post.video_processing_error}
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* 3. Source social account */}
      <CollapsibleSection
        title="Source social account"
        hint="The creator account this post came from. The IDs below are how the post is wired to our internal account graph — useful when chasing 'why isn't this post showing up under creator X?' bugs."
      >
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <KV k="Handle" v={handle ? `@${handle}` : '—'} />
          <KV k="Platform" v={<Badge>{post.platform}</Badge>} />
          <KV
            k="social_accounts.id"
            hint="The 'connector' row that ties one creator to their TikTok / IG / YouTube identities. One per platform. Click to open the account view."
            v={
              socialAccount.id ? (
                <Link
                  href={`/admin/lookup/account/${socialAccount.id}`}
                  className="font-mono text-xs text-blue-600 hover:underline"
                >
                  {socialAccount.id}
                </Link>
              ) : (
                '—'
              )
            }
          />
          <KV
            k="tiktok_account_id"
            hint="FK to tiktok_accounts. The platform-specific row that stores TikTok-only fields (follower count, sync state, region)."
            v={
              <span className="font-mono text-xs">
                {post.tiktok_account_id ?? '—'}
              </span>
            }
          />
          <KV
            k="instagram_account_id"
            hint="FK to instagram_accounts."
            v={
              <span className="font-mono text-xs">
                {post.instagram_account_id ?? '—'}
              </span>
            }
          />
          <KV
            k="youtube_account_id"
            hint="FK to youtube_accounts."
            v={
              <span className="font-mono text-xs">
                {post.youtube_account_id ?? '—'}
              </span>
            }
          />
          {platformAccount && (
            <>
              <KV
                k="Tracking disabled"
                hint="If true, our sync crons skip this account. Usually set when an account goes private, gets banned, or the creator opts out."
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
                hint="The platform account's overall state in our system (active, deleted, etc.)."
                v={platformAccount.status ?? '—'}
              />
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* 4. Managed creator → brand → job chain */}
      <CollapsibleSection
        title={`Managed creators (${managedCreatorPosts.length})`}
        hint="If this post belongs to a creator we're paying for a brand campaign, the link to the creator/brand/job lives here. Empty = the post was scraped but isn't tied to any campaign."
      >
        {managedCreatorPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No managed creator rows reference this post.
          </p>
        ) : (
          <div className="space-y-3">
            {managedCreatorPosts.map(({ mcp, managedCreator }) => (
              <div key={mcp.id} className="rounded border bg-card p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {managedCreator?.name ?? '— unknown creator —'}
                  </span>
                  {managedCreator?.status && (
                    <WithTooltip text="The creator's overall status in this campaign — applied / warming up / active / dropped / etc.">
                      <Badge variant="outline" className="text-[10px]">
                        {managedCreator.status}
                      </Badge>
                    </WithTooltip>
                  )}
                  <WithTooltip text="Where this specific post is in the payment flow. 'unpaid' = owed, 'paid' = a transaction exists.">
                    <Badge variant="secondary" className="text-[10px]">
                      {mcp.payment_status}
                    </Badge>
                  </WithTooltip>
                  <WithTooltip text="Whether the post has been reviewed by the brand or admin (approved / rejected / pending review).">
                    <Badge variant="outline" className="text-[10px]">
                      {mcp.review_status}
                    </Badge>
                  </WithTooltip>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                  <KV
                    k="Base pay (cents)"
                    hint="The flat fee snapshot. Captured at post-creation time from the job's base_pay, divided by platform_count. Doesn't change if the job's base_pay is later edited."
                    v={mcp.base_pay_cents.toLocaleString()}
                  />
                  <KV
                    k="Bonus (cents)"
                    hint="Performance bonus earned, based on the highest matching milestone (NOT stacked). 0 if the post hasn't hit any milestone yet."
                    v={mcp.bonus_cents.toLocaleString()}
                  />
                  <KV
                    k="Calculated pay"
                    hint="What we think the creator is owed for this post = base + bonus, capped at max_pay_cents."
                    v={mcp.calculated_pay_cents.toLocaleString()}
                  />
                  <KV
                    k="Total owed"
                    hint="Calculated pay minus what we've already paid. Drives the 'pay this post' dialog amount."
                    v={mcp.total_owed_cents.toLocaleString()}
                  />
                  <KV
                    k="Total paid"
                    hint="Sum of all completed creator_transactions for this post. Either Stripe transferred or marked paid manually."
                    v={mcp.total_paid_cents.toLocaleString()}
                  />
                  <KV
                    k="Platform count"
                    hint="Number of platforms this campaign requires (e.g. TikTok + IG = 2). Base pay is divided across platforms."
                    v={mcp.platform_count.toString()}
                  />
                  <KV
                    k="Brand"
                    v={
                      managedCreator?.brand_organization ? (
                        <Link
                          href={`/admin/brands/${managedCreator.brand_organization.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {managedCreator.brand_organization.organization_name ?? '(no name)'}
                        </Link>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <KV
                    k="Job"
                    v={
                      managedCreator?.job?.job_title ? (
                        <span>{managedCreator.job.job_title}</span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <KV
                    k="Managed creator id"
                    v={<span className="font-mono">{mcp.managed_creator_id}</span>}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* 5. Sync history */}
      <CollapsibleSection
        title={`Sync history (${syncJobs.length})`}
        hint="The last 20 sync_jobs rows that touched this post's source account. Useful for spotting patterns when stats look stale or wrong."
      >
        {syncJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync jobs in last 20 runs.</p>
        ) : (
          <div className="overflow-hidden rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Created</th>
                  <th className="px-2 py-1.5 text-left font-medium">Cron</th>
                  <th className="px-2 py-1.5 text-left font-medium">Type</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {syncJobs.map((j) => (
                  <tr key={j.id} className="bg-background">
                    <td className="px-2 py-1 font-mono">{fmtDate(j.created_at)}</td>
                    <td className="px-2 py-1">{j.cron_name ?? '—'}</td>
                    <td className="px-2 py-1">{j.job_type ?? '—'}</td>
                    <td className="px-2 py-1">
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
                    </td>
                    <td className="px-2 py-1 text-red-600">
                      {j.error ? (
                        <span className="line-clamp-2">{j.error}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* 6. Payment + review */}
      <CollapsibleSection
        title={`Payments & review (${transactions.length})`}
        hint="Every creator_transactions row tied to this post — i.e. money we've moved (or queued to move) for this post specifically. 'Stripe transfer' status shows whether a real Stripe payout went through or just a database IOU."
      >
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No creator_transactions for this post.</p>
        ) : (
          <div className="overflow-hidden rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Created</th>
                  <th className="px-2 py-1.5 text-left font-medium">Type</th>
                  <th className="px-2 py-1.5 text-left font-medium">Amount</th>
                  <th className="px-2 py-1.5 text-left font-medium">Stripe transfer</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((t) => (
                  <tr key={t.id} className="bg-background">
                    <td className="px-2 py-1 font-mono">{fmtDate(t.created_at)}</td>
                    <td className="px-2 py-1">{t.transaction_type}</td>
                    <td className="px-2 py-1 tabular-nums">
                      ${(t.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant="outline" className="text-[10px]">
                        {t.stripe_transfer_status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1">{t.status ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
