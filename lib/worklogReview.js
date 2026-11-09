import { normalizeDefects } from './worklogExtract.js';

export const CORRECTION_DELETED = '__deleted__';
export const CORRECTION_ADDED = '__added__';

const TEXT_FIELDS = ['item_code', 'lot_no', 'start_time', 'end_time', 'task_note', 'process_code'];

export const TRACKED_FIELDS = ['work_date', 'item_code', 'lot_no', 'start_time', 'end_time', 'qty', 'task_note', 'process_code', 'defect_breakdown'];

export const STAT_FIELDS = ['work_date', 'item_code', 'qty', 'defect_breakdown'];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function buildReviewedSkipParsedData(parsed) {
  const current = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return {
    ...current,
    stage: 'extract',
    skipped_reason: 'reviewed',
  };
}

function assertCalendarDate(text) {
  const match = DATE_RE.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function blankToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function normalizeDefectInput(value) {
  const list = Array.isArray(value) ? value : [];
  const cleaned = [];
  for (const item of list) {
    const raw = blankToNull(item?.raw_code ?? item?.code);
    const qtyEmpty = item?.qty == null || item?.qty === '';
    if (!raw && qtyEmpty) continue;
    if (!qtyEmpty) {
      const qty = Number(item.qty);
      if (!Number.isInteger(qty)) {
        throw new Error('불량 수량은 정수여야 합니다.');
      }
      cleaned.push({ raw_code: raw, qty });
    } else {
      cleaned.push({ raw_code: raw, qty: null });
    }
  }
  return normalizeDefects(cleaned);
}

export function normalizeReviewField(field, value) {
  if (field === 'work_date') {
    const text = blankToNull(value);
    if (text == null) return null;
    const day = text.slice(0, 10);
    if (!assertCalendarDate(day)) throw new Error('근무일은 YYYY-MM-DD 여야 합니다.');
    return day;
  }
  if (field === 'qty') {
    if (value == null || value === '') return null;
    const qty = Number(value);
    if (!Number.isInteger(qty)) throw new Error('수량은 정수여야 합니다.');
    return qty;
  }
  if (field === 'defect_breakdown') {
    return normalizeDefectInput(value).breakdown;
  }
  if (!TEXT_FIELDS.includes(field)) {
    throw new Error(`수정할 수 없는 칸입니다: ${field}`);
  }
  const text = blankToNull(value);
  if (text && text.length > 200) throw new Error('칸 값이 너무 깁니다.');
  return text;
}

function defectKey(list) {
  return JSON.stringify((Array.isArray(list) ? list : []).map((item) => ({
    raw_code: item?.raw_code ?? null,
    code: item?.code ?? null,
    qty: item?.qty ?? null,
  })));
}

function sameValue(field, before, after) {
  if (field === 'defect_breakdown') return defectKey(before) === defectKey(after);
  return (before ?? null) === (after ?? null);
}

export function diffReviewFields(before, after) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    if (!sameValue(field, before?.[field] ?? null, after?.[field] ?? null)) {
      changes.push({
        field,
        before: before?.[field] ?? null,
        after: after?.[field] ?? null,
      });
    }
  }
  return changes;
}

export function appendCorrections(existing, entries) {
  const prev = Array.isArray(existing) ? existing : [];
  return [...prev, ...entries];
}

export function stampCorrections(entries, { at, by, rowId }) {
  return entries.map((entry) => ({
    row_id: rowId,
    field: entry.field,
    before: entry.before ?? null,
    after: entry.after ?? null,
    at,
    by,
  }));
}

/**
 * 검토한 행 가운데 수량 칸을 고친 비율을 뺀 값.
 * 검토한 행이 없으면 null.
 */
export function qtyAccuracy(reviewedCount, qtyEditedRowCount) {
  const reviewed = Number(reviewedCount) || 0;
  if (reviewed <= 0) return null;
  const edited = Math.min(reviewed, Number(qtyEditedRowCount) || 0);
  return 1 - edited / reviewed;
}

export function summarizeReviewCorrections(corrections, reviewedRowIds) {
  const reviewed = reviewedRowIds instanceof Set ? reviewedRowIds : new Set(reviewedRowIds || []);
  const fieldCounts = {
    work_date: 0,
    item_code: 0,
    qty: 0,
    defect_breakdown: 0,
  };
  const editedRows = new Set();
  const qtyRows = new Set();
  const lists = Array.isArray(corrections) ? corrections : [corrections];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const field = entry?.field;
      if (field === CORRECTION_ADDED || field === CORRECTION_DELETED) continue;
      if (STAT_FIELDS.includes(field)) fieldCounts[field] += 1;
      if (!entry?.row_id || !reviewed.has(entry.row_id)) continue;
      if (TRACKED_FIELDS.includes(field)) editedRows.add(entry.row_id);
      if (field === 'qty') qtyRows.add(entry.row_id);
    }
  }
  const reviewedCount = reviewed.size;
  return {
    reviewedRows: reviewedCount,
    editedRows: editedRows.size,
    fieldCounts,
    qtyEditedRows: qtyRows.size,
    qtyAccuracy: qtyAccuracy(reviewedCount, qtyRows.size),
  };
}

export function rowInWorkDateRange(workDate, from, to) {
  if (!from && !to) return true;
  if (!workDate) return false;
  const day = String(workDate).slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function isReviewQueueRow(row) {
  return row?.needs_review === true && row?.is_duplicate !== true;
}
