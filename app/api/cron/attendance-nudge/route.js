import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { runFivesMissingNudge } from '../../../../lib/attendance/nudge';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** 매일 10:00 KST — 3정5S 미기록 독촉 (개별 스위치, 기본 OFF) */
export async function GET(request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const result = await runFivesMissingNudge(supabase, companyId);
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron/attendance-nudge]', err);
    return NextResponse.json(
      { error: err?.message || 'nudge failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
