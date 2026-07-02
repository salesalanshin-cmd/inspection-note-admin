/**
 * Supabase Storage URL(공개 URL이든, 만료되는 signed URL이든)에서
 * 버킷 이름과 파일 경로를 뽑아냅니다.
 * 예: https://xxx.supabase.co/storage/v1/object/sign/defect-images/GR001/foo.jpg?token=...
 *  -> { bucket: 'defect-images', path: 'GR001/foo.jpg' }
 */
export function extractStoragePath(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = '/storage/v1/object/';
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;

    const rest = u.pathname.slice(idx + marker.length); // "sign/bucket/a/b.jpg" or "public/bucket/a/b.jpg"
    const parts = rest.split('/').filter(Boolean);
    parts.shift(); // remove "sign" | "public" | "authenticated"
    const bucket = parts.shift();
    const path = decodeURIComponent(parts.join('/'));

    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}
