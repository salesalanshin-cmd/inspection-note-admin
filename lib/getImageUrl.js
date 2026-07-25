import { supabase } from './supabase';
import { extractStoragePath } from './storagePath';

const DEFAULT_TTL = 60 * 60 * 24;

/** 갤러리 썸네일 / 상세보기용 Supabase Storage transform 프리셋 */
export const IMAGE_TRANSFORMS = {
  thumbnail: { width: 400, height: 400, resize: 'cover', quality: 70 },
  full: { width: 1200, resize: 'contain', quality: 80 },
};

/**
 * Storage path 또는 기존 URL에서 화면 표시용 signed URL을 발급합니다.
 * @param {string|null|undefined} imagePath
 * @param {{
 *   bucket?: string,
 *   ttl?: number,
 *   size?: 'thumbnail' | 'full',
 *   transform?: { width?: number, height?: number, resize?: string, quality?: number } | null,
 * }} [options]
 */
export async function getImageUrl(imagePath, options = {}) {
  const { bucket: defaultBucket, ttl = DEFAULT_TTL, size, transform } = options;
  if (!imagePath) return null;

  const transformOpts =
    transform === null
      ? null
      : transform || (size && IMAGE_TRANSFORMS[size] ? IMAGE_TRANSFORMS[size] : null);

  const signOptions = transformOpts ? { transform: transformOpts } : undefined;

  const parsed = extractStoragePath(imagePath);
  if (parsed) {
    return createSigned(parsed.bucket, parsed.path, ttl, signOptions);
  }

  if (imagePath.startsWith('http')) {
    // 외부 URL은 변환 불가
    return imagePath;
  }

  if (!defaultBucket) return null;

  return createSigned(defaultBucket, imagePath, ttl, signOptions);
}

async function createSigned(bucket, path, ttl, signOptions) {
  // 1차: transform 포함 (Pro 이미지 변환)
  if (signOptions?.transform) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl, signOptions);
    if (!error && data?.signedUrl) return data.signedUrl;
    // 플랜 미지원 등 → 원본 signed URL로 폴백
    // eslint-disable-next-line no-console
    console.warn('[getImageUrl] transform signed URL 실패, 원본으로 폴백', error?.message);
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
