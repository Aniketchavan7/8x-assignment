const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export const VIEW_AS_HEADERS = {
  BRAND: 'x-admin-view-as-brand',
} as const;

export function extractViewAsHeaders(request: Request): {
  viewAsBrandId: string | null;
} {
  return {
    viewAsBrandId: request.headers.get(VIEW_AS_HEADERS.BRAND),
  };
}
