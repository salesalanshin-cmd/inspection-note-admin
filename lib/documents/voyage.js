import { EMBED_MAX_RETRIES, VOYAGE_MODEL } from './constants.js';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Voyage AI 배치 임베딩
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY가 설정되지 않았습니다.');
  }
  if (!texts?.length) return [];

  let lastError;
  for (let attempt = 1; attempt <= EMBED_MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(VOYAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: VOYAGE_MODEL,
          input_type: 'document',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Voyage API ${res.status}: ${body.slice(0, 300)}`);
      }

      const json = await res.json();
      const embeddings = json?.data?.map((row) => row.embedding) ?? json?.embeddings;
      if (!embeddings?.length) {
        throw new Error('Voyage API 응답에 embedding이 없습니다.');
      }
      return embeddings;
    } catch (err) {
      lastError = err;
      if (attempt < EMBED_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}

export { VOYAGE_MODEL };
