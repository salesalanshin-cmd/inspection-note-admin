import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company.js';
import {
  getInspectionReportRange,
  getWorkReport,
  listInspectionWorkdays,
} from '../../../../lib/inspectionStats.js';
import { requireWorklogAdmin } from '../../../../lib/worklogReviewHttp.js';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function neighbors(workdays, day) {
  let prev = null;
  let next = null;
  for (const item of workdays) {
    if (item < day) prev = item;
    else if (item > day && !next) next = item;
  }
  return { prev, next };
}

export async function GET(request) {
  if (!requireWorklogAdmin(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const workday = url.searchParams.get('workday');
    const supabase = createServiceRoleClient();
    const companyId = await getCompanyId();

    if (from || to) {
      if (!YMD.test(from || '') || !YMD.test(to || '') || from > to) {
        return NextResponse.json({ error: '기간은 YYYY-MM-DD 이고 시작이 끝보다 앞서야 합니다.' }, { status: 400 });
      }
      const body = await getInspectionReportRange({ from, to, supabase, companyId });
      return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (workday && !YMD.test(workday)) {
      return NextResponse.json({ error: '근무일은 YYYY-MM-DD 여야 합니다.' }, { status: 400 });
    }

    const workdays = await listInspectionWorkdays({ supabase, companyId });
    const day = workday || workdays[workdays.length - 1] || null;
    if (!day) {
      return NextResponse.json({
        companyName: '',
        workday: null,
        prev: null,
        next: null,
        generatedAt: new Date().toISOString(),
        report: null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const report = await getWorkReport({ workday: day, supabase, companyId });
    const around = neighbors(workdays, day);
    return NextResponse.json({
      companyName: report.companyName,
      workday: day,
      prev: around.prev,
      next: around.next,
      generatedAt: new Date().toISOString(),
      report,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/reports/daily]', err?.message || err);
    return NextResponse.json({ error: err?.message || '작업일보를 만들지 못했습니다.' }, { status: 500 });
  }
}
