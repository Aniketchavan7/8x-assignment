import { createServiceRoleClient } from '@/lib/db/supabase';

function generateBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function generateUniqueSlug(name: string, maxRetries: number = 100): Promise<string> {
  // Use service role client to bypass RLS and see all existing slugs
  const supabase = createServiceRoleClient();
  const baseSlug = generateBaseSlug(name);

  let slug = baseSlug;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const { data: existing, error } = await supabase
      .from('brand_organizations')
      .select('id')
      .eq('organization_slug', slug)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check slug uniqueness: ${error.message}`);
    }

    if (!existing) {
      return slug;
    }

    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  throw new Error(
    `Unable to generate unique slug after ${maxRetries} attempts. Please try a different organization name.`
  );
}
