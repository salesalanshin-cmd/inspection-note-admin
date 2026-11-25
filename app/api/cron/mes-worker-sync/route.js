import { NextResponse } from 'next/server';
import { getCompanyCode, getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin';
import { deliverPending, listPending } from '../../../../lib/mesWorkerSync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (getCompanyCode() !== 'dkmetal') return NextResponse.json({ processed: 0 });
  try {
    const db = createServiceRoleClient();
    const companyId = await getCompanyId();
    const { rows } = await listPending(db, companyId, { untouched: true, limit: 4 });
    const results = await Promise.allSettled(rows.map(row => deliverPending(db, companyId, row, false)));
    const failed = results.filter(r => r.status === 'rejected').length;
    return NextResponse.json({ selected: rows.length, failed }, { status: failed ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: 'MES 연동 대기 목록을 확인하세요.' }, { status: 503 });
  }
}
