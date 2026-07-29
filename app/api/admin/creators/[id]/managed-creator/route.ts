import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { MC_STATUS } from '@/lib/modules/managed-creators/constants';
import { notifyOnStatusTransition } from '@/lib/modules/managed-creators/notify-on-status-transition';
import { after } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CreateManagedCreatorRequest {
  brand_organization_id: string;
  job_id: string;
}

/**
 * Creates a managed_creators row linking the given creator profile to a brand+job
 * directly, bypassing the apply flow. Replaces the deprecated job_applications path.
 *
 * `[id]` is the creator_profiles.id.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: creatorProfileId } = await params;

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

    const body = (await request.json()) as Partial<CreateManagedCreatorRequest>;
    const brandOrganizationId = body.brand_organization_id;
    const jobId = body.job_id;

    if (!brandOrganizationId) {
      return Response.json({ error: 'brand_organization_id is required' }, { status: 400 });
    }
    if (!jobId) {
      return Response.json({ error: 'job_id is required' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('creator_profiles')
      .select('id, display_name, user_id, email, location')
      .eq('id', creatorProfileId)
      .maybeSingle();

    if (profileError || !profile) {
      return Response.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: brand, error: brandError } = await supabase
      .from('brand_organizations')
      .select('id, organization_name')
      .eq('id', brandOrganizationId)
      .maybeSingle();

    if (brandError || !brand) {
      return Response.json({ error: 'Brand not found' }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, job_title, brand_organization_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError || !job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.brand_organization_id !== brandOrganizationId) {
      return Response.json(
        { error: 'Job does not belong to the specified brand' },
        { status: 400 },
      );
    }

    // Check for an existing MC row for this creator on this brand. CLAUDE.md notes
    // there's no DB unique constraint and dupes exist in prod, but we should still
    // avoid making more from this admin action.
    const orParts: string[] = [`linked_creator_profile_id.eq.${profile.id}`];
    if (profile.user_id) {
      orParts.push(`linked_user_id.eq.${profile.user_id}`);
    }

    const { data: existing } = await supabase
      .from('managed_creators')
      .select('id')
      .eq('brand_organization_id', brandOrganizationId)
      .or(orParts.join(','))
      .limit(1)
      .maybeSingle();

    if (existing) {
      return Response.json(
        {
          error: 'Creator already on this brand',
          managed_creator_id: existing.id,
        },
        { status: 409 },
      );
    }

    const insertData = {
      brand_organization_id: brandOrganizationId,
      job_id: jobId,
      name: profile.display_name,
      email: profile.email?.toLowerCase() ?? null,
      // TODO(country-codes): normalize via countryNameToISO() (lib/utils/country-iso-mapping)
      // when the cross-table country format inconsistency is resolved. Until then we match
      // existing portal/admin write paths that pass full names through.
      country: profile.location ?? null,
      linked_creator_profile_id: profile.id,
      linked_user_id: profile.user_id,
      status: MC_STATUS.APPLIED,
      base_pay: 0,
      payment_method: 'pending' as const,
      payout_frequency: 'monthly' as const,
    };

    const { data: created, error: insertError } = await supabase
      .from('managed_creators')
      .insert(insertData)
      .select()
      .single();

    if (insertError || !created) {
      console.error('Error creating managed_creator:', insertError);
      return Response.json({ error: 'Failed to create managed creator' }, { status: 500 });
    }

    const { error: auditError } = await supabase
      .from('managed_creator_audit_log')
      .insert({
        managed_creator_id: created.id,
        brand_organization_id: brandOrganizationId,
        action: 'create',
        field_name: 'created_by_admin',
        old_value: null,
        new_value: JSON.stringify({
          managed_creator_id: created.id,
          brand_organization_id: brandOrganizationId,
          job_id: jobId,
          source: 'creator_detail_modal',
        }),
        changed_by: user.id,
        batch_id: crypto.randomUUID(),
      });

    if (auditError) {
      console.error('Audit log error for managed_creator create:', auditError);
    }

    after(() =>
      notifyOnStatusTransition(supabase, null, MC_STATUS.APPLIED, {
        managedCreatorId: created.id,
        brandOrganizationId: brandOrganizationId,
        jobId,
        linkedUserId: profile.user_id ?? null,
      }),
    );

    return Response.json({ managed_creator: created });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/creators/[id]/managed-creator',
      method: 'POST',
    });
  }
}
