import JSZip from 'jszip';
import { getImageUrl } from './getImageUrl';

function triggerBrowserDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function sanitizeFilename(name) {
  return String(name || 'image')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function guessExtension(contentType, fallbackUrl) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  if (fallbackUrl?.toLowerCase().includes('.png')) return 'png';
  return 'jpg';
}

/**
 * 서명 URL(또는 재발급된 URL)로 단일 이미지 다운로드
 * @param {string} signedUrl
 * @param {string} filename
 */
export async function downloadSingleImage(signedUrl, filename) {
  if (!signedUrl) throw new Error('다운로드할 이미지가 없습니다.');
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`이미지 다운로드 실패 (${response.status})`);
  const blob = await response.blob();
  const ext = guessExtension(blob.type, signedUrl);
  const base = sanitizeFilename(filename.replace(/\.[a-z0-9]+$/i, ''));
  triggerBrowserDownload(blob, `${base}.${ext}`);
}

/**
 * image_url에서 signed URL을 새로 받아 단일 다운로드
 * @param {{ imageUrl: string, filename: string, bucket?: string }} item
 */
export async function downloadRecordImage(item) {
  const signedUrl = await getImageUrl(item.imageUrl, item.bucket ? { bucket: item.bucket } : {});
  if (!signedUrl) throw new Error('이미지 URL을 발급하지 못했습니다.');
  await downloadSingleImage(signedUrl, item.filename);
}

/**
 * @param {Array<{ imageUrl: string, filename: string, bucket?: string }>} items
 * @param {string} [zipName]
 */
export async function downloadImagesAsZip(items, zipName = 'images.zip') {
  const list = (items || []).filter((item) => item?.imageUrl);
  if (!list.length) throw new Error('다운로드할 이미지가 없습니다.');

  if (list.length === 1) {
    await downloadRecordImage(list[0]);
    return;
  }

  const zip = new JSZip();
  const usedNames = new Set();

  await Promise.all(
    list.map(async (item, index) => {
      const signedUrl = await getImageUrl(item.imageUrl, item.bucket ? { bucket: item.bucket } : {});
      if (!signedUrl) return;
      const response = await fetch(signedUrl);
      if (!response.ok) return;
      const blob = await response.blob();
      const ext = guessExtension(blob.type, signedUrl);
      let base = sanitizeFilename(item.filename.replace(/\.[a-z0-9]+$/i, '') || `image_${index + 1}`);
      let finalName = `${base}.${ext}`;
      let n = 2;
      while (usedNames.has(finalName)) {
        finalName = `${base}_${n}.${ext}`;
        n += 1;
      }
      usedNames.add(finalName);
      zip.file(finalName, blob);
    })
  );

  if (usedNames.size === 0) throw new Error('다운로드할 이미지를 가져오지 못했습니다.');

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerBrowserDownload(zipBlob, sanitizeFilename(zipName.replace(/\.zip$/i, '')) + '.zip');
}

/** 작업자명_촬영시각 형태 파일명 */
export function buildImageDownloadFilename(workerName, createdAt, fallback = 'image') {
  const name = sanitizeFilename(workerName || fallback);
  if (!createdAt) return name;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return name;
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${name}_${stamp}`;
}
