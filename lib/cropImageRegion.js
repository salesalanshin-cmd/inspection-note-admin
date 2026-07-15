import { getImageUrl } from './getImageUrl';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = url;
  });
}

/**
 * 원본 이미지에서 정규화 bounds(0~1) 영역만 canvas crop → data URL
 * @param {string} imagePathOrUrl
 * @param {{ left: number, top: number, width: number, height: number }} bounds
 * @param {{ bucket?: string }} [options]
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export async function cropImageRegionToDataUrl(imagePathOrUrl, bounds, options = {}) {
  if (!imagePathOrUrl || !bounds) {
    throw new Error('image and bounds are required');
  }

  const signed = await getImageUrl(imagePathOrUrl, options.bucket ? { bucket: options.bucket } : undefined);
  if (!signed) throw new Error('이미지 URL을 확인할 수 없습니다.');

  const img = await loadImage(signed);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!(iw > 0) || !(ih > 0)) throw new Error('이미지 크기를 확인할 수 없습니다.');

  const sx = Math.max(0, Math.floor(bounds.left * iw));
  const sy = Math.max(0, Math.floor(bounds.top * ih));
  const sw = Math.max(1, Math.min(iw - sx, Math.ceil(bounds.width * iw)));
  const sh = Math.max(1, Math.min(ih - sy, Math.ceil(bounds.height * ih)));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas를 사용할 수 없습니다.');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL('image/jpeg', 0.92);
}
