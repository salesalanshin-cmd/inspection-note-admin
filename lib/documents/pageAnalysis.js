/** 소제목 패턴: "4.1 게이트 결육 판정", "제3장 안전" 등 */
const SECTION_RE =
  /^(?:제\s*\d+\s*장|(?:\d+(?:\.\d+)*)\s+[^\s].{2,80})$/u;

export function detectSectionLabel(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (SECTION_RE.test(trimmed)) return trimmed;
  return null;
}

export function isTableSuspected(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const lines = t.split(/\n/).filter((l) => l.trim());
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
