import { z } from 'zod';
import { getUser } from '@/lib/modules/auth/queries';
import { handleApiError } from '@/lib/utils/api-error';
import { validateOrigin } from '@/lib/utils/origin-validation';
import type { User } from '@/lib/db/types';

type RouteHandler<S extends z.ZodType, T> = (
  data: z.infer<S>,
  user: User
) => Promise<T>;

type RouteOptions = {
  name?: string;
};

/**
 * Parse JSON body, returning a 400 Response for malformed JSON.
 */
async function parseJsonBody(request: Request): Promise<{ body: unknown } | Response> {
  try {
    const body = await request.json();
    return { body };
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }
}

/**
 * Convert a service result to an HTTP response.
 * Convention: objects containing `{ error: string }` are treated as
 * business-logic failures. The status defaults to 422 unless the result
 * includes a `statusCode` field (e.g. 400, 404, 500).
 * `statusCode` is stripped from the response body before sending.
 */
function toResponse(data: unknown): Response {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as Record<string, unknown>).error != null
  ) {
    const record = data as Record<string, unknown>;
    const status = typeof record.statusCode === 'number' ? record.statusCode : 422;
    const { statusCode: _sc, ...body } = record;
    return Response.json(body, { status });
  }
  return Response.json(data);
}

/**
 * Resolve the HTTP method from a request for error-reporting context.
 */
function resolveMethod(request: Request): string {
  return request.method || 'UNKNOWN';
}

/**
 * API route wrapper that mirrors `validatedActionWithUser` for server actions.
 *
 * Handles: origin validation, authentication, JSON parsing, Zod validation,
 * error responses, and Sentry/PostHog capture.
 *
 * @example
 * ```ts
 * // app/api/creator/profile/route.ts
 * import { validatedRouteWithUser } from '@/lib/api/route-helpers';
 * import { updateCreatorBasicInfo } from '@/lib/modules/creator/services';
 *
 * const schema = z.object({
 *   display_name: z.string().min(1).max(100),
 *   bio: z.string().max(500).optional().nullable(),
 * });
 *
 * export const PATCH = validatedRouteWithUser(schema, async (data, user) => {
 *   return updateCreatorBasicInfo(user.id, data);
 * }, { name: 'creator/update-profile' });
 * ```
 */
export function validatedRouteWithUser<S extends z.ZodType, T>(
  schema: S,
  handler: RouteHandler<S, T>,
  options?: RouteOptions
) {
  const routeName = options?.name || 'unknown';

  return async (request: Request): Promise<Response> => {
    const originError = validateOrigin(request);
    if (originError) return originError;

    try {
      const user = await getUser();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const parsed = await parseJsonBody(request);
      if (parsed instanceof Response) return parsed;

      const result = schema.safeParse((parsed as { body: unknown }).body);
      if (!result.success) {
        return Response.json(
          { error: result.error.errors[0].message, code: 'VALIDATION_ERROR' },
          { status: 422 }
        );
      }

      const data = await handler(result.data, user);
      return toResponse(data);
    } catch (error) {
      return handleApiError(error, {
        route: `/api/${routeName}`,
        method: resolveMethod(request),
        userId: undefined,
      });
    }
  };
}

/**
 * API route wrapper for authenticated endpoints without a request body.
 * Use for GET endpoints or POST endpoints with no body.
 *
 * @example
 * ```ts
 * export const GET = routeWithUser(async (user) => {
 *   return fetchCreatorProfile(user.id);
 * }, { name: 'creator/profile' });
 * ```
 */
export function routeWithUser<T>(
  handler: (user: User, request: Request) => Promise<T>,
  options?: RouteOptions
) {
  const routeName = options?.name || 'unknown';

  return async (request: Request): Promise<Response> => {
    const originError = validateOrigin(request);
    if (originError) return originError;

    try {
      const user = await getUser();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const data = await handler(user, request);
      return toResponse(data);
    } catch (error) {
      return handleApiError(error, {
        route: `/api/${routeName}`,
        method: resolveMethod(request),
        userId: undefined,
      });
    }
  };
}

/**
 * API route wrapper for file upload endpoints.
 * Passes raw FormData to the handler instead of parsing JSON.
 *
 * @example
 * ```ts
 * export const POST = fileUploadRouteWithUser(async (formData, user) => {
 *   return uploadCreatorPhoto(user.id, formData);
 * }, { name: 'creator/upload-photo' });
 * ```
 */
export function fileUploadRouteWithUser<T>(
  handler: (formData: FormData, user: User) => Promise<T>,
  options?: RouteOptions
) {
  const routeName = options?.name || 'unknown';

  return async (request: Request): Promise<Response> => {
    const originError = validateOrigin(request);
    if (originError) return originError;

    try {
      const user = await getUser();
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const formData = await request.formData();
      const data = await handler(formData, user);
      return toResponse(data);
    } catch (error) {
      return handleApiError(error, {
        route: `/api/${routeName}`,
        method: resolveMethod(request),
        userId: undefined,
      });
    }
  };
}
