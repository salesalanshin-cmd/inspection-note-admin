/**
 * 소제목 패턴 (문서별 하드코딩 없음)
 *
 * - "제3장  주조 공정 불량코드"  (★ \b 는 한글 뒤에서 동작하지 않음 — 사용 금지)
 * - "2.5 검사 환경" / "3.1 코드 일람"
 * - "A001 게이트 결육 (Gate Tear)" / "A01A 취급불량" / "GR001 미사상" / "MC001 치수불량"
 * - "Q1. 판정이 애매할 때는?"
 */

/** 표 요약 행(○ 포함)은 제목이 아님 */
function isTableSummaryLine(line) {
  return /[○◎]/.test(line);
}

const CHAPTER_LINE_RE = /^제\s*\d+\s*장/u;

/** 목차 줄 끝의 페이지 번호 제거: "제1장 검사 업무 개요 3" → "제1장 검사 업무 개요" */
function stripTocPageNumber(label) {
  return String(label || '')
    .replace(/\s+\d{1,3}$/u, '')
    .trim();
}

const SECTION_CHECKS = [
  (line) => CHAPTER_LINE_RE.test(line),
  (line) => /^Q\d+\.\s+\S/u.test(line),
  (line) => /^(?:\d+(?:\.\d+)*)\s+[^\s\d○◎].{1,80}$/u.test(line),
  (line) =>
    /^[A-Z][A-Z0-9]{2,4}\s+[^\s○◎]/u.test(line) &&
    !isTableSummaryLine(line) &&
    line.length <= 120,
];

/** 한 페이지에 "제N장"이 5회 이상이면 목차로 간주 */
export function isTableOfContentsPage(text) {
  let chapterCount = 0;
  for (const line of String(text || '').split('\n')) {
    if (CHAPTER_LINE_RE.test(line.trim())) {
      chapterCount += 1;
      if (chapterCount >= 5) return true;
    }
  }
  return false;
}

export function detectSectionLabel(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (!SECTION_CHECKS.some((check) => check(trimmed))) return null;
  return stripTocPageNumber(trimmed) || null;
}

/** 페이지 텍스트에서 가장 먼저 등장하는 제목 (목차 페이지·제목 없음 → null) */
export function firstHeadingInText(text) {
  const fullText = String(text || '');
  if (isTableOfContentsPage(fullText)) return null;
  for (const line of fullText.split('\n')) {
    const label = detectSectionLabel(line);
    if (label) return label;
  }
  return null;
}

export function isTableSuspected(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const lines = t.split('\n').filter((l) => l.trim());
  if (lines.length < 3) return false;
  let tabHeavy = 0;
  let spacedCols = 0;
  for (const line of lines) {
    if ((line.match(/\t/g) || []).length >= 2) tabHeavy += 1;
    if ((line.match(/\s{3,}/g) || []).length >= 2) spacedCols += 1;
  }
  const ratio = (tabHeavy + spacedCols) / lines.length;
  return ratio >= 0.4;
}

export function isEmptyPageText(text) {
  const cleaned = String(text || '')
    .replace(/\s+/g, '')
    .trim();
  return cleaned.length < 15;
}
