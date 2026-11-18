const PAST_CASE_PROMPT_LIMIT = 30;
const ACCEPTED_PROMPT_LIMIT = 5;

/** 부정 증거: (제품, AI 제안 코드) 최소 정정 횟수 */
export const NEGATIVE_EVIDENCE_MIN_COUNT = 2;
/** 프롬프트에 넣을 (AI 코드) 조합 상한 */
export const NEGATIVE_EVIDENCE_LIMIT = 5;

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * @param {object} row
 * @returns {boolean} final_code와 ai_suggested_code가 다르면 정정
 */
export function isCorrectedExample(row) {
  const finalCode = row?.final_code || null;
  if (!finalCode) return false;
  const aiCode = row?.ai_suggested_code || null;
  return aiCode !== finalCode;
}

function isAcceptedExample(row) {
  if (!row?.final_code || isCorrectedExample(row)) return false;
  if (row.was_ai_accepted === true) return true;
  return Boolean(row.ai_suggested_code) && row.ai_suggested_code === row.final_code;
}

function matchesProduct(row, productName) {
  if (!productName) return false;
  return String(row?.product_name || '').trim() === productName;
}

function sourceKey(row) {
  if (!row?.source_id) return null;
  return `${row.source_table || ''}:${row.source_id}`;
}

function lessonKey(row) {
  return [
    String(row?.product_name || '').trim(),
    row?.ai_suggested_code || '',
    row?.final_code || '',
    String(row?.correction_reason || '').trim(),
  ].join('|');
}

/**
 * 정정 사례 우선순위.
 * ① 같은 제품의 정정 ② 사유 있는 다른 제품 정정 ③ 나머지 정정 ④ 수락(최대 5)
 * 합계는 limit(기본 30) 이내. source_id·동일 교훈은 먼저 나온 1건만.
 * 호출 순서가 최신순이면 최신 건이 남는다.
 *
 * @param {Array<object>} rows
 * @param {{ productName?: string, limit?: number, acceptedLimit?: number }} [options]
 */
export function selectPastCorrectionExamples(rows, options = {}) {
  const productName = String(options.productName || '').trim();
  const limit = options.limit ?? PAST_CASE_PROMPT_LIMIT;
  const acceptedLimit = options.acceptedLimit ?? ACCEPTED_PROMPT_LIMIT;
  const seenSource = new Set();
  const seenLesson = new Set();
  const unique = [];

  for (const row of rows || []) {
    if (!row?.final_code) continue;
    const source = sourceKey(row);
    if (source) {
      if (seenSource.has(source)) continue;
      seenSource.add(source);
    }
    const lesson = lessonKey(row);
    if (seenLesson.has(lesson)) continue;
    seenLesson.add(lesson);
    unique.push(row);
  }

  const sameProduct = [];
  const withReason = [];
  const other = [];
  const accepted = [];

  for (const row of unique) {
    if (isCorrectedExample(row)) {
      if (matchesProduct(row, productName)) sameProduct.push(row);
      else if (String(row.correction_reason || '').trim()) withReason.push(row);
      else other.push(row);
    } else if (isAcceptedExample(row)) {
      accepted.push(row);
    }
  }

  const acceptedTake = accepted.slice(0, acceptedLimit);
  const correctionBudget = Math.max(0, limit - acceptedTake.length);
  const corrections = [...sameProduct, ...withReason, ...other].slice(0, correctionBudget);
  return [...corrections, ...acceptedTake];
}

/**
 * AI가 제안한 코드와 같은 정정 건을 final_code별로 집계.
 * 건수 내림차순, 같으면 같은 제품 건수, 그다음 최근 시각. 상위 limit개.
 *
 * @param {Array<object>} rows was_ai_accepted = false 인 행
 * @param {{ code?: string|null, productName?: string, limit?: number }} [options]
 * @returns {Array<{ finalCode: string, count: number, sameProductCount: number, lastCorrectedAt: string|null }>}
 */
