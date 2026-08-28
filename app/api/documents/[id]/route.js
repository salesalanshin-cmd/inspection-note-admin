import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { updateDocumentStatus } from '../../../../lib/documents/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const companyId = await getCompanyId();
    const documentId = params.id;
    const body = await request.json();

    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active(boolean)가 필요합니다.' }, { status: 400 });
    }

    const doc = await updateDocumentStatus(documentId, companyId, {
      is_active: body.is_active,
    });
    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '수정 실패' }, { status: 500 });
  }
}
