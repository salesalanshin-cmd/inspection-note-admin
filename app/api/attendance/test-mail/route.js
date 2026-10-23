import { NextResponse } from 'next/server';
import { buildWorkerDisplayNameMap } from '../../../../lib/analytics';
import { sendTestAttendanceMail } from '../../../../lib/attendance/mail';
import { getCompanyId } from '../../../../lib/company';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** 관리자 시험 발송: 활성 수신자 첫 번째 주소로만 POST { workDate? } */
export async function POST(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const workDate = body.workDate?.toString()?.trim() || null;
  if (workDate && !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return NextResponse.json({ error: 'invalid workDate' }, { status: 400 });
  }

  try {
    const companyId = await getCompanyId();
    const { data: directory } = await supabase
      .from('worker_directory')
      .select('worker_name, display_name')
      .eq('company_id', companyId);
    const displayMap = buildWorkerDisplayNameMap(directory || []);

    const result = await sendTestAttendanceMail({
      supabase,
      companyId,
      workDate,
      displayMap,
    });

    if (result.skipped && result.error === 'no_recipients') {
      return NextResponse.json(
        { error: '활성 수신자가 없습니다. 먼저 주소를 등록하세요.', ...result },
        { status: 400 }
      );
    }
    if (
      result.skipped &&
      typeof result.reason === 'string' &&
      (result.reason.includes('RESEND_API_KEY 없음') ||
        result.reason.includes('MAIL_FROM 없음'))
    ) {
      return NextResponse.json(
        {
          error: result.reason,
          ...result,
        },
        { status: 503 }
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'send failed', ...result },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attendance/test-mail]', err);
    return NextResponse.json(
      { error: err?.message || 'test mail failed' },
      { status: 500 }
    );
  }
}
