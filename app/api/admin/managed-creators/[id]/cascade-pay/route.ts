export const runtime = 'nodejs';

import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { captureDbError } from '@/lib/analytics/capture-error';

/**
 * POST /api/admin/managed-creators/[id]/cascade-pay
 *
 * Cascades the managed creator's current pay config to all their
 * managed_creator_posts and recalculates payments.
 * Returns the count of updated posts and a snapshot for undo.
 *
 * Admin-only endpoint.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, { id }] = await Promise.all([getUser(), params]);

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

    const { data, error } = await supabase.rpc('cascade_pay_config_to_posts', {
      p_managed_creator_id: id,
    });

    if (error) {
      captureDbError(error, 'cascade_pay_config_to_posts', {
        userId: user.id,
        metadata: { managedCreatorId: id },
      });
      return Response.json({ error: 'Failed to cascade pay config' }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    captureDbError(error, 'cascade_pay_route', {});
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
