import { ALLOWED_EXTENSIONS } from './constants.js';

/**
 * 원본 파일명에서 확장자 추출 (소문자, 허용 형식만)
 */
export function getFileExtension(fileName) {
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : null;
}

/**
 * Storage 경로용 파일명 정규화.
 * - 영문/숫자/한글/하이픈/언더스코어/점만 허용
 * - 공백 → 언더스코어
 * - 그 외 문자 제거
 * - 연속 언더스코어 축약
 * - 확장자 보존
 * - 결과가 비면 'document_{timestamp}' + 확장자
 *
 * ★ 실제 Storage 저장에는 document_id.ext 방식을 사용한다.
 *   Supabase Storage는 ★, 괄호 등 특수문자를 거부하며,
 *   한글 파일명도 환경/버전에 따라 Invalid key가 발생할 수 있다.
 *   (https://github.com/supabase/storage/issues/133)
 */
export function sanitizeFileName(fileName) {
  const raw = String(fileName || '').trim();
  const ext = getFileExtension(raw);
  const baseName = ext
    ? raw.slice(0, raw.length - ext.length - 1)
    : raw.replace(/\.[^.]+$/, '');

  let sanitized = baseName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9\uAC00-\uD7A3\u3131-\u318E\u1100-\u11FF._-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!sanitized) {
    sanitized = `document_${Date.now()}`;
  }

  return ext ? `${sanitized}.${ext}` : sanitized;
}

/**
 * Storage 객체 키의 파일명 부분 — document_id + 확장자 (ASCII only, 가장 안전)
 */
export function storageObjectFileName(documentId, originalFileName) {
  const ext = getFileExtension(originalFileName) || 'bin';
  return `${documentId}.${ext}`;
}

/**
 * Storage 전체 경로: {company_id}/{document_id}/v{version}/{document_id}.{ext}
 * originalFileName은 확장자 추출에만 사용한다.
 */
export function buildStorageObjectPath(companyId, documentId, version, originalFileName) {
  const storageName = storageObjectFileName(documentId, originalFileName);
  return `${companyId}/${documentId}/v${version}/${storageName}`;
}

/**
 * Storage 업로드 실패 시 사용자용 메시지
 */
export function toUploadUserMessage(rawError) {
  const msg = String(rawError || '').toLowerCase();
  if (msg.includes('row-level security') || msg.includes('rls')) {
    return '파일 저장 권한이 없습니다. Storage 버킷(company-documents) 정책을 확인해 주세요.';
  }
  if (msg.includes('invalid key') || msg.includes('invalid_key')) {
    return '파일 저장에 실패했습니다. 파일명에 사용할 수 없는 문자가 포함되어 있을 수 있습니다. 다시 시도해 주세요.';
  }
  if (msg.includes('payload too large') || msg.includes('entity too large')) {
    return '파일 크기가 허용 한도를 초과했습니다.';
  }
  if (msg.includes('unauthorized') || msg.includes('403')) {
    return '파일 저장 권한이 없습니다. 관리자에게 문의해 주세요.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return '네트워크 오류로 파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '파일 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}
