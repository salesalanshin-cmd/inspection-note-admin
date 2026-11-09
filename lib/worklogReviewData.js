import { buildDedupKey } from './worklogExtract.js';
import { recomputeWorklogDedup } from './worklogExtractJob.js';
import { getKstDateParts, toKstDate } from './kst.js';
import {
  CORRECTION_ADDED,
  CORRECTION_DELETED,
  TRACKED_FIELDS,
  appendCorrections,
  diffReviewFields,
  isReviewQueueRow,
  normalizeDefectInput,
  normalizeReviewField,
  rowInWorkDateRange,
  stampCorrections,
  summarizeReviewCorrections,
} from './worklogReview.js';

export const WORKLOG_REVIEWER_NAME = 'admin';

const FORMS = new Set(['final_inspection', 'working_report']);

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatCapturedAt(value) {
  if (!value) return '';
  const kst = toKstDate(value);
  const { year, month, day } = getKstDateParts(value);
  return `${year}-${pad(month + 1)}-${pad(day)} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fetchAll(queryPage) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function parseFilters(input = {}) {
  const scope = input.scope === 'all' ? 'all' : 'needs';
  const form = FORMS.has(input.form) ? input.form : 'all';
  const from = input.from || '';
  const to = input.to || '';
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw httpError('근무일 시작이 올바르지 않습니다.');
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw httpError('근무일 끝이 올바르지 않습니다.');
  if (from && to && from > to) throw httpError('근무일 시작이 끝보다 늦습니다.');
  return { scope, form, from, to };
}

function matchesScope(row, filters) {
  if (filters.form !== 'all' && row.form_type !== filters.form) return false;
  if (!rowInWorkDateRange(row.work_date, filters.from, filters.to)) return false;
  if (filters.scope === 'needs' && !isReviewQueueRow(row)) return false;
  return true;
}

async function fetchQueueRows(supabase, companyId) {
  return fetchAll((from, to) => supabase
    .from('worklog_rows')
    .select('id, ocr_result_id, form_type, process_code, work_date, is_duplicate, needs_review')
    .eq('company_id', companyId)
    .or('process_code.eq.IN,process_code.is.null')
    .order('id', { ascending: true })
    .range(from, to));
}

async function fetchPhotosByIds(supabase, companyId, ids) {
  const photos = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from('ocr_results')
      .select('id, image_url, created_at, worker_name, company_id, is_deleted, parsed_data')
      .in('id', chunk)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
    photos.push(...(data || []).filter((row) => row.is_deleted !== true));
  }
  return photos;
}

export async function listWorklogReview(supabase, companyId, input) {
  const filters = parseFilters(input);
  const rows = await fetchQueueRows(supabase, companyId);
  const byPhoto = new Map();
  for (const row of rows) {
    if (!row.ocr_result_id || !matchesScope(row, filters)) continue;
    const bucket = byPhoto.get(row.ocr_result_id) || [];
    bucket.push(row);
    byPhoto.set(row.ocr_result_id, bucket);
  }
  const photos = await fetchPhotosByIds(supabase, companyId, [...byPhoto.keys()]);
  const listed = photos
    .map((photo) => {
      const scoped = byPhoto.get(photo.id) || [];
      const needsReviewCount = scoped.filter((row) => isReviewQueueRow(row)).length;
      return {
        id: photo.id,
        imageUrl: photo.image_url || null,
        createdAt: photo.created_at,
        capturedAt: formatCapturedAt(photo.created_at),
        workerName: photo.worker_name || null,
        formType: photo.parsed_data?.form_type || scoped[0]?.form_type || null,
        formEvidence: photo.parsed_data?.form_evidence || null,
        needsReviewCount,
        rowCount: scoped.length,
      };
    })
    .sort((a, b) => {
      const delta = Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0);
      if (delta !== 0) return delta;
      return String(a.id).localeCompare(String(b.id));
    });
  const stats = await loadReviewStats(supabase, companyId);
  return {
    summary: {
      remainingRows: listed.reduce((sum, photo) => sum + photo.needsReviewCount, 0),
      photoCount: listed.length,
    },
    stats,
    photos: listed,
  };
}

async function loadReviewStats(supabase, companyId) {
  const reviewed = await fetchAll((from, to) => supabase
    .from('worklog_rows')
    .select('id')
    .eq('company_id', companyId)
    .not('reviewed_at', 'is', null)
    .order('id', { ascending: true })
    .range(from, to));
  const corrections = await fetchAll((from, to) => supabase
    .from('ocr_results')
    .select('corrections')
    .eq('company_id', companyId)
    .not('corrections', 'is', null)
    .order('id', { ascending: true })
    .range(from, to));
  return summarizeReviewCorrections(
    corrections.map((row) => row.corrections),
    reviewed.map((row) => row.id)
  );
}

const DETAIL_COLUMNS = 'id, ocr_result_id, company_id, form_type, process_code, work_date, item_code, lot_no, task_note, start_time, end_time, qty, defect_qty, defect_breakdown, confidence, is_duplicate, needs_review, reviewed_at, reviewed_by, raw';

function presentRow(row) {
  return {
    id: row.id,
    formType: row.form_type,
    processCode: row.process_code ?? null,
    workDate: row.work_date ? String(row.work_date).slice(0, 10) : null,
    itemCode: row.item_code ?? null,
    lotNo: row.lot_no ?? null,
    taskNote: row.task_note ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    qty: row.qty ?? null,
    defectBreakdown: Array.isArray(row.defect_breakdown) ? row.defect_breakdown : [],
    confidence: row.confidence ?? null,
    isDuplicate: row.is_duplicate === true,
    needsReview: row.needs_review === true,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    raw: row.raw && typeof row.raw === 'object' ? row.raw : null,
  };
}

async function loadPhoto(supabase, companyId, ocrResultId) {
  const { data, error } = await supabase
    .from('ocr_results')
    .select('id, image_url, created_at, worker_name, company_id, is_deleted, parsed_data, corrections')
    .eq('id', ocrResultId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.is_deleted === true || data.company_id !== companyId) {
    throw httpError('사진을 찾지 못했습니다.', 404);
  }
  return data;
}

export async function getWorklogReviewPhoto(supabase, companyId, ocrResultId) {
  const photo = await loadPhoto(supabase, companyId, ocrResultId);
  const { data, error } = await supabase
    .from('worklog_rows')
    .select(DETAIL_COLUMNS)
    .eq('company_id', companyId)
    .eq('ocr_result_id', ocrResultId)
    .order('work_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return {
    photo: {
      id: photo.id,
      imageUrl: photo.image_url || null,
      createdAt: photo.created_at,
      capturedAt: formatCapturedAt(photo.created_at),
      workerName: photo.worker_name || null,
      formType: photo.parsed_data?.form_type || data?.[0]?.form_type || null,
      formEvidence: photo.parsed_data?.form_evidence || null,
    },
    rows: (data || []).map(presentRow),
  };
}

function storedComparable(row) {
  return {
    work_date: row.work_date ? String(row.work_date).slice(0, 10) : null,
    item_code: row.item_code ?? null,
    lot_no: row.lot_no ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    qty: row.qty ?? null,
    task_note: row.task_note ?? null,
    process_code: row.process_code ?? null,
    defect_breakdown: Array.isArray(row.defect_breakdown) ? row.defect_breakdown : [],
  };
}

function readPatch(input) {
  try {
    return readPatchFields(input);
  } catch (err) {
    if (err?.status) throw err;
    throw httpError(err?.message || '입력값을 확인하세요.');
  }
}

function readPatchFields(input) {
  const next = {};
  for (const field of TRACKED_FIELDS) {
    if (field === 'defect_breakdown') {
      next.defect_breakdown = normalizeDefectInput(input?.defectBreakdown ?? input?.defect_breakdown).breakdown;
      continue;
    }
    const camel = {
      work_date: 'workDate',
      item_code: 'itemCode',
      lot_no: 'lotNo',
      start_time: 'startTime',
      end_time: 'endTime',
      task_note: 'taskNote',
      process_code: 'processCode',
    }[field];
    const raw = input?.[field] !== undefined ? input[field] : input?.[camel];
    next[field] = normalizeReviewField(field, raw);
  }
  const defects = normalizeDefectInput(input?.defectBreakdown ?? input?.defect_breakdown);
  next.defect_breakdown = defects.breakdown;
  next.defect_qty = defects.defectQty;
  return next;
}

async function loadRow(supabase, companyId, rowId) {
  const { data, error } = await supabase
    .from('worklog_rows')
    .select(`${DETAIL_COLUMNS}, dedup_key, qty_kind, sheet_worker, uploader_name`)
    .eq('id', rowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.company_id !== companyId) throw httpError('행을 찾지 못했습니다.', 404);
  return data;
}

async function writeCorrections(supabase, photo, entries) {
  if (!entries.length) return;
  const { error } = await supabase
    .from('ocr_results')
    .update({ corrections: appendCorrections(photo.corrections, entries) })
    .eq('id', photo.id);
  if (error) throw new Error(error.message);
}

function touchesDedup(changes) {
  return changes.some((change) => change.field === 'work_date' || change.field === 'qty');
}

async function loadOwnedPhoto(supabase, companyId, ocrResultId) {
  return loadPhoto(supabase, companyId, ocrResultId);
}

export async function saveWorklogReviewRow(supabase, companyId, rowId, input, by = WORKLOG_REVIEWER_NAME) {
  const row = await loadRow(supabase, companyId, rowId);
  const photo = await loadOwnedPhoto(supabase, companyId, row.ocr_result_id);
  const next = readPatch(input);
  const before = storedComparable(row);
  const after = storedComparable({ ...row, ...next });
  const changes = diffReviewFields(before, after);
  const reviewedAt = new Date().toISOString();
  const patch = {
    ...next,
    dedup_key: buildDedupKey({
      companyId: row.company_id,
      formType: row.form_type,
      workDate: next.work_date,
      itemCode: next.item_code,
      lotNo: next.lot_no,
      start: next.start_time,
      end: next.end_time,
    }),
    needs_review: false,
    reviewed_at: reviewedAt,
    reviewed_by: by,
  };
  const { data, error } = await supabase
    .from('worklog_rows')
    .update(patch)
    .eq('id', row.id)
    .eq('company_id', companyId)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await writeCorrections(
    supabase,
    photo,
    stampCorrections(changes, { at: reviewedAt, by, rowId: row.id })
  );
  let dedup = null;
  if (touchesDedup(changes)) {
    dedup = await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase });
  }
  const fresh = dedup ? await loadRow(supabase, companyId, row.id) : data;
  return { row: presentRow(fresh), corrections: changes.length, dedup };
}

export async function addWorklogReviewRow(supabase, companyId, input, by = WORKLOG_REVIEWER_NAME) {
  const ocrResultId = String(input?.ocrResultId || input?.ocr_result_id || '').trim();
  if (!ocrResultId) throw httpError('사진 id가 필요합니다.');
  const photo = await loadOwnedPhoto(supabase, companyId, ocrResultId);
  const { data: siblings, error: siblingError } = await supabase
    .from('worklog_rows')
    .select('form_type, qty_kind, sheet_worker, uploader_name')
    .eq('ocr_result_id', ocrResultId)
    .eq('company_id', companyId)
    .limit(1);
  if (siblingError) throw new Error(siblingError.message);
  const sibling = siblings?.[0] || null;
  const formType = sibling?.form_type || photo.parsed_data?.form_type || null;
  if (!FORMS.has(formType)) throw httpError('행을 추가할 수 있는 양식이 아닙니다.');
  const next = readPatch(input);
  const reviewedAt = new Date().toISOString();
  const insert = {
    company_id: companyId,
    ocr_result_id: ocrResultId,
    form_type: formType,
    process_code: next.process_code,
    sheet_worker: sibling?.sheet_worker ?? null,
    uploader_name: sibling?.uploader_name ?? photo.worker_name ?? null,
    work_date: next.work_date,
    item_code: next.item_code,
    lot_no: next.lot_no,
    task_note: next.task_note,
    start_time: next.start_time,
    end_time: next.end_time,
    qty: next.qty,
    qty_kind: sibling?.qty_kind || (formType === 'final_inspection' ? 'good' : 'work'),
    defect_qty: next.defect_qty,
    defect_breakdown: next.defect_breakdown,
    dedup_key: buildDedupKey({
      companyId,
      formType,
      workDate: next.work_date,
      itemCode: next.item_code,
      lotNo: next.lot_no,
      start: next.start_time,
      end: next.end_time,
    }),
    is_duplicate: false,
    confidence: null,
    needs_review: false,
    reviewed_at: reviewedAt,
    reviewed_by: by,
    raw: { source: 'review_add' },
  };
  const { data, error } = await supabase
    .from('worklog_rows')
    .insert(insert)
    .select(DETAIL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  await writeCorrections(supabase, photo, stampCorrections(
    [{ field: CORRECTION_ADDED, before: null, after: storedComparable(data) }],
    { at: reviewedAt, by, rowId: data.id }
  ));
  let dedup = null;
  if (next.work_date || next.qty != null) {
    dedup = await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase });
  }
  const fresh = dedup ? await loadRow(supabase, companyId, data.id) : data;
  return { row: presentRow(fresh), dedup };
}

export async function deleteWorklogReviewRow(supabase, companyId, rowId, by = WORKLOG_REVIEWER_NAME) {
  const row = await loadRow(supabase, companyId, rowId);
  const photo = await loadOwnedPhoto(supabase, companyId, row.ocr_result_id);
  const at = new Date().toISOString();
  await writeCorrections(supabase, photo, stampCorrections(
    [{ field: CORRECTION_DELETED, before: storedComparable(row), after: null }],
    { at, by, rowId: row.id }
  ));
  const { error } = await supabase
    .from('worklog_rows')
    .delete()
    .eq('id', row.id)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  let dedup = null;
  if (row.work_date || row.qty != null) {
    dedup = await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase });
  }
  return { deletedId: row.id, dedup };
}

export async function completeWorklogReviewPhoto(supabase, companyId, ocrResultId, by = WORKLOG_REVIEWER_NAME) {
  await loadOwnedPhoto(supabase, companyId, ocrResultId);
  const reviewedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('worklog_rows')
    .update({
      needs_review: false,
      reviewed_at: reviewedAt,
      reviewed_by: by,
    })
    .eq('company_id', companyId)
    .eq('ocr_result_id', ocrResultId)
    .or('needs_review.eq.true,reviewed_at.is.null')
    .select('id');
  if (error) throw new Error(error.message);
  return { updated: data?.length || 0 };
}
