import { DEFECT_CODE_DEFINITIONS } from './defectCodeDefinitions.js';

/** 앱 src/lib/defectTypes.js 와 같은 코드 목록. */
const MASTER_CODES = DEFECT_CODE_DEFINITIONS.map((item) => item.code);
const MASTER_SET = new Set(MASTER_CODES);

const CONFUSION = { O: '0', I: '1', L: '1' };

const SAVED_FORMS = new Set(['final_inspection', 'working_report']);

export function savesWorklogRows(formType) {
  return SAVED_FORMS.has(formType);
}

/**
 * 원문 코드를 마스터 코드로 맞춘다. 자릿수와 O/0, I/l/1 혼동만 보정한다.
 * 마스터에 없으면 null.
 */
export function matchDefectCode(rawCode, master = MASTER_SET) {
  if (rawCode == null || String(rawCode).trim() === '') return null;
  const folded = String(rawCode)
    .trim()
    .toUpperCase()
    .replace(/[OIL]/g, (ch) => CONFUSION[ch]);
  if (master.has(folded)) return folded;

  const parts = folded.match(/^([A-Z]+)(\d+)$/);
  if (!parts) return null;
  const prefix = parts[1];
  const widths = new Set();
  for (const code of master) {
    const masterParts = String(code).match(/^([A-Z]+)(\d+)$/);
    if (masterParts && masterParts[1] === prefix) widths.add(masterParts[2].length);
  }
  for (const width of widths) {
    const padded = prefix + parts[2].padStart(width, '0');
    if (master.has(padded)) return padded;
  }
  return null;
}

export function normalizeDefects(defects) {
  const list = Array.isArray(defects) ? defects : [];
  let defectQty = 0;
  const breakdown = list.map((item) => {
    const qty = Number(item?.qty);
    const safeQty = Number.isFinite(qty) ? qty : null;
    if (safeQty != null) defectQty += safeQty;
    return {
      raw_code: item?.raw_code == null ? null : String(item.raw_code),
      code: matchDefectCode(item?.raw_code),
      qty: safeQty,
    };
  });
  return { defectQty, breakdown };
}

export function resolveProcessCode(formType, site) {
  if (formType === 'final_inspection') {
    return { processCode: 'IN', siteNeedsReview: false };
  }
  if (formType !== 'working_report') {
    return { processCode: null, siteNeedsReview: false };
  }
  if (site == null || String(site).trim() === '') {
    return { processCode: null, siteNeedsReview: true };
  }
  if (String(site).includes('검사')) {
    return { processCode: 'IN', siteNeedsReview: false };
  }
  return { processCode: null, siteNeedsReview: false };
}

/**
 * MM-DD에 촬영 연도(KST)를 붙인다.
 * 만든 날짜가 촬영일보다 뒤면 afterCapture.
 */
