import { NextResponse } from 'next/server';
import { getCompanyCode } from '../../../lib/company';
import { isValidSession, SESSION_COOKIE_NAME } from '../../../lib/session';
import { fetchMesReview } from '../../../lib/mesProductionReview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const error = (message, status) => NextResponse.json({ error: message }, { status });
  if (!isValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value)) return error('관리자 로그인이 필요합니다.', 401);
  if (getCompanyCode() !== 'dkmetal') return error('디케이메탈 전용 기능입니다.', 403);
  const origin = request.headers.get('origin');
  if (origin && new URL(request.url).host !== new URL(origin).host) return error('요청 출처를 확인해주세요.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return error('JSON 요청이 필요합니다.', 415);
  const criteria = await request.json().catch(() => null);
  if (!criteria || !['list','history','lots','correct'].includes(criteria.action)) return error('조회 구분을 확인해주세요.', 400);
  try {
    const result = await fetchMesReview(criteria);
    return NextResponse.json(Array.isArray(result) ? { rows: result } : result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return error(e.message, e.status >= 400 && e.status < 500 ? e.status : 503);
  }
}
