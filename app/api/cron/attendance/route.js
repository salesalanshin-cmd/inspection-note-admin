import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { buildWorkerDisplayNameMap } from '../../../../lib/analytics';
import {
  computeAttendanceForWorkDate,
  fetchAttendanceRange,
  previousMonthRange,
  previousWeekRange,
  previousWorkDate,
  workDateDaysAgo,
} from '../../../../lib/attendance/compute';
import {
  retryFailedMails,
  sendAndLogAttendanceReport,
} from '../../../../lib/attendance/mail';
import { getKstDateParts, getKstDay } from '../../../../lib/kst';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 근태 일일 계산 + 메일 리포트
 * - 매일: 전일 + 전전일 재계산(늦게 들어온 신호 반영)
 * - 월요일: 전주 추가
 * - 매월 1일: 전월 추가
 */
export async function GET(request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const now = new Date();
    const workDate = previousWorkDate(now);
    const workDatePrev2 = workDateDaysAgo(now, 2);

    const computePrev2 = await computeAttendanceForWorkDate(
      supabase,
      companyId,
      workDatePrev2
    );
    const computeResult = await computeAttendanceForWorkDate(
      supabase,
      companyId,
      workDate
    );

    const { data: directory } = await supabase
      .from('worker_directory')
      .select('worker_name, display_name')
      .eq('company_id', companyId);
    const displayMap = buildWorkerDisplayNameMap(directory || []);

    const mails = [];

    // 매일: 전일
    const dailyRows = await fetchAttendanceRange(
      supabase,
      companyId,
      workDate,
      workDate
    );
    mails.push(
      await sendAndLogAttendanceReport({
        supabase,
        companyId,
        kind: 'attendance_daily',
        periodStart: workDate,
        periodEnd: workDate,
        rows: dailyRows,
        displayMap,
        subject: `[검사노트] 근태 일일 (${workDate})`,
      })
    );

    // 월요일(KST): 전주
    if (getKstDay(now) === 1) {
      const week = previousWeekRange(now);
      // 주간 범위 재계산 보강
      for (
        let d = week.start;
        d <= week.end;
        d = incrementDate(d)
      ) {
        await computeAttendanceForWorkDate(supabase, companyId, d);
      }
      const weekRows = await fetchAttendanceRange(
        supabase,
        companyId,
        week.start,
        week.end
      );
      mails.push(
        await sendAndLogAttendanceReport({
          supabase,
          companyId,
          kind: 'attendance_weekly',
          periodStart: week.start,
          periodEnd: week.end,
          rows: weekRows,
          displayMap,
          subject: `[검사노트] 근태 주간 (${week.start}~${week.end})`,
        })
      );
    }

    // 매월 1일(KST): 전월
    const { day } = getKstDateParts(now);
    if (day === 1) {
      const month = previousMonthRange(now);
      const monthRows = await fetchAttendanceRange(
        supabase,
        companyId,
        month.start,
        month.end
      );
      mails.push(
        await sendAndLogAttendanceReport({
          supabase,
          companyId,
          kind: 'attendance_monthly',
          periodStart: month.start,
          periodEnd: month.end,
          rows: monthRows,
          displayMap,
          subject: `[검사노트] 근태 월간 (${month.start}~${month.end})`,
        })
      );
    }

    const retries = await retryFailedMails(supabase, companyId, { limit: 3 });

    return NextResponse.json({
      ok: true,
      compute: computeResult,
      computePrev2,
      mails,
      retries,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[cron/attendance]', err);
    return NextResponse.json(
      { error: err?.message || 'attendance cron failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}

function incrementDate(ymd) {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
