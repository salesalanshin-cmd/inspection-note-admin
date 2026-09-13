import { defectLabel } from './constants.js';
import { listManagerWorkerNames, sendPush } from './pushSend.js';
import { supabase } from './supabase.js';

/**
 * 불량 조치 발송 — thread 확보 + action 메시지 + status + event_log + 선택적 푸시
 *
 * @param {object} opts
 * @param {string} opts.companyId
 * @param {string} opts.actionText
 * @param {boolean} [opts.notifyWorker=true]
 * @param {string|null} [opts.threadId] — 앱: 기존 defect thread
 * @param {string|null} [opts.defectReportId] — 어드민: defect_reports.id 로 thread 찾거나 생성
 * @param {string|null} [opts.managerWorker]
 * @param {string} [opts.managerName]
 */
export async function sendDefectAction({
  companyId,
  actionText,
  notifyWorker = true,
  threadId = null,
  defectReportId = null,
  managerWorker = null,
  managerName = '관리자',
}) {
  if (!companyId) throw new Error('companyId가 필요합니다.');
  const text = String(actionText || '').trim();
  if (!text) throw new Error('조치 내용을 입력하세요.');

  const resolvedManager = await resolveManagerWorker(companyId, managerWorker);

  let thread = null;
  if (threadId) {
    thread = await fetchDefectThread(companyId, threadId);
    if (!thread) {
      const err = new Error('불량 조치 스레드를 찾을 수 없습니다.');
      err.status = 404;
      throw err;
    }
  } else if (defectReportId) {
    thread = await findOrCreateDefectThread({
      companyId,
      defectReportId,
      managerWorker: resolvedManager,
    });
  } else {
    throw new Error('threadId 또는 defectReportId가 필요합니다.');
  }

  const { data: message, error: messageError } = await supabase
    .from('message')
    .insert({
      thread_id: thread.id,
      company_id: companyId,
      author_worker: resolvedManager,
      author_role: 'manager',
      msg_type: 'action',
      body: text,
      body_ko: text,
      lang: 'ko',
      meta: { outcome: 'unknown' },
    })
    .select('id, created_at')
    .single();
  if (messageError) throw new Error(messageError.message);

  const { error: statusError } = await supabase
    .from('thread')
    .update({ status: 'acted' })
    .eq('id', thread.id)
    .eq('company_id', companyId)
    .eq('is_deleted', false);
  if (statusError) throw new Error(statusError.message);

  const { error: eventError } = await supabase.from('event_log').insert({
    company_id: companyId,
    event_type: 'manager_acted',
    thread_id: thread.id,
    worker_name: thread.created_by_worker || null,
    meta: {
      manager: resolvedManager,
      managerName,
      messageId: message?.id || null,
      defectReportId: thread.ref_id || defectReportId || null,
      kind: 'defect_action',
    },
  });
  if (eventError) {
    // eslint-disable-next-line no-console
    console.error('[defectActions] event_log failed', eventError.message || eventError);
  }

  let pushResult = null;
  if (notifyWorker) {
    const workerName = thread.created_by_worker;
    const preview = text.slice(0, 30);
    try {
      pushResult = await sendPush({
        companyId,
        workerNames: workerName ? [workerName] : [],
        title: '조치 안내',
        body: preview || '조치가 등록되었습니다',
        data: { threadId: thread.id, type: 'defect_action' },
        threadId: thread.id,
      });
    } catch (pushErr) {
      // eslint-disable-next-line no-console
      console.error('[defectActions] push failed', pushErr?.message || pushErr);
      pushResult = { ok: false, error: pushErr?.message || String(pushErr) };
    }
  }

  return {
    ok: true,
    threadId: thread.id,
    messageId: message?.id || null,
    status: 'acted',
    notifyWorker: Boolean(notifyWorker),
    push: pushResult,
  };
}

async function resolveManagerWorker(companyId, managerWorkerRaw) {
  const raw = String(managerWorkerRaw || '').trim();
  if (raw) {
    const { data } = await supabase
      .from('worker_directory')
      .select('worker_name')
      .eq('company_id', companyId)
      .eq('worker_name', raw)
      .maybeSingle();
    if (data?.worker_name) return data.worker_name;
  }
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('worker_directory')
    .select('worker_name, removed')
    .eq('company_id', companyId)
    .eq('role', 'manager')
    .limit(20);
  if (fallbackError) throw new Error(fallbackError.message);
  const fallback = (fallbackRows || []).find(
    (row) => row.removed !== true && row.worker_name
  );
  return fallback?.worker_name || null;
}

