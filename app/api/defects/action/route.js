import { NextResponse } from 'next/server';
import { resolveAskAuth } from '../../../../lib/askAuth.js';
import { sendDefectAction } from '../../../../lib/defectActions.js';

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
 * POST /api/defects/action
 * 앱 관리자 조치 → sendDefectAction (푸시 포함)
 *
 * body: { threadId, actionText, notifyWorker?, managerWorker?, managerName? }
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

  const threadId = body.threadId?.toString()?.trim() || null;
  const actionText = body.actionText?.toString()?.trim() || '';
  const notifyWorker = body.notifyWorker !== false;
  const managerWorker = body.managerWorker?.toString()?.trim() || null;
  const managerName = body.managerName?.toString()?.trim() || '관리자';

  if (!threadId) {
    return jsonWithCors({ error: 'threadId가 필요합니다.' }, { status: 400 });
  }
  if (!actionText) {
    return jsonWithCors({ error: '조치 내용을 입력하세요.' }, { status: 400 });
  }

  try {
    const result = await sendDefectAction({
      companyId: auth.companyId,
      threadId,
      actionText,
      notifyWorker,
      managerWorker,
      managerName,
    });
    return jsonWithCors(result);
  } catch (err) {
    const status = err?.status === 404 ? 404 : 500;
    // eslint-disable-next-line no-console
    console.error('[api/defects/action]', err);
    return jsonWithCors(
      { error: err?.message || '조치 등록에 실패했습니다.' },
      { status }
    );
  }
}
