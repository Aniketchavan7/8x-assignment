import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Intro-videos bucket is the same across all environments (staging and
// prod commingle, same convention as post-videos). Hardcoded because env
// vars would just be ceremony.
export const INTRO_VIDEOS_BUCKET = 'intro-videos';
export const INTRO_VIDEOS_PUBLIC_URL = 'https://intro-videos.example.com';

// Canonical mime types for the video extensions the intro-video and
// job-media buckets accept. Kept in one place so the presigned-URL
// signer and the server-side fallbacks can't drift apart.
export const VIDEO_EXT_TO_CONTENT_TYPE: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
};

let client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }
  return client;
}

// --- Existing post-videos helpers ---

export async function uploadToR2(
  path: string,
  data: Blob,
  contentType: string
): Promise<void> {
  const buffer = Buffer.from(await data.arrayBuffer());
  await getClient().send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: path,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    })
  );
}

export function getR2PublicUrl(path: string): string {
  return `${requireEnv('R2_PUBLIC_URL').replace(/\/$/, '')}/${path}`;
}

// --- Generic R2 operations (bucket-parameterized) ---

export async function getR2SignedUrl(
  bucket: string,
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

export async function getR2SignedUploadUrl(
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

export async function deleteFromR2(bucket: string, key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key }),
  );
}

export async function deleteMultipleFromR2(bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // Batch delete up to 1000 keys per request (S3/R2 limit)
  const chunkSize = 1000;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })) },
      }),
    );
  }
}

export type R2Object = {
  key: string;
  size: number;
  lastModified: Date | undefined;
};

export async function listR2Objects(
  bucket: string,
  prefix: string,
): Promise<R2Object[]> {
  const results: R2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents || []) {
      if (obj.Key) {
        results.push({
          key: obj.Key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified,
        });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}

export async function uploadBufferToR2(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  options?: { cacheControl?: string },
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(options?.cacheControl ? { CacheControl: options.cacheControl } : {}),
    }),
  );
}

export async function downloadFromR2(
  bucket: string,
  key: string,
): Promise<{ body: ReadableStream | null; contentType: string | undefined }> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return {
    body: response.Body?.transformToWebStream() ?? null,
    contentType: response.ContentType,
  };
}

export async function downloadBufferFromR2(
  bucket: string,
  key: string,
): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty response from R2 for key: ${key}`);
  return Buffer.from(bytes);
}

export async function r2ObjectExists(
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'NoSuchKey' || err.name === 'NotFound')) return false;
    throw err;
  }
}

export function getManagedCreatorsBucket(): string {
  return requireEnv('R2_MANAGED_CREATORS_BUCKET');
}
