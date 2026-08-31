import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../lib/company';
import { createKnowledge, listKnowledge } from '../../../lib/knowledgeAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get('sourceType') || undefined;
    const activeFilter = searchParams.get('active') || 'all';
    const search = searchParams.get('search') || undefined;
    const sort = searchParams.get('sort') === 'helpful' ? 'helpful' : 'latest';

    const items = await listKnowledge(companyId, {
      sourceType,
      activeFilter,
      search,
      sort,
    });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '목록 조회 실패' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const result = await createKnowledge(companyId, {
      questionText: body.questionText,
      answerText: body.answerText,
      sourceLabel: body.sourceLabel,
      sourceType: body.sourceType || 'doc',
      validUntil: body.validUntil || null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '등록 실패' }, { status: 500 });
  }
}
