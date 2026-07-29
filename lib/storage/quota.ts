/**
 * Storage Quota Management
 *
 * Utilities for checking Supabase storage usage against tier limits
 * and calculating alert thresholds.
 */

import { createServiceRoleClient } from '@/lib/db/supabase';

// ============================================================================
// Types
// ============================================================================

export type StorageTier = 'free' | 'pro';

export interface StorageUsage {
  total_bytes: number;
  total_files: number;
  buckets: Array<{
    bucket_id: string;
    bytes: number;
    files: number;
    percentage: number;
  }>;
  calculated_at: string;
}

export interface QuotaStatus {
  tier: StorageTier;
  limitBytes: number;
  usedBytes: number;
  usedPercentage: number;
  remainingBytes: number;
  buckets: StorageUsage['buckets'];
  alertLevel: 'none' | 'warning' | 'urgent' | 'critical';
  calculatedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Storage tier limits in bytes
 */
export const STORAGE_LIMITS: Record<StorageTier, number> = {
  free: 1_073_741_824, // 1 GB
  pro: 107_374_182_400, // 100 GB
};

/**
 * Alert thresholds as percentages
 */
export const ALERT_THRESHOLDS = {
  warning: 80, // ⚠️ Yellow
  urgent: 90, // ❌ Red
  critical: 95, // 🚨 Bright Red
} as const;

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format bytes to human-readable string (GB, MB, KB)
 */
export function formatBytes(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  const KB = 1024;

  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`;
  } else if (bytes >= MB) {
    return `${(bytes / MB).toFixed(2)} MB`;
  } else if (bytes >= KB) {
    return `${(bytes / KB).toFixed(2)} KB`;
  } else {
    return `${bytes} bytes`;
  }
}

/**
 * Determine alert level based on usage percentage
 */
export function getAlertLevel(percentage: number): QuotaStatus['alertLevel'] {
  if (percentage >= ALERT_THRESHOLDS.critical) return 'critical';
  if (percentage >= ALERT_THRESHOLDS.urgent) return 'urgent';
  if (percentage >= ALERT_THRESHOLDS.warning) return 'warning';
  return 'none';
}

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Fetch storage usage from database function
 *
 * @param bucketId - Optional bucket ID to filter by
 * @returns Storage usage statistics
 */
export async function getStorageUsage(bucketId?: string): Promise<StorageUsage> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('get_storage_usage', {
    p_bucket_id: bucketId,
  });

  if (error) {
    throw new Error(`Failed to fetch storage usage: ${error.message}`);
  }

  return data as unknown as StorageUsage;
}

/**
 * Check storage quota status against tier limit
 *
 * @param tier - Storage tier (free or pro)
 * @param bucketId - Optional bucket ID to filter by
 * @returns Quota status with alert level
 */
export async function checkStorageQuota(
  tier: StorageTier = 'pro',
  bucketId?: string
): Promise<QuotaStatus> {
  const usage = await getStorageUsage(bucketId);
  const limitBytes = STORAGE_LIMITS[tier];
  const usedPercentage = (usage.total_bytes / limitBytes) * 100;
  const alertLevel = getAlertLevel(usedPercentage);

  return {
    tier,
    limitBytes,
    usedBytes: usage.total_bytes,
    usedPercentage: Math.round(usedPercentage * 100) / 100, // Round to 2 decimals
    remainingBytes: limitBytes - usage.total_bytes,
    buckets: usage.buckets,
    alertLevel,
    calculatedAt: usage.calculated_at,
  };
}
