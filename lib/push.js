import { supabase } from './supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;
/** 동일 threadId+type 중복 발송 방지 창 (구버전 앱 /api/push/send 병행 호출 대비) */
const PUSH_DEDUP_WINDOW_MS = 60_000;

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

  const sourceEventId =
    data?.sourceEventId != null && data.sourceEventId !== ''
      ? String(data.sourceEventId)
      : null;

  function baseMeta(extra = {}) {
    return {
      type: pushType,
      ...(sourceEventId ? { sourceEventId } : {}),
      ...extra,
    };
  }

  // eslint-disable-next-line no-console
  console.info('[push] 푸시 발송 시작', {
    type: pushType,
    companyId,
    threadId,
    workerNames: names,
    requestedCount: names.length,
  });

  if (threadId) {
    const recent = await findRecentPushEvent({
      companyId,
      threadId,
      pushType,
      withinMs: PUSH_DEDUP_WINDOW_MS,
    });
    if (recent) {
      await logPushEvent({
        companyId,
        threadId,
        eventType: 'push_skipped',
        meta: {
          type: pushType,
          reason: 'duplicate',
          recentEventId: recent.id,
          recentAt: recent.created_at,
          via: 'sendPush',
        },
      });
      // eslint-disable-next-line no-console
      console.info('[push] 중복 발송 생략', {
        type: pushType,
        threadId,
        recentEventId: recent.id,
        recentAt: recent.created_at,
      });
      return {
        ok: true,
        skipped: true,
        deduped: true,
        targetCount: 0,
        successCount: 0,
        failedCount: 0,
      };
    }
  }

  if (!names.length) {
    await logPushEvent({
      companyId,
      threadId,
      eventType: 'push_sent',
      meta: baseMeta({
        targetCount: 0,
        successCount: 0,
        failedCount: 0,
        reason: 'no_workers',
      }),
    });
    // eslint-disable-next-line no-console
    console.info('[push] 대상 0건 — workerNames 비어 있음', { type: pushType });
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

  // eslint-disable-next-line no-console
  console.info('[push] 토큰 조회 결과', {
    type: pushType,
    requestedCount: names.length,
    rowCount: (rows || []).length,
    tokenCount: tokenEntries.length,
  });

  if (!tokenEntries.length) {
    await logPushEvent({
      companyId,
      threadId,
      eventType: 'push_sent',
      meta: baseMeta({
        targetCount: 0,
        successCount: 0,
        failedCount: 0,
        reason: 'no_tokens',
        requestedWorkers: names.length,
      }),
    });
    // eslint-disable-next-line no-console
    console.info('[push] 토큰 0건 — 발송 생략', { type: pushType, names });
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
    meta: baseMeta({
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
    }),
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

/**
 * kind → event_log meta.type
 * manager_answered 는 answer_posted 와 동일 취급
 */
export function pushTypeFromKind(kind) {
  const k = String(kind || '').trim();
  if (k === 'manager_answered') return 'answer_posted';
  if (k === 'question_escalated') return 'question_escalated';
  if (k === 'answer_posted') return 'answer_posted';
  if (k === 'custom') return 'custom';
  return k || 'push';
}

/**
 * /api/push/send 중복 방어.
 * threadId 가 있을 때만 판별 가능.
 * /api/ask 가 threadId 없이 발송한 경우(thread_id null)도 같은 type 이면 중복으로 본다.
 *
 * @returns {Promise<{ duplicate: boolean, recent?: { id: string, created_at: string } }>}
 */
export async function checkDuplicatePushAndLog({
  companyId,
  threadId,
  pushType,
  withinMs = PUSH_DEDUP_WINDOW_MS,
}) {
  if (!companyId || !threadId || !pushType) {
    return { duplicate: false };
  }

  const recent = await findRecentPushEvent({
    companyId,
    threadId,
    pushType,
    withinMs,
  });

  if (!recent) {
    return { duplicate: false };
  }

  await logPushEvent({
    companyId,
    threadId,
    eventType: 'push_skipped',
    meta: {
      type: pushType,
      reason: 'duplicate',
      recentEventId: recent.id,
      recentAt: recent.created_at,
    },
  });

  // eslint-disable-next-line no-console
  console.info('[push] push_skipped (duplicate)', {
    type: pushType,
    threadId,
    recentEventId: recent.id,
    recentAt: recent.created_at,
  });

  return { duplicate: true, recent };
}

/**
 * 최근 창 내 동일 type 발송 기록.
 * - thread_id === threadId 우선
 * - /api/ask 가 threadId 없이 남긴 thread_id null 기록도 매칭 (구버전·askApi 누락 대비)
 * @returns {Promise<{ id: string, created_at: string }|null>}
 */
async function findRecentPushEvent({
  companyId,
  threadId,
  pushType,
  withinMs = PUSH_DEDUP_WINDOW_MS,
}) {
  if (!companyId || !pushType) return null;
  const since = new Date(Date.now() - withinMs).toISOString();
  try {
    const { data, error } = await supabase
      .from('event_log')
      .select('id, created_at, meta, event_type, thread_id')
      .eq('company_id', companyId)
      .eq('event_type', 'push_sent')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[push] dedup 조회 실패', error.message || error);
      return null;
    }

    const rows = (data || []).filter((row) => row?.meta?.type === pushType);
    if (!rows.length) return null;

    if (threadId) {
      const exact = rows.find((row) => row.thread_id === threadId);
      if (exact) return { id: exact.id, created_at: exact.created_at };
      // ask 경로가 threadId 없이 발송한 직후 /api/push/send 가 따라오는 케이스
      const orphan = rows.find((row) => row.thread_id == null);
      if (orphan) return { id: orphan.id, created_at: orphan.created_at };
      return null;
    }

    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] dedup 조회 예외', err?.message || err);
    return null;
  }
}

/** role=manager & removed=false 작업자 이름 목록 (토큰 유무와 무관 — sendPush가 필터) */
export async function listManagerWorkerNames(companyId) {
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, removed, expo_push_token')
    .eq('company_id', companyId)
    .eq('role', 'manager');

  if (error) throw new Error(error.message);
  const active = (data || []).filter(
    (row) => row.removed !== true && row.worker_name
  );
  // eslint-disable-next-line no-console
  console.info('[push] 관리자 조회', {
    companyId,
    managerCount: active.length,
    withTokenCount: active.filter((r) => r.expo_push_token).length,
  });
  return active.map((row) => row.worker_name);
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
  // eslint-disable-next-line no-console
  console.info('[push] notifyQuestionEscalated 진입', { companyId, threadId });
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
  // eslint-disable-next-line no-console
  console.info('[push] notifyAnswerPosted 진입', {
    companyId,
    threadId,
    workerName: workerName || null,
  });
  try {
    if (!workerName) {
      await logPushEvent({
        companyId,
        threadId,
        eventType: 'push_sent',
        meta: {
          type: 'answer_posted',
          targetCount: 0,
          successCount: 0,
          failedCount: 0,
          reason: 'created_by_worker_null',
        },
      });
      // eslint-disable-next-line no-console
      console.info('[push] created_by_worker null — 발송 생략');
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