export function aggregateSimilarCorrections(rows, options = {}) {
  const code = options.code || null;
  if (!code) return [];
  const productName = String(options.productName || '').trim();
  const limit = options.limit ?? 2;
  const productOnly = Boolean(options.productOnly) && Boolean(productName);
  const byFinal = new Map();

  for (const row of rows || []) {
    if (row?.was_ai_accepted !== false) continue;
    if ((row.ai_suggested_code || null) !== code) continue;
    if (productOnly && !matchesProduct(row, productName)) continue;
    const finalCode = row.final_code || null;
    if (!finalCode) continue;
    const current = byFinal.get(finalCode) || {
      finalCode,
      count: 0,
      sameProductCount: 0,
      lastCorrectedAt: null,
    };
    current.count += 1;
    if (matchesProduct(row, productName)) current.sameProductCount += 1;
    const at = row.created_at || null;
    if (at && (!current.lastCorrectedAt || String(at) > String(current.lastCorrectedAt))) {
      current.lastCorrectedAt = at;
    }
    byFinal.set(finalCode, current);
  }

  return [...byFinal.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.sameProductCount - a.sameProductCount ||
        String(b.lastCorrectedAt || '').localeCompare(String(a.lastCorrectedAt || ''))
    )
    .slice(0, limit);
}

/**
 * 프롬프트용 반복 오진 집계. (제품 있으면 그 제품만, 없으면 전체·약하게)
 * ai_suggested_code별 정정 횟수가 minCount 미만이면 제외. 상위 limit개.
 *
 * @param {Array<object>} rows was_ai_accepted === false 인 행
 * @param {{ productName?: string, minCount?: number, limit?: number }} [options]
 * @returns {Array<{ aiCode: string, total: number, finals: Array<{ finalCode: string, count: number }> }>}
 */
