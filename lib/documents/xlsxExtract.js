import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { estimateTokens } from './tokens.js';

/**
 * 제조 현장 엑셀 → 지식베이스 조각 후보
 *
 * ★ 파싱만 담당. extract.js / 업로드 UI / process 연동은 다음 단계.
 *
 * rawMatrix  — 병합 채우기 전 (헤더 판정·빈 행·블록 분할·메타 라벨)
 * filledMatrix — 병합 forward fill (값 읽기·계층 상속)
 */

export const XLSX_CHUNK_TOKEN_MAX = 800;
export const IMAGE_NOT_PARSED_ISSUE = 'image_not_parsed';
export const IMAGE_REF_NOTE = '※ 측정 위치는 원본 기준서 도면 참조';

const EMPTY_BLOCK_GAP = 2;
const HEADER_SEARCH_MAX_ROWS = 10;
const HEADER_MIN_DISTINCT = 3;
const HEADER_MIN_ROWS_BELOW = 2;

const META_LABEL_DEFS = [
  { key: '품명', re: /^품\s*명$/ },
  { key: '품번', re: /^품\s*번$/ },
  { key: '차종', re: /^차\s*종$/ },
  { key: '고객사', re: /^고\s*객\s*사$/ },
  { key: '관리번호', re: /^관\s*리\s*번\s*호$/ },
  { key: '제정일자', re: /^제\s*정\s*일\s*자$/ },
];

const META_ROW_HINT_RE = /품\s*명|품\s*번|차\s*종|고\s*객\s*사|관\s*리\s*번\s*호/;
const HEADER_HINT_RE =
  /No\.?|항\s*목|규\s*격|검사\s*방법|검사\s*주기|관리\s*담당|특별\s*특성|개\s*정\s*사\s*유/i;
const BRACKET_META_KEYS = ['품명', '품번', '차종'];

function log(logs, message, detail) {
  const entry = detail !== undefined ? { message, detail } : { message };
  logs.push(entry);
  // eslint-disable-next-line no-console
  console.info('[xlsxExtract]', message, detail !== undefined ? detail : '');
}

function cellDisplay(cell) {
  if (cell == null) return '';
  if (cell.w != null && String(cell.w).trim() !== '') return String(cell.w).trim();
  if (cell.v == null || cell.v === '') return '';
  if (cell.v instanceof Date) {
    try {
      return cell.v.toISOString().slice(0, 10);
    } catch {
      return String(cell.v);
    }
  }
  return String(cell.v).trim();
}

function compactSpaces(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSpaces(s) {
  return String(s || '').replace(/\s+/g, '');
}

function rowNonEmptyCount(row) {
  return (row || []).filter((c) => String(c || '').trim() !== '').length;
}

function isEmptyRow(row) {
  return rowNonEmptyCount(row) === 0;
}

function distinctNonEmptyValues(row) {
  const set = new Set();
  for (const c of row || []) {
    const v = compactSpaces(c);
    if (v) set.add(v);
  }
  return set;
}

function isSubItemLabel(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(v)) return true;
  if (/^[（(]?\d{1,2}[）).．、]?$/.test(v)) return true;
  return false;
}

