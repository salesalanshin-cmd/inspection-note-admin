import { NextResponse } from 'next/server';
import { resolveAskAuth } from '../../../lib/askAuth.js';
import {
  notifyAnswerPosted,
  notifyQuestionEscalated,
  sendPush,
} from '../../../lib/push.js';
import { supabase } from '../../../lib/supabase.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-company-key',
};

function jsonWithCors(body, init = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/push/send
 * body.kind:
 *   - question_escalated: 관리자 전원
 *   - answer_posted | manager_answered: thread 작성자에게
 *   - custom: workerNames + title/body
 */
export async function POST(request) {
  const auth = await resolveAskAuth(request);
  if (!auth) {
    return jsonWithCors({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const kind = body.kind?.toString()?.trim() || '';
  const threadId = body.threadId?.toString()?.trim() || null;
  const companyId = auth.companyId;

  // eslint-disable-next-line no-console
  console.info('[api/push/send] 요청 수신', {
    kind,
    threadId,
    companyId,
    authMethod: auth.authMethod,
  });

  try {
    if (kind === 'question_escalated') {
      const questionPreview =
        body.questionText?.toString() ||
        body.body?.toString() ||
        body.questionPreview?.toString() ||
        '';
      const result = await notifyQuestionEscalated({
        companyId,
        threadId,
        questionText: questionPreview,
      });
      return jsonWithCors({ ok: true, ...result });
    }

    if (kind === 'answer_posted' || kind === 'manager_answered') {
      let workerName = body.workerName?.toString()?.trim() || '';
      if (!workerName && threadId) {
        const { data: thread } = await supabase
          .from('thread')
          .select('created_by_worker')
          .eq('id', threadId)
          .eq('company_id', companyId)
          .maybeSingle();
        workerName = thread?.created_by_worker || '';
      }
      const result = await notifyAnswerPosted({
        companyId,
        threadId,
        workerName,
      });
      return jsonWithCors({ ok: true, ...result });
    }

    if (kind === 'custom') {
      const workerNames = Array.isArray(body.workerNames) ? body.workerNames : [];
      const title = body.title?.toString()?.trim() || '검사노트';
      const messageBody = body.body?.toString()?.trim() || '';
      const result = await sendPush({
        companyId,
        workerNames,
        title,
        body: messageBody,
        data: body.data && typeof body.data === 'object' ? body.data : { threadId },
        threadId,
      });
      return jsonWithCors({ ok: true, ...result });
    }

    return jsonWithCors({ error: 'kind가 올바르지 않습니다.' }, { status: 400 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/push/send]', err);
    return jsonWithCors({
      ok: false,
      error: err?.message || '푸시 발송에 실패했습니다.',
    });
  }
}
