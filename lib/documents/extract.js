import mammoth from 'mammoth';
import { detectSectionLabel, isEmptyPageText, isTableSuspected } from './pageAnalysis.js';

/**
 * @typedef {{ pageNo: number, text: string, sectionLabel: string|null, skipped: boolean, issue: string|null }} ExtractedPage
 */

function annotatePage(pageNo, rawText) {
  const text = String(rawText || '').trim();
  let sectionLabel = null;
  for (const line of text.split(/\n/)) {
    const label = detectSectionLabel(line);
    if (label) {
      sectionLabel = label;
      break;
    }
  }

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

/**
 * PDF — pdfjs-dist 페이지 단위 (배치 추출용)
 * @param {Buffer} buffer
 * @param {{ startPage?: number, maxPages?: number }} opts
 */
export async function extractPdfPages(buffer, opts = {}) {
  const startPage = opts.startPage ?? 1;
  const maxPages = opts.maxPages ?? Infinity;

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const endPage = Math.min(totalPages, startPage + maxPages - 1);
  const pages = [];

  for (let pageNo = startPage; pageNo <= endPage; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(annotatePage(pageNo, text));
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
