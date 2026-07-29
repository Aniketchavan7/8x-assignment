import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import {
  getR2SignedUrl,
  listR2Objects,
  deleteFromR2,
  r2ObjectExists,
  getManagedCreatorsBucket,
} from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type OnboardingVideo = {
  path: string;
  url: string;
  filename: string;
  createdAt: string;
};

export async function verifyAdmin() {
  const user = await getUser();
  if (!user) return null;

  const supabase = createServiceRoleClient();
  const { data: userData, error } = await supabase
    .from('users')
    .select('account_type')
    .eq('id', user.id)
    .single();

  if (error || !userData || userData.account_type !== 'admin') return null;
  return { user, supabase };
}

export async function getManagedCreator(
  supabase: ReturnType<typeof createServiceRoleClient>,
  id: string,
) {
  const { data, error } = await supabase
    .from('managed_creators')
    .select('id, linked_user_id, brand_organization_id')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data;
}

export function getStoragePrefix(creator: {
  id: string;
  linked_user_id: string | null;
  brand_organization_id: string | null;
}) {
  const userId = creator.linked_user_id || creator.id;
  if (creator.brand_organization_id) {
    return `onboarding/${creator.brand_organization_id}/${userId}`;
  }
  return `onboarding/${userId}`;
}

async function getSignedUrlWithFallback(
  supabase: ReturnType<typeof createServiceRoleClient>,
  storagePath: string,
): Promise<string> {
  const bucket = getManagedCreatorsBucket();
  try {
    if (await r2ObjectExists(bucket, storagePath)) {
      return await getR2SignedUrl(bucket, storagePath, 3600);
    }
  } catch {
    // R2 unavailable
  }
  const { data } = await supabase.storage
    .from('managed-creators')
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl || '';
}

