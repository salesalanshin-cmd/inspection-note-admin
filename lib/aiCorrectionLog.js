import { supabase } from './supabase';
import { getCompanyId } from './company';
import { getCodeLabel } from './constants';
import {
  correctionLogExtras,
  formatCorrectionExampleLine,
  selectPastCorrectionExamples,
} from './aiCorrectionSelect';

const PAST_CASE_FETCH_LIMIT = 100;
const PAST_CASE_PROMPT_LIMIT = 30;
const SAME_PRODUCT_FETCH_LIMIT = 50;
const REASON_FETCH_LIMIT = 40;
const RECENT_FETCH_LIMIT = 80;
const ACCEPTED_FETCH_LIMIT = 10;
const SIMILAR_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const SIMILAR_FETCH_LIMIT = 1000;

const RANKED_COLUMNS =
  'source_table, source_id, final_code, final_note, was_ai_accepted, ai_suggested_code, correction_reason, product_name, created_at';

/**
 * 이번 세션에서 AI 판정을 실행했는지에 따라 was_ai_accepted 계산.
 * @param {boolean} sessionAiRan
 * @param {string|null|undefined} aiSuggestedCode
 * @param {string|null|undefined} finalCode
 * @returns {boolean|null}
 */
export function resolveWasAiAccepted(sessionAiRan, aiSuggestedCode, finalCode) {
  if (!sessionAiRan) return null;
  const ai = aiSuggestedCode ?? null;
  const final = finalCode || null;
  return ai === final;
}

/**
 * @param {object} entry
 * @param {string} entry.sourceTable
 * @param {string} entry.sourceId
 * @param {'defect'|'sos'|'doc'} entry.codeSet
 * @param {string|null} [entry.aiSuggestedCode]
 * @param {string|null} [entry.aiConfidence]
 * @param {string|null} [entry.aiReason]
 * @param {string|null} entry.finalCode
 * @param {string|null} [entry.finalNote]
 * @param {boolean|null} entry.wasAiAccepted
 * @param {string|null} [entry.workerName]
 * @param {string|null} [entry.correctionReason]
 * @param {string|null} [entry.correctedBy] 정정한 관리자 이름. 없으면 컬럼을 넣지 않음
 * @param {string|null} [entry.productName] 저장 시점 제품명 스냅샷
 * @param {string|null} [entry.itemId]
 * @param {string|Date|null} [entry.aiRunAt] 이번 화면에서 AI 응답을 받은 시각
 */
export async function insertAiCorrectionLog(entry) {
  let companyId;
  try {
    companyId = await getCompanyId();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] company_id:', err?.message || err);
    return err;
  }

  const { error } = await supabase.from('ai_correction_log').insert({
    company_id: companyId,
    source_table: entry.sourceTable,
    source_id: entry.sourceId,
    code_set: entry.codeSet,
    ai_suggested_code: entry.aiSuggestedCode ?? null,
    ai_confidence: entry.aiConfidence ?? null,
    ai_reason: entry.aiReason ?? null,
    final_code: entry.finalCode ?? null,
    final_note: entry.finalNote ?? null,
    was_ai_accepted: entry.wasAiAccepted,
    worker_name: entry.workerName ?? null,
    correction_reason: entry.correctionReason ?? null,
    ...correctionLogExtras(entry),
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] insert failed:', error);
  }
  return error;
}

/**
 * code_set별 과거 판정 사례.
 * productName이 있으면 같은 제품 정정을 우선하고, mode가 'legacy'면 최근 100건의 기존 순서를 유지한다.
 * @param {'defect'|'sos'|'doc'} codeSet
 * @param {{ productName?: string, mode?: 'ranked'|'legacy' }} [options]
 */
