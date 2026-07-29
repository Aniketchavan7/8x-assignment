/**
 * Background upload queue utility for handling file uploads asynchronously.
 *
 * Allows users to proceed to next screen while uploads continue in the background.
 * Tracks upload status and handles retries/errors gracefully.
 * Includes caching to avoid re-uploading duplicate files.
 *
 * Uses TUS resumable uploads for video files to improve reliability for large files.
 * Standard uploads are used for smaller files (images, etc.) for better performance.
 *
 * All upload events are tracked in PostHog for monitoring and debugging.
 */

import { createBrowserSupabaseClient } from '@/lib/db/supabase-browser';
import { getCachedUpload, addToUploadCache } from '@/lib/utils/uploadCache';
import * as tus from 'tus-js-client';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/env';
import { trackEvent } from '@/lib/analytics/posthog';
import { PostHogEvents } from '@/lib/analytics/events';
import { captureFireAndForget } from '@/lib/utils/capture-fire-and-forget';

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'retrying';

export interface QueuedUpload {
  id: string;
  file: File;
  bucket: string;
  fileName: string;
  publicUrl: string; // Pre-generated URL path
  status: UploadStatus;
  error?: string;
  retryCount: number;
  createdAt: number;
  completedAt?: number;
  progress?: number; // Upload progress percentage (0-100)
  // Per-upload callbacks
  onComplete?: (uploadId: string, publicUrl: string) => void;
  onError?: (uploadId: string, error: string, errorType: UploadErrorType) => void;
  onProgress?: (uploadId: string, progress: number) => void;
  // Promise resolvers for waitForCompletion
  resolve?: (result: { success: true; publicUrl: string }) => void;
  reject?: (error: { success: false; error: string; errorType: UploadErrorType }) => void;
  // TUS upload instance for cancellation/abort
  tusUpload?: tus.Upload;
  // Upload type indicator
  uploadType?: 'standard' | 'signed_url';
  // For signed URL uploads
  signedUrlProvider?: SignedUrlProvider;
  storagePath?: string;
  xhr?: XMLHttpRequest;
}

/**
 * Provider for signed URL uploads.
 * The getSignedUrl function is called each time an upload attempt is made,
 * allowing fresh URLs on retry (since signed URLs can expire).
 */
export interface SignedUrlProvider {
  /**
   * Get a fresh signed upload URL. Called on each upload attempt.
   * This allows retries to get fresh URLs if the previous one expired.
   */
  getSignedUrl: () => Promise<{ uploadUrl: string; storagePath: string }>;

  /**
   * Bucket name for tracking/logging purposes.
   */
  bucket: string;

  /**
   * Optional: Called after successful upload to save the record to database.
   * If provided, this is called before resolving the upload promise.
   */
  onUploadComplete?: (storagePath: string) => Promise<void>;
}

export interface UploadQueueConfig {
  maxRetries?: number;
  retryDelay?: number; // milliseconds
  uploadTimeout?: number; // milliseconds - timeout for upload operations
  onProgress?: (uploadId: string, progress: number) => void;
  onComplete?: (uploadId: string, publicUrl: string) => void;
  onError?: (uploadId: string, error: string, errorType: UploadErrorType) => void;
  enableCache?: boolean; // Enable caching to avoid duplicate uploads. Default: true
  cacheTTL?: number; // Cache time-to-live in milliseconds. Default: 30 days
  useTusForVideos?: boolean; // Use TUS resumable uploads for video files. Default: true
  tusChunkSize?: number; // Chunk size for TUS uploads. Must be 6MB for Supabase.
}

export type UploadErrorType =
  | 'network'
  | 'size_limit'
  | 'permission'
  | 'timeout'
  | 'invalid_file'
  | 'storage_error'
  | 'unknown';

// Video MIME types that should use TUS resumable uploads
const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
  'video/3gpp2',
];

// Threshold for using TUS uploads (files larger than this will use TUS)
// 6MB is a good threshold since that's also the TUS chunk size
const TUS_SIZE_THRESHOLD = 6 * 1024 * 1024; // 6MB

/**
 * Helper to determine if file is a video based on MIME type.
 */
function isVideoFile(file: File): boolean {
  return VIDEO_MIME_TYPES.includes(file.type);
}

/**
 * Helper to get human-readable file size.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * Track upload events to PostHog for monitoring and debugging.
 * Provides detailed context about file, upload method, and errors.
 */
function trackUploadEvent(
  eventName: string,
  uploadId: string,
  file: File,
  bucket: string,
  additionalProps?: Record<string, unknown>
) {
  const fileType = isVideoFile(file) ? 'video' : file.type.startsWith('image/') ? 'image' : 'other';

  trackEvent(eventName, {
    upload_id: uploadId,
    bucket,
    file_name: file.name,
    file_type: fileType,
    file_mime_type: file.type,
    file_size_bytes: file.size,
    file_size_human: formatFileSize(file.size),
    file_extension: file.name.split('.').pop()?.toLowerCase() || 'unknown',
    timestamp: new Date().toISOString(),
    ...additionalProps,
  });
}

/**
 * Check if a file should use TUS resumable upload.
 * Videos and large files benefit from resumable uploads.
 */
function shouldUseTusUpload(file: File, useTusForVideos: boolean): boolean {
  // Use TUS for all video files if enabled
  if (useTusForVideos && VIDEO_MIME_TYPES.includes(file.type)) {
    return true;
  }

  // Also use TUS for any large files (>6MB)
  if (file.size > TUS_SIZE_THRESHOLD) {
    return true;
  }

  return false;
}

/**
 * Extract project ID from Supabase URL.
 * Handles both production (https://project.supabase.co) and local (http://127.0.0.1:54321) URLs.
 *
 * Examples:
 * - https://xigkfywncesdbjivdpqi.supabase.co -> xigkfywncesdbjivdpqi
 * - http://127.0.0.1:54321 -> null (local development)
 */
