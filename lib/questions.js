import { getDisplayName } from './analytics.js';
import { getCompanyId } from './company.js';
import { supabase } from './supabase.js';

export const QUESTION_THREAD_TYPE = 'question';

export const QUESTION_STATUS_LABELS = {
  open: '진행 중',
  wait_manager: '답변 대기',
  acted: '답변 완료',
  resolved: '종료',
};

export const DONE_STATUSES = ['acted', 'resolved'];

export function formatElapsed(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간`;
  const days = Math.floor(hours / 24);
  return `${days}일`;
}

export function isElapsedOver24h(iso) {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return ms >= 24 * 60 * 60 * 1000;
}

export function getFirstWorkerQuestion(messages) {
  return (messages || []).find(
    (m) => m.author_role === 'worker' && m.msg_type === 'question'
  );
}

/** message.meta.outcome — 작업자 O/X 피드백 */
export function getMessageOutcome(message) {
  const outcome = message?.meta?.outcome;
  if (outcome === 'effective' || outcome === 'ineffective') return outcome;
  return null;
}

export function getIneffectiveManagerAnswers(messages) {
  return (messages || []).filter(
    (m) => m.author_role === 'manager' && m.meta?.outcome === 'ineffective'
  );
}

export function isReinquiryThread(thread, managerMessagesByThread) {
  const msgs = managerMessagesByThread?.get(thread.id) || [];
  const hasIneffective = msgs.some((m) => m.meta?.outcome === 'ineffective');
  return (
    hasIneffective && (thread.status === 'wait_manager' || thread.status === 'open')
  );
}

export async function fetchManagerMessagesForThreads(threadIds) {
  const ids = [...new Set(threadIds)].filter(Boolean);
  if (!ids.length) return new Map();

  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('message')
    .select('id, thread_id, author_role, body, body_ko, meta, created_at')
    .eq('company_id', companyId)
    .in('thread_id', ids)
    .eq('author_role', 'manager')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const byThread = new Map();
  for (const m of data || []) {
    if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
    byThread.get(m.thread_id).push(m);
  }
  return byThread;
}

export async function fetchQuestionThreads(statusFilter = 'wait_manager', { includeHidden = false } = {}) {
  const companyId = await getCompanyId();
  let query = supabase
    .from('thread')
    .select(
      'id, title, status, company_id, created_by_worker, created_at, context, last_read_at, is_deleted, deleted_at'
    )
    .eq('company_id', companyId)
    .eq('type', QUESTION_THREAD_TYPE)
    .eq('is_deleted', includeHidden);

  if (!includeHidden && statusFilter === 'wait_manager') {
    query = query.eq('status', 'wait_manager');
  } else if (!includeHidden && statusFilter === 'done') {
    query = query.in('status', DONE_STATUSES);
  }

  const orderCol = includeHidden ? 'deleted_at' : 'created_at';
  const { data, error } = await query.order(orderCol, { ascending: !includeHidden });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchWaitManagerCount() {
  const companyId = await getCompanyId();
  const { count, error } = await supabase
    .from('thread')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('type', QUESTION_THREAD_TYPE)
    .eq('status', 'wait_manager')
    .eq('is_deleted', false);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function fetchQuestionThread(threadId, { allowHidden = false } = {}) {
  const companyId = await getCompanyId();
  let query = supabase
    .from('thread')
    .select('*')
    .eq('id', threadId)
    .eq('company_id', companyId)
    .eq('type', QUESTION_THREAD_TYPE);
  if (!allowHidden) query = query.eq('is_deleted', false);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchQuestionMessages(threadId) {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('message')
    .select(
      'id, thread_id, company_id, author_worker, author_role, msg_type, body, body_ko, lang, meta, created_at'
    )
    .eq('thread_id', threadId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchWorkerProfile(workerName, companyId) {
  if (!workerName) return null;
  const cid = companyId || (await getCompanyId());
  const { data: row, error } = await supabase
    .from('worker_directory')
    .select('worker_name, display_name, process, default_equipment_id, role')
    .eq('company_id', cid)
    .eq('worker_name', workerName)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { worker_name: workerName, display_name: workerName, process: null, equipmentName: null };

  let equipmentName = null;
  if (row.default_equipment_id) {
    const { data: eq } = await supabase
      .from('equipment')
      .select('name')
      .eq('id', row.default_equipment_id)
      .eq('company_id', cid)
      .maybeSingle();
    equipmentName = eq?.name || null;
  }

  return {
    ...row,
    displayName: getDisplayName(workerName, [row]),
    equipmentName,
  };
}

export function buildQuestionListRows(threads, workerDirectory, { managerMessagesByThread } = {}) {
  const rows = (threads || []).map((thread) => {
    const workerRow = (workerDirectory || []).find(
      (w) => w.worker_name === thread.created_by_worker
    );
    const isReinquiry = managerMessagesByThread
      ? isReinquiryThread(thread, managerMessagesByThread)
      : false;
    return {
      ...thread,
      displayName: getDisplayName(thread.created_by_worker, workerDirectory),
      process: workerRow?.process || thread.context?.process || null,
      preview: thread.title || '(질문 없음)',
      isReinquiry,
    };
  });

  if (!managerMessagesByThread) return rows;

  return rows.sort((a, b) => {
    if (a.isReinquiry && !b.isReinquiry) return -1;
    if (!a.isReinquiry && b.isReinquiry) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}
