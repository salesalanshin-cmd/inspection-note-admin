import { NextResponse } from 'next/server';
import { getCompanyCode, getCompanyId } from '../../../../lib/company';
import { isValidSession, SESSION_COOKIE_NAME } from '../../../../lib/session';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin';
import { deliverPending, listPending } from '../../../../lib/mesWorkerSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function withWorkerAdmin(request, handler) {
  if (!isValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
  }
  if (getCompanyCode() !== 'dkmetal') {
    return NextResponse.json({ error: '디케이메탈 전용 기능입니다.' }, { status: 403 });
  }
  try {
    return await handler(createServiceRoleClient(), await getCompanyId());
  } catch (error) {
    return NextResponse.json({ error: error.message || 'MES 연동 상태를 확인할 수 없습니다.' }, { status: 503 });
  }
}

export function GET(request) {
  return withWorkerAdmin(request, async (db, companyId) => {
    const { rows, count } = await listPending(db, companyId);
    return NextResponse.json({ pending: rows, count }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export function POST(request) {
  return withWorkerAdmin(request, async (db, companyId) => {
    const origin = request.headers.get('origin');
    if (origin && !['https://', 'http://'].some(scheme => origin === scheme + request.headers.get('host'))) {
      return NextResponse.json({ error: '요청 출처를 확인하세요.' }, { status: 403 });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'JSON 요청이 필요합니다.' }, { status: 415 });
    }
    const body = await request.json().catch(() => null);
    const name = body?.workerName;
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
      return NextResponse.json({ error: '작업자 등록명을 확인하세요.' }, { status: 400 });
    }
    const { rows } = await listPending(db, companyId, { name });
    const targets = body.retryEnvironment ? rows.filter(row => row.environment === body.retryEnvironment) : rows;
    const deliveries = await Promise.allSettled(targets.map(row => deliverPending(db, companyId, row, Boolean(body.retryEnvironment))));
    const { rows: pending } = await listPending(db, companyId, { name });
    const failure = deliveries.find(result => result.status === 'rejected');
    return NextResponse.json({
      pending, error: failure ? failure.reason.message : undefined,
    }, { status: pending.length ? 202 : 200 });
  });
}
