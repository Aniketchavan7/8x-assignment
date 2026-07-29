import {
  Phone,
  UserPlus,
  Video,
  BookOpen,
  Flame,
  Send,
  type LucideIcon,
} from 'lucide-react';

/**
 * Platform-wide default guide URLs for onboarding tasks.
 * These are fallbacks - the actual URLs come from platform_resource_templates
 * and can be customized per-brand via brand_resources.
 */
export const DEFAULT_GUIDE_URLS = {
  create: 'https://smoggy-peripheral-af9.notion.site/Creating-your-Account-2a2210dec9f6805abc1ffde968bbfac8',
  warmup: 'https://smoggy-peripheral-af9.notion.site/Warming-up-the-Account-2a2210dec9f6808c8d8bec19aaec949a',
  videos: 'https://smoggy-peripheral-af9.notion.site/Video-Creation-Best-Practices-2a2210dec9f68054bd5adf7a0bd530b4',
} as const;

export type GuideKey = keyof typeof DEFAULT_GUIDE_URLS;

/**
 * Maps guide keys to platform_resource_templates IDs.
 * These are the fixed UUIDs from the migration seed data.
 */
export const GUIDE_TEMPLATE_IDS: Record<GuideKey, string> = {
  create: '00000000-0000-0000-0000-000000000001',
  warmup: '00000000-0000-0000-0000-000000000002',
  videos: '00000000-0000-0000-0000-000000000003',
};

/**
 * Guide configuration with display names for the UI.
 */
export const GUIDE_CONFIG: Record<GuideKey, { title: string; description: string }> = {
  create: {
    title: 'Account Creation Guide',
    description: 'Instructions for creating TikTok and Instagram accounts',
  },
  warmup: {
    title: 'Account Warmup Guide',
    description: 'Daily warmup activities for new accounts',
  },
  videos: {
    title: 'Video Creation Guide',
    description: 'Best practices for creating test videos',
  },
};

/**
 * Onboarding task configuration for managed creators.
 *
 * Each task has:
 * - deadlineHours: Hours from onboarding start to complete (null = no deadline)
 * - minHoursAfterPrev: Minimum hours to wait after dependency completes (for warm-up spacing)
 * - dependsOn: Array of task IDs that must be completed first
 * - columnName: Database column name for the completion timestamp
 * - guideKey: Optional reference to a guide (resolved via brand overrides or defaults)
 */
export const TASK_CONFIG = {
  'onboarding-call': {
    title: 'Onboarding Call',
    description: 'Complete your onboarding call with the team',
    icon: Phone,
    order: 1,
    deadlineHours: 24,
    minHoursAfterPrev: 0,
    dependsOn: [] as const,
    columnName: 'onboarding_call_completed_at' as const,
    guideKey: undefined as GuideKey | undefined,
  },
  'add-tiktok': {
    title: 'Add TikTok Account',
    description: 'Enter your TikTok username',
    icon: UserPlus,
    order: 2,
    deadlineHours: 16,
    minHoursAfterPrev: 0,
    dependsOn: ['onboarding-call'] as const,
    columnName: 'tiktok_handle_completed_at' as const,
    guideKey: 'create' as GuideKey | undefined,
  },
  'add-instagram': {
    title: 'Add Instagram Account',
    description: 'Enter your Instagram username',
    icon: UserPlus,
    order: 3,
    deadlineHours: 16,
    minHoursAfterPrev: 0,
    dependsOn: ['onboarding-call'] as const,
    columnName: 'instagram_handle_completed_at' as const,
    guideKey: 'create' as GuideKey | undefined,
  },
  'read-about-company': {
    title: 'Read About the Company',
    description: 'Learn about the brand and their products',
    icon: BookOpen,
    order: 4,
    deadlineHours: 24,
    minHoursAfterPrev: 0,
    dependsOn: ['add-tiktok', 'add-instagram'] as const,
    columnName: 'read_about_company_completed_at' as const,
    guideKey: undefined as GuideKey | undefined,
  },
  'test-videos': {
    title: 'Test Videos',
    description: 'Record and submit test videos',
    icon: Video,
    order: 5,
    deadlineHours: 48,
    minHoursAfterPrev: 0,
    dependsOn: ['add-tiktok', 'add-instagram'] as const,
    columnName: 'videos_completed_at' as const,
    guideKey: 'videos' as GuideKey | undefined,
  },
  'warmup-day-1': {
    title: 'Warm Up Account (Day 1)',
    description: 'First day of account warm-up activities',
    icon: Flame,
    order: 6,
    deadlineHours: 24,
    minHoursAfterPrev: 0,
    dependsOn: ['add-tiktok', 'add-instagram'] as const,
    columnName: 'warmup_day_1_completed_at' as const,
    guideKey: 'warmup' as GuideKey | undefined,
  },
  'warmup-day-2': {
    title: 'Warm Up Account (Day 2)',
    description: 'Second day of account warm-up activities',
    icon: Flame,
    order: 7,
    deadlineHours: null,
    minHoursAfterPrev: 24, // Must wait 24 hours after day 1
    dependsOn: ['warmup-day-1'] as const,
    columnName: 'warmup_day_2_completed_at' as const,
    guideKey: 'warmup' as GuideKey | undefined,
  },
  'warmup-day-3': {
    title: 'Warm Up Account (Day 3)',
    description: 'Third day of account warm-up activities',
    icon: Flame,
    order: 8,
    deadlineHours: null,
    minHoursAfterPrev: 24,
    dependsOn: ['warmup-day-2'] as const,
    columnName: 'warmup_day_3_completed_at' as const,
    guideKey: 'warmup' as GuideKey | undefined,
  },
  'warmup-day-4': {
    title: 'Warm Up Account (Day 4)',
    description: 'Fourth day of account warm-up activities',
    icon: Flame,
    order: 9,
    deadlineHours: null,
    minHoursAfterPrev: 24,
    dependsOn: ['warmup-day-3'] as const,
    columnName: 'warmup_day_4_completed_at' as const,
    guideKey: 'warmup' as GuideKey | undefined,
  },
  'first-post': {
    title: 'First Post',
    description: 'Create and publish your first post',
    icon: Send,
    order: 10,
    deadlineHours: 168, // 7 days
    minHoursAfterPrev: 0,
    dependsOn: ['warmup-day-4'] as const,
    columnName: 'first_post_completed_at' as const,
    guideKey: undefined as GuideKey | undefined,
  },
} as const;

