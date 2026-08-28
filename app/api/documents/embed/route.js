import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { authorizeCron } from '../../../../lib/cronAuth';
import { processEmbedStep } from '../../../../lib/documents/process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyId = await getCompanyId();
    const body = await request.json().catch(() => ({}));
    const documentId = body.documentId?.toString()?.trim();

    if (!documentId) {
      return NextResponse.json({ error: 'documentId가 필요합니다.' }, { status: 400 });
    }

    const result = await processEmbedStep(documentId, companyId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[documents/embed]', err);
    return NextResponse.json({ error: err?.message || 'embed failed' }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