function getProjectId(): string | null {
  // Production URL format: https://{projectId}.supabase.co
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (match) {
    return match[1];
  }

  // Local development URL (http://127.0.0.1:54321 or http://localhost:54321)
  if (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost')) {
    return null; // Local development - TUS endpoint format is different
  }

  // Custom domain (e.g., https://api.example.com) — use the URL directly
  return null;
}

/**
 * Get the TUS upload endpoint based on environment.
 * Production uses the storage subdomain, local uses the main URL.
 */
function getTusEndpoint(projectId: string | null): string {
  if (projectId) {
    // Production: use the storage subdomain for direct uploads
    return `https://${projectId}.supabase.co/storage/v1/upload/resumable`;
  }

  // Local development: use the main Supabase URL
  return `${SUPABASE_URL}/storage/v1/upload/resumable`;
}

/**
 * Parse Supabase storage error and return user-friendly message.
 */
function parseSupabaseError(error: unknown): { message: string; type: UploadErrorType } {
  if (typeof error !== 'object' || error === null) {
    return { message: 'Upload failed. Please try again.', type: 'unknown' };
  }

  const errorObj = error as Record<string, unknown>;
  const errorMessage = String(errorObj.message || errorObj.error || 'Upload failed');
  const errorCode = String(errorObj.code || errorObj.statusCode || '');

  // Network errors
  if (
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('ERR_INTERNET_DISCONNECTED') ||
    errorCode === 'ECONNABORTED' ||
    errorCode === 'ETIMEDOUT'
  ) {
    return {
      message: 'Network error. Please check your connection and try again.',
      type: 'network',
    };
  }

  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return {
      message:
        'Upload timed out. The file may be too large or your connection is slow. Please try again.',
      type: 'timeout',
    };
  }

  // Size limit errors
  if (
    errorMessage.includes('size') &&
    (errorMessage.includes('limit') ||
      errorMessage.includes('exceed') ||
      errorMessage.includes('too large'))
  ) {
    return {
      message: 'File is too large. Please use a smaller file.',
      type: 'size_limit',
    };
  }

  // Permission errors - be more specific to avoid false positives
  // Check for actual permission-related errors, not just any mention of these words
  const lowerMessage = errorMessage.toLowerCase();
  if (
    errorCode === '403' ||
    errorCode === '401' ||
    lowerMessage.includes('permission denied') ||
    lowerMessage.includes('insufficient permissions') ||
    (lowerMessage.includes('unauthorized') &&
      (lowerMessage.includes('access') || lowerMessage.includes('upload'))) ||
    (lowerMessage.includes('forbidden') &&
      (lowerMessage.includes('access') || lowerMessage.includes('upload'))) ||
    (lowerMessage.includes('policy') &&
      (lowerMessage.includes('violation') ||
        lowerMessage.includes('denied') ||
        lowerMessage.includes('not allowed')))
  ) {
    return {
      message:
        'You do not have permission to upload this file. Please contact support if this persists.',
      type: 'permission',
    };
  }

  // Invalid file errors
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('mime') ||
    errorMessage.includes('type') ||
    errorMessage.includes('format')
  ) {
    return {
      message: 'Invalid file type. Please check the file format and try again.',
      type: 'invalid_file',
    };
  }

  // Storage bucket errors
  if (errorMessage.includes('bucket') || errorMessage.includes('Storage')) {
    return {
      message: 'Storage error. Please try again in a few moments.',
      type: 'storage_error',
    };
  }

  // Default
  return {
    message: errorMessage || 'Upload failed. Please try again.',
    type: 'unknown',
  };
}

class UploadQueue {
  private queue: Map<string, QueuedUpload> = new Map();
  private processing: Set<string> = new Set();
  private config: Required<UploadQueueConfig>;
  private supabase = createBrowserSupabaseClient();
  private completionPromises: Map<string, Promise<{ success: true; publicUrl: string }>> =
    new Map();
  private projectId: string | null;

  constructor(config: UploadQueueConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 2000,
      uploadTimeout: config.uploadTimeout ?? 600000, // 10 minutes default for large files
      onProgress: config.onProgress ?? (() => {}),
      onComplete: config.onComplete ?? (() => {}),
      onError: config.onError ?? (() => {}),
      enableCache: config.enableCache ?? true,
      cacheTTL: config.cacheTTL ?? 30 * 24 * 60 * 60 * 1000, // 30 days default
      useTusForVideos: config.useTusForVideos ?? true, // Enable TUS for videos by default
      tusChunkSize: config.tusChunkSize ?? 6 * 1024 * 1024, // 6MB - Required by Supabase
    };

    this.projectId = getProjectId();

    // Load persisted queue from localStorage on init
    this.loadQueue();

