import {
  CHUNK_OVERLAP,
  CHUNK_TOKEN_MAX,
  CHUNK_TOKEN_MIN,
} from './constants.js';
import { detectSectionLabel } from './pageAnalysis.js';
import { estimateTokens, takeTokenHead, takeTokenTail } from './tokens.js';

/**
 * 페이지 배열 → 조각 (문단 경계 우선, overlap 포함)
 * @param {Array<{ pageNo: number, text: string, sectionLabel?: string|null, skipped?: boolean }>} pages
 * @param {string} extractMethod
 */
export function chunkPages(pages, extractMethod = 'text') {
  const blocks = [];
  let currentSection = null;

  for (const page of pages) {
    if (page.skipped) continue;
    const text = String(page.text || '').trim();
    if (!text) continue;

    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const heading = detectSectionLabel(para.split('\n')[0]);
      if (heading) currentSection = heading;
      else if (page.sectionLabel) currentSection = page.sectionLabel;

      blocks.push({
        pageNo: page.pageNo,
        text: para,
        sectionLabel: currentSection,
      });
    }
  }

  if (!blocks.length) return [];

  const chunks = [];
  let buffer = '';
  let bufferPages = new Set();
  let bufferSection = blocks[0].sectionLabel ?? null;
  let overlapTail = '';

  function flushBuffer() {
    const content = buffer.trim();
    if (!content) return;
    const pageNums = [...bufferPages].sort((a, b) => a - b);
    chunks.push({
      chunk_index: chunks.length,
      content,
      content_tokens: estimateTokens(content),
      page_from: pageNums[0] ?? null,
      page_to: pageNums[pageNums.length - 1] ?? null,
      section_label: bufferSection,
      extract_method: extractMethod,
    });
    overlapTail = takeTokenTail(content, CHUNK_OVERLAP);
    buffer = overlapTail;
    bufferPages = new Set(pageNums.slice(-1));
  }

  for (const block of blocks) {
    const candidate = buffer ? `${buffer}\n\n${block.text}` : block.text;
    const tokens = estimateTokens(candidate);

    if (tokens > CHUNK_TOKEN_MAX && buffer.trim()) {
      flushBuffer();
      buffer = overlapTail ? `${overlapTail}\n\n${block.text}` : block.text;
      bufferPages = new Set([block.pageNo]);
      bufferSection = block.sectionLabel ?? bufferSection;
    } else {
      buffer = candidate;
      bufferPages.add(block.pageNo);
      if (block.sectionLabel) bufferSection = block.sectionLabel;
    }

    if (estimateTokens(buffer) >= CHUNK_TOKEN_MIN) {
      flushBuffer();
    }
  }

  if (buffer.trim() && estimateTokens(buffer) > CHUNK_OVERLAP / 2) {
    const content = buffer.trim();
    const pageNums = [...bufferPages].sort((a, b) => a - b);
    chunks.push({
      chunk_index: chunks.length,
      content,
      content_tokens: estimateTokens(content),
      page_from: pageNums[0] ?? null,
      page_to: pageNums[pageNums.length - 1] ?? null,
      section_label: bufferSection,
      extract_method: extractMethod,
    });
  }

  return chunks.map((c, i) => ({ ...c, chunk_index: i }));
}
