import { defectLabel } from './constants.js';
import { getCompanyId } from './company.js';
import { sendPush } from './pushSend.js';
import { fetchWorkerProfile } from './questions.js';
import { supabase } from './supabase.js';

export const DEFECT_THREAD_TYPE = 'defect';

/** 목록·필터용 조치 상태 */
export const DEFECT_ACTION_STATUS = {
  none: 'none',
  pending: 'pending',
  resolved: 'resolved',
  unresolved: 'unresolved',
};

export const DEFECT_ACTION_STATUS_LABELS = {
  none: '조치 없음',
  pending: '결과 대기',
  resolved: '해결됨',
  unresolved: '미해결',
};

const STALE_MS = 24 * 60 * 60 * 1000;

export function isActionPendingStale(latestActionAt) {
  if (!latestActionAt) return false;
  const ms = Date.now() - new Date(latestActionAt).getTime();
  return !Number.isNaN(ms) && ms >= STALE_MS;
}

/** message.meta.outcome — unknown 포함 */
export function getActionOutcome(message) {
  const outcome = message?.meta?.outcome;
  if (outcome === 'effective' || outcome === 'ineffective' || outcome === 'unknown') {
    return outcome;
  }
  if (message?.msg_type === 'action' && message?.author_role === 'manager') {
    return 'unknown';
  }
  return null;
}

export function getIneffectiveActions(messages) {
  return (messages || []).filter(
    (m) =>
      m.author_role === 'manager' &&
      m.msg_type === 'action' &&
      getActionOutcome(m) === 'ineffective'
  );
}

/**
 * 최신 action 메시지 기준 상태.
 * @returns {'none'|'pending'|'resolved'|'unresolved'}
 */
export function deriveDefectActionStatus(actionMessages) {
  const actions = (actionMessages || [])
    .filter((m) => m.msg_type === 'action' && m.author_role === 'manager')
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!actions.length) return DEFECT_ACTION_STATUS.none;

  const latest = actions[actions.length - 1];
  const outcome = getActionOutcome(latest);
  if (outcome === 'effective') return DEFECT_ACTION_STATUS.resolved;
  if (outcome === 'ineffective') return DEFECT_ACTION_STATUS.unresolved;
  return DEFECT_ACTION_STATUS.pending;
}

export function buildDefectThreadTitle(report, equipmentName) {
  const label = defectLabel(report) || report.defect_type || '불량';
  const equipment = (equipmentName || '').trim();
  return equipment ? `${equipment} · ${label}` : label;
}

