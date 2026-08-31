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
    const patch = {};

    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
    if (body.title != null) {
      const title = body.title.toString().trim();
      if (!title) {
        return NextResponse.json({ error: '제목을 입력하세요.' }, { status: 400 });
      }
      patch.title = title;
    }
    if (body.folderId !== undefined) {
      patch.folder_id = body.folderId?.toString()?.trim() || null;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        { error: 'is_active, title, folderId 중 하나 이상 필요합니다.' },
        { status: 400 }
      );
    }

    const doc = await updateDocumentStatus(documentId, companyId, patch);
    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '수정 실패' }, { status: 500 });
  }
}
