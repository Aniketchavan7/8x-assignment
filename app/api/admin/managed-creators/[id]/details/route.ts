import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { getManagedCreatorSocialAccounts, type UnifiedSocialAccount } from '@/lib/db/social-accounts';
import type { ManagedCreatorListItem } from '../../route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type ManagedCreatorDetailsResponse = {
  creator: ManagedCreatorListItem;
  creatorProfile: CreatorProfileSummary | null;
  socialAccounts: UnifiedSocialAccount[];
  recentPosts: PostWithMetrics[];
  otherCampaigns: OtherCampaign[];
  transactions: TransactionRecord[];
  applications: ApplicationRecord[];
};

export type CreatorProfileSummary = {
  id: string;
  display_name: string;
  bio: string | null;
  profile_picture: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  languages_spoken: string[] | null;
  interests: string[] | null;
  content_types: string[] | null;
  average_rating: number | null;
  total_jobs_completed: number | null;
  total_jobs_active: number | null;
  stripe_payouts_enabled: boolean | null;
  onboarding_status: string | null;
  created_at: string | null;
};

export type PostWithMetrics = {
  id: string;
  platform: string;
  post_url: string;
  caption: string | null;
  thumbnail_url: string | null;
  posted_at: string;
  latest_views: number | null;
  latest_likes: number | null;
  latest_comments: number | null;
  latest_shares: number | null;
  latest_engagement_rate: number | null;
};

export type OtherCampaign = {
  id: string;
  brand_name: string | null;
  job_title: string | null;
  status: string | null;
  base_pay: number | null;
  created_at: string | null;
};

export type TransactionRecord = {
  id: string;
  transaction_type: string;
  amount: number;
  status: string | null;
  description: string | null;
  created_at: string | null;
  stripe_transfer_status: string;
};

