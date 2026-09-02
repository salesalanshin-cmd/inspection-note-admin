import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { hideQuestionThreads } from '../../../../lib/questionThreadsAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const threadIds = Array.isArray(body.threadIds) ? body.threadIds : [];
    const deactivateKnowledge = Boolean(body.deactivateKnowledge);
    const result = await hideQuestionThreads(companyId, threadIds, { deactivateKnowledge });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '숨기기 실패' }, { status: 500 });
  }
}
