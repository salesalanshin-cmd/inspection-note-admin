import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company.js';
import { formatKstISODate } from '../../../../lib/kst.js';
import {
  getInspectionDashboard,
  resolveInspectionWindow,
} from '../../../../lib/inspectionStats.js';
import { requireWorklogAdmin } from '../../../../lib/worklogReviewHttp.js';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  if (!requireWorklogAdmin(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const window = resolveInspectionWindow({
      preset: url.searchParams.get('preset') || 'project',
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      today: formatKstISODate(new Date()),
    });
    const supabase = createServiceRoleClient();
    const companyId = await getCompanyId();
    const body = await getInspectionDashboard({
      ...window,
      bucket: url.searchParams.get('bucket') || 'month',
      supabase,
      companyId,
    });
    return NextResponse.json({ ...body, preset: window.preset }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error('[api/dashboard/inspection]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || '대시보드를 만들지 못했습니다.' },
      { status }
    );
  }
}
