import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { getOrgBySlug, getPortalDataForUser, getReferenceVideos } from '@/lib/modules/portal/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { createServiceRoleClient } from '@/lib/db/supabase';
import type { PreviousAccount } from '@/lib/modules/managed-creators/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandSlug: string }> }
): Promise<Response> {
  try {
    const { brandSlug } = await params;
    const user = await getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = await getOrgBySlug(brandSlug);
    if (!org) {
      return Response.json({ error: 'Organization not found' }, { status: 404 });
    }

    const { mc, config, jobId, monthlyPayoutCap, targetCountry } = await getPortalDataForUser(user.id, org.id);

    if (!mc) {
      return Response.json({ error: 'Not a managed creator for this brand' }, { status: 404 });
    }

    const jid = jobId ?? undefined;
    const db = createServiceRoleClient();

    const [referenceVideos, briefVideos, { data: trackedAccounts }, { data: replacedRows }] = await Promise.all([
      getReferenceVideos(org.id, { promoted_job_listing: true, jobId: jid }),
      getReferenceVideos(org.id, { promoted_brief: true, jobId: jid }),
      db
        .from('social_accounts')
        .select('tiktok_account_id, instagram_account_id, youtube_account_id, brand_tracked_social_accounts!inner(brand_organization_id)')
        .eq('managed_creator_id', mc.id)
        .eq('status', 'active')
        .eq('brand_tracked_social_accounts.brand_organization_id', org.id),
      // Lifecycle history for the previous-accounts popover. Joins the platform
      // table on each row so we get the username text for display.
      db
        .from('social_accounts')
        .select(
          `id, ended_at, ended_reason,
           tiktok_account_id, instagram_account_id, youtube_account_id,
           tiktok_accounts(tiktok_username),
           instagram_accounts(instagram_username),
           youtube_accounts(youtube_username)`,
        )
        .eq('managed_creator_id', mc.id)
        .eq('status', 'replaced')
        .in('account_type', ['personal', 'brand_owned'])
        .order('ended_at', { ascending: false }),
    ]);

    type ReplacedRow = {
      id: string;
      ended_at: string | null;
      ended_reason: string | null;
      tiktok_account_id: string | null;
      instagram_account_id: string | null;
      youtube_account_id: string | null;
      tiktok_accounts: { tiktok_username: string | null } | null;
      instagram_accounts: { instagram_username: string | null } | null;
      youtube_accounts: { youtube_username: string | null } | null;
    };
    const previousAccounts: Record<'tiktok' | 'instagram' | 'youtube', PreviousAccount[]> = {
      tiktok: [],
      instagram: [],
      youtube: [],
    };
    for (const row of (replacedRows ?? []) as ReplacedRow[]) {
      const base = { id: row.id, endedAt: row.ended_at, endedReason: row.ended_reason };
      if (row.tiktok_account_id && row.tiktok_accounts?.tiktok_username) {
        previousAccounts.tiktok.push({ ...base, username: row.tiktok_accounts.tiktok_username });
      } else if (row.instagram_account_id && row.instagram_accounts?.instagram_username) {
        previousAccounts.instagram.push({ ...base, username: row.instagram_accounts.instagram_username });
      } else if (row.youtube_account_id && row.youtube_accounts?.youtube_username) {
        previousAccounts.youtube.push({ ...base, username: row.youtube_accounts.youtube_username });
      }
    }

    const defaultLang = config?.defaultLang ?? 'en';
    const content = config?.content?.[defaultLang];

    // Strip accessCode (sensitive) but keep education + appAccess for the creator brief
    let portalConfig = null;
    if (config) {
      const { accessCode: _, ...safe } = config;
      portalConfig = safe;
    }

    return Response.json({
      managedCreator: {
        id: mc.id,
        status: mc.status ?? 'applied',
        videosComplete: mc.videos_complete ?? false,
        tiktokUsername: mc.tiktok_username,
        instagramUsername: mc.instagram_username,
        youtubeUsername: mc.youtube_username,
        contractAcceptedAt: mc.contract_accepted_at,
        contractSignerName: mc.contract_signer_name,
        contractVersion: mc.contract_version,
        basePay: mc.base_pay,
        monthlyPayoutCap,
        onboardingStartedAt: mc.onboarding_started_at,
      },
      org: {
        name: org.organization_name,
        slug: org.organization_slug,
        logo: org.company_logo,
        website: org.website,
      },
      targetCountry,
      portalConfig,
      referenceVideos,
      briefVideos,
      trackedPlatforms: {
        tiktok: trackedAccounts?.some(a => a.tiktok_account_id != null) ?? false,
        instagram: trackedAccounts?.some(a => a.instagram_account_id != null) ?? false,
        youtube: trackedAccounts?.some(a => a.youtube_account_id != null) ?? false,
      },
      previousAccounts,
      currency: (content?.compensation?.currency ?? 'USD').toUpperCase(),
      resources: content?.resources ?? '',
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/creator/workspace/[brandSlug]',
      method: 'GET',
    });
  }
}
