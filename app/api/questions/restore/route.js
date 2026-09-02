import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { restoreQuestionThreads } from '../../../../lib/questionThreadsAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const threadIds = Array.isArray(body.threadIds) ? body.threadIds : [];
    const result = await restoreQuestionThreads(companyId, threadIds);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '복원 실패' }, { status: 500 });
  }
}
