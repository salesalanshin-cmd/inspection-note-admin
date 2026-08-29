import mammoth from 'mammoth';
import { firstHeadingInText, isEmptyPageText, isTableSuspected } from './pageAnalysis.js';

/**
 * @typedef {{ pageNo: number, text: string, sectionLabel: string|null, skipped: boolean, issue: string|null }} ExtractedPage
 */

function annotatePage(pageNo, rawText) {
  const text = String(rawText || '').trim();
  const sectionLabel = firstHeadingInText(text);

  let issue = null;
  let skipped = false;
  if (isEmptyPageText(text)) {
    issue = 'empty_text';
    skipped = true;
  } else if (isTableSuspected(text)) {
    issue = 'table_suspected';
  }

  return { pageNo, text, sectionLabel, skipped, issue };
}

/** Node.js Buffer는 Uint8Array 서브클래스 — pdfjs는 순수 Uint8Array만 허용 */
function toPdfData(buffer) {
  if (buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)) {
    return buffer;
  }
  return new Uint8Array(buffer);
}

/**
 * unpdf — dynamic import로 Node 런타임에서 패키지를 직접 로드한다.
 * (정적 import 시 Next.js webpack이 unpdf/pdfjs를 번들링해 DOMMatrix polyfill 순서가 깨짐)
 */
async function loadUnpdf() {
  return import('unpdf');
}

/**
 * PDF — unpdf 서버리스 빌드 (mergePages: false → 페이지별 배열, pageNo = index + 1)
 *
 * @param {Buffer} buffer
 * @param {{ startPage?: number, maxPages?: number }} opts
 */
export async function extractPdfPages(buffer, opts = {}) {
  const startPage = opts.startPage ?? 1;
  const maxPages = opts.maxPages ?? Infinity;

  const { extractText, getDocumentProxy } = await loadUnpdf();
  const data = toPdfData(buffer);
  const pdf = await getDocumentProxy(data);
  const { totalPages, text: pageTexts } = await extractText(pdf, { mergePages: false });

  if (!Array.isArray(pageTexts)) {
    throw new Error('PDF 페이지별 텍스트 추출에 실패했습니다.');
  }

  if (startPage > totalPages) {
    return { pages: [], totalPages };
  }

  const endPage = Math.min(totalPages, startPage + maxPages - 1);
  const pages = [];

  for (let pageNo = startPage; pageNo <= endPage; pageNo += 1) {
    const pageText = pageTexts[pageNo - 1] ?? '';
    pages.push(annotatePage(pageNo, pageText));
  }

  return { pages, totalPages };
}

export async function extractDocxPages(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || '';
  return { pages: [annotatePage(1, text)], totalPages: 1 };
}

export function extractTxtPages(buffer) {
  const text = buffer.toString('utf8');
  const chunkSize = 3000;
  const pages = [];
  if (text.length <= chunkSize) {
    pages.push(annotatePage(1, text));
  } else {
    let pageNo = 1;
    for (let i = 0; i < text.length; i += chunkSize) {
      pages.push(annotatePage(pageNo, text.slice(i, i + chunkSize)));
      pageNo += 1;
    }
  }
  return { pages, totalPages: pages.length };
}

export async function extractDocumentPages(buffer, fileType, opts = {}) {
  if (fileType === 'pdf') return extractPdfPages(buffer, opts);
  if (fileType === 'docx') return extractDocxPages(buffer);
  if (fileType === 'txt') return extractTxtPages(buffer);
  throw new Error(`지원하지 않는 형식: ${fileType}`);
}