/**
 * GET /api/admin/managed-creators/[id]/onboarding-videos
 * List onboarding videos. Checks managed_creator_videos table first (covers all
 * upload flows), then falls back to storage listing for legacy data.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { supabase } = auth;

    const creator = await getManagedCreator(supabase, id);
    if (!creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Try managed_creator_videos table first (has paths from all upload flows)
    const { data: dbVideos } = await supabase
      .from('managed_creator_videos')
      .select('storage_path, created_at')
      .eq('managed_creator_id', id)
      .is('replaced_at', null)
      .order('slot_number', { ascending: true });

    if (dbVideos && dbVideos.length > 0) {
      const videos: OnboardingVideo[] = await Promise.all(
        dbVideos.map(async (row) => {
          const url = await getSignedUrlWithFallback(supabase, row.storage_path);
          return {
            path: row.storage_path,
            url,
            filename: row.storage_path.split('/').pop() || row.storage_path,
            createdAt: row.created_at || '',
          };
        }),
      );
      return Response.json({ data: videos });
    }

    // Fallback: list from R2 first, then Supabase for legacy data
    const prefix = getStoragePrefix(creator);
    const bucket = getManagedCreatorsBucket();

    let videoFiles: { name: string; path: string; createdAt: string }[] = [];
    try {
      const r2Objects = await listR2Objects(bucket, prefix);
      videoFiles = r2Objects
        .filter((obj) => /\.(mp4|mov|webm)$/i.test(obj.key))
        .map((obj) => ({
          name: obj.key.split('/').pop() || obj.key,
          path: obj.key,
          createdAt: obj.lastModified?.toISOString() || '',
        }));
    } catch {
      // R2 unavailable
    }

    // Fall back to Supabase if R2 had no results
    if (videoFiles.length === 0) {
      const { data: files, error: listError } = await supabase.storage
        .from('managed-creators')
        .list(prefix, { sortBy: { column: 'created_at', order: 'desc' } });

      if (listError) {
        console.error('[GET onboarding-videos] List error:', listError);
        return Response.json({ error: 'Failed to list videos' }, { status: 500 });
      }

      videoFiles = (files || [])
        .filter((f) => /\.(mp4|mov|webm)$/i.test(f.name))
        .map((f) => ({
          name: f.name,
          path: `${prefix}/${f.name}`,
          createdAt: f.created_at || '',
        }));
    }

    const videos: OnboardingVideo[] = await Promise.all(
      videoFiles.map(async (f) => {
        const url = await getSignedUrlWithFallback(supabase, f.path);
        return {
          path: f.path,
          url,
          filename: f.name,
          createdAt: f.createdAt,
        };
      }),
    );

    return Response.json({ data: videos });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/onboarding-videos',
      method: 'GET',
    });
  }
}

/**
 * POST /api/admin/managed-creators/[id]/onboarding-videos
 * Register an already-uploaded onboarding video. Accepts JSON { storage_path }.
 * The file must have been uploaded directly to R2 via a presigned URL first.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { supabase } = auth;

    const creator = await getManagedCreator(supabase, id);
    if (!creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    const body = await request.json();
    const storagePath = body.storage_path;

    if (!storagePath || typeof storagePath !== 'string') {
      return Response.json({ error: 'storage_path is required' }, { status: 400 });
    }

    const prefix = getStoragePrefix(creator);
    if (!storagePath.startsWith(prefix) || storagePath.includes('..')) {
      return Response.json({ error: 'Invalid storage_path' }, { status: 400 });
    }

    // Append storage path to managed_creators.video_urls array (legacy)
    const { data: existing } = await supabase
      .from('managed_creators')
      .select('video_urls')
      .eq('id', id)
      .single();

    const currentUrls: string[] = existing?.video_urls || [];
    await supabase
      .from('managed_creators')
      .update({ video_urls: [...currentUrls, storagePath] })
      .eq('id', id);

    // Also insert into managed_creator_videos table
    const { data: maxSlotRow } = await supabase
      .from('managed_creator_videos')
      .select('slot_number')
      .eq('managed_creator_id', id)
      .is('replaced_at', null)
      .order('slot_number', { ascending: false })
      .limit(1)
      .single();

    const nextSlot = (maxSlotRow?.slot_number ?? 0) + 1;
    await supabase.from('managed_creator_videos').insert({
      managed_creator_id: id,
      slot_number: nextSlot,
      storage_path: storagePath,
    });

    const url = await getSignedUrlWithFallback(supabase, storagePath);
    const filename = storagePath.split('/').pop() || storagePath;

    return Response.json({
      data: {
        path: storagePath,
        url,
        filename,
        createdAt: new Date().toISOString(),
      } satisfies OnboardingVideo,
    });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/onboarding-videos',
      method: 'POST',
    });
  }
}

/**
 * DELETE /api/admin/managed-creators/[id]/onboarding-videos
 * Remove a video from storage by path (query param ?path=...)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const auth = await verifyAdmin();
    if (!auth) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { supabase } = auth;

    const creator = await getManagedCreator(supabase, id);
    if (!creator) {
      return Response.json({ error: 'Creator not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path || path.includes('..')) {
      return Response.json({ error: 'path query parameter is required' }, { status: 400 });
    }

    // Verify path belongs to this creator via table or prefix
    const prefix = getStoragePrefix(creator);
    const ownsViaPrefix = path.startsWith(prefix);

    let ownsViaTable = false;
    if (!ownsViaPrefix) {
      const { data: videoRow } = await supabase
        .from('managed_creator_videos')
        .select('id')
        .eq('managed_creator_id', id)
        .eq('storage_path', path)
        .is('replaced_at', null)
        .limit(1)
        .single();
      ownsViaTable = !!videoRow;
    }

    if (!ownsViaPrefix && !ownsViaTable) {
      return Response.json({ error: 'Invalid path' }, { status: 403 });
    }

    // Delete from R2 and Supabase (covers both migrated and legacy files)
    try { await deleteFromR2(getManagedCreatorsBucket(), path); } catch { /* may not exist in R2 */ }
    await supabase.storage.from('managed-creators').remove([path]);

    // Soft-delete from managed_creator_videos if present
    await supabase
      .from('managed_creator_videos')
      .update({ replaced_at: new Date().toISOString() })
      .eq('managed_creator_id', id)
      .eq('storage_path', path)
      .is('replaced_at', null);

    return Response.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/managed-creators/[id]/onboarding-videos',
      method: 'DELETE',
    });
  }
}
