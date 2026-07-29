import { redirect } from 'next/navigation';
import { getUser } from '@/lib/modules/auth/queries';
import { getOrgBySlug, getPortalDataForUser } from '@/lib/modules/portal/queries';
import { ContractPage } from '@/components/Portal/ContractPage';

export default async function ContractRoute({
  params,
}: {
  params: Promise<{ brandSlug: string; locale: string }>;
}) {
  const { brandSlug, locale } = await params;
  const user = await getUser();
  if (!user) {
    redirect(`/${locale}/sign-in?redirect=/${locale}/dashboard/${brandSlug}/contract`);
  }

  const org = await getOrgBySlug(brandSlug);
  if (!org) return null;

  const { mc, config, monthlyPayoutCap } = await getPortalDataForUser(user.id, org.id);
  if (!mc || !config) return null;

  if (mc.status !== 'active' && mc.status !== 'warming_up' && mc.status !== 'ghosted') {
    redirect(`/${locale}/dashboard/jobs/${brandSlug}`);
  }

  const content = config.content[config.defaultLang];

  return (
    <ContractPage
      brandSlug={brandSlug}
      orgName={org.organization_name}
      currency={(content?.compensation?.currency ?? 'USD').toUpperCase()}
      basePay={mc.base_pay}
      monthlyPayoutCap={monthlyPayoutCap}
      contractSigned={!!mc.contract_accepted_at}
      contractSignerName={mc.contract_signer_name}
      contractSignedAt={mc.contract_accepted_at}
      contractVersion={mc.contract_version}
    />
  );
}
