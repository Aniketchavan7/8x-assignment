const BUCKET = 'creator_v2_onboarding';

/**
 * Returns the public URL for a file in the creator_v2_onboarding storage bucket.
 *
 * When NEXT_PUBLIC_STORAGE_CDN_URL is set (Cloudflare-proxied domain), it is
 * used as the base — expected to map to the bucket root, e.g.
 *   https://cdn.example.com  →  {supabase}/storage/v1/object/public/creator_v2_onboarding
 *
 * Falls back to the raw Supabase storage URL otherwise.
 */
export function getOnboardingStorageUrl(storagePath: string): string {
  const cdnBase = process.env.NEXT_PUBLIC_STORAGE_CDN_URL;
  if (cdnBase) {
    return `${cdnBase.replace(/\/$/, '')}/${storagePath}`;
  }
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
