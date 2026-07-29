export const runtime = 'nodejs';

import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { captureDbError } from '@/lib/analytics/capture-error';

export interface PostPaymentDetailResponse {
  post: {
    id: string;
    platform: string;
    post_url: string;
    thumbnail_url: string | null;
    posted_at: string | null;
    latest_views: number;
  };
  payment: {
    id: string;
    managed_creator_id: string;
    base_pay_cents: number;
    cpm_rate: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    calculated_pay_cents: number;
    bonus_cents: number;
    total_owed_cents: number;
    total_paid_cents: number;
    payment_status: string;
    platform_count: number;
    created_at: string;
  };
  creator_config: {
    name: string;
    base_pay: number;
    cpm_rate: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    linked_creator_profile_id: string | null;
  };
  job_config: {
    id: string;
    title: string;
    base_pay_cents: number | null;
    max_pay_cents: number | null;
    bonus_milestones: Array<{ min_views: number; amount_cents: number }> | null;
    platforms_required: string[];
  } | null;
  payment_history: Array<{
    id: string;
    amount: number;
    views_at_payment: number | null;
    created_at: string;
    admin_email: string | null;
  }>;
}

/**
 * GET /api/admin/creator-post-payments/[id]
 *
 * Returns full detail for a single managed_creator_posts row,
 * including payment breakdown, config hierarchy, and payment history.
 * Admin-only endpoint.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    // Fetch managed_creator_posts row with nested managed_creators and posts
    const { data: mcp, error: mcpError } = await supabase
      .from('managed_creator_posts')
      .select(`
        id,
        managed_creator_id,
        base_pay_cents,
        cpm_rate,
        max_pay_cents,
        bonus_milestones,
        calculated_pay_cents,
        bonus_cents,
        total_owed_cents,
        total_paid_cents,
        payment_status,
        platform_count,
        created_at,
        managed_creators!managed_creator_id (
          name,
          base_pay,
          cpm_rate,
          max_pay_cents,
          bonus_milestones,
          linked_creator_profile_id,
          job_id
        ),
        posts!post_id (
          id,
          platform,
          post_url,
          thumbnail_url,
          posted_at,
          latest_views
        )
      `)
      .eq('id', id)
      .single();

    if (mcpError || !mcp) {
      if (mcpError?.code === 'PGRST116') {
        return Response.json({ error: 'Post payment not found' }, { status: 404 });
      }
      captureDbError(mcpError, 'fetch_post_payment_detail', { userId: user.id, metadata: { postPaymentId: id } });
      return Response.json({ error: 'Failed to fetch post payment detail' }, { status: 500 });
    }

    const mc = mcp.managed_creators as Record<string, unknown> | null;
    const post = mcp.posts as Record<string, unknown> | null;

    // Fetch job config and payment history in parallel
    const [jobResult, txResult] = await Promise.all([
      mc?.job_id
        ? supabase
            .from('jobs')
            .select(`
              id,
              job_title,
              cpm_base_pay,
              max_pay_cents,
              bonus_milestones,
              job_requirements (
                platforms_required
              )
            `)
            .eq('id', mc.job_id as string)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('creator_transactions')
        .select('id, amount, views_at_payment, created_at, triggered_by_admin_id')
        .eq('managed_creator_post_id', id)
        .order('created_at', { ascending: false }),
    ]);

    let jobConfig: PostPaymentDetailResponse['job_config'] = null;
    if (!jobResult.error && jobResult.data) {
      const jobData = jobResult.data;
      const req = Array.isArray(jobData.job_requirements)
        ? jobData.job_requirements[0]
        : jobData.job_requirements;

      jobConfig = {
        id: jobData.id,
        title: jobData.job_title,
        base_pay_cents: jobData.cpm_base_pay,
        max_pay_cents: jobData.max_pay_cents,
        bonus_milestones: jobData.bonus_milestones as NonNullable<PostPaymentDetailResponse['job_config']>['bonus_milestones'] || null,
        platforms_required: req?.platforms_required || [],
      };
    }

    const { data: transactions, error: txError } = txResult;
    if (txError) {
      captureDbError(txError, 'fetch_post_payment_history', { userId: user.id, metadata: { postPaymentId: id } });
    }

    // Resolve admin emails for payment history
    const adminIds = (transactions || [])
      .map((t) => t.triggered_by_admin_id)
      .filter((aid): aid is string => aid != null);

    const uniqueAdminIds = [...new Set(adminIds)];
    let adminEmailMap: Record<string, string> = {};

    if (uniqueAdminIds.length > 0) {
      const { data: admins } = await supabase
        .from('users')
        .select('id, email')
        .in('id', uniqueAdminIds);

      if (admins) {
        for (const a of admins) {
          adminEmailMap[a.id] = a.email;
        }
      }
    }

    const paymentHistory = (transactions || []).map((t) => ({
      id: t.id,
      amount: t.amount,
      views_at_payment: t.views_at_payment,
      created_at: t.created_at!,
      admin_email: t.triggered_by_admin_id
        ? adminEmailMap[t.triggered_by_admin_id] || null
        : null,
    }));

    const response: PostPaymentDetailResponse = {
      post: {
        id: (post?.id as string) || '',
        platform: (post?.platform as string) || 'unknown',
        post_url: (post?.post_url as string) || '',
        thumbnail_url: (post?.thumbnail_url as string) || null,
        posted_at: (post?.posted_at as string) || null,
        latest_views: (post?.latest_views as number) || 0,
      },
      payment: {
        id: mcp.id,
        managed_creator_id: mcp.managed_creator_id,
        base_pay_cents: mcp.base_pay_cents,
        cpm_rate: mcp.cpm_rate,
        max_pay_cents: mcp.max_pay_cents,
        bonus_milestones: mcp.bonus_milestones as PostPaymentDetailResponse['payment']['bonus_milestones'],
        calculated_pay_cents: mcp.calculated_pay_cents,
        bonus_cents: mcp.bonus_cents,
        total_owed_cents: mcp.total_owed_cents,
        total_paid_cents: mcp.total_paid_cents,
        payment_status: mcp.payment_status,
        platform_count: mcp.platform_count,
        created_at: mcp.created_at!,
      },
      creator_config: {
        name: (mc?.name as string) || 'Unknown',
        base_pay: (mc?.base_pay as number) || 0,
        cpm_rate: (mc?.cpm_rate as number) || null,
        max_pay_cents: (mc?.max_pay_cents as number) || null,
        bonus_milestones: mc?.bonus_milestones as PostPaymentDetailResponse['creator_config']['bonus_milestones'] || null,
        linked_creator_profile_id: (mc?.linked_creator_profile_id as string) || null,
      },
      job_config: jobConfig,
      payment_history: paymentHistory,
    };

    return Response.json(response);
  } catch (error) {
    captureDbError(error, 'admin_post_payment_detail_route');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
