import { supabase } from './supabase';
import { getCodeLabel } from './constants';

const PAST_CASE_FETCH_LIMIT = 100;
const PAST_CASE_PROMPT_LIMIT = 30;

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
 */
export async function insertAiCorrectionLog(entry) {
  const { error } = await supabase.from('ai_correction_log').insert({
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
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] insert failed:', error);
  }
  return error;
}

/**
 * code_set별 최근 판정 사례.
 * 오판 사유(correction_reason) 있는 거절 사례 → 기타 거절 → 직접 판정 → 수락 순.
 * @param {'defect'|'sos'|'doc'} codeSet
 */
export async function fetchPastCorrectionExamples(codeSet) {
  const { data, error } = await supabase
    .from('ai_correction_log')
    .select(
      'final_code, final_note, was_ai_accepted, ai_suggested_code, correction_reason, created_at'
    )
    .eq('code_set', codeSet)
    .not('final_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(PAST_CASE_FETCH_LIMIT);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ai_correction_log] fetch failed:', error);
    return [];
  }
  if (!data?.length) return [];

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

/**
 * @param {'defect'|'sos'|'doc'} codeSet
 * @param {Array<object>} examples
 * @returns {string}
 */
export function formatPastCasesForPrompt(codeSet, examples) {
  if (!examples?.length) return '';

  const lines = examples.map((ex) => {
    const reason = ex.correction_reason?.trim();
    if (reason && ex.was_ai_accepted === false) {
      const aiCode = ex.ai_suggested_code || '(없음)';
      return `- AI가 ${aiCode}로 잘못 판단했으나 실제로는 ${ex.final_code}였음 - 이유: ${reason}`;
    }
    const label = getCodeLabel(codeSet, ex.final_code) || ex.final_code;
    const note = ex.final_note?.trim() ? ex.final_note.trim() : '(없음)';
    return `- 최종판정: ${ex.final_code} (${label}), 메모: ${note}`;
  });

  return `

## 과거 관리자 판정 사례
다음은 과거 관리자들이 실제로 판정한 사례들입니다. 이 패턴을 참고해서 판단하세요:
${lines.join('\n')}`;
}
