'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X, Upload, Trash2, Loader2, Video, CheckCircle2 } from 'lucide-react';
import { LazyVideoPlayer } from '@/components/shared/LazyVideoPlayer';
import type { PipelineGridData } from '@/components/Admin/AdminGrid/pipelineColumnDefs';
import type { OnboardingVideo } from '@/app/api/admin/managed-creators/[id]/onboarding-videos/route';

const EXT_MAP: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

interface CreatorVideosPanelProps {
  row: PipelineGridData;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onRefresh: () => void;
}

export function CreatorVideosPanel({
  row,
  onClose,
  onStatusChange,
  onRefresh,
}: CreatorVideosPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ['/api/admin/managed-creators', row.id, 'onboarding-videos'],
    [row.id],
  );

  const { data, isLoading } = useQuery<{ data: OnboardingVideo[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/managed-creators/${row.id}/onboarding-videos`,
      );
      if (!res.ok) throw new Error('Failed to fetch videos');
      return res.json();
    },
  });

  const videos = data?.data || [];

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      try {
        const ext = EXT_MAP[file.type] || 'mp4';

        // Step 1: Get signed upload URL
        const urlRes = await fetch(
          `/api/admin/managed-creators/${row.id}/onboarding-videos/upload-url?ext=${ext}`,
        );
        if (!urlRes.ok) {
          const err = await urlRes.json();
          setUploadError(err.error || 'Failed to get upload URL');
          return;
        }
        const { signedUrl, storagePath } = await urlRes.json();

        // Step 2: Upload file directly to Supabase via XHR (with progress)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', file.type);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Upload failed'));
          xhr.send(file);
        });

        // Step 3: Save metadata
        const saveRes = await fetch(
          `/api/admin/managed-creators/${row.id}/onboarding-videos`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storage_path: storagePath }),
          },
        );

        if (!saveRes.ok) {
          const err = await saveRes.json();
          setUploadError(err.error || 'Failed to save video');
          return;
        }

        invalidate();

        if (updateStatus && row.status !== 'test_videos_submitted') {
          onStatusChange(row.id, 'test_videos_submitted');
          onRefresh();
        }
      } catch {
        setUploadError('Upload failed');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [row.id, row.status, updateStatus, invalidate, onStatusChange, onRefresh],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleDelete = useCallback(
    async (path: string) => {
      setDeletingPath(path);
      try {
        const res = await fetch(
          `/api/admin/managed-creators/${row.id}/onboarding-videos?path=${encodeURIComponent(path)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          console.error('Delete failed:', await res.text());
        }
        invalidate();
      } finally {
        setDeletingPath(null);
      }
    },
    [row.id, invalidate],
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <h3 className="text-sm font-semibold truncate">
            Videos &mdash; {row.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-12">
            <Video className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No onboarding videos yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <div key={video.path} className="rounded-lg border overflow-hidden">
                <div className="aspect-[9/16] max-h-[400px] bg-muted">
                  <LazyVideoPlayer src={video.url} />
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="text-xs text-muted-foreground truncate">
                    {video.filename}
                  </span>
                  <button
                    type="button"
                    disabled={deletingPath === video.path}
                    onClick={() => handleDelete(video.path)}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1 flex-shrink-0"
                  >
                    {deletingPath === video.path ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload section */}
      <div className="border-t px-4 py-3 space-y-3 flex-shrink-0">
        {uploadError && (
          <p className="text-xs text-destructive">{uploadError}</p>
        )}

        {isUploading && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={updateStatus}
            onChange={(e) => setUpdateStatus(e.target.checked)}
            className="accent-primary h-3.5 w-3.5"
          />
          <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
          Update status to &quot;Video Submitted&quot;
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={handleFileChange}
          className="hidden"
        />

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {isUploading ? 'Uploading...' : 'Upload Video'}
        </Button>
      </div>
    </div>
  );
}