export function resolveWorkDate(mmdd, capturedYmd) {
  const match = String(mmdd || '').match(/^(\d{2})-(\d{2})$/);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(String(capturedYmd || ''))) {
    return { workDate: null, afterCapture: false, invalid: true };
  }
  const year = Number(capturedYmd.slice(0, 4));
  const month = Number(match[1]);
  const day = Number(match[2]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return { workDate: null, afterCapture: false, invalid: true };
  }
  const workDate = `${capturedYmd.slice(0, 4)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { workDate, afterCapture: workDate > capturedYmd, invalid: false };
}

function toQty(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function blankNote(taskNote) {
  return taskNote == null || String(taskNote).trim() === '';
}

export function needsReviewForRow({
  confidence,
  qty,
  taskNote,
  afterCapture,
  invalidDate,
  siteNeedsReview,
  qtyConflict,
}) {
  const qtyMissing = qty == null && blankNote(taskNote);
  return (
    confidence === 'low' ||
    qtyMissing ||
    afterCapture ||
    invalidDate ||
    siteNeedsReview ||
    qtyConflict
  );
}

function keyPart(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** sheet_worker는 넣지 않는다. */
export const SUPERSEDE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

const WORKLOG_FORMS = new Set([
  'final_inspection',
  'working_report',
  'machining',
  'grinding',
  'casting',
  'casting_detail',
]);

/** 추출 양식 → ocr_results.doc_type. 모르는 양식은 null. */
export function docTypeForForm(formType) {
  if (WORKLOG_FORMS.has(formType)) return 'worklog';
  if (formType === 'self_check') return 'inspection';
  if (formType === 'other') return 'other';
  return null;
}

function qtyToken(qty) {
  const n = Number(qty);
  return Number.isFinite(n) ? String(n) : String(qty);
}

/** qty가 있는 행의 (work_date, qty) 멀티셋. */
export function signatureMultiset(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    if (row?.qty == null || row.qty === '') continue;
    const key = `${row.work_date ?? ''}\0${qtyToken(row.qty)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function signatureSize(counts) {
  let size = 0;
  for (const count of counts.values()) size += count;
  return size;
}

/** Q 멀티셋 중 P와 개수까지 겹치는 비율. Q가 비어 있으면 0. */
export function matchRatio(qCounts, pCounts) {
  const qSize = signatureSize(qCounts);
  if (qSize === 0) return 0;
  let matched = 0;
  for (const [key, count] of qCounts) {
    matched += Math.min(count, pCounts.get(key) || 0);
  }
  return matched / qSize;
}

export function datesInRows(rows) {
  const dates = new Set();
  for (const row of rows || []) {
    if (row?.work_date) dates.add(row.work_date);
  }
  return dates;
}

/** Q 촬영 시각이 P보다 앞서고 차이가 21일 이내인지. */
export function withinSupersedeWindow(earlierIso, laterIso, windowMs = SUPERSEDE_WINDOW_MS) {
  const earlier = new Date(earlierIso).getTime();
  const later = new Date(laterIso).getTime();
  if (!Number.isFinite(earlier) || !Number.isFinite(later)) return false;
  if (earlier >= later) return false;
  return later - earlier <= windowMs;
}

/**
 * 촬영 시각과 무관하게, 같은 양식 안에서 각 사진의 최신 대체본을 정한다.
 * sheets: { id, capturedAt, formType, rows }[]
 * P의 수량 멀티셋이 나중에 찍힌 R과 50% 이상 겹치면, 그런 R 중 가장 나중 것이 대체본이다.
 * 표시하는 행은 R에 같은 work_date가 있는 P의 행뿐이다.
 */
export function planWorklogDedup(sheets) {
  const list = Array.isArray(sheets) ? sheets : [];
  const byForm = new Map();
  for (const sheet of list) {
    const formType = sheet?.formType ?? null;
    const group = byForm.get(formType) || [];
    group.push(sheet);
    byForm.set(formType, group);
  }

  const marks = [];
  let supersededPhotos = 0;
  for (const group of byForm.values()) {
    const ordered = group
      .filter((sheet) => sheet?.capturedAt && Number.isFinite(Date.parse(sheet.capturedAt)))
      .slice()
      .sort((a, b) => {
        const delta = Date.parse(a.capturedAt) - Date.parse(b.capturedAt);
        if (delta !== 0) return delta;
        return String(a.id).localeCompare(String(b.id));
      });
    for (let index = 0; index < ordered.length; index += 1) {
      const photo = ordered[index];
      const pCounts = signatureMultiset(photo.rows);
      if (signatureSize(pCounts) === 0) continue;
      const pTime = Date.parse(photo.capturedAt);
      let replacement = null;
      for (let later = index + 1; later < ordered.length; later += 1) {
        const candidate = ordered[later];
        const gap = Date.parse(candidate.capturedAt) - pTime;
        if (gap > SUPERSEDE_WINDOW_MS) break;
        if (!withinSupersedeWindow(photo.capturedAt, candidate.capturedAt)) continue;
        if (matchRatio(pCounts, signatureMultiset(candidate.rows)) < 0.5) continue;
        replacement = candidate;
      }
      if (!replacement) continue;
      supersededPhotos += 1;
      const dates = datesInRows(replacement.rows);
      for (const row of photo.rows || []) {
        if (row?.id && row.work_date && dates.has(row.work_date)) {
          marks.push({ id: row.id, supersededBy: replacement.id });
        }
      }
    }
  }

  return {
    photos: list.length,
    supersededPhotos,
    duplicateRows: marks.length,
    marks,
  };
}

export function buildDedupKey({
  companyId,
  formType,
  workDate,
  itemCode,
  lotNo,
  start,
  end,
}) {
  return [companyId, formType, workDate, itemCode, lotNo, start, end].map(keyPart).join('|');
}

export function buildWorklogInserts({
  parsed,
  capturedYmd,
  companyId,
  uploaderName,
  ocrResultId,
}) {
  if (!savesWorklogRows(parsed?.form_type) || !Array.isArray(parsed.rows)) return [];
  return parsed.rows.filter((row) => row && typeof row === 'object').map((row) => {
    const { processCode, siteNeedsReview } = resolveProcessCode(parsed.form_type, row.site);
    const date = resolveWorkDate(row.date, capturedYmd);
    const qty = toQty(row.qty);
    const defects = normalizeDefects(row.defects);
    const dedupKey = buildDedupKey({
      companyId,
      formType: parsed.form_type,
      workDate: date.workDate,
      itemCode: row.item_code,
      lotNo: row.lot_no,
      start: row.start,
      end: row.end,
    });
    const needsReview = needsReviewForRow({
      confidence: row.confidence,
      qty,
      taskNote: row.task_note,
      afterCapture: date.afterCapture,
      invalidDate: date.invalid,
      siteNeedsReview,
      qtyConflict: false,
    });
    return {
      company_id: companyId ?? null,
      ocr_result_id: ocrResultId,
      form_type: parsed.form_type,
      process_code: processCode,
      sheet_worker: row.sheet_worker ?? parsed.sheet_worker ?? null,
      uploader_name: uploaderName ?? null,
      work_date: date.workDate,
      item_code: row.item_code ?? null,
      lot_no: row.lot_no ?? null,
      task_note: row.task_note ?? null,
      start_time: row.start ?? null,
      end_time: row.end ?? null,
      qty,
      qty_kind: parsed.form_type === 'final_inspection' ? 'good' : 'work',
      defect_qty: defects.defectQty,
      defect_breakdown: defects.breakdown,
      dedup_key: dedupKey,
      is_duplicate: false,
      confidence: row.confidence ?? null,
      needs_review: needsReview,
      raw: { ...row, form_evidence: parsed.form_evidence ?? null },
    };
  });
}
