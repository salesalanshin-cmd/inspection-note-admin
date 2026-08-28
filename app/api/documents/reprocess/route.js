import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { reprocessDocument } from '../../../../lib/documents/process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const documentId = body.documentId?.toString()?.trim();
    if (!documentId) {
      return NextResponse.json({ error: 'documentId가 필요합니다.' }, { status: 400 });
    }

    const result = await reprocessDocument(documentId, companyId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err?.message || '재처리 실패' }, { status: 500 });
  }
}