export function aggregateNegativeEvidence(rows, options = {}) {
  const productName = String(options.productName || '').trim();
  const minCount = options.minCount ?? NEGATIVE_EVIDENCE_MIN_COUNT;
  const limit = options.limit ?? NEGATIVE_EVIDENCE_LIMIT;
  const byAi = new Map();

  for (const row of rows || []) {
    if (row?.was_ai_accepted !== false) continue;
    const aiCode = row.ai_suggested_code || null;
    const finalCode = row.final_code || null;
    if (!aiCode || !finalCode || aiCode === finalCode) continue;
    if (productName && !matchesProduct(row, productName)) continue;

    const group = byAi.get(aiCode) || {
      aiCode,
      total: 0,
      finals: new Map(),
    };
    group.total += 1;
    group.finals.set(finalCode, (group.finals.get(finalCode) || 0) + 1);
    byAi.set(aiCode, group);
  }

  return [...byAi.values()]
    .filter((group) => group.total >= minCount)
    .map((group) => ({
      aiCode: group.aiCode,
      total: group.total,
      finals: [...group.finals.entries()]
        .map(([finalCode, count]) => ({ finalCode, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.finalCode.localeCompare(b.finalCode)
        ),
    }))
    .sort(
      (a, b) =>
        b.total - a.total || a.aiCode.localeCompare(b.aiCode)
    )
    .slice(0, limit);
}

/**
 * @param {Array<{ aiCode: string, total: number, finals: Array<{ finalCode: string, count: number }> }>} groups
 * @param {{ productName?: string }} [options]
 * @returns {string} 프롬프트 섹션(없으면 빈 문자열)
 */
export function formatNegativeEvidenceForPrompt(groups, options = {}) {
  if (!groups?.length) return '';
  const productName = String(options.productName || '').trim();
  const header = productName
    ? `## 이 제품(${productName})에서 반복된 AI 오진 (피해야 할 제안)`
    : `## 반복된 AI 오진 (제품명 없음 — 약하게 참고)`;

  const lines = groups.map((group) => {
    const dist = group.finals
      .map((item) => `${group.aiCode}→${item.finalCode} ${item.count}회`)
      .join(', ');
    const scope = productName ? '이 제품에서 ' : '';
    return `- ${dist}. ${group.aiCode}는 ${scope}${group.total}회 오진됨. ${group.aiCode} 제안을 피하고 사진 증거에 맞는 다른 코드를 선택하라.`;
  });

  return `

${header}
${lines.join('\n')}`;
}

/**
 * 배너용: "이 제품에서 X는 N회 정정됨(주 정정: Y n회)"
 * productScoped이면 sameProductCount 합을 쓰고, 0이면 null.
 *
 * @param {string|null|undefined} suggestedCode
 * @param {Array<{ finalCode: string, count: number, sameProductCount?: number }>} items
 * @param {{ productScoped?: boolean }} [options]
 * @returns {string|null}
 */
export function formatMisdiagnosisBannerLine(suggestedCode, items, options = {}) {
  const code = suggestedCode == null ? '' : String(suggestedCode).trim();
  if (!code || !items?.length) return null;
  const productScoped = Boolean(options.productScoped);

  const ranked = [...items].sort(
    (a, b) =>
      (productScoped
        ? (b.sameProductCount || 0) - (a.sameProductCount || 0)
        : 0) ||
      b.count - a.count ||
      String(a.finalCode).localeCompare(String(b.finalCode))
  );

  if (productScoped) {
    const total = ranked.reduce((sum, row) => sum + (Number(row.sameProductCount) || 0), 0);
    if (total < 1) return null;
    const top = ranked.find((row) => (row.sameProductCount || 0) > 0) || ranked[0];
    const topCount = Number(top.sameProductCount) || Number(top.count) || 0;
    return `이 제품에서 ${code}는 ${total}회 정정됨(주 정정: ${top.finalCode} ${topCount}회)`;
  }

  const total = ranked.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  if (total < 1) return null;
  const top = ranked[0];
  return `${code}는 ${total}회 정정됨(주 정정: ${top.finalCode} ${top.count}회)`;
}

/**
 * 값이 있는 확장 컬럼만 반환. 비어 있으면 키 자체를 넣지 않는다.
 * @param {object} entry
 */
export function correctionLogExtras(entry) {
  const extras = {};
  const correctedBy = cleanText(entry?.correctedBy);
  if (correctedBy) extras.corrected_by = correctedBy;
  const productName = cleanText(entry?.productName);
  if (productName) extras.product_name = productName;
  const itemId = cleanText(entry?.itemId);
  if (itemId) extras.item_id = itemId;
  const aiRunAt = cleanTimestamp(entry?.aiRunAt);
  if (aiRunAt) extras.ai_run_at = aiRunAt;
  return extras;
}

/**
 * 프롬프트에 넣을 사례 한 줄. 정정 건은 AI 코드와 최종 코드를 같이 적는다.
 * @param {object} ex
 * @param {(code: string) => string} labelFor
 */
export function formatCorrectionExampleLine(ex, labelFor) {
  const product = String(ex.product_name || '').trim();
  const prefix = product ? `[제품 ${product}] ` : '';
  const reason = String(ex.correction_reason || '').trim();
  const aiCode = ex.ai_suggested_code || null;
  const corrected = ex.was_ai_accepted === false || (aiCode && aiCode !== ex.final_code);
  if (corrected) {
    const shownAi = aiCode || '(없음)';
    const reasonPart = reason ? ` - 이유: ${reason}` : '';
    return `- ${prefix}AI가 ${shownAi}로 잘못 판단했으나 실제로는 ${ex.final_code}였음${reasonPart}`;
  }
  const label = labelFor(ex.final_code) || ex.final_code;
  const note = String(ex.final_note || '').trim() || '(없음)';
  return `- ${prefix}최종판정: ${ex.final_code} (${label}), 메모: ${note}`;
}

function cleanTimestamp(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
