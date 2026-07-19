import Anthropic from '@anthropic-ai/sdk';
import { CLASSIFY_MODEL, getCodeSetCodes } from './constants';
import { fetchPastCorrectionExamples } from './aiCorrectionLog';
import { buildClassifyPrompt } from './classifyPrompt';
import { fetchImageAsBase64 } from './classifyImageServer';

function parseClassifyResponse(text) {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from model');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence)
    ? parsed.confidence
    : 'low';

  let code = parsed.code;
  if (code === 'null' || code === '') code = null;

  return {
    code: code ?? null,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : '',
  };
}

/**
 * @param {string} imageUrl - http(s) / storage path / data URL(crop)
 * @param {'defect' | 'sos' | 'doc'} codeSet
 * @param {{ regionCrop?: boolean, pastCases?: Array }} [options]
 */
export async function classifyPhoto(imageUrl, codeSet, options = {}) {
  if (!imageUrl) throw new Error('imageUrl is required');
  if (codeSet !== 'defect' && codeSet !== 'sos' && codeSet !== 'doc') {
    throw new Error('codeSet must be defect, sos, or doc');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const { base64, mediaType } = await fetchImageAsBase64(imageUrl);
  const client = new Anthropic({ apiKey });
  const validCodes = getCodeSetCodes(codeSet);
  const regionCrop = Boolean(options.regionCrop);
  const systemPrompt = await buildClassifyPrompt(codeSet, {
    regionCrop,
    pastCases: options.pastCases,
  });

  const userHint = regionCrop
    ? codeSet === 'sos'
      ? '이 이미지는 3정5S 점검 사진의 특정 영역만 잘라낸 것입니다. 이 영역에 해당하는 문제만 판정하여 JSON으로만 응답하세요.'
      : codeSet === 'doc'
        ? '이 이미지는 문서의 특정 영역만 잘라낸 것입니다. 이 영역에 해당하는 문제만 판정하여 JSON으로만 응답하세요.'
        : '이 사진을 분석하여 가장 적합한 오류 코드를 JSON 형식으로만 응답하세요.'
    : '이 사진을 분석하여 가장 적합한 오류 코드를 JSON 형식으로만 응답하세요.';

  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 256,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: userHint,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Empty response from model');
  }

  const result = parseClassifyResponse(textBlock.text);

  if (result.code && !validCodes.includes(result.code)) {
    result.code = null;
    result.confidence = 'low';
    result.reason = result.reason || '유효하지 않은 코드 응답';
  }

  return result;
}

export const BATCH_CHUNK_SIZE = 8;

export async function classifyPhotosBatch(items, codeSet) {
  const results = [];
  // 배치 내 동일 code_set 사례 조회는 1회만 (프롬프트 재사용)
  const pastCases = await fetchPastCorrectionExamples(codeSet);

  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        const data = await classifyPhoto(item.imageUrl, codeSet, { pastCases });
        return { id: item.id, ...data };
      })
    );

    for (let j = 0; j < settled.length; j += 1) {
      const item = chunk[j];
      const outcome = settled[j];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else {
        results.push({
          id: item.id,
          error: outcome.reason?.message || 'Classification failed',
        });
      }
    }
  }

  return results;
}
