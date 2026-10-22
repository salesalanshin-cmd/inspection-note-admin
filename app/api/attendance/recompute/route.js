import { NextResponse } from 'next/server';
import { computeAttendanceForWorkDate } from '../../../../lib/attendance/compute';
import { getCompanyId } from '../../../../lib/company';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** 관리자 수동 재계산 POST { workDate } */
export async function POST(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const workDate = body.workDate?.toString()?.trim();
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return NextResponse.json({ error: 'workDate required' }, { status: 400 });
  }

  try {
    const companyId = await getCompanyId();
    const result = await computeAttendanceForWorkDate(
      supabase,
      companyId,
      workDate,
      { overwriteReviewed: Boolean(body.overwriteReviewed) }
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attendance/recompute]', err);
    return NextResponse.json(
      { error: err?.message || 'recompute failed' },
      { status: 500 }
    );
  }
}
