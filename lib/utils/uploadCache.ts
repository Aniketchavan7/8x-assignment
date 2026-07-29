/**
 * Upload cache utility for preventing duplicate file uploads.
 *
 * Caches uploaded file information (URL, metadata) in localStorage to avoid
 * re-uploading the same files. Uses file fingerprinting (name + size + lastModified)
 * to detect duplicates.
 *
 * Benefits:
 * - Faster uploads by returning cached URLs for duplicate files
 * - Reduced bandwidth and storage costs
 * - Better UX when users accidentally select the same file multiple times
 * - Persistent across page refreshes
 */

const CACHE_KEY = '8x_upload_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_SIZE = 500; // Maximum number of cached entries
const DEFAULT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

export interface CachedUpload {
  /** Unique fingerprint of the file (name + size + lastModified) */
  fingerprint: string;
  /** Public URL of the uploaded file */
  url: string;
  /** Storage bucket name */
  bucket: string;
  /** File path in storage */
  filePath: string;
  /** Original file metadata */
  metadata: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
  /** Timestamp when the file was uploaded */
  uploadedAt: number;
  /** User ID who uploaded the file */
  userId?: string;
  /** Expiration timestamp (optional) */
  expiresAt?: number;
}

export interface UploadCacheData {
  version: number;
  entries: Map<string, CachedUpload>;
}

/**
 * Generate a unique fingerprint for a file based on its characteristics.
 * This is used to identify duplicate files without uploading them.
 */
export function generateFileFingerprint(file: File): string {
  // Use name, size, and lastModified to create a unique identifier
  // This is fast and doesn't require reading the file contents
  const parts = [file.name, file.size.toString(), file.lastModified.toString(), file.type];
  return btoa(unescape(encodeURIComponent(parts.join('|'))));
}

/**
 * Generate a fingerprint from file metadata (for checking cache with metadata only).
 */
export function generateFingerprintFromMetadata(metadata: {
  name: string;
  size: number;
  lastModified: number;
  type: string;
}): string {
  const parts = [
    metadata.name,
    metadata.size.toString(),
    metadata.lastModified.toString(),
    metadata.type,
  ];
  return btoa(unescape(encodeURIComponent(parts.join('|'))));
}

/**
 * Load the upload cache from localStorage.
 */
function loadCache(): Map<string, CachedUpload> {
  if (typeof window === 'undefined') {
    return new Map();
  }

  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) {
      return new Map();
    }

    const parsed = JSON.parse(stored) as {
      version: number;
      entries: Array<[string, CachedUpload]>;
    };

    // Check version compatibility
    if (parsed.version !== CACHE_VERSION) {
      console.warn('[UploadCache] Cache version mismatch, clearing cache');
      clearUploadCache();
      return new Map();
    }

    // Convert array back to Map and filter out expired entries
    const now = Date.now();
    const entries = new Map<string, CachedUpload>();

    for (const [key, value] of parsed.entries) {
      // Skip expired entries
      if (value.expiresAt && value.expiresAt < now) {
        continue;
      }
      entries.set(key, value);
    }

    return entries;
  } catch (error) {
    console.error('[UploadCache] Failed to load cache:', error);
    return new Map();
  }
}

/**
 * Save the upload cache to localStorage.
 */
function saveCache(entries: Map<string, CachedUpload>, skipRetry = false): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Convert Map to array for JSON serialization
  const data = {
    version: CACHE_VERSION,
    entries: Array.from(entries.entries()),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[UploadCache] Failed to save cache:', error);

    // If storage is full, try to clear old entries and retry (but only once)
    if (!skipRetry && error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('[UploadCache] Storage quota exceeded, clearing old entries');

      // Manually clear old entries to avoid recursive saveCache calls
      const now = Date.now();
      const cutoff = now - 7 * 24 * 60 * 60 * 1000; // 7 days
      const filtered = new Map<string, CachedUpload>();

      for (const [key, value] of entries.entries()) {
        if (value.uploadedAt >= cutoff) {
          filtered.set(key, value);
        }
      }

      try {
        const retryData = {
          version: CACHE_VERSION,
          entries: Array.from(filtered.entries()),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(retryData));
      } catch (retryError) {
        console.error('[UploadCache] Failed to save cache after clearing old entries:', retryError);
      }
    }
  }
}

/**
 * Get a cached upload by file fingerprint.
 */
export function getCachedUpload(file: File): CachedUpload | null {
  const fingerprint = generateFileFingerprint(file);
  const cache = loadCache();
  const cached = cache.get(fingerprint);

  if (!cached) {
    return null;
  }

  // Check if entry has expired
  if (cached.expiresAt && cached.expiresAt < Date.now()) {
    // Remove expired entry
    cache.delete(fingerprint);
    saveCache(cache);
    return null;
  }

  return cached;
}

/**
 * Get a cached upload by fingerprint string.
 */
export function getCachedUploadByFingerprint(fingerprint: string): CachedUpload | null {
  const cache = loadCache();
  const cached = cache.get(fingerprint);

  if (!cached) {
    return null;
  }

  // Check if entry has expired
  if (cached.expiresAt && cached.expiresAt < Date.now()) {
    // Remove expired entry
    cache.delete(fingerprint);
    saveCache(cache);
    return null;
  }

  return cached;
}

