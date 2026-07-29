import { getR2PublicUrl, uploadToR2 } from '@/lib/storage/r2';
import { countryNameToISO } from '@/lib/utils/country-iso-mapping';

export const PERMANENT_ERRORS = ['no_download_url', 'Invalid content type:'];

export const TIKTOK_API_HOST = 'tiktok-api23.p.rapidapi.com';
export const SCRAPTIK_API_HOST = 'scraptik.p.rapidapi.com';

export const VIDEO_DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AppBot/1.0; +https://example.com)',
  Accept: 'video/mp4,video/webm,video/*,*/*;q=0.8',
  Referer: 'https://www.tiktok.com/',
};

export const IMAGE_DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AppBot/1.0; +https://example.com)',
  Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8',
  Referer: 'https://www.tiktok.com/',
};

export interface FreshUrlResult {
  videoUrl?: string;
  imageUrls?: string[];
  error?: string;
}

export interface VideoDownloadResult {
  success: boolean;
  storageUrl?: string;
  buffer?: Buffer;
  error?: string;
  permanent?: boolean;
  urlSource?: 'raw_data' | 'download_api' | 'api' | 'scraptik';
}

export function countryNameToRegionCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const iso = countryNameToISO(country);
  if (!iso || iso === 'US') return null;
  return iso;
}

export function isPermanentError(error: string): boolean {
  return PERMANENT_ERRORS.some((prefix) => error.startsWith(prefix));
}

/**
 * Extract the video download URL from a post's raw_data.
 * Handles both Scraptik raw format and transformAweme format.
 */
export function getVideoDownloadUrl(rawData: Record<string, unknown> | null): string | null {
  if (!rawData) return null;

  const video = rawData.video as Record<string, unknown> | undefined;
  if (!video) return null;

  // Scraptik format: video.download_addr.url_list[0]
  const downloadAddr = video.download_addr as Record<string, unknown> | undefined;
  if (downloadAddr) {
    const urlList = downloadAddr.url_list as string[] | undefined;
    if (urlList && urlList.length > 0 && urlList[0]) {
      return urlList[0];
    }
  }

  // Transformed format: video.downloadAddr
  if (typeof video.downloadAddr === 'string' && video.downloadAddr) {
    return video.downloadAddr;
  }

  // Fallback: play_addr
  const playAddr = video.play_addr as Record<string, unknown> | undefined;
  if (playAddr) {
    const urlList = playAddr.url_list as string[] | undefined;
    if (urlList && urlList.length > 0 && urlList[0]) {
      return urlList[0];
    }
  }

  if (typeof video.playAddr === 'string' && video.playAddr) {
    return video.playAddr;
  }

  return null;
}

/**
 * Extract image URLs from a carousel/slideshow post's raw_data.
 * Returns array of image URLs or null if none found.
 */
export function getCarouselImageUrls(rawData: Record<string, unknown> | null): string[] | null {
  if (!rawData) return null;

  const imagePost = rawData.imagePost as Record<string, unknown> | undefined;
  if (!imagePost) return null;

  const images = imagePost.images as Array<Record<string, unknown>> | undefined;
  if (!images || images.length === 0) return null;

  const urls: string[] = [];
  for (const img of images) {
    const imageURL = img.imageURL as Record<string, unknown> | undefined;
    if (imageURL) {
      const urlList = imageURL.urlList as string[] | undefined;
      if (urlList && urlList[0]) {
        urls.push(urlList[0]);
        continue;
      }
    }
    // Scraptik raw format: display_image.url_list
    const displayImage = img.display_image as Record<string, unknown> | undefined;
    if (displayImage) {
      const urlList = displayImage.url_list as string[] | undefined;
      if (urlList && urlList[0]) {
        urls.push(urlList[0]);
      }
    }
  }

  return urls.length > 0 ? urls : null;
}

/**
 * Fetch a video download URL using the dedicated download video API endpoint.
 * Purpose-built for downloading -- returns working URLs unlike the post/detail
 * endpoint which often returns webapp-prime URLs that require cookies.
 */
export async function fetchDirectDownloadUrl(
  postId: string,
  tiktokUsername: string,
  rapidApiKey: string
): Promise<FreshUrlResult> {
  const tiktokUrl = `https://www.tiktok.com/@${tiktokUsername}/video/${postId}`;
  const apiUrl = `https://${TIKTOK_API_HOST}/api/download/video?url=${encodeURIComponent(tiktokUrl)}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': TIKTOK_API_HOST,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Download Video API error: ${response.status}` };
  }

  const data = (await response.json()) as { play?: string; play_watermark?: string };

  if (data.play && typeof data.play === 'string' && data.play.startsWith('http')) {
    return { videoUrl: data.play };
  }

  console.warn(`[video-download] Download Video API returned no play URL for ${postId}:`, JSON.stringify(data));
  return { error: 'No video URL in Download Video response' };
}

