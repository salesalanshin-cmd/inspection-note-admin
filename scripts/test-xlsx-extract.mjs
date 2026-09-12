/**
 * 엑셀 파싱 품질 확인용 스크립트 (UI/파이프라인 연결 전)
 *
 * 사용:
 *   node scripts/test-xlsx-extract.mjs path/to/file.xlsx
 *   node scripts/test-xlsx-extract.mjs path/to/file.xls --mode flow
 *   node scripts/test-xlsx-extract.mjs path/to/file.xlsx --sheet 32493
 *   node scripts/test-xlsx-extract.mjs path/to/file.xlsx --max-chunks 5
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { estimateTokens } from '../lib/documents/tokens.js';
import {
  extractXlsxDocument,
  previewXlsxWorkbook,
} from '../lib/documents/xlsxExtract.js';

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith('--'));
const sheetArgIdx = args.indexOf('--sheet');
const sheetFilter =
  sheetArgIdx >= 0 && args[sheetArgIdx + 1] ? [args[sheetArgIdx + 1]] : null;
const maxChunksIdx = args.indexOf('--max-chunks');
const maxChunks =
  maxChunksIdx >= 0 && args[maxChunksIdx + 1]
    ? Number(args[maxChunksIdx + 1])
    : 8;
const modeIdx = args.indexOf('--mode');
const parseMode =
  modeIdx >= 0 && args[modeIdx + 1]
    ? String(args[modeIdx + 1]).toLowerCase()
    : 'table';

if (!filePath) {
  console.error(`Usage:
  node scripts/test-xlsx-extract.mjs <file.xlsx|file.xls> [--mode table|flow] [--sheet NAME] [--max-chunks N]`);
  process.exit(1);
}

if (parseMode !== 'table' && parseMode !== 'flow') {
  console.error(`Invalid --mode "${parseMode}". Use table or flow.`);
  process.exit(1);
}

const abs = resolve(filePath);
const buffer = readFileSync(abs);
const extractOpts = {
  parseMode,
  ...(sheetFilter ? { sheetNames: sheetFilter } : {}),
};

console.log('\n=== FILE ===');
console.log(abs);
console.log(`size: ${(buffer.length / 1024).toFixed(1)} KB`);
console.log(`parseMode: ${parseMode}`);

if (parseMode === 'table') {
  console.log('\n=== PREVIEW (header / meta) ===');
  const preview = previewXlsxWorkbook(buffer, { parseMode });
  for (const s of preview.sheets) {
    if (sheetFilter && !sheetFilter.includes(s.name)) continue;
    console.log(`\n[시트] ${s.name}`);
    console.log(
      `  merges: ${s.mergeCount}, headerRow: ${s.headerExcelRow}, rows: ${s.totalRows}`
    );
    console.log(`  meta: ${s.metaText || '(없음)'}`);
    console.log(`  headers: ${s.headers.join(' | ')}`);
    console.log('  preview rows:');
    for (const r of s.previewRows.slice(0, 5)) {
      console.log(
        `    ${r.excelRow}: ${r.values.filter(Boolean).join(' | ').slice(0, 120)}`
      );
    }
  }
} else {
  console.log('\n=== PREVIEW ===');
  console.log('(flow 모드 — 헤더/메타 미리보기 생략)');
}

console.log('\n=== EXTRACT CHUNKS ===');
const result = await extractXlsxDocument(buffer, extractOpts);

console.log('\n--- sheet summary ---');
for (const s of result.sheets) {
  if (s.parseMode === 'flow') {
    console.log(
      `  ${s.sheetName}: mode=flow, lines=${s.flowLineCount}, excluded=${s.excludedLabelCount}, chunks=${s.chunkCount}, images=${s.imageCount}`
    );
  } else {
    console.log(
      `  ${s.sheetName}: mode=table, header=${s.headerExcelRow}, merges=${s.mergeCount}, blocks=${s.blockCount}, chunks=${s.chunkCount}, images=${s.imageCount}`
    );
  }
}

if (result.sheetIssues.length) {
  console.log('\n--- sheet issues (image_not_parsed) ---');
  for (const issue of result.sheetIssues) {
    console.log(
      `  page_no=${issue.page_no} sheet=${issue.sheetName} images=${issue.imageCount} issue=${issue.issue}`
    );
  }
}

console.log(
  `\n--- chunks: ${result.pages.length} total (showing up to ${maxChunks}) ---`
);

for (const page of result.pages.slice(0, maxChunks)) {
  const tokens = estimateTokens(page.text);
  console.log(`\n#${page.pageNo} ${page.sectionLabel} (~${tokens} tokens)`);
  console.log(`  page_from=${page.pageFrom} page_to=${page.pageTo}`);
  console.log(
    `  ${page.text.slice(0, 500).replace(/\n/g, '\n  ')}${page.text.length > 500 ? '…' : ''}`
  );
}

if (result.pages.length > maxChunks) {
  console.log(`\n… ${result.pages.length - maxChunks} more chunks omitted`);
}

console.log('\nDone.');
