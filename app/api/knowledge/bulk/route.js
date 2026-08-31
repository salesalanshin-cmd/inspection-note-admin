import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { bulkCreateKnowledge } from '../../../../lib/knowledgeAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ error: '등록할 행이 없습니다.' }, { status: 400 });
    }
    const result = await bulkCreateKnowledge(companyId, rows);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '일괄 등록 실패' }, { status: 500 });
  }
}