    // Resume processing any pending uploads
    this.processQueue();
  }

  /**
   * Generate a public URL path immediately (before upload).
   * This allows us to save the URL optimistically and proceed.
   * Uses Supabase's getPublicUrl to ensure correct URL format.
   */
  private generatePublicUrl(bucket: string, fileName: string): string {
    // Use Supabase's getPublicUrl method to ensure correct URL format
    const {
      data: { publicUrl },
    } = this.supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
  }

  /**
   * Generate a unique filename for the upload.
   */
  private generateFileName(userId: string, file: File): string {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${userId}/${timestamp}-${random}.${fileExt}`;
  }

  /**
   * Add an upload to the queue and start processing immediately.
   * Returns the public URL immediately (optimistic) so navigation can proceed.
   *
   * IMPORTANT: The returned publicUrl is generated before upload completes.
   * Use `waitForCompletion()` to ensure the file actually exists before saving to database.
   *
   * Checks cache first to avoid re-uploading duplicate files.
   * Validates file size before enqueuing to provide immediate feedback.
   */
  async enqueue(
    file: File,
    bucket: string,
    userId: string,
    options?: {
      customFileName?: string;
      contentType?: string;
      maxFileSize?: number; // Optional override for file size validation
      onComplete?: (uploadId: string, publicUrl: string) => void;
      onError?: (uploadId: string, error: string, errorType: UploadErrorType) => void;
      onProgress?: (uploadId: string, progress: number) => void;
    }
  ): Promise<{ uploadId: string; publicUrl: string; cached?: boolean }> {
    // Check cache first if enabled
    if (this.config.enableCache) {
      const cached = getCachedUpload(file);
      if (cached && cached.bucket === bucket) {
        console.log('[UploadQueue] File found in cache, skipping upload');

        // Create a pseudo upload ID for consistency
        const uploadId = `cached-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Track cache hit in PostHog
        trackUploadEvent(PostHogEvents.UPLOAD_CACHE_HIT, uploadId, file, bucket, {
          cached_url: cached.url,
          user_id: userId,
        });

        // Create an already-resolved promise for waitForCompletion
        this.completionPromises.set(
          uploadId,
          Promise.resolve({ success: true as const, publicUrl: cached.url })
        );

        // Trigger per-upload onComplete callback if provided, otherwise use global
        const onComplete = options?.onComplete || this.config.onComplete;
        onComplete(uploadId, cached.url);

        return {
          uploadId,
          publicUrl: cached.url,
          cached: true,
        };
      }
    }

    // Validate file size if maxFileSize is provided
    if (options?.maxFileSize && file.size > options.maxFileSize) {
      const sizeMB = (options.maxFileSize / (1024 * 1024)).toFixed(0);
      const errorMessage = `File size exceeds the limit of ${sizeMB}MB. Please use a smaller file.`;

      // Track validation failure in PostHog
      trackUploadEvent(PostHogEvents.UPLOAD_VALIDATION_FAILED, 'pre-upload', file, bucket, {
        user_id: userId,
        validation_type: 'file_size',
        max_size_bytes: options.maxFileSize,
        max_size_human: formatFileSize(options.maxFileSize),
        error_message: errorMessage,
      });

      throw new Error(errorMessage);
    }

    // Generate filename and public URL immediately
    const fileName = options?.customFileName || this.generateFileName(userId, file);
    const publicUrl = this.generatePublicUrl(bucket, fileName);

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create promise for waitForCompletion
    let resolvePromise: QueuedUpload['resolve'];
    let rejectPromise: QueuedUpload['reject'];
    const completionPromise = new Promise<{ success: true; publicUrl: string }>(
      (resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      }
    );

    // Store the promise for waitForCompletion
    this.completionPromises.set(uploadId, completionPromise);

    const queuedUpload: QueuedUpload = {
      id: uploadId,
      file,
      bucket,
      fileName,
      publicUrl,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      progress: 0,
      onComplete: options?.onComplete,
      onError: options?.onError,
      onProgress: options?.onProgress,
      resolve: resolvePromise,
      reject: rejectPromise,
    };

    this.queue.set(uploadId, queuedUpload);
    this.saveQueue();

    // Track upload started in PostHog
    const useTus = shouldUseTusUpload(file, this.config.useTusForVideos);
    trackUploadEvent(PostHogEvents.UPLOAD_STARTED, uploadId, file, bucket, {
      user_id: userId,
      public_url: publicUrl,
      upload_method: useTus ? 'tus' : 'standard',
      use_tus_for_videos: this.config.useTusForVideos,
      max_retries: this.config.maxRetries,
      upload_timeout_ms: this.config.uploadTimeout,
    });

    // Start processing immediately
    this.processUpload(uploadId).catch(captureFireAndForget('upload_queue_process'));

    return { uploadId, publicUrl, cached: false };
  }

  /**
   * Add a signed URL upload to the queue and start processing immediately.
   * Uses server-generated signed URLs for secure direct uploads.
   *
   * This method is ideal when:
   * - Server needs to control the exact storage path
   * - Bucket policies don't allow direct client uploads
   * - You need server-side validation before upload
   *
   * The SignedUrlProvider.getSignedUrl is called on each attempt, allowing
   * fresh URLs on retry (since signed URLs can expire).
   *
   * @param file - The file to upload
   * @param provider - SignedUrlProvider with getSignedUrl function and optional callbacks
   * @param options - Upload options including callbacks and size limits
   * @returns Promise with uploadId and storagePath (available after first getSignedUrl call)
   */
  async enqueueSignedUrlUpload(
    file: File,
    provider: SignedUrlProvider,
    options?: {
      maxFileSize?: number;
      onComplete?: (uploadId: string, storagePath: string) => void;
      onError?: (uploadId: string, error: string, errorType: UploadErrorType) => void;
      onProgress?: (uploadId: string, progress: number) => void;
    }
  ): Promise<{ uploadId: string; storagePath: string }> {
    // Validate file size if maxFileSize is provided
    if (options?.maxFileSize && file.size > options.maxFileSize) {
      const sizeMB = (options.maxFileSize / (1024 * 1024)).toFixed(0);
      const errorMessage = `File size exceeds the limit of ${sizeMB}MB. Please use a smaller file.`;

      // Track validation failure in PostHog
      trackUploadEvent(PostHogEvents.UPLOAD_VALIDATION_FAILED, 'pre-upload', file, provider.bucket, {
        validation_type: 'file_size',
        max_size_bytes: options.maxFileSize,
        max_size_human: formatFileSize(options.maxFileSize),
        error_message: errorMessage,
        upload_method: 'signed_url',
      });

      throw new Error(errorMessage);
    }

    // Get initial signed URL to determine storage path
    let initialSignedUrl: { uploadUrl: string; storagePath: string };
    try {
      initialSignedUrl = await provider.getSignedUrl();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get upload URL';
      trackUploadEvent(PostHogEvents.UPLOAD_FAILED, 'pre-upload', file, provider.bucket, {
        error_message: errorMessage,
        error_type: 'signed_url_fetch',
        upload_method: 'signed_url',
      });
      throw new Error(errorMessage);
    }

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const storagePath = initialSignedUrl.storagePath;
    const fileName = storagePath.split('/').pop() || storagePath;

    // Create promise for waitForCompletion
    let resolvePromise: QueuedUpload['resolve'];
    let rejectPromise: QueuedUpload['reject'];
    const completionPromise = new Promise<{ success: true; publicUrl: string }>(
      (resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      }
    );

    // Store the promise for waitForCompletion
    this.completionPromises.set(uploadId, completionPromise);

    const queuedUpload: QueuedUpload = {
      id: uploadId,
      file,
      bucket: provider.bucket,
      fileName,
      publicUrl: storagePath, // For signed URL uploads, we use storagePath as the identifier
      storagePath,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
      progress: 0,
      uploadType: 'signed_url',
      signedUrlProvider: provider,
      onComplete: options?.onComplete,
      onError: options?.onError,
      onProgress: options?.onProgress,
      resolve: resolvePromise,
      reject: rejectPromise,
    };

    this.queue.set(uploadId, queuedUpload);
    this.saveQueue();

    // Track upload started in PostHog
    trackUploadEvent(PostHogEvents.UPLOAD_STARTED, uploadId, file, provider.bucket, {
      storage_path: storagePath,
      upload_method: 'signed_url',
      max_retries: this.config.maxRetries,
      upload_timeout_ms: this.config.uploadTimeout,
    });

    // Start processing immediately with the initial signed URL
    this.processSignedUrlUpload(uploadId, initialSignedUrl.uploadUrl).catch(captureFireAndForget('upload_queue_signed_url'));

    return { uploadId, storagePath };
  }

  /**
   * Process a signed URL upload using XMLHttpRequest for progress tracking.
   * Gets a fresh signed URL on each retry to handle URL expiration.
   */
  private async processSignedUrlUpload(uploadId: string, signedUrl: string): Promise<void> {
    const upload = this.queue.get(uploadId);
    if (!upload || upload.uploadType !== 'signed_url' || !upload.signedUrlProvider) {
      console.warn(`[UploadQueue] Signed URL upload ${uploadId} not found or invalid`);
      return;
    }

    // Prevent concurrent processing
    if (this.processing.has(uploadId)) {
      return;
    }

    this.processing.add(uploadId);
    const processStartTime = Date.now();

    try {
      upload.status = 'uploading';
      this.queue.set(uploadId, upload);
      this.saveQueue();

      // Upload using XMLHttpRequest for progress tracking
      await this.uploadWithXhr(upload, signedUrl);

      // Call onUploadComplete callback if provided (e.g., to save database record)
      if (upload.signedUrlProvider.onUploadComplete && upload.storagePath) {
        try {
          await upload.signedUrlProvider.onUploadComplete(upload.storagePath);
        } catch (saveError) {
          // If saving fails, the upload technically succeeded but we should report the error
          const errorMessage =
            saveError instanceof Error ? saveError.message : 'Failed to save upload record';
          console.error(`[UploadQueue] Failed to save record for ${uploadId}:`, saveError);

          trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
            error_message: errorMessage,
            error_type: 'save_record_failed',
            upload_method: 'signed_url',
            storage_path: upload.storagePath,
            duration_ms: Date.now() - processStartTime,
          });

          throw new Error(errorMessage);
        }
      }

      const totalDurationMs = Date.now() - processStartTime;

      // Mark as completed
      upload.status = 'completed';
      upload.completedAt = Date.now();
      upload.error = undefined;
      upload.progress = 100;
      upload.xhr = undefined;
      this.queue.set(uploadId, upload);
      this.saveQueue();

      // Track successful completion in PostHog
      const uploadSpeedMbps = upload.file.size / (totalDurationMs / 1000) / (1024 * 1024);
      trackUploadEvent(PostHogEvents.UPLOAD_COMPLETED, upload.id, upload.file, upload.bucket, {
        storage_path: upload.storagePath,
        duration_ms: totalDurationMs,
        upload_method: 'signed_url',
        upload_speed_mbps: Number(uploadSpeedMbps.toFixed(2)),
        retry_count: upload.retryCount,
        total_attempts: upload.retryCount + 1,
      });

      // Resolve the completion promise
      if (upload.resolve) {
        upload.resolve({ success: true, publicUrl: upload.storagePath || '' });
      }

      // Call per-upload callback
      const onComplete = upload.onComplete || this.config.onComplete;
      onComplete(uploadId, upload.storagePath || '');
    } catch (error) {
      console.log(`[UploadQueue] Raw error for signed URL upload ${uploadId}:`, error);

      const { message: errorMessage, type: errorType } = parseSupabaseError(error);

      // Determine if error is retryable
      const isRetryable =
        errorType === 'network' || errorType === 'timeout' || errorType === 'unknown';

      // Retry if error is retryable and we haven't exceeded max retries
      if (isRetryable && upload.retryCount < this.config.maxRetries) {
        upload.status = 'retrying';
        upload.retryCount++;
        upload.error = errorMessage;
        upload.xhr = undefined;
        this.queue.set(uploadId, upload);
        this.saveQueue();

        console.log(
          `[UploadQueue] Retrying signed URL upload ${uploadId} (attempt ${upload.retryCount}/${this.config.maxRetries})`
        );

        // Track retry attempt
        trackUploadEvent(PostHogEvents.UPLOAD_RETRYING, upload.id, upload.file, upload.bucket, {
          retry_attempt: upload.retryCount,
          max_retries: this.config.maxRetries,
          error_message: errorMessage,
          error_type: errorType,
          upload_method: 'signed_url',
          duration_before_retry_ms: Date.now() - processStartTime,
        });

        // Get fresh signed URL for retry (previous one might have expired)
        const retryDelay =
          errorType === 'network'
            ? this.config.retryDelay * Math.pow(2, upload.retryCount - 1)
            : this.config.retryDelay;

        setTimeout(async () => {
          try {
            // Get fresh signed URL
            const freshUrl = await upload.signedUrlProvider!.getSignedUrl();
            upload.storagePath = freshUrl.storagePath;
            this.queue.set(uploadId, upload);
            this.processSignedUrlUpload(uploadId, freshUrl.uploadUrl).catch(captureFireAndForget('upload_queue_signed_url'));
          } catch (urlError) {
            // If we can't get a fresh URL, fail the upload
            console.error(`[UploadQueue] Failed to get fresh URL for retry ${uploadId}:`, urlError);
            upload.status = 'failed';
            upload.error = 'Failed to get upload URL for retry';
            this.queue.set(uploadId, upload);
            this.saveQueue();
            if (upload.reject) {
              upload.reject({
                success: false,
                error: 'Failed to get upload URL for retry',
                errorType: 'unknown',
              });
            }
          }
        }, retryDelay);
      } else {
        // Max retries exceeded or non-retryable error
        upload.status = 'failed';
        upload.error = errorMessage;
        upload.xhr = undefined;
        this.queue.set(uploadId, upload);
        this.saveQueue();

        console.error(`[UploadQueue] Signed URL upload ${uploadId} failed:`, errorMessage);

        trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
          error_message: errorMessage,
          error_type: errorType,
          upload_method: 'signed_url',
          retry_count: upload.retryCount,
          max_retries: this.config.maxRetries,
          is_retryable: isRetryable,
          total_duration_ms: Date.now() - upload.createdAt,
          final_failure: true,
        });

        if (upload.reject) {
          upload.reject({ success: false, error: errorMessage, errorType });
        }

        const onError = upload.onError || this.config.onError;
        onError(uploadId, errorMessage, errorType);
      }
    } finally {
      this.processing.delete(uploadId);
    }
  }

  /**
   * Upload file using XMLHttpRequest with progress tracking.
   * Used for signed URL uploads where we need progress events.
   */
  private uploadWithXhr(upload: QueuedUpload, signedUrl: string): Promise<void> {
    const uploadStartTime = Date.now();

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      upload.xhr = xhr;
      this.queue.set(upload.id, upload);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          const previousProgress = upload.progress || 0;
          upload.progress = progress;
          this.queue.set(upload.id, upload);

          // Call progress callbacks
          const onProgress = upload.onProgress || this.config.onProgress;
          onProgress(upload.id, progress);

          // Track progress at milestones
          const milestones = [25, 50, 75];
          for (const milestone of milestones) {
            if (previousProgress < milestone && progress >= milestone) {
              trackUploadEvent(
                PostHogEvents.UPLOAD_PROGRESS,
                upload.id,
                upload.file,
                upload.bucket,
                {
                  progress_percent: milestone,
                  bytes_uploaded: event.loaded,
                  bytes_total: event.total,
                  duration_ms: Date.now() - uploadStartTime,
                  upload_method: 'signed_url',
                }
              );
            }
          }

          console.log(
            `[UploadQueue] Signed URL progress for ${upload.id}: ${progress}% (${event.loaded}/${event.total})`
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText || 'Unknown error'}`)
          );
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Configure and send
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', upload.file.type || 'application/octet-stream');
      xhr.timeout = this.config.uploadTimeout;
      xhr.send(upload.file);
    });
  }

  /**
   * Upload file using TUS resumable upload protocol.
   * This is more reliable for large files and handles network interruptions gracefully.
   */
  private async processUploadWithTus(upload: QueuedUpload): Promise<void> {
    const uploadStartTime = Date.now();

    return new Promise((resolve, reject) => {
      console.log(
        `[UploadQueue] Starting TUS upload for ${upload.id} (${(upload.file.size / 1024 / 1024).toFixed(2)}MB)`
      );

      // Track TUS upload started
      trackUploadEvent(PostHogEvents.UPLOAD_TUS_STARTED, upload.id, upload.file, upload.bucket, {
        tus_endpoint: getTusEndpoint(this.projectId),
        chunk_size_bytes: this.config.tusChunkSize,
        chunk_size_human: formatFileSize(this.config.tusChunkSize),
      });

      // Get the TUS endpoint (handles both local and production URLs)
      const tusEndpoint = getTusEndpoint(this.projectId);

      const tusUpload = new tus.Upload(upload.file, {
        endpoint: tusEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000], // Built-in retry with exponential backoff
        headers: {
          // For Supabase TUS uploads, we need both apikey and authorization
          // The apikey identifies the project, authorization is for the anon role
          apikey: SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'x-upsert': 'false', // Don't overwrite existing files
        },
        uploadDataDuringCreation: true,
        // Remove fingerprint after success to allow re-uploading same file
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: upload.bucket,
          objectName: upload.fileName,
          contentType: upload.file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        // IMPORTANT: Chunk size must be 6MB for Supabase
        chunkSize: this.config.tusChunkSize,
        onError: (error) => {
          console.error(`[UploadQueue] TUS upload error for ${upload.id}:`, error);

          // Track TUS-specific error details in PostHog
          trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
            error_message: error instanceof Error ? error.message : String(error),
            error_type: 'tus_error',
            upload_method: 'tus',
            bytes_uploaded: upload.progress
              ? Math.round((upload.progress / 100) * upload.file.size)
              : 0,
            duration_ms: Date.now() - uploadStartTime,
            tus_endpoint: tusEndpoint,
          });

          reject(error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const progress = Math.round((bytesUploaded / bytesTotal) * 100);
          const previousProgress = upload.progress || 0;
          upload.progress = progress;
          this.queue.set(upload.id, upload);

          // Call progress callbacks
          const onProgress = upload.onProgress || this.config.onProgress;
          onProgress(upload.id, progress);

          // Track progress at milestones (25%, 50%, 75%) to avoid event spam
          const milestones = [25, 50, 75];
          for (const milestone of milestones) {
            if (previousProgress < milestone && progress >= milestone) {
              trackUploadEvent(
                PostHogEvents.UPLOAD_PROGRESS,
                upload.id,
                upload.file,
                upload.bucket,
                {
                  progress_percent: milestone,
                  bytes_uploaded: bytesUploaded,
                  bytes_total: bytesTotal,
                  duration_ms: Date.now() - uploadStartTime,
                  upload_method: 'tus',
                }
              );
            }
          }

          console.log(
            `[UploadQueue] TUS progress for ${upload.id}: ${progress}% (${bytesUploaded}/${bytesTotal})`
          );
        },
        onSuccess: () => {
          const durationMs = Date.now() - uploadStartTime;
          console.log(`[UploadQueue] TUS upload completed for ${upload.id} in ${durationMs}ms`);
          resolve();
        },
      });

      // Store TUS upload instance for potential abort
      upload.tusUpload = tusUpload;
      this.queue.set(upload.id, upload);

      // Check for previous uploads to resume
      tusUpload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          console.log(
            `[UploadQueue] Found ${previousUploads.length} previous uploads for ${upload.id}, resuming...`
          );

          // Track TUS resume event
          trackUploadEvent(
            PostHogEvents.UPLOAD_TUS_RESUMED,
            upload.id,
            upload.file,
            upload.bucket,
            {
              previous_uploads_found: previousUploads.length,
            }
          );

          tusUpload.resumeFromPreviousUpload(previousUploads[0]);
        }
        // Start the upload
        tusUpload.start();
      });
    });
  }

  /**
   * Upload file using standard Supabase storage upload.
   * Good for smaller files where resumability isn't needed.
   */
  private async processUploadWithStandard(upload: QueuedUpload): Promise<{ durationMs: number }> {
    const uploadStartTime = Date.now();
    console.log(
      `[UploadQueue] Starting standard upload for ${upload.id} (${(upload.file.size / 1024 / 1024).toFixed(2)}MB)`
    );

    // Create upload promise with timeout
    const uploadPromise = this.supabase.storage
      .from(upload.bucket)
      .upload(upload.fileName, upload.file, {
        contentType: upload.file.type || undefined,
        upsert: false,
      });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error(
          `Upload timeout after ${this.config.uploadTimeout}ms. The file may be too large or your connection is slow.`
        );

        // Track timeout error
        trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
          error_message: timeoutError.message,
          error_type: 'timeout',
          upload_method: 'standard',
          timeout_ms: this.config.uploadTimeout,
          duration_ms: Date.now() - uploadStartTime,
        });

        reject(timeoutError);
      }, this.config.uploadTimeout);
    });

    // Race between upload and timeout
    const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);
    const durationMs = Date.now() - uploadStartTime;

    if (error) {
      // Track standard upload error
      trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
        error_message: error.message,
        error_type: 'supabase_error',
        upload_method: 'standard',
        duration_ms: durationMs,
        supabase_error_name: error.name,
      });

      throw error;
    }

    if (!data) {
      const noDataError = new Error('Upload completed but no data returned');

      // Track this unusual error condition
      trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
        error_message: noDataError.message,
        error_type: 'no_data_returned',
        upload_method: 'standard',
        duration_ms: durationMs,
      });

      throw noDataError;
    }

    return { durationMs };
  }

  /**
   * Process a single upload with timeout and improved error handling.
   * Automatically chooses TUS or standard upload based on file type and size.
   */
  private async processUpload(uploadId: string): Promise<void> {
    const upload = this.queue.get(uploadId);
    if (!upload) {
      console.warn(`[UploadQueue] Upload ${uploadId} not found`);
      return;
    }

    // Prevent concurrent processing of the same upload
    if (this.processing.has(uploadId)) {
      return;
    }

    this.processing.add(uploadId);
    const processStartTime = Date.now();

    try {
      upload.status = 'uploading';
      this.saveQueue();

      // Decide whether to use TUS or standard upload
      const useTus = shouldUseTusUpload(upload.file, this.config.useTusForVideos);

      if (useTus) {
        await this.processUploadWithTus(upload);
      } else {
        await this.processUploadWithStandard(upload);
      }

      // Verify the URL is accessible
      const {
        data: { publicUrl },
      } = this.supabase.storage.from(upload.bucket).getPublicUrl(upload.fileName);

      const totalDurationMs = Date.now() - processStartTime;

      upload.status = 'completed';
      upload.completedAt = Date.now();
      upload.publicUrl = publicUrl; // Use the actual public URL from Supabase
      upload.error = undefined; // Clear any previous errors
      upload.progress = 100;
      upload.tusUpload = undefined; // Clear TUS instance
      this.queue.set(uploadId, upload);
      this.saveQueue();

      // Track successful completion in PostHog
      const uploadSpeedMbps = upload.file.size / (totalDurationMs / 1000) / (1024 * 1024);
      trackUploadEvent(PostHogEvents.UPLOAD_COMPLETED, upload.id, upload.file, upload.bucket, {
        public_url: publicUrl,
        duration_ms: totalDurationMs,
        upload_method: useTus ? 'tus' : 'standard',
        upload_speed_mbps: Number(uploadSpeedMbps.toFixed(2)),
        retry_count: upload.retryCount,
        total_attempts: upload.retryCount + 1,
        cached: false,
      });

      // Cache the successful upload if caching is enabled
      if (this.config.enableCache) {
        addToUploadCache(upload.file, publicUrl, upload.bucket, upload.fileName, {
          ttl: this.config.cacheTTL,
        });
      }

      // Resolve the completion promise
      if (upload.resolve) {
        upload.resolve({ success: true, publicUrl });
      }

      // Call per-upload callback if provided, otherwise use global
      const onComplete = upload.onComplete || this.config.onComplete;
      onComplete(uploadId, publicUrl);
    } catch (error) {
      // Log the raw error for debugging
      console.log(`[UploadQueue] Raw error for ${uploadId}:`, error);

      // Parse error for user-friendly message
      const { message: errorMessage, type: errorType } = parseSupabaseError(error);
      const useTus = shouldUseTusUpload(upload.file, this.config.useTusForVideos);

      // Determine if error is retryable
      const isRetryable =
        errorType === 'network' || errorType === 'timeout' || errorType === 'unknown';

      // Retry if error is retryable and we haven't exceeded max retries
      if (isRetryable && upload.retryCount < this.config.maxRetries) {
        upload.status = 'retrying';
        upload.retryCount++;
        upload.error = errorMessage;
        upload.tusUpload = undefined; // Clear TUS instance for retry
        this.queue.set(uploadId, upload);
        this.saveQueue();

        console.log(
          `[UploadQueue] Retrying upload ${uploadId} (attempt ${upload.retryCount}/${this.config.maxRetries})`
        );

        // Track retry attempt in PostHog
        trackUploadEvent(PostHogEvents.UPLOAD_RETRYING, upload.id, upload.file, upload.bucket, {
          retry_attempt: upload.retryCount,
          max_retries: this.config.maxRetries,
          error_message: errorMessage,
          error_type: errorType,
          upload_method: useTus ? 'tus' : 'standard',
          duration_before_retry_ms: Date.now() - processStartTime,
        });

        // Retry after delay (exponential backoff for network errors)
        const retryDelay =
          errorType === 'network'
            ? this.config.retryDelay * Math.pow(2, upload.retryCount - 1) // Exponential backoff
            : this.config.retryDelay;

        setTimeout(() => {
          this.processUpload(uploadId).catch(captureFireAndForget('upload_queue_process'));
        }, retryDelay);
      } else {
        // Max retries exceeded or non-retryable error
        upload.status = 'failed';
        upload.error = errorMessage;
        upload.tusUpload = undefined; // Clear TUS instance
        this.queue.set(uploadId, upload);
        this.saveQueue();

        console.error(`[UploadQueue] Upload ${uploadId} failed:`, errorMessage, errorType);

        // Track final failure in PostHog (this is when all retries exhausted or non-retryable error)
        trackUploadEvent(PostHogEvents.UPLOAD_FAILED, upload.id, upload.file, upload.bucket, {
          error_message: errorMessage,
          error_type: errorType,
          upload_method: useTus ? 'tus' : 'standard',
          retry_count: upload.retryCount,
          max_retries: this.config.maxRetries,
          is_retryable: isRetryable,
          total_duration_ms: Date.now() - upload.createdAt,
          final_failure: true,
        });

        // Reject the completion promise
        if (upload.reject) {
          upload.reject({ success: false, error: errorMessage, errorType });
        }

        // Call per-upload callback if provided, otherwise use global
        const onError = upload.onError || this.config.onError;
        onError(uploadId, errorMessage, errorType);
      }
    } finally {
      this.processing.delete(uploadId);
    }
  }

  /**
   * Process all pending uploads in the queue.
   */
  private async processQueue(): Promise<void> {
    const pendingUploads = Array.from(this.queue.values()).filter(
      (upload) => upload.status === 'pending' || upload.status === 'retrying'
    );

    for (const upload of pendingUploads) {
      // Process with small delay to avoid overwhelming the browser
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.processUpload(upload.id).catch(captureFireAndForget('upload_queue_process'));
    }
  }

  /**
   * Get upload status.
   */
  getStatus(uploadId: string): QueuedUpload | null {
    return this.queue.get(uploadId) || null;
  }

  /**
   * Get all uploads.
   */
  getAllUploads(): QueuedUpload[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get upload progress percentage (0-100).
   */
  getProgress(uploadId: string): number {
    const upload = this.queue.get(uploadId);
    return upload?.progress ?? 0;
  }

  /**
   * Wait for an upload to complete.
   * Returns a promise that resolves when the upload succeeds or rejects when it fails.
   *
   * IMPORTANT: Use this method before saving URLs to the database to ensure
   * the file actually exists in storage.
   *
   * @param uploadId - The upload ID returned from enqueue()
   * @returns Promise that resolves with { success: true, publicUrl } or rejects with { success: false, error, errorType }
   *
   * @example
   * ```typescript
   * const { uploadId, publicUrl } = await uploadQueue.enqueue(file, bucket, userId);
   *
   * // Wait for upload to actually complete before saving to database
   * try {
   *   const result = await uploadQueue.waitForCompletion(uploadId);
   *   // Now safe to save result.publicUrl to database
   *   await saveToDatabase(result.publicUrl);
   * } catch (error) {
   *   // Upload failed, don't save the URL
   *   console.error('Upload failed:', error.error);
   * }
   * ```
   */
  waitForCompletion(uploadId: string): Promise<{ success: true; publicUrl: string }> {
    const promise = this.completionPromises.get(uploadId);
    if (!promise) {
      // Check if upload already completed
      const upload = this.queue.get(uploadId);
      if (upload?.status === 'completed') {
        return Promise.resolve({ success: true, publicUrl: upload.publicUrl });
      }
      if (upload?.status === 'failed') {
        return Promise.reject({
          success: false,
          error: upload.error || 'Upload failed',
          errorType: 'unknown',
        });
      }
      return Promise.reject({ success: false, error: 'Upload not found', errorType: 'unknown' });
    }
    return promise;
  }

  /**
   * Abort an in-progress upload.
   * Handles TUS uploads, XHR (signed URL) uploads, and standard uploads.
   */
  abort(uploadId: string): void {
    const upload = this.queue.get(uploadId);
    if (!upload) return;

    // Determine upload method for tracking
    let uploadMethod: 'tus' | 'standard' | 'signed_url' = 'standard';
    if (upload.uploadType === 'signed_url') {
      uploadMethod = 'signed_url';
    } else if (shouldUseTusUpload(upload.file, this.config.useTusForVideos)) {
      uploadMethod = 'tus';
    }

    // Abort TUS upload if active
    if (upload.tusUpload) {
      try {
        upload.tusUpload.abort();
      } catch (e) {
        console.warn(`[UploadQueue] Failed to abort TUS upload ${uploadId}:`, e);
      }
    }

    // Abort XHR upload if active (used by signed URL uploads)
    if (upload.xhr) {
      try {
        upload.xhr.abort();
      } catch (e) {
        console.warn(`[UploadQueue] Failed to abort XHR upload ${uploadId}:`, e);
      }
    }

    // Track abort in PostHog
    trackUploadEvent(PostHogEvents.UPLOAD_ABORTED, upload.id, upload.file, upload.bucket, {
      progress_at_abort: upload.progress,
      status_at_abort: upload.status,
      upload_method: uploadMethod,
      duration_before_abort_ms: Date.now() - upload.createdAt,
    });

    // Mark as failed and clean up
    upload.status = 'failed';
    upload.error = 'Upload aborted by user';
    upload.tusUpload = undefined;
    upload.xhr = undefined;
    this.queue.set(uploadId, upload);
    this.processing.delete(uploadId);
    this.saveQueue();

    // Reject the completion promise
    if (upload.reject) {
      upload.reject({ success: false, error: 'Upload aborted by user', errorType: 'unknown' });
    }
  }

  /**
   * Remove an upload from the queue.
   */
  remove(uploadId: string): void {
    const upload = this.queue.get(uploadId);

    // Abort if still in progress
    if (upload?.tusUpload) {
      try {
        upload.tusUpload.abort();
      } catch (e) {
        // Ignore abort errors
      }
    }

    this.queue.delete(uploadId);
    this.processing.delete(uploadId);
    this.completionPromises.delete(uploadId);
    this.saveQueue();
  }

  /**
   * Clear completed uploads older than specified age.
   */
  clearCompleted(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, upload] of this.queue.entries()) {
      if (
        upload.status === 'completed' &&
        upload.completedAt &&
        now - upload.completedAt > olderThanMs
      ) {
        this.queue.delete(id);
        this.completionPromises.delete(id);
      }
    }
    this.saveQueue();
  }

  /**
   * Save queue state to localStorage for persistence.
   */
  private saveQueue(): void {
    if (typeof window === 'undefined') return;

    try {
      // Convert File objects to metadata (we can't store File objects in localStorage)
      // Don't store TUS upload instances
      const serializable = Array.from(this.queue.values()).map((upload) => ({
        id: upload.id,
        bucket: upload.bucket,
        fileName: upload.fileName,
        publicUrl: upload.publicUrl,
        status: upload.status,
        error: upload.error,
        retryCount: upload.retryCount,
        createdAt: upload.createdAt,
        completedAt: upload.completedAt,
        progress: upload.progress,
        fileMetadata: {
          name: upload.file.name,
          size: upload.file.size,
          type: upload.file.type,
        },
      }));

      localStorage.setItem('8x_upload_queue', JSON.stringify(serializable));
    } catch (error) {
      console.error('[UploadQueue] Failed to save queue:', error);
    }
  }

  /**
   * Load queue state from localStorage.
   * Note: File objects are not restored, only metadata.
   */
  private loadQueue(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('8x_upload_queue');
      if (!stored) return;

      type StoredUpload = {
        id: string;
        bucket: string;
        fileName: string;
        publicUrl: string;
        status: UploadStatus;
        error?: string;
        retryCount: number;
        createdAt: number;
        completedAt?: number;
        progress?: number;
        fileMetadata: {
          name: string;
          size: number;
          type: string;
        };
      };

      const storedUploads = JSON.parse(stored) as StoredUpload[];

      // Restore upload metadata (but not File objects, as they can't be serialized)
      // Completed uploads are fine, but pending/failed ones would need to be re-queued
      for (const storedUpload of storedUploads) {
        if (storedUpload.status === 'completed') {
          // Only restore completed uploads (they have valid URLs)
          this.queue.set(storedUpload.id, {
            id: storedUpload.id,
            bucket: storedUpload.bucket,
            fileName: storedUpload.fileName,
            publicUrl: storedUpload.publicUrl,
            status: storedUpload.status,
            error: storedUpload.error,
            retryCount: storedUpload.retryCount,
            createdAt: storedUpload.createdAt,
            completedAt: storedUpload.completedAt,
            progress: storedUpload.progress ?? 100,
            file: new File([], storedUpload.fileMetadata.name, {
              type: storedUpload.fileMetadata.type,
            }),
          });
        }
      }
    } catch (error) {
      console.error('[UploadQueue] Failed to load queue:', error);
    }
  }
}

// Singleton instance
let uploadQueueInstance: UploadQueue | null = null;

/**
 * Get or create the upload queue instance.
 */
export function getUploadQueue(config?: UploadQueueConfig): UploadQueue {
  if (!uploadQueueInstance) {
    uploadQueueInstance = new UploadQueue(config);
  }
  return uploadQueueInstance;
}

