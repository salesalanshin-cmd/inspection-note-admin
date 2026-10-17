import { classifyOcrDocumentType } from './ocrClassify.js';
import { createServiceRoleClient } from './supabaseAdmin.js';

export const OCR_TIME_BUDGET_MS = 45_000;
export const OCR_MAX_ATTEMPTS = 3;

export function isOcrEnabled(env = process.env) {
  return String(env.OCR_ENABLED || '').trim() === 'true';
}

export function getOcrBatchSize(env = process.env) {
  const n = Number(env.OCR_BATCH_SIZE);
  if (Number.isFinite(n) && n > 0 && n <= 50) return Math.floor(n);
  return 6;
}

export function getOcrDailyLimit(env = process.env) {
  const n = Number(env.OCR_DAILY_LIMIT);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return 200;
}

/** 오늘(KST) 00:00 → UTC ISO */
export function getKstDayStartIso(now = new Date()) {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  // KST midnight = UTC previous day 15:00
  const utc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000);
  return utc.toISOString();
}

export function remainingDailyQuota(processedToday, dailyLimit) {
  return Math.max(0, dailyLimit - processedToday);
}

/**
 * 실패 후 상태: attempts(증가 후)가 3 이상이면 failed, 아니면 pending 재시도
 */
export function statusAfterFailure(attemptsAfterIncrement) {
  return attemptsAfterIncrement >= OCR_MAX_ATTEMPTS ? 'failed' : 'pending';
}

export function shouldStopForTimeBudget(startedAt, now = Date.now(), budgetMs = OCR_TIME_BUDGET_MS) {
  return now - startedAt >= budgetMs;
}

/**
 * @param {object} opts
 * @param {number} [opts.limit]
 * @param {'recent'|'oldest'} [opts.order]
 * @param {boolean} [opts.manual]
 * @param {ReturnType<typeof createServiceRoleClient>} [opts.supabaseAdmin]
 */
export async function runOcrClassifyBatch(opts = {}) {
  if (!isOcrEnabled()) {
    return { ok: true, skipped: true, reason: 'OCR_ENABLED_not_true', processed: 0 };
  }

  const supabaseAdmin = opts.supabaseAdmin || createServiceRoleClient();
  const batchSize = opts.limit != null ? Math.min(Math.max(1, opts.limit), 50) : getOcrBatchSize();
  // recent(기본)=created_at DESC, oldest=ASC
  const orderAsc = opts.order === 'oldest';
  const dailyLimit = getOcrDailyLimit();
  const dayStart = getKstDayStartIso();

  const processedToday = await countProcessedToday(supabaseAdmin, dayStart);
  const quota = remainingDailyQuota(processedToday, dailyLimit);
  if (quota <= 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'daily_limit',
      processedToday,
      dailyLimit,
      processed: 0,
    };
  }

  const take = Math.min(batchSize, quota);
  const candidates = await fetchPendingCandidates(supabaseAdmin, take, orderAsc);
  if (!candidates.length) {
    return { ok: true, processed: 0, claimed: 0, results: [] };
  }

  const startedAt = Date.now();
  const results = [];
  let processed = 0;

  for (const row of candidates) {
    if (shouldStopForTimeBudget(startedAt)) {
      results.push({ id: row.id, status: 'deferred', reason: 'time_budget' });
      break;
    }
    if (processed >= quota) break;

    const claimed = await claimPendingRow(supabaseAdmin, row.id);
    if (!claimed) {
      results.push({ id: row.id, status: 'skipped_lock' });
      continue;
    }

    try {
      if (!claimed.image_url) {
        throw new Error('image_url missing');
      }

      const classified = await classifyOcrDocumentType(claimed.image_url, {
        supabaseAdmin,
      });

      await supabaseAdmin.from('ocr_usage').insert({
        ocr_result_id: claimed.id,
        model: classified.model,
        input_tokens: classified.usage.inputTokens,
        output_tokens: classified.usage.outputTokens,
      });

      const { error: doneError } = await supabaseAdmin
        .from('ocr_results')
        .update({
          status: 'done',
          doc_type: classified.docType,
          ocr_confidence: classified.confidence,
          ocr_model: classified.model,
          needs_review: classified.needsReview,
          parsed_data: classified.parsedData,
          ocr_error: null,
          ocr_processed_at: new Date().toISOString(),
          // company_id 보존 — 업데이트하지 않음
        })
        .eq('id', claimed.id)
        .eq('status', 'processing');

      if (doneError) throw new Error(doneError.message);

      processed += 1;
      results.push({
        id: claimed.id,
        status: 'done',
        docType: classified.docType,
        needsReview: classified.needsReview,
      });
    } catch (err) {
      const message = err?.message || String(err);
      // eslint-disable-next-line no-console
      console.error('[ocr/process] row failed', { id: claimed.id, message });

      const attempts = (Number(claimed.ocr_attempts) || 0) + 1;
      const nextStatus = statusAfterFailure(attempts);

      await supabaseAdmin
        .from('ocr_results')
        .update({
          status: nextStatus,
          ocr_attempts: attempts,
          ocr_error: message.slice(0, 500),
          ocr_processed_at: new Date().toISOString(),
        })
        .eq('id', claimed.id)
        .eq('status', 'processing');

      processed += 1;
      results.push({
        id: claimed.id,
        status: nextStatus,
        error: message.slice(0, 200),
        attempts,
      });
    }
  }

  return {
    ok: true,
    processed,
    claimed: results.filter((r) => r.status !== 'skipped_lock').length,
    processedToday: processedToday + processed,
    dailyLimit,
    results,
  };
}

async function countProcessedToday(supabaseAdmin, dayStartIso) {
  // 호출 건수 기준(ocr_usage) — 재시도도 일일 상한에 반영
  const { count, error } = await supabaseAdmin
    .from('ocr_usage')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', dayStartIso);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ocr/process] daily count failed', error.message);
    return 0;
  }
  return count || 0;
}

async function fetchPendingCandidates(supabaseAdmin, limit, orderAsc) {
  const { data, error } = await supabaseAdmin
    .from('ocr_results')
    .select('id, image_url, ocr_attempts, company_id, status, created_at')
    .eq('status', 'pending')
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('created_at', { ascending: orderAsc })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * pending → processing 조건부 잠금 (동시 실행 방지)
 * @returns {Promise<object|null>}
 */
export async function claimPendingRow(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from('ocr_results')
    .update({ status: 'processing' })
    .eq('id', id)
    .eq('status', 'pending')
    .select(
      'id, image_url, ocr_attempts, company_id, status, doc_type, created_at'
    )
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[ocr/process] claim failed', error.message);
    return null;
  }
  return data;
}
