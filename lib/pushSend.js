/**
 * 하위 호환 래퍼 — 신규 코드는 lib/push.js 를 사용하세요.
 */
export {
  sendPush,
  notifyQuestionEscalated,
  notifyAnswerPosted,
  listManagerWorkerNames,
} from './push.js';

import {
  notifyAnswerPosted,
  notifyQuestionEscalated,
  sendPush,
  listManagerWorkerNames,
} from './push.js';
import { supabase } from './supabase.js';

/** @deprecated notifyQuestionEscalated 사용 */
export async function notifyManagersQuestionEscalated(opts) {
  return notifyQuestionEscalated({
    companyId: opts.companyId,
    threadId: opts.threadId,
    questionText: opts.questionPreview || opts.questionText || '',
  });
}

/** @deprecated notifyAnswerPosted 사용 */
export async function notifyWorkerManagerAnswered(opts) {
  return notifyAnswerPosted({
    companyId: opts.companyId,
    threadId: opts.threadId,
    workerName: opts.workerName,
  });
}

/** @deprecated sendPush 사용 */
export async function sendExpoPushMessages({
  companyId,
  threadId = null,
  tokens,
  title,
  body,
  data = {},
  kind = 'push',
}) {
  // 토큰만 있는 레거시 호출 → worker_name 역조회 후 sendPush
  const uniqueTokens = [
    ...new Set((tokens || []).map((t) => String(t || '').trim()).filter(Boolean)),
  ];
  if (!uniqueTokens.length) {
    return { ok: true, skipped: true, targetCount: 0, successCount: 0, failedCount: 0 };
  }

  const { data: rows, error } = await supabase
    .from('worker_directory')
    .select('worker_name, expo_push_token, removed')
    .eq('company_id', companyId)
    .in('expo_push_token', uniqueTokens);

  if (error) throw new Error(error.message);

  const workerNames = (rows || [])
    .filter((r) => r.removed !== true && r.worker_name)
    .map((r) => r.worker_name);

  return sendPush({
    companyId,
    workerNames,
    title,
    body,
    data: { ...data, type: data.type || kind },
    threadId,
  });
}

export async function fetchManagerPushTokens(companyId) {
  const names = await listManagerWorkerNames(companyId);
  const { data, error } = await supabase
    .from('worker_directory')
    .select('expo_push_token, removed')
    .eq('company_id', companyId)
    .in('worker_name', names.length ? names : ['__none__']);
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((r) => r.removed !== true && r.expo_push_token)
    .map((r) => r.expo_push_token);
}

export async function fetchWorkerPushToken(companyId, workerName) {
  const name = workerName?.trim();
  if (!name) return null;
  const { data, error } = await supabase
    .from('worker_directory')
    .select('expo_push_token, removed')
    .eq('company_id', companyId)
    .eq('worker_name', name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.removed === true) return null;
  return data?.expo_push_token || null;
}