export async function fetchPostDetail(postId: string, rapidApiKey: string): Promise<FreshUrlResult> {
  const url = `https://${TIKTOK_API_HOST}/api/post/detail?videoId=${postId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': TIKTOK_API_HOST,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `Post detail API error: ${response.status}` };
  }

  const data = (await response.json()) as {
    itemInfo?: {
      itemStruct?: {
        video?: { downloadAddr?: string; playAddr?: string };
        imagePost?: {
          images?: Array<{ imageURL?: { urlList?: string[] } }>;
        };
      };
    };
    statusCode?: number;
    statusMsg?: string;
  };

  if (data.statusCode !== undefined && data.statusCode !== 0) {
    return { error: data.statusMsg || `Post detail status: ${data.statusCode}` };
  }

  const item = data.itemInfo?.itemStruct;
  if (!item) {
    return { error: 'No post data in detail response' };
  }

  // Check if carousel
  const images = item.imagePost?.images;
  if (images && images.length > 0) {
    const freshImageUrls = images
      .map((img) => img.imageURL?.urlList?.[0])
      .filter((u): u is string => !!u);
    return freshImageUrls.length > 0
      ? { imageUrls: freshImageUrls }
      : { error: 'No image URLs in detail response' };
  }

  // Video -- skip webapp-prime URLs that require cookies
  const candidates = [item.video?.downloadAddr, item.video?.playAddr].filter(Boolean) as string[];
  const videoUrl = candidates.find((u) => !u.includes('webapp-prime'));
  if (videoUrl) {
    return { videoUrl };
  }

  const hasWebappPrime = candidates.some((u) => u.includes('webapp-prime'));
  return { error: hasWebappPrime ? 'API returned webapp-prime URL' : 'No video URL in detail response' };
}

/**
 * Fetch fresh download URLs for a TikTok post via the post detail API.
 * Used as fallback when the direct download API fails, and as primary for carousels.
 */
export async function fetchFreshDownloadUrls(postId: string): Promise<FreshUrlResult> {
  const rapidApiKey = process.env.RAPIDAPI_KEY_TIKTOK;
  if (!rapidApiKey) {
    return { error: 'RAPIDAPI_KEY_TIKTOK not configured' };
  }

  try {
    const result = await fetchPostDetail(postId, rapidApiKey);
    if (result.imageUrls || result.videoUrl) {
      return result;
    }
    return { error: result.error || 'no_download_url' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[video-download] Post detail API network error for ${postId}: ${msg}`);
    return { error: `Post detail API network error: ${msg}` };
  }
}

/**
 * Fetch download URLs via ScrapTik's region-aware /get-post endpoint.
 * Used as fallback when tiktok-api23 URLs are region-blocked (403).
 * Handles both videos (download_addr/play_addr) and carousels (image_post_info).
 */
