import Anthropic from '@anthropic-ai/sdk';
import { extractStoragePath } from './storagePath.js';
import {
  getOcrClassifyModel,
  isValidOcrDocType,
  OCR_DOC_TYPES,
} from './ocrDocTypes.js';
import { createServiceRoleClient } from './supabaseAdmin.js';

const SIGNED_URL_TTL = 60 * 60;

const SYSTEM_PROMPT = `당신은 공장 현장 문서/사진 분류기입니다.
이미지가 어떤 종류의 기록인지 하나만 고르세요.

허용 doc_type (정확히 이 값만):
- inspection: 자주검사 (자주검사 체크리스트·검사 기록)
- 5s: 3정5S 점검 사진
- defect: 불량품/불량 기록 사진
- worklog: 작업일보·생산일지류
- other: 위에 해당하지 않음

JSON만 응답하세요. 다른 텍스트 금지.
형식: {"doc_type":"inspection"|"5s"|"defect"|"worklog"|"other","confidence":"high"|"medium"|"low","reason":"한 줄 이유"}`;

/**
 * 모델 텍스트 → 검증된 분류 결과.
 * 스키마 밖 doc_type → other + needsReview.
 * 빈/파싱 실패 → throw (호출측에서 failed 처리).
 *
 * @param {string|null|undefined} text
 */
export function parseAndValidateOcrClassifyResponse(text) {
  if (text == null || !String(text).trim()) {
    throw new Error('Empty classify response');
  }

  const trimmed = String(text).trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from model');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Invalid JSON response from model');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON response from model');
  }

  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence)
    ? parsed.confidence
    : 'low';

  const rawType = String(parsed.doc_type ?? parsed.docType ?? '').trim();
  let docType = rawType;
  let needsReview = false;

  if (!isValidOcrDocType(docType)) {
    docType = 'other';
    needsReview = true;
  }

  const reason =
    typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 120) : '';

  return {
    docType,
    confidence,
    reason,
    needsReview,
    rawDocType: rawType || null,
  };
}

function guessMediaType(path, contentType) {
  if (contentType?.startsWith('image/')) return contentType;
  const lower = (path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * 서비스 롤로 서명 URL 발급 후 이미지 base64 로드.
 * URL/토큰을 로그에 남기지 않음.
 */
export async function fetchOcrImageAsBase64(imageUrl, supabaseAdmin) {
  if (!imageUrl) throw new Error('imageUrl is required');

  let fetchUrl = imageUrl;
  let pathHint = imageUrl;

  const parsed = extractStoragePath(imageUrl);
  if (parsed) {
    const { data, error } = await supabaseAdmin.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${error?.message || 'unknown'}`);
    }
    fetchUrl = data.signedUrl;
    pathHint = parsed.path;
  } else if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
    throw new Error('Unsupported image reference');
  }

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/
    );
    if (!match) throw new Error('Invalid data URL');
    return { base64: match[2].replace(/\s/g, ''), mediaType: match[1] };
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    base64: buffer.toString('base64'),
    mediaType: guessMediaType(pathHint, response.headers.get('content-type')),
  };
}

/**
 * 이미지 1장 → 문서 유형 분류 + usage
 * @returns {Promise<{
 *   docType: string,
 *   confidence: string,
 *   reason: string,
 *   needsReview: boolean,
 *   model: string,
 *   usage: { inputTokens: number, outputTokens: number },
 *   parsedData: object,
 * }>}
 */
export async function classifyOcrDocumentType(imageUrl, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const supabaseAdmin = options.supabaseAdmin || createServiceRoleClient();
  const model = getOcrClassifyModel();
  const { base64, mediaType } = await fetchOcrImageAsBase64(imageUrl, supabaseAdmin);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
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
            text: `이 이미지를 분류하세요. doc_type은 다음 중 하나여야 합니다: ${OCR_DOC_TYPES.join(', ')}. JSON만 응답하세요.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const validated = parseAndValidateOcrClassifyResponse(textBlock?.text);

  const inputTokens = Number(response.usage?.input_tokens) || 0;
  const outputTokens = Number(response.usage?.output_tokens) || 0;

  return {
    docType: validated.docType,
    confidence: validated.confidence,
    reason: validated.reason,
    needsReview: validated.needsReview,
    model,
    usage: { inputTokens, outputTokens },
    parsedData: {
      stage: 'classify',
      doc_type: validated.docType,
      confidence: validated.confidence,
      reason: validated.reason,
      raw_doc_type: validated.rawDocType,
      needs_review: validated.needsReview,
    },
  };
}
