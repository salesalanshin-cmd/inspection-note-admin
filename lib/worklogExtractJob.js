import { formatKstISODate } from './kst.js';
import { EXTRACT_PROMPT_VERSION, extractWorklog, readExtractMeta } from './ocrExtract.js';
import { buildReviewedSkipParsedData } from './worklogReview.js';
import { createServiceRoleClient } from './supabaseAdmin.js';
import {
  buildWorklogInserts,
  docTypeForForm,
  planWorklogDedup,
  savesWorklogRows,
} from './worklogExtract.js';
import { buildWorkerNameIndex } from './worklogWorkerMatch.js';

export const EXTRACT_TIME_BUDGET_MS = 600_000;
export const EXTRACT_MAX_ATTEMPTS = 3;

export function isWorklogExtractEnabled(env = process.env) {
  return String(env.OCR_EXTRACT_ENABLED || '').trim() === 'true';
}

export function getExtractBatchSize(env = process.env) {
  const n = Number(env.OCR_EXTRACT_BATCH_SIZE);
  if (Number.isFinite(n) && n > 0 && n <= 50) return Math.floor(n);
  return 5;
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

/** 크레딧 부족·요금 제한. 이 경우 시도 횟수를 올리지 않는다. */
export function isAnthropicBillingStop(err) {
  const status = Number(err?.status ?? err?.statusCode);
  if (status === 429 || status === 402) return true;
  const type = String(err?.error?.error?.type || err?.error?.type || '');
  if (type === 'rate_limit_error' || type === 'billing_error') return true;
  const message = String(err?.message || '');
  return /credit balance is too low|rate limit/i.test(message);
}

function lockCurrentStage(query, stage) {
  if (stage == null || stage === '') {
    return query.filter('parsed_data->>stage', 'is', null);
  }
  return query.filter('parsed_data->>stage', 'eq', String(stage));
}

async function claimExtract(supabase, row, { anyStage = false } = {}) {
  const current = asObject(row.parsed_data);
  const next = { ...current, stage: 'extracting' };
  let query = supabase
    .from('ocr_results')
    .update({ parsed_data: next })
    .eq('id', row.id);
  query = anyStage
    ? lockCurrentStage(query, current.stage)
    : query.filter('parsed_data->>stage', 'eq', 'classify');
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** 잠금만 풀고 시도 횟수는 그대로 둔다. */
export async function releaseExtractClaim(supabase, row) {
  const { error } = await supabase
    .from('ocr_results')
    .update({ parsed_data: asObject(row.parsed_data) })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extracting');
  if (error) throw new Error(error.message);
}

async function markFailure(supabase, row, message) {
  const attempts = (Number(row.ocr_attempts) || 0) + 1;
  const stage = attempts >= EXTRACT_MAX_ATTEMPTS ? 'extract_failed' : 'classify';
  const { error } = await supabase
    .from('ocr_results')
    .update({
      ocr_attempts: attempts,
      parsed_data: { ...asObject(row.parsed_data), stage },
      ocr_error: String(message || 'extract failed').slice(0, 500),
    })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extracting');
  if (error) throw new Error(error.message);
  return { attempts, stage };
}

async function markExtracted(supabase, row, { formType, formEvidence, rowCount, model, rawText }) {
  const patch = {
    status: 'done',
    parsed_data: {
      stage: 'extract',
      form_type: formType ?? null,
      form_evidence: formEvidence ?? null,
      prompt_version: EXTRACT_PROMPT_VERSION,
      row_count: rowCount,
      model: model ?? null,
    },
    extracted_text: rawText ?? '',
    ocr_error: null,
  };
  if (row.doc_type == null || String(row.doc_type).trim() === '') {
    const docType = docTypeForForm(formType);
    if (docType) patch.doc_type = docType;
  }
  const { error } = await supabase
    .from('ocr_results')
    .update(patch)
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extracting');
  if (error) throw new Error(error.message);
}

async function photoHasReviewedRow(supabase, ocrResultId) {
  const { data, error } = await supabase
    .from('worklog_rows')
    .select('id')
    .eq('ocr_result_id', ocrResultId)
    .not('reviewed_at', 'is', null)
    .limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

async function markReviewedSkip(supabase, row) {
  const { error } = await supabase
    .from('ocr_results')
    .update({ parsed_data: buildReviewedSkipParsedData(row.parsed_data) })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extracting');
  if (error) throw new Error(error.message);
}

async function deleteSheetRows(supabase, ocrResultId) {
  const { error } = await supabase.from('worklog_rows').delete().eq('ocr_result_id', ocrResultId);
  if (error) throw new Error(error.message);
}

async function fetchCompanyRows(supabase, companyId) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    let query = supabase
      .from('worklog_rows')
      .select('id, ocr_result_id, form_type, work_date, qty, is_duplicate, raw')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchCapturedAt(supabase, ids) {
  const captured = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase
      .from('ocr_results')
      .select('id, created_at')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const item of data || []) captured.set(item.id, item.created_at);
  }
  return captured;
}

/**
 * 한 회사의 작업일보 중복을 촬영 시각 기준으로 처음부터 다시 계산한다.
 * @param {string|null} companyId
 * @param {{ supabaseAdmin?: object }} [opts]
 * @returns {Promise<{ photos: number, supersededPhotos: number, duplicateRows: number }>}
 */
export async function recomputeWorklogDedup(companyId, opts = {}) {
  const supabase = opts.supabaseAdmin || createServiceRoleClient();
  const rows = await fetchCompanyRows(supabase, companyId);
  const photoIds = [...new Set(rows.map((row) => row.ocr_result_id).filter(Boolean))];
  const captured = await fetchCapturedAt(supabase, photoIds);
  const byPhoto = new Map();
  for (const row of rows) {
    if (!row.ocr_result_id) continue;
    const key = `${row.form_type ?? ''}\0${row.ocr_result_id}`;
    const sheet = byPhoto.get(key) || {
      id: row.ocr_result_id,
      formType: row.form_type ?? null,
      capturedAt: captured.get(row.ocr_result_id) || null,
      rows: [],
    };
    sheet.rows.push(row);
    byPhoto.set(key, sheet);
  }

  const plan = planWorklogDedup([...byPhoto.values()]);
  const markById = new Map(plan.marks.map((mark) => [mark.id, mark.supersededBy]));
  const updates = [];
  for (const row of rows) {
    const supersededBy = markById.get(row.id) || null;
    const raw = { ...asObject(row.raw) };
    const currentBy = raw.superseded_by ?? null;
    if (supersededBy) raw.superseded_by = supersededBy;
    else delete raw.superseded_by;
    if (Boolean(row.is_duplicate) === Boolean(supersededBy) && currentBy === supersededBy) continue;
    updates.push({ id: row.id, is_duplicate: Boolean(supersededBy), raw });
  }

  const concurrency = 15;
  for (let index = 0; index < updates.length; index += concurrency) {
    const chunk = updates.slice(index, index + concurrency);
    const results = await Promise.all(chunk.map(async (update) => {
      const { error } = await supabase
        .from('worklog_rows')
        .update({ is_duplicate: update.is_duplicate, raw: update.raw })
        .eq('id', update.id);
      return error;
    }));
    const failed = results.find(Boolean);
    if (failed) throw new Error(failed.message);
  }

  return {
    photos: plan.photos,
    supersededPhotos: plan.supersededPhotos,
    duplicateRows: plan.duplicateRows,
  };
}

async function loadWorkerIndex(supabase, companyId) {
  let query = supabase
    .from('worker_directory')
    .select('worker_name, process, removed, excluded');
  query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return buildWorkerNameIndex(data || []);
}

async function saveSheet(supabase, row, parsed) {
  const meta = readExtractMeta(parsed);
  const formType = parsed?.form_type ?? null;
  const formEvidence = parsed?.form_evidence ?? null;
  await deleteSheetRows(supabase, row.id);
  let inserted = 0;
  let needsReview = 0;
  if (savesWorklogRows(formType)) {
    const workerIndex = await loadWorkerIndex(supabase, row.company_id);
    const inserts = buildWorklogInserts({
      parsed,
      capturedYmd: formatKstISODate(row.created_at),
      companyId: row.company_id,
      uploaderName: row.worker_name,
      ocrResultId: row.id,
      workerIndex,
    });
    for (const insert of inserts) insert.is_duplicate = false;
    if (inserts.length) {
      const { error } = await supabase.from('worklog_rows').insert(inserts);
      if (error) throw new Error(error.message);
      inserted = inserts.length;
      needsReview = inserts.filter((insert) => insert.needs_review).length;
    }
  }
  await markExtracted(supabase, row, {
    formType,
    formEvidence,
    rowCount: inserted,
    model: meta.model,
    rawText: meta.rawText,
  });
  return { formType, formEvidence, inserted, needsReview };
}

const CANDIDATE_COLUMNS = 'id, image_url, created_at, worker_name, company_id, parsed_data, ocr_attempts, doc_type';

function applyCandidateFilters(query) {
  return query
    .eq('status', 'done')
    .in('doc_type', ['worklog', 'inspection'])
    .or('is_deleted.eq.false,is_deleted.is.null')
    .filter('parsed_data->>stage', 'eq', 'classify');
}

export async function fetchWorklogExtractCandidates(supabase, limit) {
  const { data, error } = await applyCandidateFilters(
    supabase.from('ocr_results').select(CANDIDATE_COLUMNS),
  )
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function countWorklogExtractCandidates(supabase) {
  const { count, error } = await applyCandidateFilters(
    supabase.from('ocr_results').select('id', { count: 'exact', head: true }),
  );
  if (error) throw new Error(error.message);
  return count || 0;
}

/**
 * 한 장을 잠그고 추출한다. 크레딧·요금 제한이면 잠금을 풀고 시도 횟수는 올리지 않는다.
 * @param {{ anyStage?: boolean }} [opts]
 */
export async function processWorklogExtractRow(supabase, row, { anyStage = false } = {}) {
  const claimed = await claimExtract(supabase, row, { anyStage });
  if (!claimed) return { id: row.id, status: 'skipped_lock', companyId: row.company_id ?? null };
  try {
    if (await photoHasReviewedRow(supabase, row.id)) {
      await markReviewedSkip(supabase, row);
      return { id: row.id, status: 'skipped_reviewed', companyId: row.company_id ?? null };
    }
    const parsed = await extractWorklog(row.image_url, formatKstISODate(row.created_at), {
      supabaseAdmin: supabase,
    });
    const saved = await saveSheet(supabase, row, parsed);
    return {
      id: row.id,
      status: 'extract',
      formType: saved.formType,
      formEvidence: saved.formEvidence,
      rowCount: saved.inserted,
      needsReview: saved.needsReview,
      companyId: row.company_id ?? null,
    };
  } catch (err) {
    const message = err?.message || String(err);
    if (isAnthropicBillingStop(err)) {
      await releaseExtractClaim(supabase, row);
      return {
        id: row.id,
        status: 'billing_stop',
        error: message.slice(0, 200),
        attempts: Number(row.ocr_attempts) || 0,
        companyId: row.company_id ?? null,
      };
    }
    console.error('[ocr/extract] row failed', { id: row.id, message });
    const failure = await markFailure(supabase, row, message);
    return {
      id: row.id,
      status: failure.stage,
      error: message.slice(0, 200),
      attempts: failure.attempts,
      companyId: row.company_id ?? null,
    };
  }
}

/** ids 순서 유지. 없는 id는 null. doc_type·stage·status는 보지 않는다. */
async function fetchByIds(supabase, ids) {
  const { data, error } = await supabase
    .from('ocr_results')
    .select(CANDIDATE_COLUMNS)
    .in('id', ids);
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id) || null);
}