export async function fetchScrapTikPostUrls(
  postId: string,
  regionCode: string,
  rapidApiKey: string
): Promise<FreshUrlResult> {
  const apiUrl = `https://${SCRAPTIK_API_HOST}/get-post?aweme_id=${postId}&region=${encodeURIComponent(regionCode)}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': SCRAPTIK_API_HOST,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return { error: `ScrapTik API error: ${response.status}` };
  }

  const data = (await response.json()) as {
    aweme_detail?: {
      video?: {
        download_addr?: { url_list?: string[] };
        play_addr?: { url_list?: string[] };
      };
      image_post_info?: {
        images?: Array<{ display_image?: { url_list?: string[] } }>;
      };
    };
    status_code?: number;
    status_msg?: string;
  };

  if (data.status_code !== undefined && data.status_code !== 0) {
    return { error: data.status_msg || `ScrapTik status: ${data.status_code}` };
  }

  const detail = data.aweme_detail;
  if (!detail) {
    return { error: 'No post data in ScrapTik response' };
  }

  // Carousel images
  const images = detail.image_post_info?.images;
  if (images && images.length > 0) {
    const urls = images
      .map((img) => img.display_image?.url_list?.[0])
      .filter((u): u is string => !!u);
    return urls.length > 0
      ? { imageUrls: urls }
      : { error: 'No image URLs in ScrapTik response' };
  }

  // Video
  const videoUrl =
    detail.video?.download_addr?.url_list?.[0] ||
    detail.video?.play_addr?.url_list?.[0];
  if (videoUrl) {
    return { videoUrl };
  }

  return { error: 'No URLs in ScrapTik response' };
}

/**
 * High-level orchestrator: download a TikTok video and store it in R2.
 *
 * Tries sources in order: direct download API -> raw_data URL -> post detail API -> ScrapTik (with region).
 * Downloads the video, validates content type, uploads to R2.
 */
export async function downloadAndStoreVideo(post: {
  post_id: string;
  tiktok_username: string;
  raw_data: Record<string, unknown> | null;
  creator_country?: string | null;
}): Promise<VideoDownloadResult> {
  const rapidApiKey = process.env.RAPIDAPI_KEY_TIKTOK;

  let downloadUrl: string | null = null;
  let urlSource: VideoDownloadResult['urlSource'] = 'raw_data';

  // 1. Try dedicated download video API
  if (rapidApiKey) {
    try {
      const downloadResult = await fetchDirectDownloadUrl(
        post.post_id,
        post.tiktok_username,
        rapidApiKey
      );
      if (downloadResult.videoUrl) {
        downloadUrl = downloadResult.videoUrl;
        urlSource = 'download_api';
      }
    } catch (err) {
      console.warn(
        `[video-download] Download Video API error for ${post.post_id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. Try raw_data URL
  if (!downloadUrl) {
    downloadUrl = getVideoDownloadUrl(post.raw_data);
    if (downloadUrl) {
      urlSource = 'raw_data';
    }
  }

  // 3. Try post detail API
  if (!downloadUrl) {
    const fresh = await fetchFreshDownloadUrls(post.post_id);
    if (fresh.videoUrl) {
      downloadUrl = fresh.videoUrl;
      urlSource = 'api';
    } else if (fresh.error && isPermanentError(fresh.error)) {
      return { success: false, error: fresh.error, permanent: true };
    }
  }

  // 4. Try ScrapTik with region
  if (!downloadUrl && rapidApiKey) {
    const regionCode = countryNameToRegionCode(post.creator_country);
    if (regionCode) {
      try {
        const scrapTikResult = await fetchScrapTikPostUrls(post.post_id, regionCode, rapidApiKey);
        if (scrapTikResult.videoUrl) {
          downloadUrl = scrapTikResult.videoUrl;
          urlSource = 'scraptik';
        }
      } catch (err) {
        console.warn(
          `[video-download] ScrapTik fallback error for ${post.post_id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (!downloadUrl) {
    return { success: false, error: 'no_download_url', permanent: true };
  }

  // Download the video
  let downloadResponse = await fetch(downloadUrl, {
    headers: VIDEO_DOWNLOAD_HEADERS,
    signal: AbortSignal.timeout(120000),
  });

  // If CDN URL expired (403/404) and we used raw_data, try fresh URLs
  if (
    !downloadResponse.ok &&
    urlSource === 'raw_data' &&
    (downloadResponse.status === 403 || downloadResponse.status === 404)
  ) {
    downloadResponse.body?.cancel().catch(() => {});
    const fresh = await fetchFreshDownloadUrls(post.post_id);
    if (fresh.videoUrl) {
      urlSource = 'api';
      downloadResponse = await fetch(fresh.videoUrl, {
        headers: VIDEO_DOWNLOAD_HEADERS,
        signal: AbortSignal.timeout(120000),
      });
    }
  }

  // If still 403 after tiktok-api23 attempts, try ScrapTik with creator's region
  if (!downloadResponse.ok && downloadResponse.status === 403 && rapidApiKey) {
    const regionCode = countryNameToRegionCode(post.creator_country);
    if (regionCode) {
      downloadResponse.body?.cancel().catch(() => {});
      try {
        const scrapTikResult = await fetchScrapTikPostUrls(
          post.post_id,
          regionCode,
          rapidApiKey
        );
        if (scrapTikResult.videoUrl) {
          urlSource = 'scraptik';
          downloadResponse = await fetch(scrapTikResult.videoUrl, {
            headers: VIDEO_DOWNLOAD_HEADERS,
            signal: AbortSignal.timeout(120000),
          });
        }
      } catch (err) {
        console.warn(
          `[video-download] ScrapTik fallback error for ${post.post_id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (!downloadResponse.ok) {
    return {
      success: false,
      error: `HTTP ${downloadResponse.status}: ${downloadResponse.statusText}`,
      permanent: false,
    };
  }

  const blob = await downloadResponse.blob();
  const contentType = downloadResponse.headers.get('content-type') || 'video/mp4';

  if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    return {
      success: false,
      error: `Invalid content type: ${contentType}`,
      permanent: true,
    };
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  const sanitizedUsername = post.tiktok_username.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `tiktok/${sanitizedUsername}/${post.post_id}.mp4`;

  try {
    await uploadToR2(storagePath, blob, contentType);
    const publicUrl = getR2PublicUrl(storagePath);
    return { success: true, storageUrl: publicUrl, buffer, urlSource };
  } catch (err) {
    return {
      success: false,
      error: `Storage upload failed: ${err instanceof Error ? err.message : String(err)}`,
      permanent: false,
    };
  }
}
