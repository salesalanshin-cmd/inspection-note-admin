import { buildStorageObjectPath } from './fileName.js';

export const DOCUMENT_BUCKET = 'company-documents';

export const DOCUMENT_STATUSES = [
  'pending',
  'extracting',
  'chunking',
  'embedding',
  'ready',
  'failed',
];

export const ALLOWED_FILE_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'xlsx', 'xls'];

/** 업로드 input accept 문자열 */
export const ALLOWED_ACCEPT =
  '.pdf,.docx,.txt,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

export const CHUNK_TOKEN_MIN = 800;
export const CHUNK_TOKEN_MAX = 1200;
export const CHUNK_OVERLAP = 100;

export const EMPTY_TEXT_CHAR_THRESHOLD = 15;
export const EXTRACT_FAIL_RATE_THRESHOLD = 0.3;

/** extract 단계에서 한 cron 호출당 처리할 최대 페이지 */
export const EXTRACT_PAGE_BATCH = 30;

/** embed 단계에서 한 cron 호출당 처리할 최대 조각 수 */
export const EMBED_BATCH_SIZE = 32;

export const VOYAGE_MODEL = 'voyage-4';
export const EMBEDDING_DIM = 1024;
export const EMBED_MAX_RETRIES = 3;

export function storageObjectPath(companyId, documentId, version, originalFileName) {
  return buildStorageObjectPath(companyId, documentId, version, originalFileName);
}

export function workExtractPath(companyId, documentId, version) {
  return `${companyId}/${documentId}/v${version}/_work/extracted.json`;
}

export function detectFileType(fileName) {
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') return 'xls';
  return null;
}

export function isExcelFileType(fileType) {
  return fileType === 'xlsx' || fileType === 'xls';
}
