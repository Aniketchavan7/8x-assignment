import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { SCOPED_ROLES, type AdminRole } from '@/lib/modules/admin/roles';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type CampaignDetailResponse = {
  campaign: {
    id: string;
    name: string;
    status: 'active' | 'paused' | 'completed';
    country: string | null;
    platforms: string[];
    budget_cents: number | null;
    target_video_count: number | null;
    base_pay_per_video_cents: number | null;
    monthly_cap_cents: number | null;
    posting_frequency: string | null;
    min_views_threshold: number | null;
    min_views_pay_cents: number | null;
    bonus_milestones: unknown[] | null;
    referral_bonus_cents: number | null;
    start_date: string | null;
    end_date: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    brand_organization_id: string;
    brand_name: string | null;
    brand_slug: string | null;
    job_id: string | null;
    job_title: string | null;
  };
  stats: {
    totalVideos: number;
    totalPaidCents: number;
    totalOwedCents: number;
    remainingCents: number;
    postsByStatus: Record<string, number>;
  };
  creators: Array<{
    managed_creator_id: string;
    display_name: string | null;
    tiktok_username: string | null;
    instagram_username: string | null;
    youtube_username: string | null;
    status: string | null;
    videos: number;
    paidCents: number;
    owedCents: number;
  }>;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
): Promise<Response> {
  try {
    const { campaignId: id } = await params;

    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: member, error: memberError } = await supabase
      .from('admin_members')
      .select('admin_role, job_ids')
      .eq('user_id', user.id)
      .single();

    if (memberError || !member) {
      return Response.json({ error: 'Forbidden: insufficient admin role' }, { status: 403 });
    }

    const memberRole = member.admin_role as AdminRole;
    const memberJobIds = (member.job_ids ?? []) as string[];
    const isScoped = SCOPED_ROLES.includes(memberRole);

    const { data: campaign, error: campaignError } = await supabase
      .from('brand_campaigns')
      .select(
        '*, brand_organizations(organization_name, organization_slug), jobs!brand_campaigns_job_id_fkey(id, job_title)'
      )
      .eq('id', id)
      .maybeSingle();

    if (campaignError) {
      console.error('Error fetching campaign:', campaignError);
      return Response.json({ error: 'Failed to fetch campaign' }, { status: 500 });
    }
    if (!campaign) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (isScoped && (!campaign.job_id || !memberJobIds.includes(campaign.job_id))) {
      return Response.json({ error: 'Forbidden: insufficient admin role' }, { status: 403 });
    }

    const brandOrg = (campaign as { brand_organizations: { organization_name: string; organization_slug: string } | null }).brand_organizations;
    const job = (campaign as { jobs: { id: string; job_title: string } | null }).jobs;

    const campaignOut: CampaignDetailResponse['campaign'] = {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      country: campaign.country,
      platforms: campaign.platforms ?? [],
      budget_cents: campaign.budget_cents,
      target_video_count: campaign.target_video_count,
      base_pay_per_video_cents: campaign.base_pay_per_video_cents,
      monthly_cap_cents: campaign.monthly_cap_cents,
      posting_frequency: campaign.posting_frequency,
      min_views_threshold: campaign.min_views_threshold,
      min_views_pay_cents: campaign.min_views_pay_cents,
      bonus_milestones: (campaign.bonus_milestones as unknown[] | null) ?? null,
      referral_bonus_cents: campaign.referral_bonus_cents,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      notes: campaign.notes,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at,
      brand_organization_id: campaign.brand_organization_id,
      brand_name: brandOrg?.organization_name ?? null,
      brand_slug: brandOrg?.organization_slug ?? null,
      job_id: campaign.job_id,
      job_title: job?.job_title ?? null,
    };

    if (!campaign.job_id) {
      return Response.json({
        campaign: campaignOut,
        stats: {
          totalVideos: 0,
          totalPaidCents: 0,
          totalOwedCents: 0,
          remainingCents: 0,
          postsByStatus: {},
        },
        creators: [],
      } satisfies CampaignDetailResponse);
    }

    const { data: postRows, error: postsError } = await supabase
      .from('managed_creator_posts')
      .select(
        'managed_creator_id, total_owed_cents, total_paid_cents, payment_status, managed_creators!inner(id, name, status, tiktok_username, instagram_username, youtube_username, job_id)'
      )
      .eq('managed_creators.job_id', campaign.job_id);

    if (postsError) {
      console.error('Error fetching campaign posts:', postsError);
      return Response.json({ error: 'Failed to fetch campaign stats' }, { status: 500 });
    }

    let totalVideos = 0;
    let totalPaidCents = 0;
    let totalOwedCents = 0;
    const postsByStatus: Record<string, number> = {};
    const creatorMap = new Map<
      string,
      {
        managed_creator_id: string;
        display_name: string | null;
        tiktok_username: string | null;
        instagram_username: string | null;
        youtube_username: string | null;
        status: string | null;
        videos: number;
        paidCents: number;
        owedCents: number;
      }
    >();

    for (const row of postRows ?? []) {
      const owed = row.total_owed_cents ?? 0;
      const paid = row.total_paid_cents ?? 0;
      totalVideos += 1;
      totalPaidCents += paid;
      totalOwedCents += owed;
      const status = row.payment_status ?? 'unknown';
      postsByStatus[status] = (postsByStatus[status] ?? 0) + 1;

      const mc = (row as unknown as {
        managed_creators: {
          id: string;
          name: string | null;
          status: string | null;
          tiktok_username: string | null;
          instagram_username: string | null;
          youtube_username: string | null;
        };
      }).managed_creators;

      const existing = creatorMap.get(mc.id);
      if (existing) {
        existing.videos += 1;
        existing.paidCents += paid;
        existing.owedCents += owed;
      } else {
        creatorMap.set(mc.id, {
          managed_creator_id: mc.id,
          display_name: mc.name,
          tiktok_username: mc.tiktok_username,
          instagram_username: mc.instagram_username,
          youtube_username: mc.youtube_username,
          status: mc.status,
          videos: 1,
          paidCents: paid,
          owedCents: owed,
        });
      }
    }

    const remainingCents = Math.max(0, totalOwedCents - totalPaidCents);

    const creators = Array.from(creatorMap.values()).sort(
      (a, b) => (b.owedCents - b.paidCents) - (a.owedCents - a.paidCents)
    );

    return Response.json({
      campaign: campaignOut,
      stats: {
        totalVideos,
        totalPaidCents,
        totalOwedCents,
        remainingCents,
        postsByStatus,
      },
      creators,
    } satisfies CampaignDetailResponse);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/brand-campaigns/[campaignId]/detail',
      method: 'GET',
    });
  }
}
