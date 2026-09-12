import { supabase } from './supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

/**
 * 작업자 이름으로 Expo 푸시 발송
 *
 * @param {object} opts
 * @param {string} opts.companyId — 필수 (테넌트 격리)
 * @param {string[]} opts.workerNames
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {Record<string, unknown>} [opts.data]
 * @param {string|null} [opts.threadId]
 */
export async function sendPush({
  companyId,
  workerNames,
  title,
  body,
  data = {},
  threadId = null,
}) {
  if (!companyId) {
    throw new Error('companyId가 필요합니다.');
  }

  const names = [
    ...new Set(
      (workerNames || [])
        .map((n) => String(n || '').trim())
        .filter(Boolean)
    ),
  ];

  const pushType =
    typeof data?.type === 'string' && data.type ? data.type : 'push';

  if (!names.length) {
    await logPushEvent({
      companyId,
      threadId,
      eventType: 'push_sent',
      meta: {
        type: pushType,
        targetCount: 0,
        successCount: 0,
        failedCount: 0,
        reason: 'no_workers',
      },
    });
    return {
      ok: true,
      skipped: true,
      targetCount: 0,
      successCount: 0,
      failedCount: 0,
    };
  }

  const { data: rows, error } = await supabase
    .from('worker_directory')
    .select('worker_name, expo_push_token, removed')
    .eq('company_id', companyId)
    .in('worker_name', names);

  if (error) throw new Error(error.message);

  const tokenEntries = [];
  const seenTokens = new Set();
  for (const row of rows || []) {
    if (row.removed === true) continue;
    const token = String(row.expo_push_token || '').trim();
    if (!token) continue;
    if (seenTokens.has(token)) continue;
    seenTokens.add(token);
    tokenEntries.push({ workerName: row.worker_name, token });
  }

  if (!tokenEntries.length) {
    await logPushEvent({
      companyId,
      threadId,
      eventType: 'push_sent',
      meta: {
        type: pushType,
        targetCount: 0,
        successCount: 0,
        failedCount: 0,
        reason: 'no_tokens',
      },
    });
    return {
      ok: true,
      skipped: true,
      targetCount: 0,
      successCount: 0,
      failedCount: 0,
    };
  }

  const messages = tokenEntries.map(({ token }) => ({
    to: token,
    sound: 'default',
    title: String(title || ''),
    body: String(body || ''),
    data: {
      ...data,
      ...(threadId ? { threadId: data.threadId || threadId } : {}),
    },
  }));

  let successCount = 0;
  let failedCount = 0;
  const deadTokens = [];
  const failureReasons = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
    const batchTokens = tokenEntries.slice(i, i + EXPO_BATCH_SIZE);

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batch),
    });

    const responseText = await res.text();
    let parsed = null;
    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      failedCount += batch.length;
      failureReasons.push(`expo_http_${res.status}`);
      continue;
    }

    const tickets = Array.isArray(parsed?.data) ? parsed.data : [];
    if (!tickets.length) {
      // 티켓 배열이 없으면 배치 전체를 실패로 보지 않고 성공으로 집계하지 않음
      failureReasons.push('empty_ticket_response');
      failedCount += batch.length;
      continue;
    }

    for (let t = 0; t < tickets.length; t += 1) {
      const ticket = tickets[t];
      const token = batchTokens[t]?.token;
      if (ticket?.status === 'ok') {
        successCount += 1;
        continue;
      }
      failedCount += 1;
      const errCode =
        ticket?.details?.error ||
        ticket?.message ||
        'ticket_error';
      failureReasons.push(String(errCode));
      if (isDeviceNotRegistered(ticket) && token) {
        deadTokens.push(token);
      }
    }
  }

  if (deadTokens.length) {
    await clearDeadTokens(companyId, deadTokens);
  }

  const eventType =
    successCount > 0 && failedCount === 0
      ? 'push_sent'
      : successCount > 0
        ? 'push_sent'
        : 'push_failed';

  await logPushEvent({
    companyId,
    threadId,
    eventType,
    meta: {
      type: pushType,
      targetCount: tokenEntries.length,
      successCount,
      failedCount,
      reason:
        failureReasons.length > 0
          ? [...new Set(failureReasons)].slice(0, 5).join('; ')
          : successCount > 0
            ? null
            : 'unknown',
      clearedTokens: deadTokens.length,
    },
  });

  return {
    ok: successCount > 0 || failedCount === 0,
    targetCount: tokenEntries.length,
    successCount,
    failedCount,
    clearedTokens: deadTokens.length,
  };
}

