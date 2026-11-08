import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session.js';
import { recomputeWorklogDedup } from '../../../../lib/worklogExtractJob.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

/**
 * GET /api/ocr/dedup?run=1 — 관리자 세션.
 * 이 회사의 작업일보 중복을 촬영 시각 기준으로 다시 계산한다.
 */
export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const url = new URL(request.url);
  if (!isValidSession(token) || url.searchParams.get('run') !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const result = await recomputeWorklogDedup(companyId);
    return NextResponse.json({ ok: true, companyId, ...result });
  } catch (err) {
    console.error('[api/ocr/dedup]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'worklog dedup failed' },
      { status: 500 }
    );
  }
}
