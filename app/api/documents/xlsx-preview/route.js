import { NextResponse } from 'next/server';
import { detectFileType, isExcelFileType } from '../../../../lib/documents/constants';
import { previewXlsxWorkbook } from '../../../../lib/documents/xlsxExtract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const fileType = detectFileType(file.name);
    if (!isExcelFileType(fileType)) {
      return NextResponse.json({ error: '엑셀 파일만 미리볼 수 있습니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = previewXlsxWorkbook(buffer);
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || '엑셀 미리보기 실패' },
      { status: 500 }
    );
  }
}
