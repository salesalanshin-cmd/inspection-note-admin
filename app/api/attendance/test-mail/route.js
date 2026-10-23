import { NextResponse } from 'next/server';
import { buildWorkerDisplayNameMap } from '../../../../lib/analytics';
import { sendTestAttendanceMail } from '../../../../lib/attendance/mail';
import { safeTrim } from '../../../../lib/attendance/mailEnv';
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

  const workDate = safeTrim(body?.workDate) || null;
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

    const stage = result.stage || null;
    const message = result.error || result.reason || null;

    if (result.skipped && result.stage === 'recipient') {
      return NextResponse.json(
        {
          error: message || '수신자가 등록되지 않았습니다',
          stage: 'recipient',
        },
        { status: 400 }
      );
    }
    if (result.skipped && result.stage === 'env') {
      return NextResponse.json(
        {
          error: message || '메일 환경 변수 미설정',
          stage: 'env',
        },
        { status: 503 }
      );
    }
    if (
      result.skipped &&
      typeof message === 'string' &&
      message.includes('RESEND_API_KEY 없음')
    ) {
      return NextResponse.json(
        { error: message, stage: stage || 'env' },
        { status: 503 }
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error: message || 'send failed',
          stage: stage || 'send',
        },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[attendance/test-mail]', err);
    return NextResponse.json(
      {
        error: 'test mail failed',
        stage: 'send',
      },
      { status: 500 }
    );
  }
}
