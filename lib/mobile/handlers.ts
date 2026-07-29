/**
 * Mobile API handler functions.
 *
 * These replicate the business logic from /api/* routes but authenticate via
 * Supabase JWT (getMobileUser) and query the database with the service-role
 * client (bypasses RLS). Because RLS is bypassed, every query MUST be manually
 * scoped to the authenticated user.
 */

import { createServiceRoleClient } from '@/lib/db/supabase';
import type { User } from '@/lib/db/types';
import { getMobileCreatorProfile } from './auth';
import { getOnboardingStorageUrl } from '@/lib/storage/url';
import * as Sentry from '@sentry/nextjs';
import {
  getCreatorProfile as getCreatorProfileService,
  updateCreatorProfile as updateCreatorProfileService,
  updateLanguages as updateLanguagesService,
  getManagedStatus as getManagedStatusService,
  updateCreatorProfileInputSchema,
  updateLanguagesInputSchema,
} from '@/lib/services/creator-profile';
import {
  getWalletDashboard,
  requestStripePayout,
  createStripeConnectLink,
  requestStripePayoutInputSchema,
  createStripeConnectInputSchema,
} from '@/lib/services/wallet';
import {
  applyToJob as applyToJobService,
  listMyApplications,
  getApplicationVideo as getApplicationVideoService,
} from '@/lib/services/applications';
import {
  listJobs,
  getJobDetail,
} from '@/lib/services/jobs';
import type { ServiceContext } from '@/lib/services/_types';
import { isServiceError } from '@/lib/services/_types';
import { deleteUserAccount } from '@/lib/modules/auth/delete-account';
import {
  buildManagedCreatorPostFilters,
  resolveManagedCreatorPostAccess,
} from '@/lib/modules/creator/post-filters';
import { triggerAccountSync } from '@/lib/modules/managed-creators/api-helpers';
import { createRateLimiter } from '@/lib/modules/phone-verification/rate-limit';
import { getReferenceVideos } from '@/lib/modules/portal/queries';
import { normalizeResources } from '@/lib/modules/portal/types';
import type { PortalContent } from '@/lib/modules/portal/types';

// In-memory, per-Lambda-instance limiter. Best-effort guard against spam from
// the mobile sync button — survives warm requests but resets on cold start.
const creatorSyncLimiter = createRateLimiter(3, 60_000);

function buildMobileContext(user: User): ServiceContext {
  return {
    user: { id: user.id, email: user.email, share_code: user.share_code },
    supabase: createServiceRoleClient(),
  };
}

function serviceErrorResponse(error: unknown, fallbackMessage = 'Internal server error'): Response {
  if (isServiceError(error)) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallbackMessage }, { status: 500 });
}

function captureMobileError(error: unknown, context: string): void {
  try {
    Sentry.captureException(error, { tags: { handler: context, source: "mobile_api" } });
  } catch {}
}

function objectProp(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined;
}

function getPortalContent(portalConfig: unknown): unknown {
  const defaultLang = objectProp(portalConfig, 'defaultLang');
  const lang = typeof defaultLang === 'string' ? defaultLang : 'en';
  return objectProp(objectProp(portalConfig, 'content'), lang) ?? null;
}

function getContentCurrency(content: unknown): string {
  const currency = objectProp(objectProp(content, 'compensation'), 'currency');
  return typeof currency === 'string' ? currency : 'usd';
}

function getContentResources(content: unknown): PortalContent['resources'] {
  const resources = objectProp(content, 'resources');
  if (typeof resources === 'string') {
    return resources;
  }
  if (Array.isArray(resources)) {
    return resources.flatMap((item) => {
      const title = objectProp(item, 'title');
      const url = objectProp(item, 'url');
      if (typeof title !== 'string' || typeof url !== 'string') return [];
      const description = objectProp(item, 'description');
      return [
        {
          title,
          url,
          ...(typeof description === 'string' ? { description } : {}),
        },
      ];
    });
  }
  return undefined;
}

function stripPortalAccessCode(portalConfig: unknown): Record<string, unknown> | null {
  if (!portalConfig || typeof portalConfig !== 'object') return null;
  return Object.fromEntries(
    Object.entries(portalConfig).filter(([key]) => key !== 'accessCode')
  );
}

// ================================================================
// APP VERSION CHECK
// ================================================================

const MIN_APP_VERSION = '1.0.0';

export async function handleVersionCheck(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') ?? 'unknown';

  return Response.json({
    minVersion: MIN_APP_VERSION,
    platform,
    updateUrl: platform === 'ios'
      ? 'https://apps.apple.com/app/8x/id0000000000'
      : 'https://play.google.com/store/apps/details?id=com.eryndorrr.eightx',
  });
}

// ================================================================
// JOBS
// ================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleGetJobDetail(user: User, jobIdOrSlug: string): Promise<Response> {
  try {
    // Shared `getJobDetail` matches by UUID. Universal-link taps land us on
    // /job/{job_slug} (web URL shape) instead of a UUID, so do a slug→id
    // resolution here when the param doesn't look like a UUID. Mobile-only —
    // we keep `lib/services/jobs.ts` untouched.
    let jobId = jobIdOrSlug;
    if (!UUID_RE.test(jobIdOrSlug)) {
      const supabase = createServiceRoleClient();
      const { data: row } = await supabase
        .from('jobs')
        .select('id')
        .eq('job_slug', jobIdOrSlug)
        .maybeSingle();
      if (!row) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }
      jobId = row.id;
    }
    const job = await getJobDetail(buildMobileContext(user), jobId);
    return Response.json(job);
  } catch (error) {
    captureMobileError(error, 'handleGetJobDetail');
    return serviceErrorResponse(error);
  }
}

export async function handleGetJobs(user: User, request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '12', 10)));
    const usePagination = searchParams.get('page') !== null;
    const filterCountries: string[] =
      searchParams
        .get('countries')
        ?.split(',')
        .map((c) => c.trim())
        .filter(Boolean) || [];
    const countryIso = searchParams.get('country_iso');

    const result = await listJobs(buildMobileContext(user), {
      page,
      limit,
      usePagination,
      filterCountries,
      countryIso,
    });
    return Response.json(result);
  } catch (error) {
    captureMobileError(error, 'handleGetJobs');
    return serviceErrorResponse(error, 'Failed to fetch jobs');
  }
}

export async function handleApplyToJob(
  user: User,
  request: Request,
  jobId: string
): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const { result } = await applyToJobService(
      buildMobileContext(user),
      {
        jobId: jobId.trim(),
        cover_letter: typeof body.cover_letter === 'string' ? body.cover_letter : null,
        burner_account_id:
          typeof body.burner_account_id === 'string' ? body.burner_account_id.trim() : null,
      },
      // Preserve pre-refactor mobile behaviour: only featured (portal-config)
      // CPM jobs auto-approve. Web has never had this gate.
      { requirePortalConfigForAutoApprove: true }
    );
    return Response.json(result);
  } catch (error) {
    captureMobileError(error, 'handleApplyToJob');
    if (isServiceError(error)) {
      const payload: Record<string, unknown> = { success: false, error: error.message };
      if (error.details?.message) payload.message = error.details.message;
      return Response.json(payload, { status: error.status });
    }
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ================================================================
// APPLICATIONS
// ================================================================

export async function handleGetApplications(user: User): Promise<Response> {
  try {
    const items = await listMyApplications(buildMobileContext(user));
    return Response.json(items);
  } catch (error) {
    captureMobileError(error, 'handleGetApplications');
    return Response.json([], { status: 200 });
  }
}

// ================================================================
// CREATOR PROFILE
// ================================================================

export async function handleGetCreatorProfile(user: User): Promise<Response> {
  try {
    const profile = await getCreatorProfileService(buildMobileContext(user));
    return Response.json(profile);
  } catch (error) {
    captureMobileError(error, 'handleGetCreatorProfile');
    return serviceErrorResponse(error);
  }
}

export async function handleUpdateCreatorProfile(
  user: User,
  request: Request
): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = updateCreatorProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }
    await updateCreatorProfileService(buildMobileContext(user), parsed.data, { upsert: true });
    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, 'handleUpdateCreatorProfile');
    return serviceErrorResponse(error);
  }
}

export async function handleUpdateLanguages(user: User, request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = updateLanguagesInputSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'languages must be an array of 1-10 items' },
        { status: 400 }
      );
    }
    await updateLanguagesService(buildMobileContext(user), parsed.data.languages);
    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, 'handleUpdateLanguages');
    return serviceErrorResponse(error);
  }
}

// ================================================================
// CREATOR COURSE
// ================================================================

export async function handleGetCourse(user: User): Promise<Response> {
  return Response.json({
    completedAt: user.course_completed_at ?? null,
    timeSpentSeconds: user.course_time_spent_seconds ?? 0,
    completedSteps: (user.course_completed_steps as string[] | null) ?? [],
  });
}

