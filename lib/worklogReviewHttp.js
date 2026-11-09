import { NextResponse } from 'next/server';
import { getCompanyId } from './company.js';
import { isValidSession, SESSION_COOKIE_NAME } from './session.js';
import { createServiceRoleClient } from './supabaseAdmin.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function requireWorklogAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) return null;
  return true;
}

export async function runWorklogAdmin(request, handler) {
  if (!requireWorklogAdmin(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const supabase = createServiceRoleClient();
    const companyId = await getCompanyId();
    const body = await handler({ supabase, companyId });
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      console.error('[api/worklog-review]', err?.message || err);
    }
    return NextResponse.json(
      { error: err?.message || '요청에 실패했습니다.' },
      { status }
    );
  }
}
