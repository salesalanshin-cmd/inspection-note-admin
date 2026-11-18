import Anthropic from '@anthropic-ai/sdk';
import { CLASSIFY_MODEL, getCodeSetCodes } from './constants';
import {
  fetchPastCorrectionExamples,
  fetchRecentRejectedCorrections,
} from './aiCorrectionLog';
import {
  aggregateNegativeEvidence,
  aggregateSimilarCorrections,
} from './aiCorrectionSelect';
import { buildClassifyPrompt, fetchProductDefectStats } from './classifyPrompt';
import { fetchImageAsBase64 } from './classifyImageServer';
import { applyMcNeedsReview } from './mcNeedsReview';
import { normalizeProcessHint } from './processHint';

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
 * @param {{
 *   regionCrop?: boolean,
 *   pastCases?: Array,
 *   productName?: string,
 *   productDefectStats?: Array,
 *   processHint?: string,
 *   negativeEvidence?: Array,
 *   rejectedRows?: Array,
 * }} [options]
 */
export async function classifyPhoto(imageUrl, codeSet, options = {}) {
  if (!imageUrl) throw new Error('imageUrl is required');
  if (codeSet !== 'defect' && codeSet !== 'sos' && codeSet !== 'doc') {
    throw new Error('codeSet must be defect, sos, or doc');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const processHint =
    codeSet === 'defect' ? normalizeProcessHint(options.processHint) : '없음';
  const productName =
    codeSet === 'defect' && options.productName
      ? String(options.productName).trim()
      : '';

  let rejectedRows = options.rejectedRows;
  let negativeEvidenceMs = 0;
  if (rejectedRows === undefined) {
    const started = Date.now();
    try {
      rejectedRows = await fetchRecentRejectedCorrections(codeSet);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[classifyPhoto] rejected corrections', err?.message || err);
      rejectedRows = [];
    }
    negativeEvidenceMs = Date.now() - started;
  }

  let negativeEvidence = options.negativeEvidence;
  if (codeSet === 'defect' && negativeEvidence === undefined) {
    negativeEvidence = aggregateNegativeEvidence(rejectedRows || [], {
      productName: productName || undefined,
    });
  }

  const { base64, mediaType } = await fetchImageAsBase64(imageUrl);
  const client = new Anthropic({ apiKey });
  const validCodes = getCodeSetCodes(codeSet);
  const regionCrop = Boolean(options.regionCrop);
  const systemPrompt = await buildClassifyPrompt(codeSet, {
    regionCrop,
    pastCases: options.pastCases,
    productName: productName || undefined,
    productDefectStats: options.productDefectStats,
    processHint,
    negativeEvidence: codeSet === 'defect' ? negativeEvidence : undefined,
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

  const guarded =
    codeSet === 'defect' ? applyMcNeedsReview(result, processHint) : { ...result, needsReview: false };

  const similarProduct =
    codeSet === 'defect' ? productName : String(options.productName || '').trim();
  const similarCorrections = aggregateSimilarCorrections(rejectedRows || [], {
    code: guarded.code,
    productName: similarProduct || undefined,
    productOnly: codeSet === 'defect' && Boolean(similarProduct),
    limit: codeSet === 'defect' ? 5 : 2,
  });

  return {
    ...guarded,
    similarCorrections,
    processHint: codeSet === 'defect' ? processHint : undefined,
    timings: negativeEvidenceMs
      ? { negativeEvidenceMs }
      : undefined,
  };
}

export const BATCH_CHUNK_SIZE = 8;

export async function classifyPhotosBatch(items, codeSet) {
  const results = [];
  const pastCache = new Map();
  const statsCache = new Map();
  const negativeCache = new Map();
  let similarRows = [];
  let negativeEvidenceMs = 0;
  try {
    const started = Date.now();
    similarRows = await fetchRecentRejectedCorrections(codeSet);
    negativeEvidenceMs = Date.now() - started;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classifyPhotosBatch] similar corrections', err?.message || err);
  }

  async function contextFor(item) {
    const productName = String(item.productName || '').trim();
    const processHint =
      codeSet === 'defect' ? normalizeProcessHint(item.processHint) : '없음';
    const pastKey = productName || '__legacy__';
    if (!pastCache.has(pastKey)) {
      const pending = (
        productName
          ? fetchPastCorrectionExamples(codeSet, { productName })
          : fetchPastCorrectionExamples(codeSet, { mode: 'legacy' })
      ).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[classifyPhotosBatch] past cases', err?.message || err);
        return [];
      });
      pastCache.set(pastKey, pending);
    }
    let productDefectStats;
    if (codeSet === 'defect' && productName) {
      if (!statsCache.has(productName)) {
        statsCache.set(
          productName,
          fetchProductDefectStats(productName).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[classifyPhotosBatch] product stats', err?.message || err);
            return null;
          })
        );
      }
      productDefectStats = await statsCache.get(productName);
    }

    const negKey = productName || '__all__';
    if (!negativeCache.has(negKey)) {
      negativeCache.set(
        negKey,
        aggregateNegativeEvidence(similarRows, {
          productName: productName || undefined,
        })
      );
    }

    const pastCases = await pastCache.get(pastKey);
    return {
      productName: productName || undefined,
      pastCases,
      productDefectStats,
      processHint,
      negativeEvidence: negativeCache.get(negKey),
      rejectedRows: similarRows,
    };
  }

  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        const context = await contextFor(item);
        const data = await classifyPhoto(item.imageUrl, codeSet, context);
        return {
          id: item.id,
          ...data,
          timings: {
            ...(data.timings || {}),
            negativeEvidenceMs: data.timings?.negativeEvidenceMs ?? negativeEvidenceMs,
          },
        };
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
          similarCorrections: [],
          needsReview: false,
        });
      }
    }
  }

  return results;
}
