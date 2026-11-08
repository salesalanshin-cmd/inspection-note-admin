import { NextResponse } from 'next/server';
import { resolveAskAuth } from '../../../../lib/askAuth.js';
import { loadAttendanceCard } from '../../../../lib/attendance/loadCard.js';
import { getCompanyId } from '../../../../lib/company.js';
import { supabase } from '../../../../lib/supabase.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-company-key',
};

const MONTH = /^\d{4}-\d{2}$/;

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
 * GET /api/attendance/card?name=&month=YYYY-MM
 * 어드민 세션 또는 앱 x-company-key. 응답은 그 작업자 한 명의 카드만.
 */
export async function GET(request) {
  const auth = await resolveAskAuth(request);
  if (!auth) {
    return jsonWithCors({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let boundCompanyId;
  try {
    boundCompanyId = await getCompanyId();
  } catch (err) {
    return jsonWithCors({ error: err?.message || '회사 코드를 확인하지 못했습니다.' }, { status: 500 });
  }
  if (auth.companyId !== boundCompanyId) {
    return jsonWithCors({ error: '이 회사의 근태만 조회할 수 있습니다.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim() || '';
  const month = url.searchParams.get('month')?.trim() || '';
  if (!name) {
    return jsonWithCors({ error: 'name 이 필요합니다.' }, { status: 400 });
  }
  if (!MONTH.test(month)) {
    return jsonWithCors({ error: 'month 는 YYYY-MM 이어야 합니다.' }, { status: 400 });
  }

  try {
    const card = await loadAttendanceCard(supabase, boundCompanyId, { name, month });
    if (!card) {
      return jsonWithCors({ error: '이 회사의 작업자가 아닙니다.' }, { status: 404 });
    }
    return jsonWithCors(card);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/attendance/card]', err);
    return jsonWithCors({ error: err?.message || '근태 카드를 불러오지 못했습니다.' }, { status: 500 });
  }
}
