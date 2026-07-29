import { createServiceRoleClient } from '@/lib/db/supabase';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const user = await getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: member, error: memberError } = await supabase
      .from('admin_members')
      .select('admin_role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !member) {
      return Response.json({ error: 'Forbidden: insufficient admin role' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('country_pricing_tiers')
      .select(
        'country_code, country_name, tier, creator_base_pay_cents, suggested_brand_charge_cents, max_monthly_per_campaign_cents, bonus_milestones, gni_per_capita_ppp, notes, active'
      )
      .eq('active', true)
      .order('tier', { ascending: true })
      .order('country_name', { ascending: true });

    if (error) {
      console.error('Error fetching country pricing:', error);
      return Response.json({ error: 'Failed to fetch country pricing' }, { status: 500 });
    }

    return Response.json({ data: data ?? [] });
  } catch (error) {
    return handleApiError(error, {
      route: '/api/admin/country-pricing',
      method: 'GET',
    });
  }
}
