import { NextResponse, NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/db/supabase';
import { validateAndExtractUsername } from '@/lib/utils/social-username';
import { handleApiError } from '@/lib/utils/api-error';
import { getBrandContext } from '@/lib/modules/managed-creators/api-helpers';
import {
  applyManagedCreatorDropSideEffects,
  reverseManagedCreatorDropSideEffects,
} from '@/lib/modules/managed-creators/drop-side-effects';
import { listR2Objects, deleteMultipleFromR2, getManagedCreatorsBucket } from '@/lib/storage/r2';
import { after } from 'next/server';
import { notifyOnStatusTransition } from '@/lib/modules/managed-creators/notify-on-status-transition';

export const dynamic = 'force-dynamic';

/**
 * Verify the managed creator belongs to the brand context
 */
async function verifyCreatorAccess(
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

  // Non-admins must have a brand context and it must match the creator's brand
  if (!isAdmin && (!brandId || creator.brand_organization_id !== brandId)) {
    return { error: 'Access denied', status: 403 };
  }

  return { creator };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { id } = await params;

    // Verify access
    const access = await verifyCreatorAccess(
      context.supabase,
      id,
      context.brandId,
      context.isAdmin
    );
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: creator, error } = await context.supabase
      .from('managed_creators')
      .select(
        `
        *,
        transcripts:managed_creator_transcripts(*)
      `
      )
      .eq('id', id)
      .single();

    if (error || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    return NextResponse.json(creator);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/[id]',
      method: 'GET',
    });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { id } = await params;

    // Verify access
    const access = await verifyCreatorAccess(
      context.supabase,
      id,
      context.brandId,
      context.isAdmin
    );
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json();

    // Fetch current state to compare username changes and handle drop side effects
    const { data: currentCreator, error: fetchError } = await context.supabase
      .from('managed_creators')
      .select(
        'status, tiktok_username, instagram_username, youtube_username, tiktok_account_id, instagram_account_id, youtube_account_id, linked_user_id, brand_organization_id, job_id'
      )
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error(
        '[PATCH /api/managed-creators/[id]] Failed to fetch current state:',
        fetchError
      );
      return NextResponse.json({ error: 'Failed to update creator' }, { status: 500 });
    }

    // Build update object with snake_case keys
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Map incoming fields to database columns
    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.location !== undefined) updateData.location = body.location || null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.base_pay !== undefined) updateData.base_pay = body.base_pay;
    if (body.payment !== undefined) updateData.payment = body.payment;
    if (body.payment_outstanding !== undefined)
      updateData.payment_outstanding = body.payment_outstanding;
    if (body.total_paid !== undefined) updateData.total_paid = body.total_paid;
    if (body.pending_payout !== undefined) updateData.pending_payout = body.pending_payout;
    if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;
    if (body.payout_frequency !== undefined) updateData.payout_frequency = body.payout_frequency;
    if (body.tiktok_performance !== undefined)
      updateData.tiktok_performance = body.tiktok_performance;
    if (body.instagram_performance !== undefined)
      updateData.instagram_performance = body.instagram_performance;
    if (body.sourced !== undefined) updateData.sourced = body.sourced || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    // Onboarding checklist
    if (body.onboarding_call_complete !== undefined)
      updateData.onboarding_call_complete = body.onboarding_call_complete;
    if (body.handles_complete !== undefined) updateData.handles_complete = body.handles_complete;
    if (body.videos_complete !== undefined) updateData.videos_complete = body.videos_complete;
    if (body.collected_tiktok_url !== undefined)
      updateData.collected_tiktok_url = body.collected_tiktok_url || null;
    if (body.collected_instagram_url !== undefined)
      updateData.collected_instagram_url = body.collected_instagram_url || null;
    if (body.video_urls !== undefined) updateData.video_urls = body.video_urls;
    // Added at timestamps
    if (body.tiktok_added_at !== undefined)
      updateData.tiktok_added_at = body.tiktok_added_at || null;
    if (body.instagram_added_at !== undefined)
      updateData.instagram_added_at = body.instagram_added_at || null;

    const wasDroppedOrRejected =
      currentCreator.status === 'dropped' || currentCreator.status === 'rejected';
    const isDroppingOrRejecting =
      (body.status === 'dropped' || body.status === 'rejected') && !wasDroppedOrRejected;

    // Handle TikTok username changes
    const oldTiktok = currentCreator.tiktok_username;
    const oldTiktokAccountId = currentCreator.tiktok_account_id;
    let newTiktok: string | null = oldTiktok;

    if (body.tiktok_username !== undefined) {
      if (body.tiktok_username) {
        const tiktokValidation = validateAndExtractUsername(body.tiktok_username, 'tiktok');
        if ('error' in tiktokValidation) {
          return NextResponse.json({ error: `TikTok: ${tiktokValidation.error}` }, { status: 400 });
        }
        newTiktok = tiktokValidation.username;
      } else {
        newTiktok = null;
      }
    }
    const tiktokChanged = body.tiktok_username !== undefined && oldTiktok !== newTiktok;

    if (tiktokChanged) {
      updateData.tiktok_username = newTiktok;

      // Freeze old account and null MC FK, but preserve social_accounts connector + BTSA
      // (non-atomic: if the MC update below fails, the account is frozen but FK still set)
      if (oldTiktok && oldTiktokAccountId) {
        const { error: freezeError } = await context.supabase
          .from('tiktok_accounts')
          .update({ tracking_disabled: true, tracking_status: 'reduced' })
          .eq('id', oldTiktokAccountId);
        if (freezeError) {
          console.error('[PATCH /api/managed-creators/[id]] Failed to freeze TikTok account:', freezeError);
        }
        updateData.tiktok_account_id = null;
      }
    }

    // Handle Instagram username changes
    const oldInstagram = currentCreator.instagram_username;
    const oldInstagramAccountId = currentCreator.instagram_account_id;
    let newInstagram: string | null = oldInstagram;

    if (body.instagram_username !== undefined) {
      if (body.instagram_username) {
        const instagramValidation = validateAndExtractUsername(
          body.instagram_username,
          'instagram'
        );
        if ('error' in instagramValidation) {
          return NextResponse.json(
            { error: `Instagram: ${instagramValidation.error}` },
            { status: 400 }
          );
        }
        newInstagram = instagramValidation.username;
      } else {
        newInstagram = null;
      }
    }
    const instagramChanged = body.instagram_username !== undefined && oldInstagram !== newInstagram;

    if (instagramChanged) {
      updateData.instagram_username = newInstagram;

      // Freeze old account and null MC FK, but preserve social_accounts connector + BTSA
      // (non-atomic: if the MC update below fails, the account is frozen but FK still set)
      if (oldInstagram && oldInstagramAccountId) {
        const { error: freezeError } = await context.supabase
          .from('instagram_accounts')
          .update({ tracking_disabled: true, tracking_status: 'reduced' })
          .eq('id', oldInstagramAccountId);
        if (freezeError) {
          console.error('[PATCH /api/managed-creators/[id]] Failed to freeze Instagram account:', freezeError);
        }
        updateData.instagram_account_id = null;
      }
    }

    // Handle YouTube username changes
    const oldYoutube = currentCreator.youtube_username;
    const oldYoutubeAccountId = currentCreator.youtube_account_id;
    let newYoutube: string | null = oldYoutube;

    if (body.youtube_username !== undefined) {
      if (body.youtube_username) {
        const youtubeValidation = validateAndExtractUsername(body.youtube_username, 'youtube');
        if ('error' in youtubeValidation) {
          return NextResponse.json(
            { error: `YouTube: ${youtubeValidation.error}` },
            { status: 400 }
          );
        }
        newYoutube = youtubeValidation.username;
      } else {
        newYoutube = null;
      }
    }
    const youtubeChanged = body.youtube_username !== undefined && oldYoutube !== newYoutube;

    if (youtubeChanged) {
      updateData.youtube_username = newYoutube;

      // Freeze old account and null MC FK, but preserve social_accounts connector + BTSA
      // (non-atomic: if the MC update below fails, the account is frozen but FK still set)
      if (oldYoutube && oldYoutubeAccountId) {
        const { error: freezeError } = await context.supabase
          .from('youtube_accounts')
          .update({ tracking_disabled: true, tracking_status: 'reduced' })
          .eq('id', oldYoutubeAccountId);
        if (freezeError) {
          console.error('[PATCH /api/managed-creators/[id]] Failed to freeze YouTube account:', freezeError);
        }
        updateData.youtube_account_id = null;
      }
    }

    if (isDroppingOrRejecting) {
      const dropCreatorState = {
        ...currentCreator,
        tiktok_account_id: tiktokChanged ? null : currentCreator.tiktok_account_id,
        instagram_account_id: instagramChanged ? null : currentCreator.instagram_account_id,
        youtube_account_id: youtubeChanged ? null : currentCreator.youtube_account_id,
      };

      const dropResult = await applyManagedCreatorDropSideEffects(
        context.supabase,
        id,
        dropCreatorState
      );
      if (!dropResult.success) {
        console.error(
          `[PATCH /api/managed-creators/[id]] Failed during ${dropResult.step}:`,
          dropResult.error
        );
        return NextResponse.json({ error: 'Failed to drop creator' }, { status: 500 });
      }
    }

    const isUndropping =
      body.status !== undefined &&
      body.status !== 'dropped' &&
      body.status !== 'rejected' &&
      wasDroppedOrRejected;
    if (isUndropping) {
      const undropResult = await reverseManagedCreatorDropSideEffects(
        context.supabase,
        id,
        currentCreator
      );
      if (!undropResult.success) {
        console.error(
          `[PATCH /api/managed-creators/[id]] Failed to reverse drop during ${undropResult.step}:`,
          undropResult.error
        );
        return NextResponse.json({ error: 'Failed to reactivate creator' }, { status: 500 });
      }
    }

    const { data: creator, error } = await context.supabase
      .from('managed_creators')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/managed-creators/[id]] Error:', error);
      return NextResponse.json({ error: 'Failed to update creator' }, { status: 500 });
    }

    if (body.status !== undefined && body.status !== currentCreator.status) {
      const previousStatus = currentCreator.status;
      const nextStatus = body.status as string;
      const linkedUserId = currentCreator.linked_user_id;
      const brandOrgId = currentCreator.brand_organization_id;
      const jobId = currentCreator.job_id;
      const rejectionReason = body.rejection_reason ?? null;
      after(() =>
        notifyOnStatusTransition(context.supabase, previousStatus, nextStatus, {
          managedCreatorId: id,
          brandOrganizationId: brandOrgId,
          jobId,
          rejectionReason,
          linkedUserId,
        }),
      );
    }

    return NextResponse.json(creator);
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/[id]',
      method: 'PATCH',
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getBrandContext(request);
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { id } = await params;

    // Verify access
    const access = await verifyCreatorAccess(
      context.supabase,
      id,
      context.brandId,
      context.isAdmin
    );
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Get the creator to find storage files to delete
    const { data: creator } = await context.supabase
      .from('managed_creators')
      .select('brand_organization_id, video_urls')
      .eq('id', id)
      .single();

    // Delete storage files from R2 and Supabase (covers both migrated and legacy files)
    if (creator?.brand_organization_id) {
      const folderPath = `${creator.brand_organization_id}/${id}`;
      const bucket = getManagedCreatorsBucket();

      // Delete from R2 (list all files under this creator's prefix)
      try {
        const r2Objects = await listR2Objects(bucket, `${folderPath}/`);
        if (r2Objects.length > 0) {
          await deleteMultipleFromR2(bucket, r2Objects.map((obj) => obj.key));
        }
      } catch {
        // R2 may not have files yet, continue with Supabase cleanup
      }

      // Also delete from Supabase for files not yet migrated
      const filesToDelete: string[] = [];
      const { data: videoFiles } = await context.supabase.storage
        .from('managed-creators')
        .list(`${folderPath}/videos`);
      if (videoFiles?.length) {
        filesToDelete.push(...videoFiles.map((f) => `${folderPath}/videos/${f.name}`));
      }
      const { data: transcriptFiles } = await context.supabase.storage
        .from('managed-creators')
        .list(`${folderPath}/transcripts`);
      if (transcriptFiles?.length) {
        filesToDelete.push(...transcriptFiles.map((f) => `${folderPath}/transcripts/${f.name}`));
      }
      if (filesToDelete.length > 0) {
        await context.supabase.storage.from('managed-creators').remove(filesToDelete);
      }
    }

    const { error } = await context.supabase.from('managed_creators').delete().eq('id', id);

    if (error) {
      console.error('[DELETE /api/managed-creators/[id]] Error:', error);
      return NextResponse.json({ error: 'Failed to delete creator' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/managed-creators/[id]',
      method: 'DELETE',
    });
  }
}

