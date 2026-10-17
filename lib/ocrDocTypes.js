/**
 * ocr_results.doc_type 규약 (CHECK 제약 없음 — 앱 상수)
 * inspection | 5s | defect | worklog | other
 */
export const OCR_DOC_TYPES = ['inspection', '5s', 'defect', 'worklog', 'other'];

export const OCR_DOC_TYPE_LABELS = {
  inspection: '자주검사',
  '5s': '3정5S',
  defect: '불량',
  worklog: '작업일보',
  other: '기타',
};

export function isValidOcrDocType(value) {
  return OCR_DOC_TYPES.includes(String(value || '').trim());
}

export function ocrDocTypeLabel(docType) {
  const key = String(docType || '').trim();
  if (!key) return '문서';
  return OCR_DOC_TYPE_LABELS[key] || key;
}

export function getOcrClassifyModel() {
  return (
    process.env.OCR_CLASSIFY_MODEL?.trim() || 'claude-haiku-4-5-20251001'
  );
}