function categoryRoot(parentValue) {
  const p = String(parentValue || '').trim();
  if (!p) return '';
  if (p.includes(' > ')) return p.split(' > ')[0].trim();
  return p;
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

/**
 * SheetJS 시트 → raw / filled 두 벌 행렬
 */
export function sheetToMatrices(sheet) {
  if (!sheet?.['!ref']) {
    return {
      rawMatrix: [],
      filledMatrix: [],
      originRow: 0,
      originCol: 0,
      mergeCount: 0,
    };
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rawMatrix = [];

  for (let R = range.s.r; R <= range.e.r; R += 1) {
    const row = [];
    for (let C = range.s.c; C <= range.e.c; C += 1) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      row.push(cellDisplay(sheet[addr]));
    }
    rawMatrix.push(row);
  }

  const filledMatrix = cloneMatrix(rawMatrix);
  const merges = sheet['!merges'] || [];
  for (const m of merges) {
    const topLeft =
      filledMatrix[m.s.r - range.s.r]?.[m.s.c - range.s.c] ?? '';
    if (!topLeft) continue;
    for (let R = m.s.r; R <= m.e.r; R += 1) {
      const ri = R - range.s.r;
      if (!filledMatrix[ri]) continue;
      for (let C = m.s.c; C <= m.e.c; C += 1) {
        const ci = C - range.s.c;
        if (R === m.s.r && C === m.s.c) continue;
        filledMatrix[ri][ci] = topLeft;
      }
    }
  }

  return {
    rawMatrix,
    filledMatrix,
    originRow: range.s.r,
    originCol: range.s.c,
    mergeCount: merges.length,
  };
}

/** @deprecated sheetToMatrices 사용 */
export function sheetToFilledMatrix(sheet) {
  const r = sheetToMatrices(sheet);
  return {
    matrix: r.filledMatrix,
    rawMatrix: r.rawMatrix,
    filledMatrix: r.filledMatrix,
    originRow: r.originRow,
    originCol: r.originCol,
    mergeCount: r.mergeCount,
  };
}

/**
 * 헤더 행 판정 — 반드시 rawMatrix
 * - 상위 10행만
 * - 서로 다른 값 ≥ 3
 * - 아래 값 있는 행 ≥ 2
 * - 메타 행(품명/품번…) 제외, 헤더 힌트(No/항목/규격…) 우선
 */
export function detectHeaderRowIndex(rawMatrix, logs, originRow = 0) {
  if (!rawMatrix.length) {
    log(logs, 'header_detect_failed', { reason: 'empty_matrix' });
    return 0;
  }

  const limit = Math.min(rawMatrix.length, HEADER_SEARCH_MAX_ROWS);
  let best = null;

  for (let i = 0; i < limit; i += 1) {
    const distinct = distinctNonEmptyValues(rawMatrix[i]);
    if (distinct.size < HEADER_MIN_DISTINCT) continue;

    const joined = [...distinct].join(' | ');
    const isMetaRow = META_ROW_HINT_RE.test(joined) && !HEADER_HINT_RE.test(joined);
    if (isMetaRow) continue;

    let rowsBelow = 0;
    for (let j = i + 1; j < Math.min(rawMatrix.length, i + 6); j += 1) {
      if (rowNonEmptyCount(rawMatrix[j]) >= 1) rowsBelow += 1;
    }
    if (rowsBelow < HEADER_MIN_ROWS_BELOW) continue;

    const hintScore = HEADER_HINT_RE.test(joined) ? 100 : 0;
    const score = hintScore + distinct.size;
    if (!best || score > best.score) {
      best = {
        i,
        score,
        distinctCount: distinct.size,
        rowsBelow,
        sample: [...distinct].slice(0, 8),
      };
    }
  }

  if (best) {
    log(logs, 'header_detected', {
      matrixIndex: best.i,
      excelRow: originRow + best.i + 1,
      distinctCount: best.distinctCount,
      rowsBelow: best.rowsBelow,
      score: best.score,
      sample: best.sample,
    });
    return best.i;
  }

  log(logs, 'header_detect_fallback', {
    reason: 'no_row_matched',
    fallbackMatrixIndex: 0,
    fallbackExcelRow: originRow + 1,
  });
  return 0;
}

/**
 * 헤더 위 메타 — raw 기준 라벨(좌) → 값(우)
 */
export function extractSheetMeta(rawMatrix, headerIndex, logs) {
  const metaRows = rawMatrix.slice(0, Math.max(0, headerIndex));
  const pairs = [];

  for (const row of metaRows) {
    const cells = (row || []).map((c) => compactSpaces(c));
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (!cell) continue;

      const kv = cell.match(/^(.+?)\s*[:：]\s*(.+)$/);
      if (kv) {
        const keyNorm = matchMetaKey(kv[1]) || compactSpaces(kv[1]);
        pairs.push({ key: keyNorm, value: compactSpaces(kv[2]) });
        continue;
      }

      const metaKey = matchMetaKey(cell);
      if (!metaKey) continue;

      let value = '';
      for (let j = i + 1; j < cells.length; j += 1) {
        if (!cells[j]) continue;
        if (matchMetaKey(cells[j])) break;
        value = cells[j];
        break;
      }
      if (value) pairs.push({ key: metaKey, value });
    }
  }

  const seen = new Set();
  const unique = [];
  for (const p of pairs) {
    const k = `${p.key}=${p.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }

  const metaText = unique.map((p) => `${p.key}: ${p.value}`).join(' | ');
  const bracketParts = BRACKET_META_KEYS.map(
    (k) => unique.find((p) => p.key === k)?.value
  ).filter(Boolean);
  const metaBracket =
    bracketParts.join(' / ') ||
    unique.map((p) => p.value).filter(Boolean).slice(0, 3).join(' / ');

  log(logs, 'sheet_meta', {
    headerIndex,
    metaPairCount: unique.length,
    metaText: metaText || null,
    metaBracket: metaBracket || null,
  });

  return { metaText, metaBracket, pairs: unique };
}

function matchMetaKey(cell) {
  const compact = stripSpaces(cell);
  for (const def of META_LABEL_DEFS) {
    if (def.re.test(cell) || def.re.test(compact) || stripSpaces(def.key) === compact) {
      return def.key;
    }
  }
  return null;
}

function isSectionStartRow(rawValues) {
  const first = (rawValues || []).map((c) => compactSpaces(c)).find(Boolean);
  if (!first) return false;
  const n = stripSpaces(first);
  return /^(비고|개정이력|개정내역|개정사유)$/.test(n) || n === '개정';
}

/**
 * 블록 분할 — rawMatrix 빈 행(≥2) + 비고 등 구역 시작
 */
export function splitTableBlocks(dataRows, logs) {
  /** @type {{ start: number, end: number, rows: object[] }[]} */
  const blocks = [];
  let current = [];
  let gap = 0;

  const flush = () => {
    if (!current.length) return;
    blocks.push({
      start: current[0].excelRow,
      end: current[current.length - 1].excelRow,
      rows: current,
    });
    current = [];
  };

  for (const row of dataRows) {
    const raw = row.rawValues || row.values;
    if (isEmptyRow(raw)) {
      gap += 1;
      if (gap >= EMPTY_BLOCK_GAP) flush();
      continue;
    }
    if (current.length && isSectionStartRow(raw)) {
      flush();
    }
    gap = 0;
    current.push(row);
  }
  flush();

  log(logs, 'blocks_split', {
    blockCount: blocks.length,
    ranges: blocks.map((b) => `${b.start}-${b.end}`),
  });

  return blocks;
}

function isJunkHeaderLabel(header) {
  const compact = stripSpaces(header);
  if (!compact) return true;
  // 도면/측정 포인트 영역 라벨 (세로 병합으로 전 행에 반복됨)
  if (/측정.*POINT|POINT.*측정/.test(compact)) return true;
  if (/측정POINT|POINT측정/.test(compact)) return true;
  // "측정…방법"이 한 셀에 붙어 있는 도면 헤더만 제외 (검사방법은 유지)
  if (/^측정.*방법$/.test(compact) && compact.includes('POINT')) return true;
  return false;
}

function shouldInheritEmptyForHeader(headerName) {
  const h = stripSpaces(headerName || '');
  if (!h) return false;
  return /^(No\.?|번호|항\s*목|검사항목|구분)$/i.test(h) || /항목/.test(h);
}

/**
 * 빈 헤더 제외 + 연속 동일 헤더 압축 + 도면 열 제외
 */
export function buildColumnPlan(headerRow) {
  const headers = [];
  const indices = [];
  let prevNorm = null;

  for (let i = 0; i < (headerRow || []).length; i += 1) {
    const raw = compactSpaces(headerRow[i]);
    if (!raw) continue; // 빈 헤더 컬럼 제외 (열34 등 생성 안 함)
    if (isJunkHeaderLabel(raw)) continue;
    const norm = compactSpaces(raw.replace(/\s+/g, ' '));
    if (prevNorm !== null && norm === prevNorm) continue;
    prevNorm = norm;
    headers.push(norm);
    indices.push(i);
  }

  return { headers, indices };
}

/**
 * 컬럼별 상위 항목 상속 (filled 값 기준, column plan 인덱스)
 * 빈 칸 상속은 항목/No. 등 계층 컬럼에만 적용 (규격·방법 오상속 방지)
 */
export function applyHierarchyInheritance(rows, colIndices = null, headers = null) {
  if (!rows.length) return rows;
  const indices =
    colIndices ||
    Array.from(
      { length: Math.max(...rows.map((r) => (r.values || []).length), 0) },
      (_, i) => i
    );
  const parents = Array(indices.length).fill('');
  const out = rows.map((r) => ({
    excelRow: r.excelRow,
    rawValues: r.rawValues,
    values: [...(r.values || [])],
  }));

  for (const row of out) {
    for (let pi = 0; pi < indices.length; pi += 1) {
      const c = indices[pi];
      while (row.values.length <= c) row.values.push('');
      const raw = String(row.values[c] || '').trim();
      const headerName = headers?.[pi] || '';
      if (!raw) {
        if (shouldInheritEmptyForHeader(headerName)) {
          row.values[c] = parents[pi] || '';
        } else {
          row.values[c] = '';
        }
        continue;
      }
      if (isSubItemLabel(raw)) {
        const root = categoryRoot(parents[pi]);
        if (root && !isSubItemLabel(root)) {
          const composed = `${root} > ${raw}`;
          row.values[c] = composed;
          parents[pi] = composed;
        } else {
          row.values[c] = raw;
          parents[pi] = raw;
        }
      } else {
        parents[pi] = raw;
        row.values[c] = raw;
      }
    }
  }

  return out;
}

/**
 * 행 → "헤더: 값 | …" (연속 중복 값 제거, 빈 헤더 컬럼 제외)
 */
export function formatRowContent(headers, values, colIndices = null) {
  const parts = [];
  let prevValue = null;
  const n = headers.length;

  for (let i = 0; i < n; i += 1) {
    const header = compactSpaces(headers[i]);
    if (!header) continue;
    const vi = colIndices ? colIndices[i] : i;
    const value = compactSpaces(values[vi]);
    if (!value) continue;
    if (isJunkHeaderLabel(value) && isJunkHeaderLabel(header)) continue;
    if (prevValue !== null && value === prevValue) continue;
    prevValue = value;
    parts.push(`${header}: ${value}`);
  }
  return parts.join(' | ');
}

/** 표 헤더가 없는 구역(비고 등) — raw 셀 순서대로 문장화 */
export function formatLooseRow(rawValues, filledValues = []) {
  const cells = [];
  const n = Math.max(rawValues?.length || 0, filledValues?.length || 0);
  for (let i = 0; i < n; i += 1) {
    const v = compactSpaces(rawValues?.[i] || filledValues?.[i] || '');
    if (!v) continue;
    if (isJunkHeaderLabel(v)) continue;
    if (cells.length && cells[cells.length - 1] === v) continue;
    cells.push(v);
  }
  if (!cells.length) return '';
  const firstNorm = stripSpaces(cells[0]);
  if (/^비고$/.test(firstNorm) && cells.length >= 2) {
    return `비고: ${cells.slice(1).join(' ')}`;
  }
  if (/^비고$/.test(firstNorm) && cells.length === 1) {
    // 라벨만 있고 본문이 다른 열에 있는 경우 filled에서 재스캔
    const extra = [];
    for (let i = 0; i < n; i += 1) {
      const v = compactSpaces(filledValues?.[i] || rawValues?.[i] || '');
      if (!v || stripSpaces(v) === '비고' || isJunkHeaderLabel(v)) continue;
      if (!extra.includes(v)) extra.push(v);
    }
    if (extra.length) return `비고: ${extra.join(' ')}`;
  }
  return cells.join(' | ');
}

function buildMetaPrefix(metaBracket, metaText) {
  if (metaBracket) return `[${metaBracket}]`;
  if (metaText) return `[${metaText}]`;
  return '';
}

function looksLikeBlockHeaderRow(rawValues) {
  const cells = (rawValues || []).map((c) => compactSpaces(c)).filter(Boolean);
  if (cells.length < 2) return false;
  if (isSectionStartRow(rawValues)) return false;
  const short = cells.filter((c) => c.length <= 24).length;
  return short >= 2 && HEADER_HINT_RE.test(cells.join(' | '));
}

/**
 * 헤더 바로 아래 서브헤더(생산/품질 등)면 데이터 시작을 한 줄 미룸
 */
export function resolveDataStartIndex(rawMatrix, headerIndex) {
  const next = headerIndex + 1;
  if (next >= rawMatrix.length) return next;
  if (isEmptyRow(rawMatrix[next])) return next;

  const distinct = distinctNonEmptyValues(rawMatrix[next]);
  const first = [...distinct][0] || '';
  const looksSub =
    distinct.size <= 4 &&
    !/^\d+$/.test(stripSpaces(first)) &&
    !HEADER_HINT_RE.test([...distinct].join(' | ')) &&
    !isSectionStartRow(rawMatrix[next]);

  if (looksSub) return next + 1;
  return next;
}

export function chunkBlockRows({
  sheetName,
  headers,
  colIndices,
  block,
  metaPrefix,
  imageNote,
  loose = false,
}) {
  const lineEntries = block.rows
    .map((r) => ({
      excelRow: r.excelRow,
      text: loose
        ? formatLooseRow(r.rawValues || [], r.values || [])
        : formatRowContent(headers, r.values, colIndices),
    }))
    .filter((e) => e.text);

  if (!lineEntries.length) return [];

  const chunks = [];
  let bufferLines = [];
  let bufferStart = lineEntries[0].excelRow;
  let bufferEnd = lineEntries[0].excelRow;

  const flush = () => {
    if (!bufferLines.length) return;
    let text = bufferLines.join('\n');
    if (metaPrefix) text = `${metaPrefix} ${text}`;
    if (imageNote) text = `${text}\n${imageNote}`;
    chunks.push({
      pageFrom: null,
      pageTo: null,
      text,
      sectionLabel: `${sheetName} · ${bufferStart}-${bufferEnd}행`,
      skipped: false,
      issue: null,
      isTableChunk: true,
      sheetName,
      startRow: bufferStart,
      endRow: bufferEnd,
    });
    bufferLines = [];
  };

  for (const entry of lineEntries) {
    const candidateLines = [...bufferLines, entry.text];
    let candidate = candidateLines.join('\n');
    if (metaPrefix) candidate = `${metaPrefix} ${candidate}`;
    if (imageNote) candidate = `${candidate}\n${imageNote}`;

    if (bufferLines.length && estimateTokens(candidate) > XLSX_CHUNK_TOKEN_MAX) {
      flush();
      bufferLines = [entry.text];
      bufferStart = entry.excelRow;
      bufferEnd = entry.excelRow;
    } else {
      if (!bufferLines.length) bufferStart = entry.excelRow;
      bufferLines.push(entry.text);
      bufferEnd = entry.excelRow;
    }
  }
  flush();

  return chunks;
}

/**
 * 시트별 이미지 포함 여부 (중복 계수 방지: r:embed 고유 ID)
 * counts[i] = unique embed 수, hasImages[i] = boolean
 */
export async function countImagesPerSheet(buffer, sheetNames) {
  const counts = sheetNames.map(() => 0);
  const hasImages = sheetNames.map(() => false);
  try {
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);

    const sheetFiles = names
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = Number(a.match(/sheet(\d+)/i)?.[1] || 0);
        const nb = Number(b.match(/sheet(\d+)/i)?.[1] || 0);
        return na - nb;
      });

    const mediaCount = names.filter(
      (n) => /^xl\/media\//i.test(n) && !zip.files[n].dir
    ).length;

    for (let i = 0; i < sheetFiles.length && i < sheetNames.length; i += 1) {
      const sheetPath = sheetFiles[i];
      const relPath = sheetPath.replace(
        /sheet(\d+)\.xml$/i,
        '_rels/sheet$1.xml.rels'
      );
      const relFile = zip.file(relPath);
      if (!relFile) continue;
      const relXml = await relFile.async('string');
      const drawingTargets = [
        ...relXml.matchAll(/Target="([^"]*drawings\/[^"]+)"/gi),
      ].map((m) => m[1]);

      const embedIds = new Set();
      for (const target of drawingTargets) {
        const parts = [];
        const drawingPath = target.startsWith('/')
          ? target.slice(1)
          : `xl/worksheets/${target}`;
        for (const p of drawingPath.split('/')) {
          if (p === '..') parts.pop();
          else if (p && p !== '.') parts.push(p);
        }
        const normalized = parts.join('/');
        let drawing =
          zip.file(normalized) ||
          zip.file(normalized.replace(/^xl\/worksheets\//, 'xl/'));
        if (!drawing) {
          const base = target.split('/').pop();
          const found = names.find((n) => n.endsWith(`drawings/${base}`));
          if (found) drawing = zip.file(found);
        }
        if (!drawing) continue;
        const xml = await drawing.async('string');
        for (const m of xml.matchAll(/r:embed="([^"]+)"/gi)) {
          embedIds.add(`${normalized}::${m[1]}`);
        }
      }
      counts[i] = embedIds.size;
      hasImages[i] = embedIds.size > 0;
    }

    if (mediaCount > 0 && hasImages.every((h) => !h)) {
      hasImages[0] = true;
      counts[0] = mediaCount;
      return { counts, hasImages, workbookMediaCount: mediaCount };
    }

    return { counts, hasImages, workbookMediaCount: mediaCount };
  } catch {
    return { counts, hasImages, workbookMediaCount: 0 };
  }
}

function readWorkbook(buffer) {
  return XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellStyles: true,
  });
}

/** flow: 셀 양끝만 trim, 내부 줄바꿈 보존 */
function normalizeFlowCell(cell) {
  return String(cell ?? '').replace(/^\s+|\s+$/g, '');
}

/**
 * flow 모드: rawMatrix를 위→아래·좌→우로 읽어 텍스트 라인 수집
 * - 직전 값과 동일하면 스킵
 * - 시트 전체에서 3회+ & 길이 <30 → 양식 라벨로 제외 (로그)
 */
export function collectFlowLines(rawMatrix, originRow, logs, sheetName) {
  const freq = new Map();
  for (const row of rawMatrix) {
    for (const cell of row || []) {
      const t = normalizeFlowCell(cell);
      if (!t) continue;
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }

  const excluded = [];
  for (const [text, count] of freq.entries()) {
    if (count >= 3 && text.length < 30) {
      excluded.push({ text, count });
    }
  }
  excluded.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  log(logs, 'flow_excluded_labels', {
    sheetName,
    count: excluded.length,
    items: excluded,
  });

  const excludeSet = new Set(excluded.map((e) => e.text));
  /** @type {{ excelRow: number, text: string }[]} */
  const lines = [];
  let lastValue = null;

  for (let ri = 0; ri < rawMatrix.length; ri += 1) {
    const rowParts = [];
    for (const cell of rawMatrix[ri] || []) {
      const t = normalizeFlowCell(cell);
      if (!t) continue;
      if (excludeSet.has(t)) continue;
      if (lastValue !== null && t === lastValue) continue;
      lastValue = t;
      rowParts.push(t);
    }
    if (!rowParts.length) continue;
    lines.push({
      excelRow: originRow + ri + 1,
      text: rowParts.join(' '),
    });
  }

  log(logs, 'flow_collect', {
    sheetName,
    lineCount: lines.length,
    excludedLabelCount: excluded.length,
  });

  return { lines, excluded };
}

function splitOversizedFlowLine(text, maxTokens) {
  if (estimateTokens(text) <= maxTokens) return [text];
  const parts = text.split(/(?<=[.!?。；;\n])\s+/);
  if (parts.length <= 1) return [text];
  const out = [];
  let buf = '';
  for (const part of parts) {
    const next = buf ? `${buf} ${part}` : part;
    if (buf && estimateTokens(next) > maxTokens) {
      out.push(buf);
      buf = part;
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [text];
}

/**
 * flow 조각: 800토큰, 행(문장) 중간에서 자르지 않음
 */
export function chunkFlowLines(sheetName, lines, imageNote = '') {
  if (!lines.length) return [];

  const chunks = [];
  let buffer = [];
  let bufferStart = lines[0].excelRow;
  let bufferEnd = lines[0].excelRow;

  const flush = () => {
    if (!buffer.length) return;
    let text = buffer.join('\n');
    if (imageNote) text = `${text}\n${imageNote}`;
    chunks.push({
      pageFrom: null,
      pageTo: null,
      text,
      sectionLabel: `${sheetName} · ${bufferStart}-${bufferEnd}행`,
      skipped: false,
      issue: null,
      isTableChunk: false,
      parseMode: 'flow',
      sheetName,
      startRow: bufferStart,
      endRow: bufferEnd,
    });
    buffer = [];
  };

  for (const line of lines) {
    const pieces = splitOversizedFlowLine(line.text, XLSX_CHUNK_TOKEN_MAX);
    for (const piece of pieces) {
      const candidate = [...buffer, piece].join('\n');
      const withNote = imageNote ? `${candidate}\n${imageNote}` : candidate;
      if (buffer.length && estimateTokens(withNote) > XLSX_CHUNK_TOKEN_MAX) {
        flush();
        buffer = [piece];
        bufferStart = line.excelRow;
        bufferEnd = line.excelRow;
      } else {
        if (!buffer.length) bufferStart = line.excelRow;
        buffer.push(piece);
        bufferEnd = line.excelRow;
      }
    }
  }
  flush();
  return chunks;
}

/**
 * 시트 단위 모드 추천 (강제 아님 — UI에서 사람이 최종 선택)
 * table: 기준서형 (품명/품번 메타, No/항목/규격 헤더)
 * flow: 프로세스/규정형 (문서 표지·절차 서술)
 */
export function recommendParseMode(sheetInfo) {
  const headers = (sheetInfo?.headers || []).join(' ');
  const meta = String(sheetInfo?.metaText || '');
  const sample = [
    ...(sheetInfo?.headers || []),
    ...((sheetInfo?.previewRows || []).flatMap((r) => r.values || [])),
  ].join(' ');

  const tableScore =
    (/항\s*목|규\s*격|검사\s*방법|검사\s*주기|관리\s*담당|No\.?/i.test(headers) ? 3 : 0) +
    (/품명|품번|차종|고객사/.test(meta) ? 3 : 0) +
    (Number(sheetInfo?.headerExcelRow) >= 3 ? 1 : 0);

  const flowScore =
    (/적용\s*범위|프로세스|TURTLE|개정이력|규정|지침|책임\s*과\s*권한/.test(sample + meta)
      ? 3
      : 0) +
    (Number(sheetInfo?.headerExcelRow) <= 2 && Number(sheetInfo?.mergeCount) > 80 ? 2 : 0) +
    (!meta && /문서\s*번호|Rev\.?\s*No|제정일/.test(sample) ? 2 : 0);

  if (flowScore > tableScore) return 'flow';
  if (tableScore > 0) return 'table';
  return Number(sheetInfo?.mergeCount) > 100 ? 'flow' : 'table';
}

/**
 * @param {Buffer} buffer
 * @param {{
 *   sheetNames?: string[]|null,
 *   parseMode?: 'table'|'flow',
 *   sheetModes?: Record<string,'table'|'flow'>,
 *   useRecommended?: boolean
 * }} [opts]
 */
export async function extractXlsxDocument(buffer, opts = {}) {
  const logs = [];
  const defaultMode = opts.parseMode === 'flow' ? 'flow' : 'table';
  const sheetModes = opts.sheetModes && typeof opts.sheetModes === 'object'
    ? opts.sheetModes
    : {};
  const workbook = readWorkbook(buffer);
  const allNames = workbook.SheetNames || [];
  const targetNames =
    Array.isArray(opts.sheetNames) && opts.sheetNames.length
      ? allNames.filter((n) => opts.sheetNames.includes(n))
      : allNames;

  if (!targetNames.length) {
    throw new Error('선택된 시트가 없습니다.');
  }

  // useRecommended: 시트별 추천 모드를 sheetModes에 채움 (명시 지정 우선)
  if (opts.useRecommended) {
    const preview = previewXlsxWorkbook(buffer);
    for (const s of preview.sheets) {
      if (sheetModes[s.name]) continue;
      sheetModes[s.name] = s.recommendedMode || recommendParseMode(s);
    }
  }

  log(logs, 'workbook_open', {
    sheetCount: allNames.length,
    targetSheets: targetNames,
    defaultMode,
    sheetModes,
  });

  const {
    counts: imageCounts,
    hasImages,
    workbookMediaCount,
  } = await countImagesPerSheet(buffer, targetNames);
  log(logs, 'image_scan', { imageCounts, hasImages, workbookMediaCount });

  const pages = [];
  const sheetIssues = [];
  const sheetsSummary = [];
  const modesUsed = new Set();
  let syntheticPageNo = 0;

  for (let sheetIdx = 0; sheetIdx < targetNames.length; sheetIdx += 1) {
    const sheetName = targetNames[sheetIdx];
    const sheetMode =
      sheetModes[sheetName] === 'flow' || sheetModes[sheetName] === 'table'
        ? sheetModes[sheetName]
        : defaultMode;
    modesUsed.add(sheetMode);

    const sheet = workbook.Sheets[sheetName];
    const { rawMatrix, filledMatrix, mergeCount, originRow } =
      sheetToMatrices(sheet);

    log(logs, 'sheet_matrix', {
      sheetName,
      rows: rawMatrix.length,
      cols: rawMatrix[0]?.length || 0,
      mergeCount,
      parseMode: sheetMode,
    });

    const sheetHasImages = Boolean(hasImages[sheetIdx]);
    const imageCount = imageCounts[sheetIdx] || 0;
    const imageNote = sheetHasImages ? IMAGE_REF_NOTE : '';

    if (sheetHasImages) {
      sheetIssues.push({
        sheetIndex: sheetIdx,
        sheetName,
        issue: IMAGE_NOT_PARSED_ISSUE,
        imageCount,
        hasImages: true,
        page_no: sheetIdx + 1,
      });
    }

    // ── flow 모드: 헤더/메타/블록/계층 전부 건너뜀 ──
    if (sheetMode === 'flow') {
      const { lines, excluded } = collectFlowLines(
        rawMatrix,
        originRow,
        logs,
        sheetName
      );
      const chunks = chunkFlowLines(sheetName, lines, imageNote);
      let sheetChunkCount = 0;
      for (const chunk of chunks) {
        syntheticPageNo += 1;
        pages.push({
          ...chunk,
          pageNo: syntheticPageNo,
          parseMode: 'flow',
          isExcelChunk: true,
        });
        sheetChunkCount += 1;
      }
      sheetsSummary.push({
        sheetName,
        parseMode: 'flow',
        headerExcelRow: null,
        mergeCount,
        blockCount: 0,
        chunkCount: sheetChunkCount,
        imageCount,
        hasImages: sheetHasImages,
        metaText: null,
        metaBracket: null,
        excludedLabelCount: excluded.length,
        flowLineCount: lines.length,
      });
      continue;
    }

    // ── table 모드 (기존 동작) ──
    const headerIndex = detectHeaderRowIndex(rawMatrix, logs, originRow);
    const { metaText, metaBracket } = extractSheetMeta(
      rawMatrix,
      headerIndex,
      logs
    );

    const headerPlan = buildColumnPlan(filledMatrix[headerIndex] || []);
    let dataStart = resolveDataStartIndex(rawMatrix, headerIndex);

    const dataRows = [];
    for (let i = dataStart; i < rawMatrix.length; i += 1) {
      dataRows.push({
        excelRow: originRow + i + 1,
        rawValues: rawMatrix[i] || [],
        values: filledMatrix[i] || [],
      });
    }

    const blocks = splitTableBlocks(dataRows, logs);
    const metaPrefix = buildMetaPrefix(metaBracket, metaText);
    let sheetChunkCount = 0;

    for (let bi = 0; bi < blocks.length; bi += 1) {
      const block = blocks[bi];
      let plan = headerPlan;
      let blockRows = block.rows;
      let loose = false;

      const firstRaw = blockRows[0]?.rawValues || [];
      if (bi > 0 && blockRows.length >= 1 && isSectionStartRow(firstRaw)) {
        loose = true;
        log(logs, 'block_loose', {
          sheetName,
          block: `${block.start}-${block.end}`,
          reason: 'section_start',
        });
      } else if (
        bi > 0 &&
        blockRows.length >= 1 &&
        looksLikeBlockHeaderRow(firstRaw)
      ) {
        plan = buildColumnPlan(blockRows[0].values);
        blockRows = blockRows.slice(1);
        log(logs, 'block_header', {
          sheetName,
          block: `${block.start}-${block.end}`,
          headers: plan.headers.slice(0, 8),
        });
      }

      if (!blockRows.length) continue;

      const inherited = loose
        ? blockRows
        : applyHierarchyInheritance(blockRows, plan.indices, plan.headers);
      const blockWithInherited = {
        start: inherited[0]?.excelRow ?? block.start,
        end: inherited[inherited.length - 1]?.excelRow ?? block.end,
        rows: inherited,
      };
      const chunks = chunkBlockRows({
        sheetName,
        headers: plan.headers,
        colIndices: plan.indices,
        block: blockWithInherited,
        metaPrefix,
        imageNote,
        loose,
      });
      for (const chunk of chunks) {
        syntheticPageNo += 1;
        pages.push({
          ...chunk,
          pageNo: syntheticPageNo,
          parseMode: 'table',
          isExcelChunk: true,
        });
        sheetChunkCount += 1;
      }
    }

    sheetsSummary.push({
      sheetName,
      parseMode: 'table',
      headerExcelRow: originRow + headerIndex + 1,
      mergeCount,
      blockCount: blocks.length,
      chunkCount: sheetChunkCount,
      imageCount,
      hasImages: sheetHasImages,
      metaText,
      metaBracket,
    });
  }

  const modeList = [...modesUsed];
  const extractMethod =
    modeList.length > 1 ? 'mixed' : modeList[0] || defaultMode;

  return {
    pages,
    totalPages: pages.length,
    sheetIssues,
    logs,
    sheets: sheetsSummary,
    parseMode: extractMethod,
    extractMethod,
  };
}

/** 동기 미리보기 + 시트별 추천 모드 */
export function previewXlsxWorkbook(buffer) {
  const workbook = readWorkbook(buffer);
  const logs = [];
  const sheets = workbook.SheetNames.map((name) => {
    const { rawMatrix, filledMatrix, mergeCount, originRow } = sheetToMatrices(
      workbook.Sheets[name]
    );
    const headerIndex = detectHeaderRowIndex(rawMatrix, logs, originRow);
    const { metaText, metaBracket, pairs } = extractSheetMeta(
      rawMatrix,
      headerIndex,
      logs
    );
    const plan = buildColumnPlan(filledMatrix[headerIndex] || []);
    const dataStart = resolveDataStartIndex(rawMatrix, headerIndex);
    const previewRows = [];
    for (
      let i = dataStart;
      i < rawMatrix.length && previewRows.length < 8;
      i += 1
    ) {
      if (isEmptyRow(rawMatrix[i])) continue;
      const vals = plan.indices.length
        ? plan.indices.map((ci) => compactSpaces(filledMatrix[i]?.[ci] || ''))
        : (rawMatrix[i] || [])
            .map((c) => compactSpaces(c))
            .filter(Boolean)
            .slice(0, 8);
      previewRows.push({
        excelRow: originRow + i + 1,
        values: vals,
      });
    }
    const info = {
      name,
      mergeCount,
      headerExcelRow: originRow + headerIndex + 1,
      headers: plan.headers,
      metaText,
      metaBracket,
      metaPairs: pairs,
      previewRows,
      totalRows: rawMatrix.length,
    };
    info.recommendedMode = recommendParseMode(info);
    return info;
  });

  return { sheetNames: workbook.SheetNames, sheets, logs };
}

/** @deprecated */
export async function extractXlsxPages(buffer, opts = {}) {
  return extractXlsxDocument(buffer, opts);
}

