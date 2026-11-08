import { formatKstISODate } from './kst.js';
import { extractWorklog, readExtractMeta } from './ocrExtract.js';
import { createServiceRoleClient } from './supabaseAdmin.js';
import { buildWorklogInserts, savesWorklogRows } from './worklogExtract.js';

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

function sameQty(left, right) {
  if (left == null && right == null) return true;
  return left === right;
}

async function claimExtract(supabase, row) {
  const next = { ...asObject(row.parsed_data), stage: 'extracting' };
  const { data, error } = await supabase
    .from('ocr_results')
    .update({ parsed_data: next })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'classify')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
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

async function markExtracted(supabase, row, { formType, rowCount, model, rawText }) {
  const { error } = await supabase
    .from('ocr_results')
    .update({
      parsed_data: {
        stage: 'extract',
        form_type: formType ?? null,
        row_count: rowCount,
        model: model ?? null,
      },
      extracted_text: rawText ?? '',
      ocr_error: null,
    })
    .eq('id', row.id)
    .filter('parsed_data->>stage', 'eq', 'extracting');
  if (error) throw new Error(error.message);
}

async function applyDuplicates(supabase, inserts) {
  let needsReview = 0;
  const ready = [];
  for (const insert of inserts) {
    let query = supabase
      .from('worklog_rows')
      .select('id, qty, needs_review')
      .eq('dedup_key', insert.dedup_key);
    query = insert.company_id
      ? query.eq('company_id', insert.company_id)
      : query.is('company_id', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const existing = data || [];
    const row = { ...insert };
    if (existing.length) {
      row.is_duplicate = true;
      const conflicts = existing.filter((item) => !sameQty(item.qty, row.qty));
      if (conflicts.length) {
        row.needs_review = true;
        const ids = conflicts.filter((item) => !item.needs_review).map((item) => item.id);
        if (ids.length) {
          const { error: reviewError } = await supabase
            .from('worklog_rows')
            .update({ needs_review: true })
            .in('id', ids);
          if (reviewError) throw new Error(reviewError.message);
        }
      }
    }
    if (row.needs_review) needsReview += 1;
    ready.push(row);
  }
  return { ready, needsReview };
}

async function saveSheet(supabase, row, parsed) {
  const meta = readExtractMeta(parsed);
  const formType = parsed?.form_type ?? null;
  let inserted = 0;
  let needsReview = 0;
  if (savesWorklogRows(formType)) {
    const inserts = buildWorklogInserts({
      parsed,
      capturedYmd: formatKstISODate(row.created_at),
      companyId: row.company_id,
      uploaderName: row.worker_name,
      ocrResultId: row.id,
    });
    const applied = await applyDuplicates(supabase, inserts);
    needsReview = applied.needsReview;
    if (applied.ready.length) {
      const { error } = await supabase.from('worklog_rows').insert(applied.ready);
      if (error) throw new Error(error.message);
      inserted = applied.ready.length;
    }
  }
  await markExtracted(supabase, row, {
    formType,
    rowCount: inserted,
    model: meta.model,
    rawText: meta.rawText,
  });
  return { formType, inserted, needsReview };
}

async function fetchCandidates(supabase, limit) {
  const { data, error } = await supabase
    .from('ocr_results')
    .select('id, image_url, created_at, worker_name, company_id, parsed_data, ocr_attempts, doc_type')
    .eq('status', 'done')
    .in('doc_type', ['worklog', 'inspection'])
    .or('is_deleted.eq.false,is_deleted.is.null')
    .filter('parsed_data->>stage', 'eq', 'classify')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * 분류가 끝난 작업일보·자주검사 사진을 추출해 worklog_rows에 넣는다.
 * @param {{ limit?: number, supabaseAdmin?: object }} [opts]
 */
export async function runWorklogExtractBatch(opts = {}) {
  if (!isWorklogExtractEnabled()) {
    return { ok: true, skipped: true, reason: 'OCR_EXTRACT_ENABLED_not_true', processed: 0, inserted: 0, needsReview: 0 };
  }

  const supabase = opts.supabaseAdmin || createServiceRoleClient();
  const limit = opts.limit != null
    ? Math.min(Math.max(1, Math.floor(opts.limit)), 50)
    : getExtractBatchSize();
  const candidates = await fetchCandidates(supabase, limit);
  const startedAt = Date.now();
  const results = [];
  let processed = 0;
  let inserted = 0;
  let needsReview = 0;

  for (const row of candidates) {
    if (Date.now() - startedAt >= EXTRACT_TIME_BUDGET_MS) {
      results.push({ id: row.id, status: 'deferred', reason: 'time_budget' });
      break;
    }
    const claimed = await claimExtract(supabase, row);
    if (!claimed) {
      results.push({ id: row.id, status: 'skipped_lock' });
      continue;
    }
    processed += 1;
    try {
      const parsed = await extractWorklog(row.image_url, formatKstISODate(row.created_at), {
        supabaseAdmin: supabase,
      });
      const saved = await saveSheet(supabase, row, parsed);
      inserted += saved.inserted;
      needsReview += saved.needsReview;
      results.push({
        id: row.id,
        status: 'extract',
        formType: saved.formType,
        rowCount: saved.inserted,
        needsReview: saved.needsReview,
      });
    } catch (err) {
      const message = err?.message || String(err);
      console.error('[ocr/extract] row failed', { id: row.id, message });
      const failure = await markFailure(supabase, row, message);
      results.push({
        id: row.id,
        status: failure.stage,
        error: message.slice(0, 200),
        attempts: failure.attempts,
      });
    }
  }

  return { ok: true, processed, inserted, needsReview, results };
}
