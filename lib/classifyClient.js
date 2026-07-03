export const AI_UNAVAILABLE_MESSAGE =
  'AI 자동판정을 사용할 수 없습니다. 관리자에게 문의하세요.';

export async function requestClassifyPhoto(imageUrl, codeSet) {
  const res = await fetch('/api/classify-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, codeSet }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error('[classify-photo]', data.error || res.statusText);
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }
  return data;
}

export async function requestClassifyPhotosBatch(items, codeSet, onProgress) {
  const CHUNK_SIZE = 8;
  const total = items.length;
  const allResults = [];
  let done = 0;

  onProgress?.(0, total);

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);

    const res = await fetch('/api/classify-photos-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: chunk, codeSet }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[classify-photos-batch]', data.error || res.statusText);
      throw new Error(AI_UNAVAILABLE_MESSAGE);
    }

    allResults.push(...(data.results || []));
    done += chunk.length;
    onProgress?.(Math.min(done, total), total);
  }

  return allResults;
}