/**
 * 분류가 끝난 작업일보·자주검사 사진을 추출해 worklog_rows에 넣는다.
 * ids가 있으면 분류 상태와 관계없이 그 행만 처리한다.
 * @param {{ limit?: number, ids?: string[], supabaseAdmin?: object }} [opts]
 */
export async function runWorklogExtractBatch(opts = {}) {
  if (!isWorklogExtractEnabled()) {
    return { ok: true, skipped: true, reason: 'OCR_EXTRACT_ENABLED_not_true', processed: 0, inserted: 0, needsReview: 0 };
  }

  const supabase = opts.supabaseAdmin || createServiceRoleClient();
  const ids = Array.isArray(opts.ids) && opts.ids.length ? opts.ids : null;
  const limit = opts.limit != null
    ? Math.min(Math.max(1, Math.floor(opts.limit)), 50)
    : getExtractBatchSize();
  const candidates = ids
    ? await fetchByIds(supabase, ids)
    : await fetchWorklogExtractCandidates(supabase, limit);
  const startedAt = Date.now();
  const results = [];
  const companies = new Set();
  let processed = 0;
  let inserted = 0;
  let needsReview = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    if (Date.now() - startedAt >= EXTRACT_TIME_BUDGET_MS) {
      results.push({
        id: row?.id ?? ids?.[index] ?? null,
        status: 'deferred',
        reason: 'time_budget',
      });
      break;
    }
    if (!row) {
      results.push({ id: ids[index], status: 'not_found' });
      continue;
    }
    const outcome = await processWorklogExtractRow(supabase, row, { anyStage: Boolean(ids) });
    results.push(outcome);
    if (outcome.status === 'billing_stop') break;
    if (outcome.status === 'skipped_lock') continue;
    processed += 1;
    if (outcome.status === 'extract') {
      inserted += outcome.rowCount;
      needsReview += outcome.needsReview;
      companies.add(outcome.companyId ?? null);
    }
  }

  const dedup = [];
  for (const companyId of companies) {
    dedup.push({
      companyId,
      ...(await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase })),
    });
  }

  return { ok: true, processed, inserted, needsReview, dedup, results };
}