export async function handleUpdateCourse(user: User, request: Request): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { action } = body;

    if (action === 'heartbeat') {
      const seconds =
        typeof body.seconds === 'number' ? Math.min(Math.max(body.seconds, 0), 120) : 30;

      const { error } = await supabase
        .from('users')
        .update({
          course_time_spent_seconds: (user.course_time_spent_seconds ?? 0) + seconds,
        })
        .eq('id', user.id);

      if (error) {
        return Response.json({ error: 'Failed to update time' }, { status: 500 });
      }
      return Response.json({ success: true });
    }

    if (action === 'complete-step') {
      const stepId = body.stepId;
      if (typeof stepId !== 'string') {
        return Response.json({ error: 'stepId is required' }, { status: 400 });
      }
      const existing: string[] = Array.isArray(user.course_completed_steps)
        ? (user.course_completed_steps as string[])
        : [];
      if (!existing.includes(stepId)) {
        existing.push(stepId);
      }
      const { error } = await supabase
        .from('users')
        .update({ course_completed_steps: existing })
        .eq('id', user.id);
      if (error) {
        return Response.json({ error: 'Failed to save step progress' }, { status: 500 });
      }
      return Response.json({ success: true, completedSteps: existing });
    }

    if (action === 'complete') {
      const completedAt = new Date().toISOString();

      const { error } = await supabase
        .from('users')
        .update({ course_completed_at: completedAt })
        .eq('id', user.id);

      if (error) {
        return Response.json({ error: 'Failed to complete course' }, { status: 500 });
      }

      // Update all managed_creators for this user
      await supabase
        .from('managed_creators')
        .update({ base_course_status: 'completed' })
        .eq('linked_user_id', user.id);

      return Response.json({ success: true, completedAt });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    captureMobileError(error, "handleUpdateCourse");
    console.error('[mobile/course] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// MANAGED STATUS
// ================================================================

export async function handleManagedStatus(user: User): Promise<Response> {
  try {
    const status = await getManagedStatusService(buildMobileContext(user));
    return Response.json(status);
  } catch (error) {
    captureMobileError(error, 'handleManagedStatus');
    return serviceErrorResponse(error, 'Failed to fetch managed status');
  }
}

// ================================================================
// WALLET DASHBOARD
// ================================================================

export async function handleGetWallet(user: User): Promise<Response> {
  try {
    const dashboard = await getWalletDashboard(buildMobileContext(user));
    return Response.json(dashboard);
  } catch (error) {
    captureMobileError(error, 'handleGetWallet');
    return serviceErrorResponse(error);
  }
}

// ================================================================
// STRIPE PAYOUT
// ================================================================

export async function handleStripePayout(user: User, request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = requestStripePayoutInputSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.errors[0].message ?? 'Invalid payout method' },
        { status: 400 }
      );
    }
    const result = await requestStripePayout(buildMobileContext(user), parsed.data);
    return Response.json(result);
  } catch (error) {
    captureMobileError(error, 'handleStripePayout');
    if (isServiceError(error)) {
      if (error.details?.available_balance != null) {
        return Response.json(
          { error: error.message, available_balance: error.details.available_balance },
          { status: error.status }
        );
      }
      return Response.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Payout failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ================================================================
// STRIPE CONNECT (account onboarding)
// ================================================================

export async function handleStripeConnect(user: User, request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createStripeConnectInputSchema.safeParse(body);
    const input = parsed.success ? parsed.data : {};
    const result = await createStripeConnectLink(buildMobileContext(user), input);
    return Response.json(result);
  } catch (error) {
    captureMobileError(error, 'handleStripeConnect');
    if (isServiceError(error)) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Failed to create Stripe link';
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ================================================================
// PUSH NOTIFICATIONS
// ================================================================

export async function handleRegisterPushToken(user: User, request: Request): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { token, platform } = body;

    if (!token || typeof token !== 'string') {
      return Response.json({ error: 'token is required' }, { status: 400 });
    }

    // Upsert push token — one per user per device
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform: platform ?? 'expo',
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );

    if (error) {
      // Table might not exist yet — create it
      console.warn('[mobile/push-token] Upsert error (table may not exist):', error.message);
      return Response.json({ success: true, warning: 'Token saved (best-effort)' });
    }

    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, "handleRegisterPushToken");
    console.error('[mobile/push-token] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function handleDeactivatePushTokens(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('push_tokens')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) {
      console.warn('[mobile/push-token] Deactivate error:', error.message);
    }

    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, "handleDeactivatePushTokens");
    console.error('[mobile/push-token] Deactivate error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface MessageNotificationRow {
  id: string;
  brand_organization_id: string | null;
  sender_user_id: string | null;
  event_type: string | null;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export async function handleGetNotifications(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    // Notifications feed = inbound only. Excludes the creator's own outbound
    // replies (sender_user_id = self), which live in the chat thread UI.
    const { data, error } = await supabase
      .from('messages')
      .select('id, brand_organization_id, sender_user_id, event_type, body, data, read_at, created_at')
      .eq('user_id', user.id)
      .or(`sender_user_id.is.null,sender_user_id.neq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[mobile/notifications] Error:', error.message);
      return Response.json({ data: [], unread_count: 0 });
    }

    const rows = (data ?? []) as unknown as MessageNotificationRow[];
    const unreadCount = rows.filter((r) => !r.read_at).length;

    // Hydrate brand_slug + brand_name for in-app routing (lets the inbox row
    // tap-handler deep-link straight to /workspace/[brandSlug] for application
    // / video / payment events). Matches the push-side enrichment in
    // `~/8x/lib/messaging/fanout.ts`.
    const brandIds = [
      ...new Set(rows.map((r) => r.brand_organization_id).filter((id): id is string => !!id)),
    ];
    const { data: brands } = brandIds.length
      ? await supabase
          .from('brand_organizations')
          .select('id, organization_name, organization_slug, company_logo')
          .in('id', brandIds)
      : {
          data: [] as {
            id: string;
            organization_name: string | null;
            organization_slug: string | null;
            company_logo: string | null;
          }[],
        };
    const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

    return Response.json({
      data: rows.map((r) => {
        const brand = r.brand_organization_id ? brandById.get(r.brand_organization_id) : null;
        return {
          id: r.id,
          type: r.event_type ?? (r.sender_user_id ? 'message' : 'general'),
          title: '',
          body: r.body,
          data: {
            ...(r.data ?? {}),
            brand_organization_id: r.brand_organization_id,
            brand_slug: brand?.organization_slug ?? null,
            brand_name: brand?.organization_name ?? null,
            brand_logo: brand?.company_logo ?? null,
            sender_user_id: r.sender_user_id,
          },
          read_at: r.read_at,
          created_at: r.created_at,
        };
      }),
      unread_count: unreadCount,
    });
  } catch (error) {
    captureMobileError(error, 'handleGetNotifications');
    console.error('[mobile/notifications] Error:', error);
    return Response.json({ data: [], unread_count: 0 });
  }
}

export async function handleMarkNotificationRead(user: User, request: Request): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json().catch(() => ({}));
    const { notification_ids } = body as { notification_ids?: unknown };
    const now = new Date().toISOString();

    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      // Mark all inbound unread messages as read. Done in two steps because
      // PostgREST `.or()` on UPDATE with non-PK columns fails (CLAUDE.md);
      // SELECT the IDs first, then UPDATE by id.in.
      const { data: ids } = await supabase
        .from('messages')
        .select('id')
        .eq('user_id', user.id)
        .is('read_at', null)
        .or(`sender_user_id.is.null,sender_user_id.neq.${user.id}`);
      if (ids && ids.length > 0) {
        await supabase
          .from('messages')
          .update({ read_at: now })
          .in('id', ids.map((row) => row.id));
      }
    } else {
      await supabase
        .from('messages')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .in('id', notification_ids as string[]);
    }

    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, 'handleMarkNotificationRead');
    console.error('[mobile/notifications] Error:', error);
    return Response.json({ success: true });
  }
}

/** Lightweight endpoint: returns only the unread inbound message count. */
export async function handleGetUnreadCount(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
      .or(`sender_user_id.is.null,sender_user_id.neq.${user.id}`);

    if (error) {
      return Response.json({ unread_count: 0 });
    }
    return Response.json({ unread_count: count ?? 0 });
  } catch {
    return Response.json({ unread_count: 0 });
  }
}

// ================================================================
// PROFILE PICTURE UPLOAD
// ================================================================

export async function handleUploadProfilePicture(
  user: User,
  request: Request
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Parse multipart form data
    const formData = await request.formData();
    const photo = formData.get('photo') as File | null;

    if (!photo) {
      return Response.json({ error: 'photo field is required' }, { status: 400 });
    }

    // Validate file type
    const mimeType = photo.type || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return Response.json({ error: 'Only JPEG, PNG, and WebP images are supported' }, { status: 400 });
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `${user.id}/${Date.now()}.${ext}`;

    // Convert File to ArrayBuffer then Buffer
    const arrayBuffer = await photo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    console.log('[mobile/profile-picture] Uploading to profile-photos:', filePath, 'size:', buffer.length, 'type:', mimeType);
    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[mobile/profile-picture] Upload error:', JSON.stringify(uploadError));
      return Response.json({ error: 'Failed to upload image: ' + (uploadError.message || 'unknown') }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Update creator_profiles
    console.log('[mobile/profile-picture] Updating creator_profiles for user_id:', user.id, 'url:', publicUrl);
    const { data: updateData, error: updateError } = await supabase
      .from('creator_profiles')
      .update({ profile_picture: publicUrl })
      .eq('user_id', user.id)
      .select('id, user_id, profile_picture');

    if (updateError) {
      console.error('[mobile/profile-picture] DB update error:', updateError);
      return Response.json({ error: 'Failed to update profile picture' }, { status: 500 });
    }

    if (!updateData || updateData.length === 0) {
      console.warn('[mobile/profile-picture] No rows updated for user_id:', user.id, '— creator_profiles row may not exist or user_id mismatch');
    } else {
      console.log('[mobile/profile-picture] Updated', updateData.length, 'row(s)');
    }

    return Response.json({ success: true, url: publicUrl });
  } catch (error) {
    captureMobileError(error, "handleUploadProfilePicture");
    console.error('[mobile/profile-picture] Unexpected error:', error instanceof Error ? error.stack : error);
    return Response.json({ error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

// ================================================================
// BURNER ACCOUNTS
// ================================================================

/**
 * List all burner accounts for the authenticated user.
 * GET /api/mobile/burner-accounts
 */
export async function handleListBurnerAccounts(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('burner_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[burner-accounts] list error:', error);
      return Response.json({ error: 'Failed to fetch burner accounts' }, { status: 500 });
    }

    // Map DB rows → frontend shape
    const accounts = (data ?? []).map((row: any) => ({
      id: row.id,
      handle: row.handle,
      platform: row.platform,
      status: row.status,
      warmupScore: row.warmup_score,
      postsCount: row.posts_count,
      followersCount: row.followers_count,
      assignedCampaign: row.assigned_campaign || null,
      createdDaysAgo: Math.max(
        0,
        Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86_400_000),
      ),
    }));

    return Response.json({ data: accounts });
  } catch (err) {
    captureMobileError(err, "handleListBurnerAccounts");
    console.error('[burner-accounts] list exception:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Create a new burner account.
 * POST /api/mobile/burner-accounts
 *
 * Body: { handle, platform, assignedCampaign? }
 */
export async function handleCreateBurnerAccount(
  user: User,
  request: Request,
): Promise<Response> {
  try {
    const body = await request.json();
    const { handle, platform, assignedCampaign } = body;

    // ── Validation ────────────────────────────────────────────────────
    if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
      return Response.json({ error: 'Handle is required' }, { status: 400 });
    }

    const VALID_PLATFORMS = ['TikTok', 'Instagram', 'YouTube'];
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return Response.json(
        { error: `Platform must be one of: ${VALID_PLATFORMS.join(', ')}` },
        { status: 400 },
      );
    }

    const cleanHandle = handle.trim().replace(/^@/, '');
    if (cleanHandle.length < 2 || cleanHandle.length > 60) {
      return Response.json(
        { error: 'Handle must be between 2 and 60 characters' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    // Resolve creator_profile_id (optional enrichment)
    const profile = await getMobileCreatorProfile(user.id);

    const { data, error } = await supabase
      .from('burner_accounts')
      .insert({
        user_id: user.id,
        creator_profile_id: profile?.id ?? null,
        handle: cleanHandle,
        platform,
        status: 'warming',
        warmup_score: 0,
        posts_count: 0,
        followers_count: 0,
        assigned_campaign: assignedCampaign?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      // Unique constraint violation → duplicate handle+platform
      if (error.code === '23505') {
        return Response.json(
          { error: `You already have a ${platform} burner with handle @${cleanHandle}` },
          { status: 409 },
        );
      }
      console.error('[burner-accounts] create error:', error);
      return Response.json({ error: 'Failed to create burner account' }, { status: 500 });
    }

    const account = {
      id: data.id,
      handle: data.handle,
      platform: data.platform,
      status: data.status,
      warmupScore: data.warmup_score,
      postsCount: data.posts_count,
      followersCount: data.followers_count,
      assignedCampaign: data.assigned_campaign || null,
      createdDaysAgo: 0,
    };

    return Response.json({ data: account }, { status: 201 });
  } catch (err) {
    captureMobileError(err, "handleCreateBurnerAccount");
    console.error('[burner-accounts] create exception:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Update a burner account (status, metrics, campaign assignment).
 * PATCH /api/mobile/burner-accounts/:id
 *
 * Body: { status?, warmupScore?, postsCount?, followersCount?, assignedCampaign?, handle? }
 */
export async function handleUpdateBurnerAccount(
  user: User,
  request: Request,
  accountId: string,
): Promise<Response> {
  try {
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // Build update payload with only supplied fields
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      const VALID_STATUSES = ['active', 'warming', 'cold'];
      if (!VALID_STATUSES.includes(body.status)) {
        return Response.json(
          { error: `Status must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 },
        );
      }
      updates.status = body.status;
    }

    if (body.warmupScore !== undefined) {
      const score = Number(body.warmupScore);
      if (isNaN(score) || score < 0 || score > 100) {
        return Response.json({ error: 'warmupScore must be 0–100' }, { status: 400 });
      }
      updates.warmup_score = score;
    }

    if (body.postsCount !== undefined) {
      const count = Number(body.postsCount);
      if (isNaN(count) || count < 0) {
        return Response.json({ error: 'postsCount must be >= 0' }, { status: 400 });
      }
      updates.posts_count = count;
    }

    if (body.followersCount !== undefined) {
      const count = Number(body.followersCount);
      if (isNaN(count) || count < 0) {
        return Response.json({ error: 'followersCount must be >= 0' }, { status: 400 });
      }
      updates.followers_count = count;
    }

    if (body.assignedCampaign !== undefined) {
      updates.assigned_campaign = body.assignedCampaign?.trim() || null;
    }

    if (body.handle !== undefined) {
      const cleanHandle = String(body.handle).trim().replace(/^@/, '');
      if (cleanHandle.length < 2 || cleanHandle.length > 60) {
        return Response.json(
          { error: 'Handle must be between 2 and 60 characters' },
          { status: 400 },
        );
      }
      updates.handle = cleanHandle;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('burner_accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('user_id', user.id) // ownership guard
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return Response.json(
          { error: 'A burner with that handle already exists on this platform' },
          { status: 409 },
        );
      }
      console.error('[burner-accounts] update error:', error);
      return Response.json({ error: 'Failed to update burner account' }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: 'Burner account not found' }, { status: 404 });
    }

    const account = {
      id: data.id,
      handle: data.handle,
      platform: data.platform,
      status: data.status,
      warmupScore: data.warmup_score,
      postsCount: data.posts_count,
      followersCount: data.followers_count,
      assignedCampaign: data.assigned_campaign || null,
      createdDaysAgo: Math.max(
        0,
        Math.floor((Date.now() - new Date(data.created_at).getTime()) / 86_400_000),
      ),
    };

    return Response.json({ data: account });
  } catch (err) {
    captureMobileError(err, "handleUpdateBurnerAccount");
    console.error('[burner-accounts] update exception:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Delete a burner account.
 * DELETE /api/mobile/burner-accounts/:id
 */
export async function handleDeleteBurnerAccount(
  user: User,
  accountId: string,
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { error, count } = await supabase
      .from('burner_accounts')
      .delete({ count: 'exact' })
      .eq('id', accountId)
      .eq('user_id', user.id); // ownership guard

    if (error) {
      console.error('[burner-accounts] delete error:', error);
      return Response.json({ error: 'Failed to delete burner account' }, { status: 500 });
    }

    if (count === 0) {
      return Response.json({ error: 'Burner account not found' }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    captureMobileError(err, "handleDeleteBurnerAccount");
    console.error('[burner-accounts] delete exception:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// TRUST GATE
// ================================================================

/**
 * POST /api/mobile/creator/trust-gate
 * Records that the creator has completed the trust gate (agreed to ToS).
 * Sets trust_gate_completed_at once; subsequent calls are no-ops.
 */
export async function handleTrustGateComplete(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { data: profile, error: fetchError } = await supabase
      .from('creator_profiles')
      .select('id, trust_gate_completed_at')
      .eq('user_id', user.id)
      .single();

    if (fetchError || !profile) {
      return Response.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    if (!profile.trust_gate_completed_at) {
      const { error: updateError } = await supabase
        .from('creator_profiles')
        .update({ trust_gate_completed_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (updateError) {
        return Response.json({ error: 'Failed to record trust gate' }, { status: 500 });
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    captureMobileError(err, "handleTrustGateComplete");
    console.error('[handleTrustGateComplete]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// APPLICATION VIDEO UPLOAD
// ================================================================

/**
 * GET /api/mobile/applications/[id]/video
 * Returns application details and uploaded videos for a given application.
 */
export async function handleGetApplicationVideo(
  user: User,
  applicationId: string,
): Promise<Response> {
  try {
    const result = await getApplicationVideoService(buildMobileContext(user), applicationId);
    return Response.json(result);
  } catch (err) {
    captureMobileError(err, 'handleGetApplicationVideo');
    return serviceErrorResponse(err);
  }
}

/**
 * POST /api/mobile/applications/[id]/video
 * Accepts multipart/form-data with a `video` field.
 * Uploads to Supabase Storage (job-media bucket) and saves URL to DB.
 */
export async function handleUploadApplicationVideo(
  user: User,
  request: Request,
  applicationId: string,
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select(
        `id, job_id, application_status, creator_profile_id,
         creator_profiles!inner(user_id)`
      )
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    const cp = application.creator_profiles as { user_id: string } | null;
    if (!cp || cp.user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const validStatuses = ['pending', 'under_review', 'accepted', 'messaged'];
    if (!validStatuses.includes(application.application_status || '')) {
      return Response.json(
        { error: 'Video upload not allowed for this application status' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const video = formData.get('video') as File | null;
    const videoType = (formData.get('video_type') as string) || 'application'; // 'application' | 'campaign'

    if (!video) {
      return Response.json({ error: 'video field is required' }, { status: 400 });
    }

    if (!['application', 'campaign'].includes(videoType)) {
      return Response.json({ error: 'Invalid video_type. Must be application or campaign' }, { status: 400 });
    }

    const mimeType = video.type || 'video/mp4';
    const validMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
    if (!validMimeTypes.includes(mimeType)) {
      return Response.json(
        { error: 'Invalid video type. Supported: mp4, mov, webm, m4v' },
        { status: 400 }
      );
    }

    const maxSize = 200 * 1024 * 1024; // 200 MB
    if (video.size > maxSize) {
      return Response.json({ error: 'Video must be under 200MB' }, { status: 400 });
    }

    // Count existing videos of the same type to generate numbered filename
    const { count: existingCount } = await supabase
      .from('applications_videos')
      .select('*', { count: 'exact', head: true })
      .eq('application_id', applicationId)
      .eq('video_type', videoType);

    const extMap: Record<string, string> = {
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'video/x-m4v': 'm4v',
    };
    const ext = extMap[mimeType] || 'mp4';
    const videoNumber = (existingCount || 0) + 1;
    const prefix = videoType === 'campaign' ? 'campaign' : 'application';
    const filename =
      videoNumber === 1 ? `${prefix}.${ext}` : `${prefix}-${videoNumber}.${ext}`;

    // Mirror the web storage path: jobs/{jobId}/creators/{userId}/{filename}
    const storagePath = `jobs/${application.job_id}/creators/${user.id}/${filename}`;

    const arrayBuffer = await video.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('job-media')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[mobile/application-video] Upload error:', uploadError);
      return Response.json({ error: 'Failed to upload video' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('job-media')
      .getPublicUrl(storagePath);

    const videoUrl = urlData.publicUrl;

    const { data: videoRecord, error: insertError } = await supabase
      .from('applications_videos')
      .insert({
        application_id: applicationId,
        video_url: videoUrl,
        filename,
        file_size: video.size,
        created_by: user.id,
        video_type: videoType,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[mobile/application-video] Insert error:', insertError);
      return Response.json({ error: 'Failed to save video record' }, { status: 500 });
    }

    // Auto-advance status: pending → under_review on first upload
    let finalStatus = application.application_status;
    if (application.application_status === 'pending') {
      const { error: statusError } = await supabase
        .from('job_applications')
        .update({ application_status: 'under_review' })
        .eq('id', applicationId);
      if (statusError) {
        console.error('[mobile/application-video] Status update error:', statusError);
        return Response.json({ error: 'Video uploaded but failed to update application status' }, { status: 500 });
      }
      finalStatus = 'under_review';
    }

    // Update job_applications.media JSONB to include the new video
    // This ensures the hasVideo flag works on the client side
    const { data: currentApp, error: fetchAppError } = await supabase
      .from('job_applications')
      .select('media')
      .eq('id', applicationId)
      .single();

    if (fetchAppError) {
      console.error('[mobile/application-video] Fetch media error:', fetchAppError);
      return Response.json({ error: 'Video uploaded but failed to read application media' }, { status: 500 });
    }

    const existingMedia = Array.isArray(currentApp?.media) ? currentApp.media : [];
    const updatedMedia = [...existingMedia, { url: videoUrl, type: mimeType, video_type: videoType }];
    const { error: mediaUpdateError } = await supabase
      .from('job_applications')
      .update({ media: updatedMedia })
      .eq('id', applicationId);

    if (mediaUpdateError) {
      console.error('[mobile/application-video] Media update error:', mediaUpdateError);
      return Response.json({ error: 'Video uploaded but failed to update application media' }, { status: 500 });
    }

    return Response.json({
      success: true,
      video: { id: videoRecord.id, url: videoUrl, filename },
      application_status: finalStatus,
    });
  } catch (err) {
    captureMobileError(err, "handleUploadApplicationVideo");
    console.error('[mobile/application-video] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// PRESIGNED VIDEO UPLOAD (bypasses Next.js body size limits)
// ================================================================

/**
 * Step 1: Generate a signed upload URL for Supabase Storage.
 * Mobile uploads directly to storage, then calls confirmVideoUpload.
 */
export async function handleGetVideoUploadUrl(
  user: User,
  request: Request,
  applicationId: string,
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select(
        `id, job_id, application_status, creator_profile_id,
         creator_profiles!inner(user_id)`
      )
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    const cp = application.creator_profiles as { user_id: string } | null;
    if (!cp || cp.user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const validStatuses = ['pending', 'under_review', 'accepted', 'messaged'];
    if (!validStatuses.includes(application.application_status || '')) {
      return Response.json(
        { error: 'Video upload not allowed for this application status' },
        { status: 400 }
      );
    }

    const body = await request.json() as {
      video_type?: string;
      mime_type?: string;
      file_size?: number;
    };

    const videoType = body.video_type || 'application';
    const mimeType = body.mime_type || 'video/mp4';
    const fileSize = body.file_size || 0;

    if (!['application', 'campaign'].includes(videoType)) {
      return Response.json({ error: 'Invalid video_type' }, { status: 400 });
    }

    const validMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
    if (!validMimeTypes.includes(mimeType)) {
      return Response.json(
        { error: 'Invalid video type. Supported: mp4, mov, webm, m4v' },
        { status: 400 }
      );
    }

    const maxSize = 200 * 1024 * 1024;
    if (fileSize > maxSize) {
      return Response.json({ error: 'Video must be under 200MB' }, { status: 400 });
    }

    // Count existing videos to generate filename
    const { count: existingCount } = await supabase
      .from('applications_videos')
      .select('*', { count: 'exact', head: true })
      .eq('application_id', applicationId)
      .eq('video_type', videoType);

    const extMap: Record<string, string> = {
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'video/x-m4v': 'm4v',
    };
    const ext = extMap[mimeType] || 'mp4';
    const videoNumber = (existingCount || 0) + 1;
    const prefix = videoType === 'campaign' ? 'campaign' : 'application';
    const filename =
      videoNumber === 1 ? `${prefix}.${ext}` : `${prefix}-${videoNumber}.${ext}`;

    const storagePath = `jobs/${application.job_id}/creators/${user.id}/${filename}`;

    const { data: signedData, error: signedError } = await supabase.storage
      .from('job-media')
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (signedError || !signedData) {
      console.error('[mobile/video-upload-url] Signed URL error:', signedError);
      return Response.json({ error: 'Failed to create upload URL' }, { status: 500 });
    }

    return Response.json({
      signed_url: signedData.signedUrl,
      token: signedData.token,
      storage_path: storagePath,
      filename,
      video_type: videoType,
      mime_type: mimeType,
    });
  } catch (err) {
    captureMobileError(err, "handleGetVideoUploadUrl");
    console.error('[mobile/video-upload-url] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Step 2: Confirm that a video was uploaded via presigned URL.
 * Creates the applications_videos record and updates application status.
 */
export async function handleConfirmVideoUpload(
  user: User,
  request: Request,
  applicationId: string,
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Verify application belongs to user
    const { data: application, error: appError } = await supabase
      .from('job_applications')
      .select(
        `id, job_id, application_status, creator_profile_id,
         creator_profiles!inner(user_id)`
      )
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    const cp = application.creator_profiles as { user_id: string } | null;
    if (!cp || cp.user_id !== user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json() as {
      storage_path: string;
      filename: string;
      video_type: string;
      file_size: number;
      mime_type: string;
    };

    const { storage_path, filename, video_type, file_size, mime_type } = body;

    if (!storage_path || !filename) {
      return Response.json({ error: 'storage_path and filename are required' }, { status: 400 });
    }

    // Validate storage_path: must match expected prefix, reject traversal
    // sequences (raw or URL-encoded), and reject path separators in filename.
    const expectedPrefix = `jobs/${application.job_id}/creators/${user.id}/`;
    const decodedPath = decodeURIComponent(storage_path);
    const decodedFilename = decodeURIComponent(filename);
    if (
      !decodedPath.startsWith(expectedPrefix) ||
      decodedPath.includes('..') ||
      decodedFilename.includes('/') ||
      decodedFilename.includes('\\') ||
      decodedFilename.includes('..')
    ) {
      return Response.json({ error: 'Invalid storage path' }, { status: 400 });
    }

    // Use decoded values for storage operations to prevent double-decode
    // attacks (e.g. %252e%252e → %2e%2e → ..).
    const { data: fileList } = await supabase.storage
      .from('job-media')
      .list(decodedPath.substring(0, decodedPath.lastIndexOf('/')), {
        search: decodedFilename,
      });

    if (!fileList || fileList.length === 0) {
      return Response.json({ error: 'Video file not found in storage' }, { status: 400 });
    }

    const { data: urlData } = supabase.storage
      .from('job-media')
      .getPublicUrl(decodedPath);

    const videoUrl = urlData.publicUrl;

    const { data: videoRecord, error: insertError } = await supabase
      .from('applications_videos')
      .insert({
        application_id: applicationId,
        video_url: videoUrl,
        filename,
        file_size: file_size || 0,
        created_by: user.id,
        video_type: video_type || 'application',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[mobile/confirm-video] Insert error:', insertError);
      return Response.json({ error: 'Failed to save video record' }, { status: 500 });
    }

    // Auto-advance status: pending → under_review on first upload
    if (application.application_status === 'pending') {
      await supabase
        .from('job_applications')
        .update({ application_status: 'under_review' })
        .eq('id', applicationId);
    }

    // Update job_applications.media JSONB
    const { data: currentApp } = await supabase
      .from('job_applications')
      .select('media')
      .eq('id', applicationId)
      .single();

    const existingMedia = Array.isArray(currentApp?.media) ? currentApp.media : [];
    const updatedMedia = [...existingMedia, { url: videoUrl, type: mime_type || 'video/mp4', video_type }];
    await supabase
      .from('job_applications')
      .update({ media: updatedMedia })
      .eq('id', applicationId);

    return Response.json({
      success: true,
      video: { id: videoRecord.id, url: videoUrl, filename },
      application_status:
        application.application_status === 'pending' ? 'under_review' : application.application_status,
    });
  } catch (err) {
    captureMobileError(err, "handleConfirmVideoUpload");
    console.error('[mobile/confirm-video] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// BRAND REFERENCE VIDEOS
// ================================================================

export async function handleGetBrandReferenceVideos(
  user: User,
  brandOrgId: string
): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Authorization: user must be a brand member of this org, OR a creator
    // with at least one job application for a job belonging to this brand.
    const [{ data: brandMember }, { data: creatorProfile }] = await Promise.all([
      supabase
        .from('brand_members')
        .select('id')
        .eq('brand_organization_id', brandOrgId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (!brandMember) {
      if (!creatorProfile) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { data: creatorApplication } = await supabase
        .from('job_applications')
        .select('id, jobs!inner(brand_organization_id)')
        .eq('creator_profile_id', creatorProfile.id)
        .eq('jobs.brand_organization_id', brandOrgId)
        .limit(1)
        .maybeSingle();
      if (!creatorApplication) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: videos, error } = await supabase
      .from('brand_reference_videos')
      .select('id, storage_path, video_url, transcript, notes, music, onscreen_text, category, adaptation, disclaimer, sort_order, promoted_onboarding, promoted_brief, promoted_job_listing')
      .eq('brand_organization_id', brandOrgId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[mobile/reference-videos] Error:', error);
      return Response.json({ error: 'Failed to fetch reference videos' }, { status: 500 });
    }

    const items = (videos || []).map((v) => ({
      id: v.id,
      video_url: v.video_url || (v.storage_path
        ? getOnboardingStorageUrl(v.storage_path)
        : null),
      transcript: v.transcript,
      notes: v.notes,
      music: v.music,
      onscreen_text: v.onscreen_text,
      category: v.category,
      adaptation: v.adaptation,
      disclaimer: v.disclaimer,
      sort_order: v.sort_order,
      promoted_onboarding: v.promoted_onboarding,
      promoted_brief: v.promoted_brief,
      promoted_job_listing: v.promoted_job_listing,
    }));

    return Response.json({ data: items });
  } catch (err) {
    captureMobileError(err, "handleGetBrandReferenceVideos");
    console.error('[mobile/reference-videos] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// PLATFORM INTRO VIDEO
// ================================================================

export async function handleGetIntroVideo(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    // Check brand_reference_videos for promoted_onboarding videos (platform intro)
    const { data: introVideos } = await supabase
      .from('brand_reference_videos')
      .select('id, video_url, storage_path, transcript')
      .eq('promoted_onboarding', true)
      .order('sort_order', { ascending: true })
      .limit(1);

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const video = introVideos?.[0];
    const videoUrl = video?.video_url || (video?.storage_path
      ? `${SUPABASE_URL}/storage/v1/object/public/intro-videos/${video.storage_path}`
      : null);

    return Response.json({
      video_url: videoUrl,
      transcript: video?.transcript ?? null,
    });
  } catch (err) {
    captureMobileError(err, "handleGetIntroVideo");
    console.error('[mobile/intro-video] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// CREATOR WORKSPACE
// ================================================================

export async function handleGetWorkspace(user: User, brandSlug: string): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();

    const { data: org } = await supabase
      .from('brand_organizations')
      .select('id, organization_name, organization_slug, website, company_logo')
      .eq('organization_slug', brandSlug)
      .single();

    if (!org) {
      return Response.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Pull every managed_creators row for this user × brand pair, then pick
    // the most relevant one. Mirrors web's `getManagedStatus` + `BrandJobsPage`
    // gate: a job-attached row is only a valid workspace target when the
    // linked job has a `portal_config`. Rows pointing at a non-portal job are
    // filtered out — same shape as web hiding the gig from `status.brands`,
    // which causes BrandJobsPage to fall through to "Campaign not found".
    const [mcResult, jobResult] = await Promise.all([
      supabase
        .from('managed_creators')
        .select('id, status, videos_complete, contract_accepted_at, contract_version, contract_signer_name, tiktok_username, instagram_username, youtube_username, base_pay, onboarding_started_at, job_id, jobs(id, portal_config, monthly_payout_cap, target_country)')
        .eq('linked_user_id', user.id)
        .eq('brand_organization_id', org.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('jobs')
        .select('id, portal_config, monthly_payout_cap, target_country')
        .eq('brand_organization_id', org.id)
        .not('portal_config', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const mcRows = mcResult.data ?? [];
    type McRow = (typeof mcRows)[number];
    const portalOf = (r: McRow): unknown => {
      return objectProp(objectProp(r, 'jobs'), 'portal_config') ?? null;
    };

    // Web's `isBrandRow` rule (lib/services/creator-profile.ts:648-651):
    //   include when `job_id IS NULL` OR the linked job has portal_config.
    const eligibleRows = mcRows.filter((r) => !r.job_id || portalOf(r) != null);

    if (eligibleRows.length === 0) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Preference: signed contract > active/warming statuses > portal-configured
    // job > any job-linked > first row (mirrors web's selection order in
    // `getManagedCreatorForBrand`).
    const mc =
      eligibleRows.find((r) => r.contract_accepted_at != null) ??
      eligibleRows.find((r) => ['active', 'warming_up', 'ghosted'].includes(r.status ?? '')) ??
      eligibleRows.find((r) => portalOf(r) != null) ??
      eligibleRows.find((r) => r.job_id != null) ??
      eligibleRows[0];

    // Prefer the portal_config attached to this creator's specific job
    // (carrying their contract pricing) over the brand's default job.
    const portalConfig = portalOf(mc) ?? jobResult.data?.portal_config ?? null;
    const job = objectProp(mc, 'jobs');
    const jobMonthlyPayoutCap = objectProp(job, 'monthly_payout_cap');
    const jobTargetCountry = objectProp(job, 'target_country');
    const hasCreatorScopedJob = mc.job_id != null;
    const workspaceJobId = mc.job_id ?? jobResult.data?.id ?? null;
    const monthlyPayoutCap =
      typeof jobMonthlyPayoutCap === 'number'
        ? jobMonthlyPayoutCap
        : hasCreatorScopedJob
          ? null
          : (jobResult.data?.monthly_payout_cap ?? null);
    const targetCountry =
      typeof jobTargetCountry === 'string'
        ? jobTargetCountry
        : hasCreatorScopedJob
          ? null
          : (jobResult.data?.target_country ?? null);
    const content = getPortalContent(portalConfig);
    const [referenceVideos, briefVideos, { data: trackedAccounts }] = await Promise.all([
      getReferenceVideos(org.id, {
        promoted_job_listing: true,
        jobId: workspaceJobId ?? undefined,
      }),
      getReferenceVideos(org.id, {
        promoted_brief: true,
        jobId: workspaceJobId ?? undefined,
      }),
      supabase
        .from('social_accounts')
        .select('tiktok_account_id, instagram_account_id, youtube_account_id, brand_tracked_social_accounts!inner(brand_organization_id)')
        .eq('managed_creator_id', mc.id)
        .eq('status', 'active')
        .eq('brand_tracked_social_accounts.brand_organization_id', org.id),
    ]);

    const safePortalConfig = stripPortalAccessCode(portalConfig);

    // job_applications.id keys video-upload/contract endpoints; workspace route has no app id, so resolve it here.
    let applicationId: string | null = null;
    if (workspaceJobId) {
      const { data: appRow } = await supabase
        .from('job_applications')
        .select('id, creator_profiles!inner(user_id)')
        .eq('creator_profiles.user_id', user.id)
        .eq('job_id', workspaceJobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      applicationId = appRow?.id ?? null;
    }

    return Response.json({
      managedCreator: {
        id: mc.id,
        applicationId,
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
      portalConfig: safePortalConfig,
      referenceVideos,
      briefVideos,
      trackedPlatforms: {
        tiktok: trackedAccounts?.some((a) => a.tiktok_account_id != null) ?? false,
        instagram: trackedAccounts?.some((a) => a.instagram_account_id != null) ?? false,
        youtube: trackedAccounts?.some((a) => a.youtube_account_id != null) ?? false,
      },
      currency: getContentCurrency(content),
      resources: normalizeResources(getContentResources(content)),
    });
  } catch (err) {
    captureMobileError(err, "handleGetWorkspace");
    console.error('[mobile/workspace] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// CONTRACT SIGNING
// ================================================================

export async function handleSignContract(user: User, request: Request, applicationId: string): Promise<Response> {
  try {
    const body = await request.json();
    const signerName = body?.signerName;

    if (!signerName || typeof signerName !== 'string' || signerName.trim().length === 0) {
      return Response.json({ error: 'signerName is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Verify the application belongs to this user
    const creatorProfile = await getMobileCreatorProfile(user.id);
    if (!creatorProfile) {
      return Response.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: app } = await supabase
      .from('job_applications')
      .select('id, application_status, contract_accepted_at, creator_profile_id')
      .eq('id', applicationId)
      .single();

    if (!app) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }
    if (app.creator_profile_id !== creatorProfile.id) {
      return Response.json({ error: 'Not authorized' }, { status: 403 });
    }
    if (app.contract_accepted_at) {
      return Response.json({ error: 'Contract already signed' }, { status: 409 });
    }

    const CONTRACT_VERSION = '2.1';

    const { error } = await supabase
      .from('job_applications')
      .update({
        contract_accepted_at: new Date().toISOString(),
        contract_version: CONTRACT_VERSION,
        contract_signer_name: signerName.trim(),
      })
      .eq('id', app.id);

    if (error) {
      console.error('[mobile/contract] Update error:', error);
      return Response.json({ error: 'Failed to sign contract' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    captureMobileError(err, "handleSignContract");
    console.error('[mobile/contract] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// WARMUP STATE (per-application)
// ================================================================

export async function handleGetWarmupState(user: User, applicationId: string): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const creatorProfile = await getMobileCreatorProfile(user.id);
    if (!creatorProfile) {
      return Response.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: app, error } = await supabase
      .from('job_applications')
      .select('id, warmup_checklist, warmup_tiktok_handle, warmup_instagram_handle, accounts_verified_at, warmup_completed_at')
      .eq('id', applicationId)
      .eq('creator_profile_id', creatorProfile.id)
      .single();

    if (error || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    return Response.json({
      checklist: app.warmup_checklist || {},
      tiktokHandle: app.warmup_tiktok_handle || null,
      instagramHandle: app.warmup_instagram_handle || null,
      accountsVerifiedAt: app.accounts_verified_at || null,
      warmupCompletedAt: app.warmup_completed_at || null,
    });
  } catch (err) {
    captureMobileError(err, "handleGetWarmupState");
    console.error('[mobile/warmup] GET error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function handleSaveWarmupState(user: User, request: Request, applicationId: string): Promise<Response> {
  try {
    const body = await request.json();
    const supabase = createServiceRoleClient();
    const creatorProfile = await getMobileCreatorProfile(user.id);
    if (!creatorProfile) {
      return Response.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: app, error: appErr } = await supabase
      .from('job_applications')
      .select('id, creator_profile_id')
      .eq('id', applicationId)
      .eq('creator_profile_id', creatorProfile.id)
      .single();

    if (appErr || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.checklist !== undefined && typeof body.checklist === 'object') {
      updates.warmup_checklist = body.checklist;
    }
    if (body.tiktokHandle !== undefined) {
      updates.warmup_tiktok_handle = typeof body.tiktokHandle === 'string' ? body.tiktokHandle.trim() : null;
    }
    if (body.instagramHandle !== undefined) {
      updates.warmup_instagram_handle = typeof body.instagramHandle === 'string' ? body.instagramHandle.trim() : null;
    }

    // Compute accounts_verified_at: set when both handles are provided
    if (body.tiktokHandle !== undefined || body.instagramHandle !== undefined) {
      // Re-read current state to check both handles
      const { data: current } = await supabase
        .from('job_applications')
        .select('warmup_tiktok_handle, warmup_instagram_handle, accounts_verified_at')
        .eq('id', applicationId)
        .single();

      const ttHandle = body.tiktokHandle !== undefined ? body.tiktokHandle : current?.warmup_tiktok_handle;
      const igHandle = body.instagramHandle !== undefined ? body.instagramHandle : current?.warmup_instagram_handle;
      const bothHandlesSet = !!ttHandle && !!igHandle;

      if (bothHandlesSet && !current?.accounts_verified_at) {
        updates.accounts_verified_at = new Date().toISOString();
      } else if (!bothHandlesSet) {
        updates.accounts_verified_at = null;
      }
    }

    // Compute warmup_completed_at: all 30 checklist items + both handles
    if (body.checklist !== undefined || body.tiktokHandle !== undefined || body.instagramHandle !== undefined) {
      const { data: latest } = await supabase
        .from('job_applications')
        .select('warmup_checklist, warmup_tiktok_handle, warmup_instagram_handle, warmup_completed_at')
        .eq('id', applicationId)
        .single();

      const checklist = body.checklist !== undefined ? body.checklist : (latest?.warmup_checklist || {});
      const ttH = body.tiktokHandle !== undefined ? body.tiktokHandle : latest?.warmup_tiktok_handle;
      const igH = body.instagramHandle !== undefined ? body.instagramHandle : latest?.warmup_instagram_handle;

      const completedCount = Object.values(checklist as Record<string, boolean>).filter(Boolean).length;
      const allTasksDone = completedCount >= 30; // 15 TikTok + 15 Instagram
      const bothHandles = !!ttH && !!igH;

      if (allTasksDone && bothHandles && !latest?.warmup_completed_at) {
        updates.warmup_completed_at = new Date().toISOString();
      } else if (!(allTasksDone && bothHandles)) {
        updates.warmup_completed_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ success: true });
    }

    const { error } = await supabase
      .from('job_applications')
      .update(updates)
      .eq('id', applicationId);

    if (error) {
      console.error('[mobile/warmup] Update error:', error);
      return Response.json({ error: 'Failed to save warmup state' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    captureMobileError(err, "handleSaveWarmupState");
    console.error('[mobile/warmup] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// ACCOUNT DELETION
// ================================================================

export async function handleDeleteAccount(user: User): Promise<Response> {
  try {
    const result = await deleteUserAccount({
      userId: user.id,
      // Always resolve via user_identities — users.id may be 'user_XXXXX' (not a
      // UUID), so passing user.id as the auth hint would cause
      // auth.admin.deleteUser to fail silently.
      authUserId: null,
      userInfo: {
        // users table has no display_name column; synthesize from email.
        name: user.email ? user.email.split('@')[0] : null,
        email: user.email,
        accountType: user.account_type,
      },
    });

    if ('error' in result && result.error) {
      return Response.json({ error: result.error }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, 'handleDeleteAccount');
    console.error('[mobile/delete-account] Unexpected error:', error);
    return Response.json({ error: 'Failed to delete account.' }, { status: 500 });
  }
}

// ================================================================
// MESSAGING — INBOX & THREADS
//
// Mirrors the cookie-auth /api/me/inbox + /api/me/threads/* routes, but for
// mobile (JWT auth via getMobileUser, service-role client).
// ================================================================

interface MobileInboxThreadRow {
  brand_organization_id: string | null;
  last_message_id: string;
  last_message_body: string;
  last_message_event_type: string | null;
  last_message_at: string;
  last_sender_user_id: string | null;
  unread_count: number;
}

const SYSTEM_THREAD_KEY = '__system__';

/** GET /mobile/inbox — one entry per (brand_organization_id) thread: latest message + unread count. */
export async function handleGetInbox(user: User): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc('mobile_inbox_threads', { p_user_id: user.id });

    if (error) {
      console.warn('[mobile/inbox] Error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as MobileInboxThreadRow[];

    const brandIds = rows
      .map((row) => row.brand_organization_id)
      .filter((id): id is string => Boolean(id));
    const { data: brands } = brandIds.length
      ? await supabase
          .from('brand_organizations')
          .select('id, organization_name, organization_slug, company_logo')
          .in('id', brandIds)
      : {
          data: [] as {
            id: string;
            organization_name: string | null;
            organization_slug: string | null;
            company_logo: string | null;
          }[],
        };
    const brandNameById = new Map((brands ?? []).map((b) => [b.id, b.organization_name ?? null]));
    const brandSlugById = new Map((brands ?? []).map((b) => [b.id, b.organization_slug ?? null]));
    const brandLogoById = new Map((brands ?? []).map((b) => [b.id, b.company_logo ?? null]));

    const threads = rows.map((row) => {
      const key = row.brand_organization_id ?? SYSTEM_THREAD_KEY;
      const isSystem = key === SYSTEM_THREAD_KEY;
      return {
        brand_organization_id: isSystem ? null : key,
        brand_name: isSystem ? null : (brandNameById.get(key) ?? null),
        brand_slug: isSystem ? null : (brandSlugById.get(key) ?? null),
        brand_logo: isSystem ? null : (brandLogoById.get(key) ?? null),
        last_message_id: row.last_message_id,
        last_message_body: row.last_message_body,
        last_message_event_type: row.last_message_event_type,
        last_message_at: row.last_message_at,
        last_sender_was_me: row.last_sender_user_id === user.id,
        unread_count: row.unread_count,
      };
    });

    return Response.json({ data: threads });
  } catch (error) {
    captureMobileError(error, 'handleGetInbox');
    console.error('[mobile/inbox] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** GET /mobile/threads/[brandId] — paginated thread, oldest first. brandId='system' = the 8x thread. */
export async function handleGetThread(user: User, request: Request, brandId: string): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 100;
    const before = searchParams.get('before');

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('messages')
      .select('id, user_id, brand_organization_id, sender_user_id, event_type, body, data, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (brandId === 'system') {
      query = query.is('brand_organization_id', null);
    } else {
      query = query.eq('brand_organization_id', brandId);
    }
    if (before) {
      query = query.lt('created_at', before);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[mobile/threads] Error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();

    return Response.json({
      data: page,
      pagination: {
        limit,
        has_more: hasMore,
        next_before: hasMore ? (page[0]?.created_at ?? null) : null,
      },
    });
  } catch (error) {
    captureMobileError(error, 'handleGetThread');
    console.error('[mobile/threads] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /mobile/threads/[brandId]/read — mark inbound unread messages in the thread as read. */
export async function handleMarkThreadRead(user: User, brandId: string): Promise<Response> {
  try {
    const supabase = createServiceRoleClient();
    // SELECT-then-UPDATE: PostgREST `.or()` on UPDATE with non-PK columns fails (CLAUDE.md).
    let selectQuery = supabase
      .from('messages')
      .select('id')
      .eq('user_id', user.id)
      .is('read_at', null)
      .or(`sender_user_id.is.null,sender_user_id.neq.${user.id}`);
    if (brandId === 'system') {
      selectQuery = selectQuery.is('brand_organization_id', null);
    } else {
      selectQuery = selectQuery.eq('brand_organization_id', brandId);
    }
    const { data: ids, error: selectError } = await selectQuery;
    if (selectError) {
      return Response.json({ error: selectError.message }, { status: 500 });
    }
    if (ids && ids.length > 0) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in(
          'id',
          ids.map((row) => row.id)
        );
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    captureMobileError(error, 'handleMarkThreadRead');
    console.error('[mobile/threads/read] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ================================================================
// CREATOR POSTS (My Content tab)
// ================================================================

/**
 * Helper: resolve the user's managed_creator row for a brand slug, mirroring
 * the `isBrandRow` rule from `~/8x/lib/services/creator-profile.ts:648-651`
 * — only job-attached rows with `portal_config` count, plus unattached rows.
 */
async function resolveManagedCreatorForBrandSlug(
  user: User,
  brandSlug: string
): Promise<
  | { ok: true; mc: { id: string; tiktok_username: string | null; instagram_username: string | null; youtube_username: string | null; tiktok_account_id: string | null; instagram_account_id: string | null; youtube_account_id: string | null; brand_organization_id: string | null }; brandId: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = createServiceRoleClient();
  const { data: org, error: orgError } = await supabase
    .from('brand_organizations')
    .select('id')
    .eq('organization_slug', brandSlug)
    .maybeSingle();
  if (orgError) {
    console.warn('[mobile/creator/posts] Brand lookup error:', orgError.message);
    return { ok: false, status: 500, error: 'Failed to load campaign' };
  }
  if (!org) return { ok: false, status: 404, error: 'Campaign not found' };

  const { data: rows, error: rowsError } = await supabase
    .from('managed_creators')
    .select('id, job_id, tiktok_username, instagram_username, youtube_username, tiktok_account_id, instagram_account_id, youtube_account_id, brand_organization_id, contract_accepted_at, status, jobs(portal_config)')
    .eq('linked_user_id', user.id)
    .eq('brand_organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (rowsError) {
    console.warn('[mobile/creator/posts] Managed creator lookup error:', rowsError.message);
    return { ok: false, status: 500, error: 'Failed to load campaign' };
  }
  const allRows = rows ?? [];
  type Row = (typeof allRows)[number];
  const portalOf = (r: Row): unknown => {
    const j = (r as Row & { jobs?: { portal_config?: unknown } | null }).jobs;
    return j && typeof j === 'object' && 'portal_config' in j ? j.portal_config : null;
  };
  const eligible = allRows.filter((r) => !r.job_id || portalOf(r) != null);
  if (eligible.length === 0) {
    return { ok: false, status: 404, error: 'Campaign not found' };
  }
  const mc =
    eligible.find((r) => r.contract_accepted_at != null) ??
    eligible.find((r) => ['active', 'warming_up', 'ghosted'].includes(r.status ?? '')) ??
    eligible.find((r) => portalOf(r) != null) ??
    eligible.find((r) => r.job_id != null) ??
    eligible[0];

  return {
    ok: true,
    brandId: org.id,
    mc: {
      id: mc.id,
      tiktok_username: mc.tiktok_username ?? null,
      instagram_username: mc.instagram_username ?? null,
      youtube_username: mc.youtube_username ?? null,
      tiktok_account_id: mc.tiktok_account_id ?? null,
      instagram_account_id: mc.instagram_account_id ?? null,
      youtube_account_id: mc.youtube_account_id ?? null,
      brand_organization_id: mc.brand_organization_id ?? null,
    },
  };
}

/** GET /mobile/creator/posts?brandSlug=…&limit=…&offset=… */
export async function handleGetCreatorPosts(user: User, request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const brandSlug = searchParams.get('brandSlug');
    if (!brandSlug) {
      return Response.json({ error: 'brandSlug required' }, { status: 400 });
    }

    const resolved = await resolveManagedCreatorForBrandSlug(user, brandSlug);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    const supabase = createServiceRoleClient();
    const orConditions = await buildManagedCreatorPostFilters(supabase, resolved.mc);
    if (orConditions.length === 0) {
      return Response.json({ posts: [], hasMore: false });
    }

    const limit = Math.min(Number(searchParams.get('limit')) || 30, 100);
    const offset = Number(searchParams.get('offset')) || 0;

    // Fetch limit + 1 so we can distinguish "page is full" from "more pages
    // exist". Same pattern as handleGetThread.
    const { data: posts, error } = await supabase
      .from('posts')
      .select(
        'id, platform, post_url, post_type, thumbnail_url, caption, posted_at, latest_views, latest_likes, latest_comments, latest_shares, ad_code, ad_code_added_at, deleted_at, managed_creator_posts(total_owed_cents)'
      )
      .or(orConditions.join(','))
      .order('posted_at', { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      throw error;
    }
    const allRows = posts ?? [];
    const hasMore = allRows.length > limit;
    const pageRows = allRows.slice(0, limit);
    const results = pageRows.map(({ managed_creator_posts: mcp, ...rest }) => {
      const payment = Array.isArray(mcp) ? mcp[0] : mcp;
      return {
        ...rest,
        total_owed_cents: payment?.total_owed_cents ?? null,
      };
    });
    return Response.json({ posts: results, hasMore });
  } catch (error) {
    captureMobileError(error, 'handleGetCreatorPosts');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /mobile/creator/posts/sync — body { brandSlug, platform } */
export async function handleSyncCreatorPosts(user: User, request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const brandSlug = typeof body.brandSlug === 'string' ? body.brandSlug : null;
    const platform = body.platform as 'tiktok' | 'instagram' | 'youtube' | undefined;
    if (!brandSlug || !platform || !['tiktok', 'instagram', 'youtube'].includes(platform)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const resolved = await resolveManagedCreatorForBrandSlug(user, brandSlug);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    const usernameKey = `${platform}_username` as const;
    const accountIdKey = `${platform}_account_id` as const;
    const username = resolved.mc[usernameKey];
    const accountId = resolved.mc[accountIdKey];

    if (!username) {
      return Response.json({ error: `No ${platform} account linked` }, { status: 400 });
    }
    if (!accountId) {
      return Response.json(
        { error: `No ${platform} account id yet — contact your campaign manager` },
        { status: 400 }
      );
    }

    const limit = creatorSyncLimiter.check(`${user.id}:${platform}`);
    if (!limit.allowed) {
      return Response.json(
        {
          error: 'rate_limited',
          message: 'Please wait a moment before syncing again.',
          retry_after_ms: limit.retryAfterMs ?? null,
        },
        { status: 429 }
      );
    }

    const supabase = createServiceRoleClient();
    const { data: syncJob, error: syncJobError } = await supabase
      .from('sync_jobs')
      .insert({ account_id: accountId, status: 'pending' })
      .select('id')
      .single();
    // Don't fail the sync over a missing audit row — mirrors
    // linkAccountToBrandAndSync. Just surface the failure to Sentry.
    if (syncJobError) {
      captureMobileError(syncJobError, 'handleSyncCreatorPosts:sync_jobs_insert');
    }

    await triggerAccountSync(platform, username, accountId, syncJob?.id);
    return Response.json({ success: true, sync_job_id: syncJob?.id ?? null });
  } catch (error) {
    captureMobileError(error, 'handleSyncCreatorPosts');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /mobile/creator/posts/[postId]/ad-code — body { ad_code, brandSlug } */
export async function handleUpdatePostAdCode(
  user: User,
  request: Request,
  postId: string
): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const ad_code = typeof body.ad_code === 'string' ? body.ad_code.trim() : '';
    const brandSlug = typeof body.brandSlug === 'string' ? body.brandSlug : null;
    if (!ad_code || !brandSlug || ad_code.length > 500) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    const resolved = await resolveManagedCreatorForBrandSlug(user, brandSlug);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    const supabase = createServiceRoleClient();
    const access = await resolveManagedCreatorPostAccess(supabase, resolved.mc);
    const hasPostAccess =
      access.connectorIds.length > 0 ||
      Boolean(access.tiktokUsername || access.instagramUsername || access.youtubeUsername);
    if (!hasPostAccess) {
      return Response.json({ error: 'No linked accounts' }, { status: 403 });
    }

    const { data: updatedPostId, error } = await supabase.rpc('mobile_update_post_ad_code', {
      p_post_id: postId,
      p_ad_code: ad_code,
      p_connector_ids: access.connectorIds,
      p_tiktok_username: access.tiktokUsername ?? undefined,
      p_instagram_username: access.instagramUsername ?? undefined,
      p_youtube_username: access.youtubeUsername ?? undefined,
    });
    if (error) {
      throw error;
    }
    if (!updatedPostId) {
      return Response.json({ error: 'Post not found or access denied' }, { status: 404 });
    }
    if (access.connectorIds.length === 0) {
      // Update succeeded with no social_accounts connector — match came via
      // the legacy username columns on `posts`. Logged so we can grep Sentry
      // for how often the fallback actually carries traffic.
      Sentry.addBreadcrumb({
        category: 'mobile.posts',
        message: 'ad_code update via legacy username fallback',
        data: { postId, hasConnectors: false },
      });
    }
    return Response.json({ success: true });
  } catch (error) {
    captureMobileError(error, 'handleUpdatePostAdCode');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /mobile/creator/handles — body { managedCreatorId, tiktokUsername?,
 * instagramUsername?, youtubeUsername? }. Stripped-down peer of the web
 * `/api/creator/handles` route — same DB write + same `@`-strip + completed-at
 * stamping, minus the brand-admin auth path and BTSA cleanup (those are admin
 * concerns; mobile is creator-only).
 */
export async function handleUpdateCreatorHandles(user: User, request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const managedCreatorId = typeof body.managedCreatorId === 'string' ? body.managedCreatorId : null;
    if (!managedCreatorId) {
      return Response.json({ error: 'managedCreatorId required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: creator } = await supabase
      .from('managed_creators')
      .select('id, linked_user_id, status, tiktok_username, instagram_username, youtube_username')
      .eq('id', managedCreatorId)
      .single();
    if (!creator) {
      return Response.json({ error: 'Managed creator not found' }, { status: 404 });
    }
    if (creator.linked_user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, string | null> = { updated_at: now };

    const clean = (raw: unknown): string | null => {
      if (typeof raw !== 'string') return null;
      const t = raw.replace(/^@/, '').trim();
      return t.length > 0 ? t : null;
    };

    // Mirror web's `saveHandles`: write-once. Only set a handle when none is
    // stored yet. Never clear — half-edited mobile fields shouldn't wipe a
    // verified handle, and web has the same `if (data.X && !mc.X_username)`
    // contract in lib/modules/portal/actions.ts.
    let addedTiktok = false;
    let addedInstagram = false;
    let addedYoutube = false;

    if (body.tiktokUsername !== undefined) {
      const cleaned = clean(body.tiktokUsername);
      if (cleaned && !creator.tiktok_username) {
        updateData.tiktok_username = cleaned;
        updateData.tiktok_handle_completed_at = now;
        addedTiktok = true;
      }
    }
    if (body.instagramUsername !== undefined) {
      const cleaned = clean(body.instagramUsername);
      if (cleaned && !creator.instagram_username) {
        updateData.instagram_username = cleaned;
        updateData.instagram_handle_completed_at = now;
        addedInstagram = true;
      }
    }
    if (body.youtubeUsername !== undefined) {
      const cleaned = clean(body.youtubeUsername);
      if (cleaned && !creator.youtube_username) {
        updateData.youtube_username = cleaned;
        addedYoutube = true;
      }
    }

    // Auto-advance accepted → warming_up when the first TikTok or Instagram
    // handle lands. Same rule web's `saveHandles` runs (actions.ts:333).
    if (creator.status === 'accepted' && (addedTiktok || addedInstagram)) {
      updateData.status = 'warming_up';
    }

    const { error } = await supabase
      .from('managed_creators')
      .update(updateData)
      .eq('id', managedCreatorId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const requestedAny =
      body.tiktokUsername !== undefined ||
      body.instagramUsername !== undefined ||
      body.youtubeUsername !== undefined;
    const wroteAny = addedTiktok || addedInstagram || addedYoutube;

    return Response.json({
      success: true,
      handles: {
        tiktok: (updateData.tiktok_username ?? creator.tiktok_username) ?? null,
        instagram: (updateData.instagram_username ?? creator.instagram_username) ?? null,
        youtube: (updateData.youtube_username ?? creator.youtube_username) ?? null,
      },
      statusAdvanced: updateData.status === 'warming_up',
      noOp: requestedAny && !wroteAny,
    });
  } catch (error) {
    captureMobileError(error, 'handleUpdateCreatorHandles');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
