import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { isNextRouterError } from 'next/dist/client/components/is-next-router-error';
import { User, BrandOrganization, BrandMember } from '@/lib/db/types';
import { captureError } from '@/lib/analytics/capture-error';
import { ErrorCategories } from '@/lib/analytics/events';

// Type alias for backwards compatibility with "Team" terminology
export type TeamDataWithMembers = BrandOrganization & {
  name?: string; // Added for backwards compatibility
  stripe_subscription_id?: string | null; // Added for backwards compatibility
  plan_name?: string | null; // Added for backwards compatibility
  subscription_status?: string | null; // Added for backwards compatibility
  teamMembers: (BrandMember & {
    profile_id?: string; // Added for backwards compatibility (maps to user_id)
    user:
      | (Pick<User, 'id' | 'email'> & {
          display_name?: string; // Computed from email
          primary_email?: string; // Alias for email
        })
      | null;
  })[];
};

export type ActionState = {
  error?: string;
  success?: string;
  [key: string]: unknown; // This allows for additional properties
};

type ValidatedActionWithUserFunction<S extends z.ZodType<unknown, z.ZodTypeDef, unknown>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: User
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<unknown, z.ZodTypeDef, unknown>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>,
  options?: { actionName?: string }
) {
  return async (prevState: ActionState, formData: FormData) => {
    const user = await getUser();
    if (!user) {
      throw new Error('User is not authenticated');
    }

    // Convert FormData to object, excluding File objects for better compatibility
    // File objects are passed separately via formData parameter to the action
    const formDataObject: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      // Skip File objects - they should be accessed directly from formData
      if (!(value instanceof File)) {
        formDataObject[key] = value;
      }
    }

    const result = schema.safeParse(formDataObject);
    if (!result.success) {
      return { error: result.error.errors[0].message };
    }

    try {
      return await action(result.data, formData, user);
    } catch (error) {
      // Don't log Next.js navigation signals (redirect, notFound) as errors
      if (isNextRouterError(error)) {
        throw error;
      }

      // Capture to Sentry with user context
      Sentry.captureException(error, {
        user: { id: user.id },
        tags: {
          action_type: 'validated_action_with_user',
          action_name: options?.actionName || 'unknown',
          account_type: user.account_type || 'unknown',
        },
      });

      // Capture unhandled errors to PostHog with user context
      await captureError(error, {
        category: ErrorCategories.UNKNOWN,
        operation: options?.actionName || 'server_action',
        userId: user.id,
        metadata: {
          action_type: 'validated_action_with_user',
          user_account_type: user.account_type,
        },
      });
      throw error;
    }
  };
}

type ActionWithTeamFunction<T> = (formData: FormData, team: TeamDataWithMembers) => Promise<T>;

export function withTeam<T>(action: ActionWithTeamFunction<T>, options?: { actionName?: string }) {
  return async (formData: FormData): Promise<T> => {
    const user = await getUser();
    if (!user) {
      redirect('/sign-in');
    }

    const team = await getTeamForUser(user.id);
    if (!team) {
      throw new Error('Team not found');
    }

    try {
      return await action(formData, team);
    } catch (error) {
      // Don't log Next.js navigation signals (redirect, notFound) as errors
      if (isNextRouterError(error)) {
        throw error;
      }

      // Capture to Sentry with user and team context
      Sentry.captureException(error, {
        user: { id: user.id },
        tags: {
          action_type: 'with_team',
          action_name: options?.actionName || 'unknown',
          account_type: user.account_type || 'unknown',
          team_id: team.id,
        },
      });

      // Capture unhandled errors to PostHog with team context
      await captureError(error, {
        category: ErrorCategories.UNKNOWN,
        operation: options?.actionName || 'server_action',
        userId: user.id,
        metadata: {
          action_type: 'with_team',
          team_id: team.id,
          user_account_type: user.account_type,
        },
      });
      throw error;
    }
  };
}
