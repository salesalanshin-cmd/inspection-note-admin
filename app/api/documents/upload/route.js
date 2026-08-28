import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { supabase } from '../../../../lib/supabase';
import { detectFileType } from '../../../../lib/documents/constants';
import {
  createDocumentRow,
  deactivateDocument,
  getDocument,
} from '../../../../lib/documents/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const form = await request.formData();
    const file = form.get('file');
    const isRevision = form.get('isRevision') === 'true';
    const supersedesId = form.get('supersedesId')?.toString()?.trim() || null;
    const title = form.get('title')?.toString()?.trim() || '';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const fileName = file.name;
    const fileType = detectFileType(fileName);
    if (!fileType) {
      return NextResponse.json(
        { error: 'PDF, DOCX, TXT 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    let version = 1;
    let supersedes = null;

    if (isRevision && supersedesId) {
      const prev = await getDocument(supersedesId, companyId);
      if (!prev) {
        return NextResponse.json({ error: '개정 대상 문서를 찾을 수 없습니다.' }, { status: 404 });
      }
      version = (prev.version || 1) + 1;
      supersedes = prev.id;
      await deactivateDocument(prev.id, companyId);
    }

    const doc = await createDocumentRow({
      companyId,
      title: title || fileName,
      fileName,
      fileType,
      version,
      supersedes,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('company-documents')
      .upload(doc.file_path, buffer, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      await supabase.from('document').delete().eq('id', doc.id).eq('company_id', companyId);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({ document: doc });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '업로드 실패' }, { status: 500 });
  }
}
