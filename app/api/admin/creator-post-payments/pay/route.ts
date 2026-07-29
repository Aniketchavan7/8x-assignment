export const runtime = 'nodejs';

import { NextRequest, after } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { transferToCreator } from '@/lib/payments/stripe-connect';
import { markTransactionsTransferred } from '@/lib/modules/creator/ledger';
import { captureDbError, captureStripeError } from '@/lib/analytics/capture-error';
import { getAdminRole } from '@/lib/modules/admin/queries';
import { PAYOUTS_ROLES, hasAccess } from '@/lib/modules/admin/roles';
import { logAdminAction } from '@/lib/modules/admin/audit-log';
import { notify } from '@/lib/messaging/notify';
import { notifyContractOverridePayout, notifyDisclosureOverridePayout, notifyPostPaymentProcessed } from '@/lib/notifications/slack/payouts';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';
import { MINIMUM_CONTRACT_VERSION, hasSignedMinimumContract } from '@/lib/modules/portal/contract-template';

const DISCLOSURE_CUTOVER = new Date('2026-05-08T00:00:00Z');

interface PayRequest {
  managed_creator_post_ids: string[];
  offplatform_method?: string;
  override_contract_check?: boolean;
  override_disclosure_check?: boolean;
}

interface UnsignedCreatorInfo {
  managed_creator_id: string;
  creator_name: string;
  job_title: string | null;
  contract_version: string | null;
  post_count: number;
}

interface UndisclosedPostInfo {
  managed_creator_post_id: string;
  creator_name: string;
  post_url: string;
  platform: string;
}

interface PaymentResult {
  mcp_id: string;
  success: boolean;
  transaction_id?: string;
  amount_paid?: number;
  advance_applied?: number;
  transfer_amount?: number;
  creator_profile_id?: string;
  error?: string;
}

