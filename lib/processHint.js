/**
 * AI 불량 진단용 공정 힌트.
 * 값: '주조' | '사상' | '가공' | '없음'
 */

export const PROCESS_HINTS = ['주조', '사상', '가공', '없음'];
export const PROCESS_HINT_CODES = ['주조', '사상', '가공'];

/** 초품/중품/종품 → 공장 관례상 주조/사상/가공 (defect_stage 보조 해석) */
const STAGE_TO_PROCESS = {
  초품: '주조',
  중품: '사상',
  종품: '가공',
  initial: '주조',
  middle: '사상',
  final: '가공',
  first: '주조',
  mid: '사상',
  last: '가공',
};

/**
 * @param {unknown} value
 * @returns {'주조'|'사상'|'가공'|'없음'}
 */
export function normalizeProcessHint(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return '없음';
  if (PROCESS_HINT_CODES.includes(text)) return text;
  if (STAGE_TO_PROCESS[text]) return STAGE_TO_PROCESS[text];
  return '없음';
}

/**
 * 신뢰도 순으로 processHint를 고른다.
 * 1) defect_stage (촬영·기록 시점 공정/단계) — AI 제안 코드에서 파생되지 않음
 * 2) worker_directory.process (주조|사상|가공만; 검사·기타는 무시)
 * 3) productProcess (제품 마스터) — 현재 product_mold에 공정 컬럼 없음
 * 4) 없음
 *
 * @param {{
 *   defectStage?: string|null,
 *   workerProcess?: string|null,
 *   productProcess?: string|null,
 * }} [sources]
 * @returns {'주조'|'사상'|'가공'|'없음'}
 */
export function resolveProcessHint(sources = {}) {
  const fromStage = normalizeProcessHint(sources.defectStage);
  if (fromStage !== '없음') return fromStage;

  const workerRaw =
    sources.workerProcess == null ? '' : String(sources.workerProcess).trim();
  if (PROCESS_HINT_CODES.includes(workerRaw)) return workerRaw;

  const fromProduct = normalizeProcessHint(sources.productProcess);
  if (fromProduct !== '없음') return fromProduct;

  return '없음';
}

/**
 * @param {Array<{ worker_name?: string, process?: string|null }>|null|undefined} directory
 * @param {string|null|undefined} workerName
 * @returns {string|null}
 */
export function lookupWorkerProcess(directory, workerName) {
  const name = workerName == null ? '' : String(workerName).trim();
  if (!name || !Array.isArray(directory)) return null;
  const row = directory.find((entry) => entry?.worker_name === name);
  if (!row || row.process == null) return null;
  const process = String(row.process).trim();
  return process || null;
}