export type ApplicationRecord = {
  id: string;
  job_id: string;
  job_title: string;
  job_type: string;
  application_status: string | null;
  applied_at: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.account_type !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    // 1. Fetch base managed creator
    const { data: raw, error: mcError } = await supabase
      .from('managed_creators')
      .select(`
        *,
        brand_organizations (organization_name),
        jobs (job_title, cpm_rate, target_country)
      `)
      .eq('id', id)
      .single();

    if (mcError || !raw) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    const brandOrg = raw.brand_organizations as { organization_name: string } | null;
    const job = raw.jobs as { job_title: string; cpm_rate: number | null; target_country: string | null } | null;

    // 2-7: Fetch linked user + all enrichment data in parallel
    const [
      linkedUser,
      creatorProfile,
      socialAccounts,
      postsResult,
      otherCampaignsResult,
      transactionsResult,
      applicationsResult,
    ] = await Promise.all([
      // Linked user data for fallback fields
      raw.linked_user_id
        ? supabase
            .from('users')
            .select('email, phone, country')
            .eq('id', raw.linked_user_id)
            .single()
            .then((r) => r.data)
        : Promise.resolve(null),
      // 2. Creator profile (if linked)
      raw.linked_creator_profile_id
        ? supabase
            .from('creator_profiles')
            .select(
              'id, display_name, bio, profile_picture, location, age, gender, languages_spoken, interests, content_types, average_rating, total_jobs_completed, total_jobs_active, stripe_payouts_enabled, onboarding_status, created_at'
            )
            .eq('id', raw.linked_creator_profile_id)
            .single()
            .then((r) => r.data)
        : Promise.resolve(null),

      // 3. Social accounts via connector table
      getManagedCreatorSocialAccounts(supabase, id),

      // 4. Recent posts via social_accounts connector
      (async (): Promise<PostWithMetrics[]> => {
        const { data: saRows } = await supabase
          .from('social_accounts')
          .select('id')
          .eq('managed_creator_id', id)
          .eq('is_active', true);

        const saIds = saRows?.map((r) => r.id) ?? [];
        if (saIds.length === 0) return [];

        const { data: posts } = await supabase
          .from('posts')
          .select(
            'id, platform, post_url, caption, thumbnail_url, posted_at, latest_views, latest_likes, latest_comments, latest_shares, latest_engagement_rate'
          )
          .in('social_account_connector_id', saIds)
          .order('posted_at', { ascending: false })
          .limit(10);

        return (posts ?? []) as PostWithMetrics[];
      })(),

      // 5. Other campaigns — same email, phone or linked_user_id
      (async (): Promise<OtherCampaign[]> => {
        let query = supabase
          .from('managed_creators')
          .select('id, status, base_pay, created_at, brand_organizations(organization_name), jobs(job_title)')
          .neq('id', id);

        const orParts: string[] = [];
        if (raw.email) orParts.push(`email.eq.${raw.email}`);
        if (raw.linked_user_id) orParts.push(`linked_user_id.eq.${raw.linked_user_id}`);
        if (raw.phone) orParts.push(`phone.eq.${raw.phone}`);
        if (orParts.length === 0) return [];
        query = query.or(orParts.join(','));

        const { data } = await query.order('created_at', { ascending: false }).limit(20);

        return (data ?? []).map((c) => {
          const bo = c.brand_organizations as { organization_name: string } | null;
          const j = c.jobs as { job_title: string } | null;
          return {
            id: c.id,
            brand_name: bo?.organization_name ?? null,
            job_title: j?.job_title ?? null,
            status: c.status,
            base_pay: c.base_pay,
            created_at: c.created_at,
          };
        });
      })(),

      // 6. Transactions (if linked to creator profile)
      raw.linked_creator_profile_id
        ? supabase
            .from('creator_transactions')
            .select('id, transaction_type, amount, status, description, created_at, stripe_transfer_status')
            .eq('creator_profile_id', raw.linked_creator_profile_id)
            .order('created_at', { ascending: false })
            .limit(20)
            .then((r) => (r.data ?? []) as TransactionRecord[])
        : Promise.resolve([] as TransactionRecord[]),

      // 7. Applications (if linked to creator profile)
      raw.linked_creator_profile_id
        ? supabase
            .from('job_applications')
            .select('id, job_id, application_status, applied_at, jobs(job_title, job_type)')
            .eq('creator_profile_id', raw.linked_creator_profile_id)
            .order('applied_at', { ascending: false })
            .limit(20)
            .then((r) =>
              (r.data ?? []).map((app) => {
                const j = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs;
                return {
                  id: app.id,
                  job_id: app.job_id,
                  job_title: (j?.job_title as string) ?? 'Unknown Job',
                  job_type: (j?.job_type as string) ?? 'standard',
                  application_status: app.application_status,
                  applied_at: app.applied_at,
                };
              })
            )
        : Promise.resolve([] as ApplicationRecord[]),
    ]);

    const creator: ManagedCreatorListItem = {
      id: raw.id,
      name: raw.name,
      email: raw.email || linkedUser?.email || null,
      phone: raw.phone || linkedUser?.phone || null,
      location: raw.location,
      status: raw.status,
      tiktok_username: raw.tiktok_username,
      instagram_username: raw.instagram_username,
      youtube_username: raw.youtube_username,
      collected_tiktok_url: raw.collected_tiktok_url,
      collected_instagram_url: raw.collected_instagram_url,
      tiktok_performance: raw.tiktok_performance,
      instagram_performance: raw.instagram_performance,
      base_pay: raw.base_pay,
      payment: raw.payment,
      total_paid: raw.total_paid,
      pending_payout: raw.pending_payout,
      payment_outstanding: raw.payment_outstanding,
      payment_method: raw.payment_method,
      payout_frequency: raw.payout_frequency,
      last_payment_date: raw.last_payment_date,
      onboarding_call_complete: raw.onboarding_call_complete,
      handles_complete: raw.handles_complete,
      videos_complete: raw.videos_complete,
      is_active: raw.is_active,
      sourced: raw.sourced,
      notes: raw.notes,
      brand_organization_id: raw.brand_organization_id,
      brand_name: brandOrg?.organization_name || null,
      linked_creator_profile_id: raw.linked_creator_profile_id,
      linked_user_id: raw.linked_user_id,
      job_id: raw.job_id,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      onboarding_started_at: raw.onboarding_started_at,
      onboarded_at: raw.onboarded_at,
      onboarding_call_completed_at: raw.onboarding_call_completed_at,
      read_about_company_completed_at: raw.read_about_company_completed_at,
      base_course_status: raw.base_course_status,
      tiktok_handle_completed_at: raw.tiktok_handle_completed_at,
      instagram_handle_completed_at: raw.instagram_handle_completed_at,
      warmup_day_1_completed_at: raw.warmup_day_1_completed_at,
      warmup_day_2_completed_at: raw.warmup_day_2_completed_at,
      warmup_day_3_completed_at: raw.warmup_day_3_completed_at,
      warmup_day_4_completed_at: raw.warmup_day_4_completed_at,
      first_post_completed_at: raw.first_post_completed_at,
      contract_accepted_at: raw.contract_accepted_at,
      accepted_at: raw.accepted_at ?? null,
      status_changed_at: raw.status_changed_at ?? null,
      job_title: job?.job_title || null,
      job_cpm: job?.cpm_rate ?? null,
      job_country: job?.target_country || null,
      country: raw.country || linkedUser?.country || null,
      video_urls: raw.video_urls,
      advance_balance_cents: raw.advance_balance_cents,
      slack_user_id: raw.slack_user_id || null,
    };

    const response: ManagedCreatorDetailsResponse = {
      creator,
      creatorProfile: creatorProfile as CreatorProfileSummary | null,
      socialAccounts,
      recentPosts: postsResult,
      otherCampaigns: otherCampaignsResult,
      transactions: transactionsResult,
      applications: applicationsResult,
    };

    return Response.json(response);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/details',
      method: 'GET',
    });
  }
}
