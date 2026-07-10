import { supabase } from './supabase';
import { extractStoragePath } from './storagePath';

const DEFAULT_TTL = 60 * 60 * 24;

/**
 * Storage path 또는 기존 URL에서 화면 표시용 signed URL을 발급합니다.
 * @param {string|null|undefined} imagePath
 * @param {{ bucket?: string, ttl?: number }} [options] - path만 저장된 경우 사용할 버킷
 */
export async function getImageUrl(imagePath, options = {}) {
  const { bucket: defaultBucket, ttl = DEFAULT_TTL } = options;
  if (!imagePath) return null;

  const parsed = extractStoragePath(imagePath);
  if (parsed) {
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, ttl);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  if (imagePath.startsWith('http')) {
    return imagePath;
  }

  if (!defaultBucket) return null;

  const { data, error } = await supabase.storage
    .from(defaultBucket)
    .createSignedUrl(imagePath, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
