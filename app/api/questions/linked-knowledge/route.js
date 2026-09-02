import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { fetchKnowledgeByThreadIds } from '../../../../lib/questionThreadsAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('threadIds') || '';
    const threadIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const items = await fetchKnowledgeByThreadIds(companyId, threadIds);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '조회 실패' }, { status: 500 });
  }
}
