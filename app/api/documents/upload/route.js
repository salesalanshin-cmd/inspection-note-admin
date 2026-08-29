import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { supabase } from '../../../../lib/supabase';
import { DOCUMENT_BUCKET, detectFileType } from '../../../../lib/documents/constants';
import {
  createDocumentRow,
  deactivateDocument,
  getDocument,
  updateDocumentStatus,
} from '../../../../lib/documents/db';
import { toUploadUserMessage } from '../../../../lib/documents/fileName';
import { uploadErrorResponse } from '../../../../lib/documents/uploadResponse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function markDocumentFailed(documentId, companyId, rawError, prefix = 'upload') {
  if (!documentId || !companyId) return;
  try {
    await updateDocumentStatus(documentId, companyId, {
      status: 'failed',
      error_message: `[${prefix}] ${rawError}`,
    });
  } catch (markErr) {
    console.error('[documents/upload] failed to mark document as failed', {
      documentId,
      error: markErr?.message,
    });
  }
}

export async function POST(request) {
  let doc = null;
  let companyId = null;
  let originalFileName = null;

  try {
    companyId = await getCompanyId();
    const form = await request.formData();
    const file = form.get('file');
    const isRevision = form.get('isRevision') === 'true';
    const supersedesId = form.get('supersedesId')?.toString()?.trim() || null;
    const title = form.get('title')?.toString()?.trim() || '';

    if (!file || typeof file === 'string') {
      return uploadErrorResponse('missing file', '파일이 필요합니다.', 400);
    }

    originalFileName = file.name;
    const fileType = detectFileType(originalFileName);
    if (!fileType) {
      return uploadErrorResponse(
        `unsupported file type: ${originalFileName}`,
        'PDF, DOCX, TXT 파일만 업로드할 수 있습니다.',
        400
      );
    }

    let version = 1;
    let supersedes = null;

    if (isRevision && supersedesId) {
      const prev = await getDocument(supersedesId, companyId);
      if (!prev) {
        return uploadErrorResponse(
          `supersedes not found: ${supersedesId}`,
          '개정 대상 문서를 찾을 수 없습니다.',
          404
        );
      }
      version = (prev.version || 1) + 1;
      supersedes = prev.id;
      await deactivateDocument(prev.id, companyId);
    }

    doc = await createDocumentRow({
      companyId,
      title: title || originalFileName,
      fileName: originalFileName,
      fileType,
      version,
      supersedes,
    });

    console.info('[documents/upload] document created', {
      documentId: doc.id,
      file_name: doc.file_name,
      file_path: doc.file_path,
      version: doc.version,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(doc.file_path, buffer, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      const rawMessage = uploadError.message || 'Storage upload failed';
      await markDocumentFailed(doc.id, companyId, rawMessage, 'storage');
      return uploadErrorResponse(rawMessage, toUploadUserMessage(rawMessage), 500, {
        public: { documentId: doc.id },
        context: { file_path: doc.file_path, file_name: doc.file_name },
      });
    }

    return NextResponse.json({ document: doc });
  } catch (err) {
    const rawMessage = err?.message || String(err) || '업로드 실패';
    console.error('[documents/upload] unexpected error', {
      file_name: originalFileName,
      documentId: doc?.id,
      error: rawMessage,
      stack: err?.stack,
    });

    if (doc?.id && companyId) {
      await markDocumentFailed(doc.id, companyId, rawMessage, 'upload');
    }

    return uploadErrorResponse(rawMessage, toUploadUserMessage(rawMessage), 500, {
      public: doc?.id ? { documentId: doc.id } : {},
      context: { file_name: originalFileName, file_path: doc?.file_path },
    });
  }
}
