import { NextRequest } from 'next/server';
import { getUser } from '@/lib/modules/auth/queries';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { linkSocialAccountToBrand } from '@/lib/db/tracked-social-accounts';
import { SUPABASE_URL, EDGE_AUTH_KEY } from '@/lib/env';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

/**
 * Trigger account data sync via edge function.
 */
export async function triggerAccountSync(
  platform: 'tiktok' | 'instagram' | 'youtube',
  username: string,
  accountId: string,
  syncJobId?: string
): Promise<void> {
  const supabaseUrl =
    SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const edgeFunctionName = { tiktok: 'fetch-accounts-and-35-posts', instagram: 'fetch-instagram-account-reels', youtube: 'fetch-youtube-account-shorts' }[platform];
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/${edgeFunctionName}`;

  fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EDGE_AUTH_KEY}`,
    },
    body: JSON.stringify({
      ...(platform === 'youtube' ? { handle: username } : { username }),
      tracked_account_id: accountId,
      job_id: syncJobId,
    }),
  }).catch(captureFireAndForget('managed_creator_webhook'));
}

/**
 * Link a managed creator's account to BTSA and optionally trigger sync.
 */
export async function linkAccountToBrandAndSync(
  supabase: ReturnType<typeof createServiceRoleClient>,
  brandOrgId: string,
  platform: 'tiktok' | 'instagram' | 'youtube',
  username: string,
  accountId: string,
  wasNewlyCreated: boolean
): Promise<void> {
  const { data: syncJob } = await supabase
    .from('sync_jobs')
    .insert({ account_id: accountId, status: 'pending' })
    .select('id')
    .single();

  const linkResult = await linkSocialAccountToBrand(supabase, {
    brandOrganizationId: brandOrgId,
    socialAccountId: accountId,
    platform,
    campaign: 'general',
  });

  if (linkResult.isNewLink || wasNewlyCreated) {
    await triggerAccountSync(platform, username, accountId, syncJob?.id);
  }
}

type BrandContextSuccess = {
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>;
  supabase: ReturnType<typeof createServiceRoleClient>;
  brandId: string | null;
  isAdmin: boolean;
};

type BrandContextError = {
  error: string;
  status: number;
};

export type BrandContext = BrandContextSuccess | BrandContextError;

/**
 * Get the brand context for the current request.
 * Supports:
 * 1. Admin viewing as brand (x-admin-view-as-brand header)
 * 2. Brand admin (from brand_members table)
 */
export async function getBrandContext(request: NextRequest): Promise<BrandContext> {
  const user = await getUser();
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const supabase = createServiceRoleClient();

  const { data: userData } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.account_type === 'admin';

  const viewAsBrandId = request.headers.get('x-admin-view-as-brand');
  if (viewAsBrandId && isAdmin) {
    return { user, supabase, brandId: viewAsBrandId, isAdmin: true };
  }

  if (isAdmin) {
    return { user, supabase, brandId: null, isAdmin: true };
  }

  const { data: brandMember } = await supabase
    .from('brand_members')
    .select('brand_organization_id, role')
    .eq('user_id', user.id)
    .single();

  if (!brandMember || (brandMember.role !== 'owner' && brandMember.role !== 'admin')) {
    return { error: 'Forbidden: Admin access required', status: 403 };
  }

  return { user, supabase, brandId: brandMember.brand_organization_id, isAdmin: false };
}

export async function getCreatorWithBrand(
  supabase: ReturnType<typeof createServiceRoleClient>,
  creatorId: string,
  brandId: string | null,
  isAdmin: boolean
) {
  const { data: creator, error } = await supabase
    .from('managed_creators')
    .select('id, brand_organization_id')
    .eq('id', creatorId)
    .single();

  if (error || !creator) {
    return { error: 'Creator not found', status: 404 };
  }

  if (!isAdmin && (!brandId || creator.brand_organization_id !== brandId)) {
    return { error: 'Access denied', status: 403 };
  }

  return { creator };
}