async function fetchDefectThread(companyId, threadId) {
  const { data, error } = await supabase
    .from('thread')
    .select(
      'id, type, ref_id, title, status, created_by_worker, context, company_id, is_deleted'
    )
    .eq('id', threadId)
    .eq('company_id', companyId)
    .eq('type', 'defect')
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * defect_reports.id 기준 thread 조회 또는 생성
 */
export async function findOrCreateDefectThread({
  companyId,
  defectReportId,
  managerWorker = null,
}) {
  const { data: existing, error: findError } = await supabase
    .from('thread')
    .select(
      'id, type, ref_id, title, status, created_by_worker, context, company_id, is_deleted'
    )
    .eq('company_id', companyId)
    .eq('type', 'defect')
    .eq('ref_id', defectReportId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing;

  const { data: report, error: reportError } = await supabase
    .from('defect_reports')
    .select(
      'id, worker_name, defect_code, defect_type, defect_stage, equipment_name, mold_code, product_name, is_deleted, company_id'
    )
    .eq('id', defectReportId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (reportError) throw new Error(reportError.message);
  if (!report) {
    const err = new Error('불량 기록을 찾을 수 없습니다.');
    err.status = 404;
    throw err;
  }

  const codeLabel = defectLabel(report);
  const equipment = String(report.equipment_name || '').trim();
  const title = equipment ? `${equipment} · ${codeLabel}` : codeLabel;

  const { data: created, error: createError } = await supabase
    .from('thread')
    .insert({
      company_id: companyId,
      type: 'defect',
      ref_id: report.id,
      title,
      status: 'open',
      created_by_worker: report.worker_name || managerWorker || null,
      context: {
        defect_code: report.defect_code || null,
        defect_stage: report.defect_stage || null,
        equipment_name: report.equipment_name || null,
        mold_code: report.mold_code || null,
        product_name: report.product_name || null,
      },
      is_deleted: false,
    })
    .select(
      'id, type, ref_id, title, status, created_by_worker, context, company_id, is_deleted'
    )
    .single();
  if (createError) throw new Error(createError.message);
  return created;
}

const RECURRED_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECURRED_BATCH = 40;

/**
 * 미처리 recurred 이벤트 → 관리자 푸시 (cron용)
 * 중복: 동일 sourceEventId 의 push_sent(type=defect_recurred) 가 있으면 스킵
 */
export async function processRecurredPushNotifications(companyId) {
  if (!companyId) throw new Error('companyId가 필요합니다.');

  const since = new Date(Date.now() - RECURRED_LOOKBACK_MS).toISOString();
  const { data: events, error } = await supabase
    .from('event_log')
    .select('id, thread_id, company_id, created_at, meta, worker_name')
    .eq('company_id', companyId)
    .eq('event_type', 'recurred')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(RECURRED_BATCH);

  if (error) throw new Error(error.message);

  const candidates = (events || []).filter((ev) => {
    const reason = ev?.meta?.reason;
    return !reason || reason === 'ineffective_action';
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const details = [];

  for (const ev of candidates) {
    const threadId = ev.thread_id;
    if (!threadId) {
      skipped += 1;
      details.push({ eventId: ev.id, status: 'skipped', reason: 'no_thread' });
      continue;
    }

    const already = await hasRecurredPushSent(companyId, threadId, ev.id);
    if (already) {
      skipped += 1;
      details.push({ eventId: ev.id, status: 'skipped', reason: 'already_sent' });
      continue;
    }

    const { data: thread, error: threadError } = await supabase
      .from('thread')
      .select('id, type, is_deleted, created_by_worker, title')
      .eq('id', threadId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (threadError) {
      failed += 1;
      details.push({
        eventId: ev.id,
        status: 'failed',
        reason: threadError.message,
      });
      continue;
    }
    if (!thread) {
      skipped += 1;
      details.push({ eventId: ev.id, status: 'skipped', reason: 'thread_missing' });
      continue;
    }

    try {
      const managers = await listManagerWorkerNames(companyId);
      const pushResult = await sendPush({
        companyId,
        workerNames: managers,
        title: '조치 미해결',
        body: '조치 후에도 불량이 재발했습니다',
        data: {
          threadId,
          type: 'defect_recurred',
          sourceEventId: ev.id,
        },
        threadId,
      });

      // sendPush 60초 type dedup 등으로 sourceEventId 마커가 빠지면 cron이 재시도함 → 보장 기록
      if (!(await hasRecurredPushSent(companyId, threadId, ev.id))) {
        await supabase.from('event_log').insert({
          company_id: companyId,
          event_type: 'push_sent',
          thread_id: threadId,
          meta: {
            type: 'defect_recurred',
            sourceEventId: ev.id,
            reason: pushResult?.deduped ? 'deduped_marked' : 'ensure_marker',
            targetCount: pushResult?.targetCount ?? 0,
            successCount: pushResult?.successCount ?? 0,
          },
        });
      }

      processed += 1;
      details.push({
        eventId: ev.id,
        threadId,
        status: 'sent',
        push: {
          targetCount: pushResult?.targetCount ?? 0,
          successCount: pushResult?.successCount ?? 0,
          skipped: pushResult?.skipped ?? false,
          deduped: pushResult?.deduped ?? false,
        },
      });
    } catch (err) {
      failed += 1;
      details.push({
        eventId: ev.id,
        threadId,
        status: 'failed',
        reason: err?.message || String(err),
      });
      // eslint-disable-next-line no-console
      console.error('[defectActions] recurred push failed', err?.message || err);
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed,
    skipped,
    failed,
    details,
  };
}

async function hasRecurredPushSent(companyId, threadId, sourceEventId) {
  const { data, error } = await supabase
    .from('event_log')
    .select('id, meta, created_at')
    .eq('company_id', companyId)
    .eq('thread_id', threadId)
    .eq('event_type', 'push_sent')
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[defectActions] dedup 조회 실패', error.message);
    return false;
  }

  return (data || []).some(
    (row) =>
      row?.meta?.type === 'defect_recurred' &&
      String(row?.meta?.sourceEventId || '') === String(sourceEventId)
  );
}
