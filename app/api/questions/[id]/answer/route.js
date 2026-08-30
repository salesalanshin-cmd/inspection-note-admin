import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../../lib/company.js';
import { insertKnowledgeFromAnswer } from '../../../../../lib/knowledgeStore.js';
import { getFirstWorkerQuestion } from '../../../../../lib/questions.js';
import { isValidSession, SESSION_COOKIE_NAME } from '../../../../../lib/session.js';
import { supabase } from '../../../../../lib/supabase.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request, { params }) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const threadId = params?.id?.toString()?.trim();
  if (!threadId) {
    return NextResponse.json({ error: 'thread id가 필요합니다.' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const answerText = body.answer?.toString()?.trim();
  if (!answerText) {
    return NextResponse.json({ error: '답변을 입력하세요.' }, { status: 400 });
  }

  const saveKnowledge = body.saveKnowledge !== false;
  const questionText = body.questionText?.toString()?.trim() || '';
  const knowledgeAnswerText = body.knowledgeAnswerText?.toString()?.trim() || answerText;
  const managerName = body.managerName?.toString()?.trim() || '관리자';
  const managerWorkerRaw = body.managerWorker?.toString()?.trim() || '';

  try {
    const companyId = await getCompanyId();

    let managerWorker = null;
    if (managerWorkerRaw) {
      const { data: workerRow } = await supabase
        .from('worker_directory')
        .select('worker_name')
        .eq('company_id', companyId)
        .eq('worker_name', managerWorkerRaw)
        .maybeSingle();
      managerWorker = workerRow?.worker_name || null;
    }
    if (!managerWorker) {
      const { data: fallbackManager } = await supabase
        .from('worker_directory')
        .select('worker_name')
        .eq('company_id', companyId)
        .eq('role', 'manager')
        .limit(1)
        .maybeSingle();
      managerWorker = fallbackManager?.worker_name || null;
    }

    const { data: thread, error: threadError } = await supabase
      .from('thread')
      .select('id, status, created_by_worker, title')
      .eq('id', threadId)
      .eq('company_id', companyId)
      .eq('type', 'question')
      .eq('is_deleted', false)
      .maybeSingle();
    if (threadError) throw new Error(threadError.message);
    if (!thread) {
      return NextResponse.json({ error: '질문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: messages, error: msgListError } = await supabase
      .from('message')
      .select('id, author_role, msg_type, body, body_ko')
      .eq('thread_id', threadId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });
    if (msgListError) throw new Error(msgListError.message);

    const firstQuestion =
      questionText ||
      getFirstWorkerQuestion(messages)?.body_ko ||
      getFirstWorkerQuestion(messages)?.body ||
      thread.title ||
      '';

    const { error: messageError } = await supabase.from('message').insert({
      thread_id: threadId,
      company_id: companyId,
      author_worker: managerWorker,
      author_role: 'manager',
      msg_type: 'answer',
      body: answerText,
      body_ko: answerText,
      lang: 'ko',
    });
    if (messageError) throw new Error(messageError.message);

    const { error: statusError } = await supabase
      .from('thread')
      .update({ status: 'acted' })
      .eq('id', threadId)
      .eq('company_id', companyId);
    if (statusError) throw new Error(statusError.message);

    const { error: eventError } = await supabase.from('event_log').insert({
      company_id: companyId,
      event_type: 'manager_acted',
      thread_id: threadId,
      worker_name: thread.created_by_worker,
      meta: { manager: managerWorker },
    });
    if (eventError) {
      // eslint-disable-next-line no-console
      console.error('[questions/answer] event_log failed', eventError);
    }

    let knowledgeResult = null;
    if (saveKnowledge && firstQuestion) {
      try {
        knowledgeResult = await insertKnowledgeFromAnswer({
          companyId,
          questionText: firstQuestion,
          answerText: knowledgeAnswerText,
          sourceLabel: `현장 Q&A · ${managerName} 답변`,
          threadId,
        });
      } catch (knowledgeErr) {
        // eslint-disable-next-line no-console
        console.error('[questions/answer] knowledge insert failed', knowledgeErr);
        knowledgeResult = {
          knowledgeId: null,
          embeddingSaved: false,
          embeddingError: knowledgeErr?.message || '지식 저장 실패',
        };
      }
    }

    return NextResponse.json({
      ok: true,
      threadId,
      status: 'acted',
      knowledge: knowledgeResult,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/questions/answer]', err);
    return NextResponse.json(
      { error: err?.message || '답변 등록에 실패했습니다.' },
      { status: 500 }
    );
  }
}