export type TaskId = keyof typeof TASK_CONFIG;
export type TaskConfig = (typeof TASK_CONFIG)[TaskId];

// Type for brand guide overrides (stored in brand_organizations.guide_url_overrides)
export type GuideUrlOverrides = Partial<Record<GuideKey, string>>;

/**
 * Resolve a guide URL, using brand override if available, otherwise default.
 */
export function resolveGuideUrl(
  guideKey: GuideKey | undefined,
  brandOverrides?: GuideUrlOverrides | null
): string | undefined {
  if (!guideKey) return undefined;

  // Check brand override first
  if (brandOverrides?.[guideKey]) {
    return brandOverrides[guideKey];
  }

  // Fall back to platform default
  return DEFAULT_GUIDE_URLS[guideKey];
}

/**
 * Get all guide URLs for a brand, merging defaults with overrides.
 */
export function getGuideUrls(brandOverrides?: GuideUrlOverrides | null): Record<GuideKey, string> {
  return {
    create: brandOverrides?.create || DEFAULT_GUIDE_URLS.create,
    warmup: brandOverrides?.warmup || DEFAULT_GUIDE_URLS.warmup,
    videos: brandOverrides?.videos || DEFAULT_GUIDE_URLS.videos,
  };
}

/**
 * Check if a guide URL is using the default or has been customized.
 */
export function isGuideUrlCustomized(
  guideKey: GuideKey,
  brandOverrides?: GuideUrlOverrides | null
): boolean {
  return Boolean(brandOverrides?.[guideKey] && brandOverrides[guideKey] !== DEFAULT_GUIDE_URLS[guideKey]);
}

// Column names for database operations
export type TaskColumnName = TaskConfig['columnName'];

// Map from task ID to database column name
export const TASK_ID_TO_COLUMN: Record<TaskId, TaskColumnName> = Object.fromEntries(
  Object.entries(TASK_CONFIG).map(([id, config]) => [id, config.columnName])
) as Record<TaskId, TaskColumnName>;

// Map from database column name to task ID (for reverse lookups)
export const COLUMN_TO_TASK_ID: Record<TaskColumnName, TaskId> = Object.fromEntries(
  Object.entries(TASK_CONFIG).map(([id, config]) => [config.columnName, id])
) as Record<TaskColumnName, TaskId>;

// Get ordered list of tasks
export function getOrderedTasks(): Array<{ id: TaskId; config: TaskConfig }> {
  return Object.entries(TASK_CONFIG)
    .map(([id, config]) => ({ id: id as TaskId, config }))
    .sort((a, b) => a.config.order - b.config.order);
}

// Check if all dependencies for a task are complete
export function areDependenciesComplete(
  taskId: TaskId,
  completedTasks: Record<TaskColumnName, string | null>
): boolean {
  const config = TASK_CONFIG[taskId];
  return config.dependsOn.every((depId) => {
    const depColumn = TASK_CONFIG[depId].columnName;
    return completedTasks[depColumn] !== null;
  });
}

// Calculate hours remaining until a task can be started (for warm-up day spacing)
export function getHoursUntilUnlock(
  taskId: TaskId,
  completedTasks: Record<TaskColumnName, string | null>
): number | null {
  const config = TASK_CONFIG[taskId];

  // No minimum wait time
  if (config.minHoursAfterPrev === 0) {
    return null;
  }

  // Check the primary dependency (first one)
  const primaryDep = config.dependsOn[0];
  if (!primaryDep) return null;

  const depColumn = TASK_CONFIG[primaryDep].columnName;
  const depCompletedAt = completedTasks[depColumn];

  if (!depCompletedAt) {
    return null; // Dependency not complete, can't calculate
  }

  const completedTime = new Date(depCompletedAt).getTime();
  const unlockTime = completedTime + config.minHoursAfterPrev * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= unlockTime) {
    return 0; // Already unlocked
  }

  return (unlockTime - now) / (60 * 60 * 1000); // Hours remaining
}

// Calculate deadline for a task
export function getTaskDeadline(
  taskId: TaskId,
  onboardingStartedAt: string | null,
  extensions: Record<string, number> = {}
): Date | null {
  const config = TASK_CONFIG[taskId];

  if (!config.deadlineHours || !onboardingStartedAt) {
    return null;
  }

  const extension = extensions[taskId] ?? 0;
  const totalHours = config.deadlineHours + extension;
  const startTime = new Date(onboardingStartedAt).getTime();

  return new Date(startTime + totalHours * 60 * 60 * 1000);
}

// Check if a task deadline has passed
export function isTaskOverdue(
  taskId: TaskId,
  onboardingStartedAt: string | null,
  extensions: Record<string, number> = {}
): boolean {
  const deadline = getTaskDeadline(taskId, onboardingStartedAt, extensions);
  if (!deadline) return false;
  return new Date() > deadline;
}