export async function fetchPastCorrectionExamples(codeSet, options = {}) {
  let companyId;
  try {
    companyId = await getCompanyId();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] company_id:', err?.message || err);
    return [];
  }

  if (options.mode === 'legacy') {
    return fetchLegacyPastCorrectionExamples(companyId, codeSet);
  }

  const productName = String(options.productName || '').trim();
  const [sameProductRows, reasonRows, recentRows, acceptedRows] = await Promise.all([
    productName
      ? queryCorrectionRows(companyId, codeSet, {
          productName,
          limit: SAME_PRODUCT_FETCH_LIMIT,
        })
      : Promise.resolve([]),
    queryCorrectionRows(companyId, codeSet, {
      withReason: true,
      limit: REASON_FETCH_LIMIT,
    }),
    queryCorrectionRows(companyId, codeSet, { limit: RECENT_FETCH_LIMIT }),
    queryCorrectionRows(companyId, codeSet, {
      acceptedOnly: true,
      limit: ACCEPTED_FETCH_LIMIT,
    }),
  ]);

  return selectPastCorrectionExamples(
    [...sameProductRows, ...reasonRows, ...recentRows, ...acceptedRows],
    { productName }
  );
}

/**
 * 제품명 없는 일괄 진단용. 사유 있는 거절 → 기타 거절 → 직접 판정 → 수락.
 */
async function fetchLegacyPastCorrectionExamples(companyId, codeSet) {
  const data = await queryCorrectionRows(companyId, codeSet, {
    columns:
      'final_code, final_note, was_ai_accepted, ai_suggested_code, correction_reason, created_at',
    limit: PAST_CASE_FETCH_LIMIT,
  });
  if (!data.length) return [];

  const rejectedWithReason = [];
  const rejected = [];
  const manual = [];
  const accepted = [];

  for (const row of data) {
    if (!row.final_code) continue;
    if (row.was_ai_accepted === false) {
      if (row.correction_reason?.trim()) rejectedWithReason.push(row);
      else rejected.push(row);
    } else if (row.was_ai_accepted == null) {
      manual.push(row);
    } else {
      accepted.push(row);
    }
  }

  return [...rejectedWithReason, ...rejected, ...manual, ...accepted].slice(
    0,
    PAST_CASE_PROMPT_LIMIT
  );
}

async function queryCorrectionRows(companyId, codeSet, options = {}) {
  let query = supabase
    .from('ai_correction_log')
    .select(options.columns || RANKED_COLUMNS)
    .eq('company_id', companyId)
    .eq('code_set', codeSet)
    .not('final_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(options.limit || RECENT_FETCH_LIMIT);

  if (options.productName) query = query.eq('product_name', options.productName);
  if (options.withReason) query = query.not('correction_reason', 'is', null);
  if (options.acceptedOnly) query = query.eq('was_ai_accepted', true);

  const { data, error } = await query;
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] fetch failed:', error.message || error);
    return [];
  }
  return data || [];
}

/**
 * 최근 90일, 같은 code_set에서 AI 제안을 거절한 행.
 * 유사 사례 집계용. 실패해도 진단 자체는 막지 않도록 빈 배열.
 * @param {'defect'|'sos'|'doc'} codeSet
 */
export async function fetchRecentRejectedCorrections(codeSet) {
  let companyId;
  try {
    companyId = await getCompanyId();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] company_id:', err?.message || err);
    return [];
  }

  const since = new Date(Date.now() - SIMILAR_LOOKBACK_MS).toISOString();
  const { data, error } = await supabase
    .from('ai_correction_log')
    .select('ai_suggested_code, final_code, product_name, created_at, was_ai_accepted')
    .eq('company_id', companyId)
    .eq('code_set', codeSet)
    .eq('was_ai_accepted', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(SIMILAR_FETCH_LIMIT);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] similar fetch failed:', error.message || error);
    return [];
  }
  return data || [];
}

/**
 * @param {'defect'|'sos'|'doc'} codeSet
 * @param {Array<object>} examples
 * @returns {string}
 */
export function formatPastCasesForPrompt(codeSet, examples) {
  if (!examples?.length) return '';

  const lines = examples.map((ex) =>
    formatCorrectionExampleLine(ex, (code) => getCodeLabel(codeSet, code))
  );

  return `

## 과거 관리자 판정 사례
다음은 과거 관리자들이 실제로 판정한 사례들입니다. 이 패턴을 참고해서 판단하세요:
${lines.join('\n')}`;
}