/**
 * Check if a file is already cached.
 */
export function isFileCached(file: File): boolean {
  return getCachedUpload(file) !== null;
}

/**
 * Add an uploaded file to the cache.
 */
export function addToUploadCache(
  file: File,
  url: string,
  bucket: string,
  filePath: string,
  options?: {
    userId?: string;
    ttl?: number; // Time to live in milliseconds
  }
): CachedUpload {
  const fingerprint = generateFileFingerprint(file);
  const now = Date.now();
  const ttl = options?.ttl ?? DEFAULT_CACHE_TTL;

  const cached: CachedUpload = {
    fingerprint,
    url,
    bucket,
    filePath,
    metadata: {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    },
    uploadedAt: now,
    userId: options?.userId,
    expiresAt: ttl > 0 ? now + ttl : undefined,
  };

  const cache = loadCache();

  // Enforce max cache size by removing oldest entries
  if (cache.size >= MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(cache.entries()).sort(
      (a, b) => a[1].uploadedAt - b[1].uploadedAt
    );

    // Remove oldest 10% of entries
    const toRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
    for (let i = 0; i < toRemove; i++) {
      cache.delete(sortedEntries[i][0]);
    }
  }

  cache.set(fingerprint, cached);
  saveCache(cache);

  return cached;
}

/**
 * Remove a specific file from the cache.
 */
export function removeFromUploadCache(file: File): boolean {
  const fingerprint = generateFileFingerprint(file);
  const cache = loadCache();
  const deleted = cache.delete(fingerprint);

  if (deleted) {
    saveCache(cache);
  }

  return deleted;
}

/**
 * Remove a specific entry from the cache by fingerprint.
 */
export function removeFromUploadCacheByFingerprint(fingerprint: string): boolean {
  const cache = loadCache();
  const deleted = cache.delete(fingerprint);

  if (deleted) {
    saveCache(cache);
  }

  return deleted;
}

/**
 * Clear all entries from the upload cache.
 */
export function clearUploadCache(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('[UploadCache] Failed to clear cache:', error);
  }
}

/**
 * Clear entries older than the specified age.
 */
export function clearOldUploadCacheEntries(maxAgeMs: number = DEFAULT_CACHE_TTL): number {
  const cache = loadCache();
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  let removed = 0;

  for (const [fingerprint, entry] of cache.entries()) {
    if (entry.uploadedAt < cutoff) {
      cache.delete(fingerprint);
      removed++;
    }
  }

  if (removed > 0) {
    saveCache(cache);
  }

  return removed;
}

/**
 * Clear entries for a specific user.
 */
export function clearUploadCacheForUser(userId: string): number {
  const cache = loadCache();
  let removed = 0;

  for (const [fingerprint, entry] of cache.entries()) {
    if (entry.userId === userId) {
      cache.delete(fingerprint);
      removed++;
    }
  }

  if (removed > 0) {
    saveCache(cache);
  }

  return removed;
}

/**
 * Clear entries for a specific bucket.
 */
export function clearUploadCacheForBucket(bucket: string): number {
  const cache = loadCache();
  let removed = 0;

  for (const [fingerprint, entry] of cache.entries()) {
    if (entry.bucket === bucket) {
      cache.delete(fingerprint);
      removed++;
    }
  }

  if (removed > 0) {
    saveCache(cache);
  }

  return removed;
}

/**
 * Get all cached uploads.
 */
export function getAllCachedUploads(): CachedUpload[] {
  const cache = loadCache();
  return Array.from(cache.values());
}

/**
 * Get cache statistics.
 */
export function getUploadCacheStats(): {
  totalEntries: number;
  totalSize: number; // Total size of cached files in bytes
  oldestEntry: number | null; // Timestamp of oldest entry
  newestEntry: number | null; // Timestamp of newest entry
  byBucket: Record<string, number>; // Count by bucket
  byUser: Record<string, number>; // Count by user
} {
  const cache = loadCache();
  const entries = Array.from(cache.values());

  const stats = {
    totalEntries: entries.length,
    totalSize: entries.reduce((sum, entry) => sum + entry.metadata.size, 0),
    oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => e.uploadedAt)) : null,
    newestEntry: entries.length > 0 ? Math.max(...entries.map((e) => e.uploadedAt)) : null,
    byBucket: {} as Record<string, number>,
    byUser: {} as Record<string, number>,
  };

  for (const entry of entries) {
    // Count by bucket
    stats.byBucket[entry.bucket] = (stats.byBucket[entry.bucket] || 0) + 1;

    // Count by user (if userId is available)
    if (entry.userId) {
      stats.byUser[entry.userId] = (stats.byUser[entry.userId] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Update the TTL (expiration) of a cached entry.
 */
export function updateCachedUploadTTL(file: File, newTtlMs: number): boolean {
  const fingerprint = generateFileFingerprint(file);
  const cache = loadCache();
  const entry = cache.get(fingerprint);

  if (!entry) {
    return false;
  }

  entry.expiresAt = newTtlMs > 0 ? Date.now() + newTtlMs : undefined;
  cache.set(fingerprint, entry);
  saveCache(cache);

  return true;
}