/**
 * POST /api/admin/creator-post-payments/pay
 *
 * Process payments for selected managed creator posts.
 * For each post: calls process_post_payment RPC, groups by creator,
 * transfers to Stripe, marks transactions transferred, sends email notifications.
 * Admin-only with PAYOUTS_ROLES access.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type, email')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Verify admin role has payout access
    const adminRole = await getAdminRole(user.id);
    if (!adminRole || !hasAccess(adminRole, PAYOUTS_ROLES)) {
      return Response.json({ error: 'Forbidden: Your admin role does not have payout access' }, { status: 403 });
    }

    const body: PayRequest = await req.json();
    const {
      managed_creator_post_ids,
      offplatform_method: rawOffplatform,
      override_contract_check = false,
      override_disclosure_check = false,
    } = body;
    const offplatform_method = rawOffplatform != null ? rawOffplatform.trim() : undefined;

    if (offplatform_method === '') {
      return Response.json({ error: 'offplatform_method cannot be empty' }, { status: 400 });
    }

    if (offplatform_method && offplatform_method.length > 100) {
      return Response.json({ error: 'Payment method must be 100 characters or fewer' }, { status: 400 });
    }

    if (!managed_creator_post_ids || !Array.isArray(managed_creator_post_ids) || managed_creator_post_ids.length === 0) {
      return Response.json({ error: 'managed_creator_post_ids is required and must be a non-empty array' }, { status: 400 });
    }

    if (managed_creator_post_ids.length > 100) {
      return Response.json({ error: 'Maximum 100 posts per batch' }, { status: 400 });
    }

    // Pre-fetch managed creator names + review statuses + contract info + disclosure flag
    const { data: mcPreData, error: mcPreError } = await supabase
      .from('managed_creator_posts')
      .select(
        'id, review_status, posts!inner(is_sponsored, post_url, platform, posted_at), managed_creators(id, name, contract_version, brand_organization_id, job_id, jobs(job_title))'
      )
      .in('id', managed_creator_post_ids);

    if (mcPreError) {
      captureDbError(mcPreError, 'prefetch_post_review_status', { userId: user.id });
      return Response.json({ error: 'Failed to verify post review statuses' }, { status: 500 });
    }

    type McInfo = {
      id: string;
      name: string;
      contract_version: string | null;
      job_title: string | null;
      post_ids: string[];
    };

    const mcNameByPostId = new Map<string, string>();
    const brandOrgIdByMcpId = new Map<string, string | null>();
    const unapprovedIds = new Set<string>();
    const disclosureFailedIds = new Set<string>();
    const undisclosedPosts: UndisclosedPostInfo[] = [];
    const undisclosedByMcpId = new Map<string, UndisclosedPostInfo>();
    const mcById = new Map<string, McInfo>();
    if (mcPreData) {
      for (const d of mcPreData) {
        const mc = d.managed_creators as
          | {
              id: string;
              name: string;
              contract_version: string | null;
              brand_organization_id: string | null;
              jobs: { job_title: string } | null;
            }
          | null;
        const post = d.posts as
          | { is_sponsored: boolean | null; post_url: string; platform: string; posted_at: string }
          | null;
        if (mc?.name) mcNameByPostId.set(d.id, mc.name);
        brandOrgIdByMcpId.set(d.id, mc?.brand_organization_id ?? null);
        if (d.review_status !== 'approved') unapprovedIds.add(d.id);
        const isPostCutover = post?.posted_at
          ? new Date(post.posted_at) >= DISCLOSURE_CUTOVER
          : false;
        if (post?.is_sponsored === false && isPostCutover) {
          disclosureFailedIds.add(d.id);
          const info: UndisclosedPostInfo = {
            managed_creator_post_id: d.id,
            creator_name: mc?.name ?? 'Unknown',
            post_url: post.post_url,
            platform: post.platform,
          };
          undisclosedPosts.push(info);
          undisclosedByMcpId.set(d.id, info);
        }
        if (!mc) continue;
        const existing = mcById.get(mc.id);
        if (existing) {
          existing.post_ids.push(d.id);
        } else {
          mcById.set(mc.id, {
            id: mc.id,
            name: mc.name,
            contract_version: mc.contract_version,
            job_title: mc.jobs?.job_title ?? null,
            post_ids: [d.id],
          });
        }
      }
    }

    const overrideContractCheck = override_contract_check === true;
    const overrideDisclosureCheck = override_disclosure_check === true;

    // Disclosure check runs first: if overridden, the disclosure-failed posts
    // become processable, so the contract check (which only counts processable
    // posts) must see the post-override set.
    if (undisclosedPosts.length > 0 && !overrideDisclosureCheck) {
      return Response.json(
        {
          error: 'disclosure_missing',
          undisclosed_posts: undisclosedPosts,
        },
        { status: 422 }
      );
    }

    if (overrideDisclosureCheck) {
      for (const id of disclosureFailedIds) unapprovedIds.delete(id);
    }

    // Partition managed creators by contract signing status (only counting posts we'd process).
    const unsignedCreators: UnsignedCreatorInfo[] = [];
    for (const mc of mcById.values()) {
      if (hasSignedMinimumContract(mc.contract_version)) continue;
      const postsInBatch = mc.post_ids.filter((id) => !unapprovedIds.has(id));
      if (postsInBatch.length === 0) continue;
      unsignedCreators.push({
        managed_creator_id: mc.id,
        creator_name: mc.name,
        job_title: mc.job_title,
        contract_version: mc.contract_version,
        post_count: postsInBatch.length,
      });
    }

    if (unsignedCreators.length > 0 && !overrideContractCheck) {
      return Response.json(
        {
          error: 'contract_not_signed',
          minimum_contract_version: MINIMUM_CONTRACT_VERSION,
          unsigned_creators: unsignedCreators,
        },
        { status: 422 }
      );
    }

    // Process each post payment via the atomic RPC — skip unapproved posts
    const results: PaymentResult[] = [];

    for (const id of unapprovedIds) {
      results.push({ mcp_id: id, success: false, error: 'Post not approved for payment' });
    }

    const approvedIds = managed_creator_post_ids.filter((id) => !unapprovedIds.has(id));

    // Process payments in parallel (batched to avoid overwhelming the DB)
    const BATCH_SIZE = 10;
    for (let i = 0; i < approvedIds.length; i += BATCH_SIZE) {
      const batch = approvedIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (mcpId) => {
          const { data, error } = await supabase.rpc('process_post_payment', {
            p_mcp_id: mcpId,
            p_admin_id: user.id,
            ...(offplatform_method ? { p_offplatform_method: offplatform_method } : {}),
            p_override_disclosure: overrideDisclosureCheck && disclosureFailedIds.has(mcpId),
          });

          if (error) return { mcp_id: mcpId, success: false, error: error.message } as PaymentResult;

          const result = data as {
            success: boolean;
            transaction_id?: string;
            amount_paid?: number;
            advance_applied?: number;
            transfer_amount?: number;
            creator_profile_id?: string;
            error?: string;
          };

          if (!result.success) return { mcp_id: mcpId, success: false, error: result.error } as PaymentResult;

          return {
            mcp_id: mcpId,
            success: true,
            transaction_id: result.transaction_id,
            amount_paid: result.amount_paid,
            advance_applied: result.advance_applied,
            transfer_amount: result.transfer_amount,
            creator_profile_id: result.creator_profile_id,
          } as PaymentResult;
        })
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          // Find which mcpId failed — use batch index
          const idx = batchResults.indexOf(settled);
          results.push({ mcp_id: batch[idx], success: false, error: String(settled.reason) });
        }
      }
    }

    // Group successful results by creator_profile_id. Track brand via the first
    // paid MCP per creator — if a batch mixes brands for one creator (rare),
    // the notify lands on whichever brand thread was first.
    const byCreator = new Map<
      string,
      {
        transactionIds: string[];
        mcpIds: string[];
        totalCents: number;
        totalAdvance: number;
        brandOrgId: string | null;
      }
    >();
    for (const r of results) {
      if (!r.success || !r.creator_profile_id || !r.transaction_id) continue;
      const existing = byCreator.get(r.creator_profile_id) || {
        transactionIds: [],
        mcpIds: [],
        totalCents: 0,
        totalAdvance: 0,
        brandOrgId: brandOrgIdByMcpId.get(r.mcp_id) ?? null,
      };
      existing.transactionIds.push(r.transaction_id);
      existing.mcpIds.push(r.mcp_id);
      existing.totalCents += r.transfer_amount ?? r.amount_paid ?? 0;
      existing.totalAdvance += r.advance_applied ?? 0;
      byCreator.set(r.creator_profile_id, existing);
    }

    // For off-platform payments, skip Stripe transfer entirely
    const transferResults: Array<{
      creator_profile_id: string;
      transferred: boolean;
      transfer_id?: string;
      advance_applied?: number;
      error?: string;
    }> = [];

    if (!offplatform_method) {
      for (const [creatorProfileId, { transactionIds, mcpIds, totalCents, totalAdvance, brandOrgId }] of byCreator) {
        // Skip Stripe transfer if advance covered everything
        if (totalCents <= 0) {
          transferResults.push({
            creator_profile_id: creatorProfileId,
            transferred: false,
            advance_applied: totalAdvance,
          });
          continue;
        }

        const { data: creator } = await supabase
          .from('creator_profiles')
          .select('id, display_name, stripe_account_id, stripe_payouts_enabled, user_id')
          .eq('id', creatorProfileId)
          .single();

        if (!creator?.stripe_account_id || !creator.stripe_payouts_enabled) {
          transferResults.push({
            creator_profile_id: creatorProfileId,
            transferred: false,
            error: !creator?.stripe_account_id
              ? 'Creator has no Stripe account connected'
              : 'Creator Stripe payouts not enabled',
          });
          continue;
        }

        try {
          const transfer = await transferToCreator(
            creator.stripe_account_id,
            totalCents,
            `Post payments for ${creator.display_name}`,
            'USD',
            {
              creator_id: creator.id,
              admin_id: user.id,
              admin_email: userData.email,
              transfer_type: 'post_payment',
            }
          );

          await markTransactionsTransferred(transactionIds, transfer.id);

          transferResults.push({
            creator_profile_id: creatorProfileId,
            transferred: true,
            transfer_id: transfer.id,
          });

          const creatorUserId = creator.user_id;
          after(async () => {
            if (creatorUserId) {
              const dollars = (totalCents / 100).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              await notify({
                userId: creatorUserId,
                eventType: 'payment_sent',
                brandOrganizationId: brandOrgId,
                body: `You've been paid $${dollars} for posts on this campaign.`,
                data: {
                  amount_cents: totalCents,
                  transfer_id: transfer.id,
                  managed_creator_post_ids: mcpIds,
                },
              }).catch(captureFireAndForget('payment_notify'));
            }
          });
        } catch (stripeError) {
          captureStripeError(stripeError, 'post_payment_transfer', {
            userId: user.id,
            metadata: { creatorProfileId, totalCents },
          });
          transferResults.push({
            creator_profile_id: creatorProfileId,
            transferred: false,
            error: stripeError instanceof Error ? stripeError.message : 'Transfer failed',
          });
        }
      }
    }

    // Log admin action + Slack notification (non-blocking)
    after(async () => {
      await logAdminAction(user.id, offplatform_method ? 'post_payment_offplatform' : 'post_payment_batch', {
        managed_creator_post_ids,
        results_count: results.length,
        success_count: results.filter((r) => r.success).length,
        ...(offplatform_method
          ? { offplatform_method }
          : { total_transferred_creators: transferResults.filter((t) => t.transferred).length }),
      });

      const successResults = results.filter((r) => r.success);
      if (successResults.length > 0) {
        const totalAmount = successResults.reduce((s, r) => s + (r.amount_paid || 0), 0);
        const totalTransfer = successResults.reduce((s, r) => s + (r.transfer_amount || 0), 0);
        const totalAdvance = successResults.reduce((s, r) => s + (r.advance_applied || 0), 0);
        const creatorIds = [...new Set(successResults.map((r) => r.creator_profile_id).filter(Boolean))];
        const method = offplatform_method ? 'offplatform' : totalTransfer <= 0 && totalAdvance > 0 ? 'advance' : 'stripe';

        const creatorNames = new Set(
          successResults.map((r) => mcNameByPostId.get(r.mcp_id)).filter(Boolean) as string[]
        );
        const creatorNamesList = [...creatorNames].sort();

        const creatorSummaryText = creatorNamesList.length > 0
          ? `${creatorNamesList.length} creator(s): ${creatorNamesList.join(', ')}`
          : `${creatorIds.length} creator(s)`;

        await notifyPostPaymentProcessed({
          adminEmail: user.email || user.id,
          postCount: successResults.length,
          totalAmount,
          method,
          offplatformMethod: offplatform_method || undefined,
          creatorSummary: creatorSummaryText,
        }).catch(captureFireAndForget('payment_slack_notification'));
      }

      if (overrideContractCheck && unsignedCreators.length > 0) {
        const mcpToMcId = new Map<string, string>();
        for (const mc of mcById.values()) {
          for (const pid of mc.post_ids) mcpToMcId.set(pid, mc.id);
        }
        const paidByMc = new Map<string, { amountCents: number; postCount: number }>();
        for (const r of results) {
          if (!r.success) continue;
          const mcId = mcpToMcId.get(r.mcp_id);
          if (!mcId) continue;
          const existing = paidByMc.get(mcId) ?? { amountCents: 0, postCount: 0 };
          existing.amountCents += r.amount_paid ?? 0;
          existing.postCount += 1;
          paidByMc.set(mcId, existing);
        }
        for (const uc of unsignedCreators) {
          const paid = paidByMc.get(uc.managed_creator_id);
          if (!paid || paid.postCount === 0) continue;
          await notifyContractOverridePayout({
            adminEmail: user.email || user.id,
            creatorName: uc.creator_name,
            managedCreatorId: uc.managed_creator_id,
            contractVersion: uc.contract_version,
            minimumVersion: MINIMUM_CONTRACT_VERSION,
            postCount: paid.postCount,
            amountCents: paid.amountCents,
          }).catch(captureFireAndForget('contract_override_slack_notification'));
        }
      }

      if (overrideDisclosureCheck && undisclosedPosts.length > 0) {
        for (const r of results) {
          if (!r.success) continue;
          const info = undisclosedByMcpId.get(r.mcp_id);
          if (!info) continue;
          await notifyDisclosureOverridePayout({
            adminEmail: user.email || user.id,
            creatorName: info.creator_name,
            managedCreatorPostId: r.mcp_id,
            postUrl: info.post_url,
            platform: info.platform,
            amountCents: r.amount_paid ?? 0,
          }).catch(captureFireAndForget('disclosure_override_slack_notification'));
        }
      }
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return Response.json({
      success: true,
      processed: results.length,
      succeeded: successCount,
      failed: failCount,
      results,
      transfers: transferResults,
    });
  } catch (error) {
    captureDbError(error, 'admin_creator_post_payments_pay_route', {
      url: req.url,
      method: req.method,
    });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