function isDeviceNotRegistered(ticket) {
  const code = ticket?.details?.error || '';
  const message = ticket?.message || '';
  return (
    code === 'DeviceNotRegistered' ||
    String(message).includes('DeviceNotRegistered')
  );
}

async function clearDeadTokens(companyId, tokens) {
  const unique = [...new Set(tokens.filter(Boolean))];
  for (const token of unique) {
    try {
      const { error } = await supabase
        .from('worker_directory')
        .update({ expo_push_token: null })
        .eq('company_id', companyId)
        .eq('expo_push_token', token);
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[push] clearDeadToken failed', error.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[push] clearDeadToken exception', err?.message || err);
    }
  }
}

async function logPushEvent({ companyId, threadId, eventType, meta }) {
  try {
    const { error } = await supabase.from('event_log').insert({
      company_id: companyId,
      event_type: eventType,
      thread_id: threadId || null,
      meta,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[push] event_log 실패', error.message || error);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] event_log 예외', err?.message || err);
  }
}

/** role=manager & removed=false 작업자 이름 목록 */
export async function listManagerWorkerNames(companyId) {
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, removed')
    .eq('company_id', companyId)
    .eq('role', 'manager');

  if (error) throw new Error(error.message);
  return (data || [])
    .filter((row) => row.removed !== true && row.worker_name)
    .map((row) => row.worker_name);
}

/**
 * AI 이관 → 관리자 전원
 * 실패해도 throw하지 않음
 */
export async function notifyQuestionEscalated({
  companyId,
  threadId = null,
  questionText = '',
}) {
  try {
    const managers = await listManagerWorkerNames(companyId);
    const preview = String(questionText || '').trim().slice(0, 30);
    return await sendPush({
      companyId,
      workerNames: managers,
      title: '새 질문',
      body: preview || '관리자 확인이 필요합니다',
      data: { threadId, type: 'question_escalated' },
      threadId,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] notifyQuestionEscalated', err?.message || err);
    try {
      await logPushEvent({
        companyId,
        threadId,
        eventType: 'push_failed',
        meta: {
          type: 'question_escalated',
          targetCount: 0,
          successCount: 0,
          failedCount: 0,
          reason: err?.message || String(err),
        },
      });
    } catch {
      // ignore
    }
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * 관리자 답변 → 질문 작성자
 * 실패해도 throw하지 않음
 */
export async function notifyAnswerPosted({
  companyId,
  threadId = null,
  workerName,
}) {
  try {
    if (!workerName) {
      return { ok: true, skipped: true, targetCount: 0 };
    }
    return await sendPush({
      companyId,
      workerNames: [workerName],
      title: '답변 도착',
      body: '질문에 답변이 등록되었습니다',
      data: { threadId, type: 'answer_posted' },
      threadId,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] notifyAnswerPosted', err?.message || err);
    try {
      await logPushEvent({
        companyId,
        threadId,
        eventType: 'push_failed',
        meta: {
          type: 'answer_posted',
          targetCount: 0,
          successCount: 0,
          failedCount: 0,
          reason: err?.message || String(err),
        },
      });
    } catch {
      // ignore
    }
    return { ok: false, error: err?.message || String(err) };
  }
}
