import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { supabase } from '../../../../lib/supabase';
import {
  DOCUMENT_BUCKET,
  detectFileType,
  isExcelFileType,
} from '../../../../lib/documents/constants';
import {
  createDocumentRow,
  deactivateDocument,
  getDocument,
  updateDocumentStatus,
  uploadWorkJson,
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

function parseXlsxOptions(form) {
  const raw = form.get('xlsxOptions');
  if (!raw || typeof raw === 'object') return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      sheetNames: Array.isArray(parsed.sheetNames) ? parsed.sheetNames : undefined,
      sheetModes:
        parsed.sheetModes && typeof parsed.sheetModes === 'object'
          ? parsed.sheetModes
          : undefined,
      useRecommended: Boolean(parsed.useRecommended),
      parseMode:
        parsed.parseMode === 'flow' || parsed.parseMode === 'table'
          ? parsed.parseMode
          : undefined,
    };
  } catch {
    return null;
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
    const folderIdRaw = form.get('folderId')?.toString()?.trim() || null;
    let folderId = folderIdRaw;
    const xlsxOptions = parseXlsxOptions(form);

    if (!file || typeof file === 'string') {
      return uploadErrorResponse('missing file', '파일이 필요합니다.', 400);
    }

    originalFileName = file.name;
    const fileType = detectFileType(originalFileName);
    if (!fileType) {
      return uploadErrorResponse(
        `unsupported file type: ${originalFileName}`,
        'PDF, DOCX, TXT, XLSX, XLS 파일만 업로드할 수 있습니다.',
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
      if (!folderId && prev.folder_id) {
        folderId = prev.folder_id;
      }
    }

    doc = await createDocumentRow({
      companyId,
      title: title || originalFileName,
      fileName: originalFileName,
      fileType,
      version,
      supersedes,
      folderId,
    });

    console.info('[documents/upload] document created', {
      documentId: doc.id,
      file_name: doc.file_name,
      file_path: doc.file_path,
      version: doc.version,
      fileType,
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

    // 엑셀 시트 모드 선택은 work JSON에만 보관 (DB 컬럼 추가 없음, 추출 후 삭제)
    if (isExcelFileType(fileType)) {
      await uploadWorkJson(companyId, doc.id, doc.version, {
        pages: [],
        nextPage: 1,
        totalPages: null,
        extractMethod: 'xlsx',
        xlsxOptions: xlsxOptions || { useRecommended: true },
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
