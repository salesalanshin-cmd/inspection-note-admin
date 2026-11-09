import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company.js';
import { formatKstISODate } from '../../../../lib/kst.js';
import { getProjectKpi } from '../../../../lib/inspectionStats.js';
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
    const today = formatKstISODate(new Date());
    const body = await getProjectKpi({
      today,
      periodA: {
        from: url.searchParams.get('fromA') || '2026-06-01',
        to: url.searchParams.get('toA') || '2026-07-31',
      },
      periodB: {
        from: url.searchParams.get('fromB') || '2026-09-01',
        to: url.searchParams.get('toB') || today,
      },
      supabase: createServiceRoleClient(),
      companyId: await getCompanyId(),
    });
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error('[api/reports/kpi]', err?.message || err);
    return NextResponse.json({ error: err?.message || '성과지표를 만들지 못했습니다.' }, { status });
  }
}
