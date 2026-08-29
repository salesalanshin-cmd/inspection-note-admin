import { CHUNK_OVERLAP, CHUNK_TOKEN_MAX } from './constants.js';
import { detectSectionLabel, firstHeadingInText } from './pageAnalysis.js';
import { estimateTokens, takeTokenTail } from './tokens.js';

/**
 * 페이지 배열 → 조각
 *
 * ★ page_from === page_to
 * ★ 페이지마다 최소 1조각 — 짧아도 다음 페이지와 합치지 않음
 * ★ section_label = 해당 페이지에서 가장 먼저 나온 제목만 (없으면 null, 이전 페이지 폴백 없음)
 */
export function chunkPages(pages, extractMethod = 'text') {
  const chunks = [];

  for (const page of pages) {
    if (page.skipped) continue;
    const pageText = String(page.text || '').trim();
    if (!pageText) continue;

    chunks.push(...chunkSinglePage(page.pageNo, pageText, extractMethod));
  }

  return chunks.map((c, i) => ({ ...c, chunk_index: i }));
}

function chunkSinglePage(pageNo, pageText, extractMethod) {
  if (estimateTokens(pageText) <= CHUNK_TOKEN_MAX) {
    return [makeChunk(pageNo, pageText, firstHeadingInText(pageText), extractMethod)];
  }
  return splitLongPage(pageNo, pageText, extractMethod);
}

function splitLongPage(pageNo, pageText, extractMethod) {
  const paragraphs = pageText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const result = [];
  let activeHeading = null;
  let buffer = '';
  let sectionAtChunkStart = null;

  const flush = () => {
    const content = buffer.trim();
    if (!content) return;
    result.push(
      makeChunk(pageNo, content, resolveSectionLabel(sectionAtChunkStart, content), extractMethod)
    );
    buffer = takeTokenTail(content, CHUNK_OVERLAP);
    sectionAtChunkStart = activeHeading;
  };

  for (const para of paragraphs) {
    const paraHeading = detectSectionLabel(para.split('\n')[0]);

    if (!buffer.trim()) {
      sectionAtChunkStart = activeHeading;
    }

    let candidate = buffer.trim() ? `${buffer}\n\n${para}` : para;

    if (estimateTokens(candidate) > CHUNK_TOKEN_MAX) {
      if (buffer.trim()) {
        flush();
        candidate = buffer.trim() ? `${buffer}\n\n${para}` : para;
      }
      if (estimateTokens(candidate) > CHUNK_TOKEN_MAX) {
        for (const part of splitBySentences(para)) {
          if (!buffer.trim()) sectionAtChunkStart = activeHeading;
          if (estimateTokens(buffer.trim() ? `${buffer}\n\n${part}` : part) > CHUNK_TOKEN_MAX && buffer.trim()) {
            flush();
          }
          buffer = buffer.trim() ? `${buffer}\n\n${part}` : part;
          if (estimateTokens(buffer) > CHUNK_TOKEN_MAX) {
            result.push(
              makeChunk(pageNo, buffer.trim(), resolveSectionLabel(sectionAtChunkStart, buffer), extractMethod)
            );
            buffer = '';
            sectionAtChunkStart = activeHeading;
          }
        }
      } else {
        buffer = candidate;
      }
    } else {
      buffer = candidate;
    }

    if (paraHeading) activeHeading = paraHeading;
  }

  if (buffer.trim()) {
    const prev = result[result.length - 1];
    const isDupTail =
      prev &&
      estimateTokens(buffer) <= CHUNK_OVERLAP &&
      prev.content.endsWith(buffer.trim().slice(-Math.min(buffer.length, 200)));
    if (!isDupTail) {
      result.push(makeChunk(pageNo, buffer.trim(), resolveSectionLabel(sectionAtChunkStart, buffer), extractMethod));
    }
  }

  return result.length ? result : [makeChunk(pageNo, pageText, firstHeadingInText(pageText), extractMethod)];
}

function resolveSectionLabel(sectionAtChunkStart, content) {
  return sectionAtChunkStart ?? firstHeadingInText(content) ?? null;
}

function splitBySentences(text) {
  const parts = text.split(/(?<=[.!?。])\s+|\n+/).filter(Boolean);
  return parts.length ? parts : [text];
}

function makeChunk(pageNo, content, sectionLabel, extractMethod) {
  const trimmed = String(content || '').trim();
  return {
    chunk_index: 0,
    content: trimmed,
    content_tokens: estimateTokens(trimmed),
    page_from: pageNo,
    page_to: pageNo,
    section_label: sectionLabel ?? null,
    extract_method: extractMethod,
  };
}