export async function findDefectThread(defectReportId, companyId) {
  const cid = companyId || (await getCompanyId());
  const { data, error } = await supabase
    .from('thread')
    .select(
      'id, title, status, company_id, created_by_worker, ref_id, context, created_at, updated_at'
    )
    .eq('company_id', cid)
    .eq('type', DEFECT_THREAD_TYPE)
    .eq('ref_id', defectReportId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchDefectActionMessages(threadId, companyId) {
  if (!threadId) return [];
  const cid = companyId || (await getCompanyId());
  const { data, error } = await supabase
    .from('message')
    .select(
      'id, thread_id, company_id, author_worker, author_role, msg_type, body, body_ko, meta, created_at'
    )
    .eq('company_id', cid)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * 목록용: defect_report.id → { status, latestActionAt, threadId, stale }
 */
export async function fetchDefectActionSummaries(defectReportIds) {
  const ids = [...new Set((defectReportIds || []).filter(Boolean))];
  const empty = new Map();
  if (!ids.length) return empty;

  const companyId = await getCompanyId();
  const { data: threads, error: threadError } = await supabase
    .from('thread')
    .select('id, ref_id, status, created_at')
    .eq('company_id', companyId)
    .eq('type', DEFECT_THREAD_TYPE)
    .eq('is_deleted', false)
    .in('ref_id', ids);
  if (threadError) throw new Error(threadError.message);

  const threadList = threads || [];
  const byDefect = new Map();
  for (const id of ids) {
    byDefect.set(id, {
      status: DEFECT_ACTION_STATUS.none,
      latestActionAt: null,
      threadId: null,
      stale: false,
    });
  }

  if (!threadList.length) return byDefect;

  const threadIds = threadList.map((t) => t.id);

  const { data: messages, error: msgError } = await supabase
    .from('message')
    .select('id, thread_id, author_role, msg_type, meta, created_at')
    .eq('company_id', companyId)
    .in('thread_id', threadIds)
    .eq('author_role', 'manager')
    .eq('msg_type', 'action')
    .order('created_at', { ascending: true });
  if (msgError) throw new Error(msgError.message);

  const actionsByThread = new Map();
  for (const m of messages || []) {
    if (!actionsByThread.has(m.thread_id)) actionsByThread.set(m.thread_id, []);
    actionsByThread.get(m.thread_id).push(m);
  }

  for (const thread of threadList) {
    const actions = actionsByThread.get(thread.id) || [];
    const status = deriveDefectActionStatus(actions);
    const latest = actions.length ? actions[actions.length - 1] : null;
    const latestActionAt = latest?.created_at || null;
    const stale =
      status === DEFECT_ACTION_STATUS.pending && isActionPendingStale(latestActionAt);
    byDefect.set(thread.ref_id, {
      status,
      latestActionAt,
      threadId: thread.id,
      stale,
    });
  }

  return byDefect;
}

/**
 * 조치 보내기 — thread 없으면 생성, action 메시지 + event_log + 선택적 푸시
 */
export async function sendDefectAction({
  report,
  actionText,
  notifyWorker = true,
  managerWorker = '관리자',
}) {
  const body = String(actionText || '').trim();
  if (!body) throw new Error('조치 내용을 입력하세요.');
  if (!report?.id) throw new Error('불량 기록이 없습니다.');

  const companyId = await getCompanyId();
  const workerName = report.worker_name || null;
  if (!workerName) throw new Error('작업자 정보가 없어 조치를 보낼 수 없습니다.');

  let thread = await findDefectThread(report.id, companyId);

  if (!thread) {
    const profile = await fetchWorkerProfile(workerName, companyId);
    const equipmentName = profile?.equipmentName || null;
    const title = buildDefectThreadTitle(report, equipmentName);
    const context = {
      defect_code: report.defect_code || null,
      defect_stage: report.defect_stage || null,
      equipment_name: equipmentName,
      mold_code: report.mold_code || null,
      product_name: report.product_name || null,
    };

    const { data: created, error: createError } = await supabase
      .from('thread')
      .insert({
        company_id: companyId,
        type: DEFECT_THREAD_TYPE,
        ref_id: report.id,
        title,
        status: 'acted',
        created_by_worker: workerName,
        context,
        is_deleted: false,
      })
      .select('*')
      .single();
    if (createError) throw new Error(createError.message);
    thread = created;
  }

  const { data: message, error: messageError } = await supabase
    .from('message')
    .insert({
      thread_id: thread.id,
      company_id: companyId,
      author_worker: managerWorker || '관리자',
      author_role: 'manager',
      msg_type: 'action',
      body,
      body_ko: body,
      lang: 'ko',
      meta: { outcome: 'unknown' },
    })
    .select('*')
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
    worker_name: workerName,
    meta: {
      kind: 'defect_action',
      defect_report_id: report.id,
      manager: managerWorker || '관리자',
    },
  });
  if (eventError) {
    // eslint-disable-next-line no-console
    console.error('[defectActions] event_log failed', eventError);
  }

  let pushResult = null;
  if (notifyWorker) {
    const preview = body.slice(0, 30);
    try {
      pushResult = await sendPush({
        companyId,
        workerNames: [workerName],
        title: '조치 안내',
        body: preview,
        data: { threadId: thread.id, type: 'defect_action' },
        threadId: thread.id,
      });
    } catch (pushErr) {
      // eslint-disable-next-line no-console
      console.error('[defectActions] push failed', pushErr);
      pushResult = { ok: false, error: pushErr?.message || String(pushErr) };
    }
  }

  return { thread, message, pushResult };
}
