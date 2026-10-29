import * as XLSX from 'xlsx';
import { extractStoragePath } from './storagePath.js';

function columnWidths(rows) {
  if (!rows.length) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((row) => String(row[key] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 48) };
  });
}

/**
 * @param {Array<Record<string, string>>} rows - { 작업자, 유형, ... } 형태
 * @param {string} filename - 예: 불량기록_20260703.xlsx
 */
export function exportToExcel(rows, filename) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = columnWidths(rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '기록');
  XLSX.writeFile(workbook, filename);
}

const KST_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * YYYY-MM-DD HH:mm:ss, Asia/Seoul.
 * 서버 시간대와 무관하다. 근태 메일·화면 엑셀과 자주검사·3정5S·불량·문서 엑셀이 함께 쓴다.
 */
export function formatExportDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = KST_PARTS.formatToParts(d);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  let hour = pick('hour');
  if (hour === '24') hour = '00';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${hour}:${pick('minute')}:${pick('second')}`;
}

/** 다운로드 파일명용 YYYYMMDD */
export function exportDateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** 다운로드 파일명용 날짜 범위: 20260601-20260630 */
export function formatDateRangeForFilename(start, end) {
  const compact = (iso) => iso.replace(/-/g, '');
  return `${compact(start)}-${compact(end)}`;
}

/** file_name 컬럼 또는 image_url 경로에서 파일명 추출 */
export function resolveFileName(record) {
  if (record.file_name) return record.file_name;
  if (!record.image_url) return '';

  const parsed = extractStoragePath(record.image_url);
  if (parsed?.path) {
    const base = parsed.path.split('/').pop();
    if (base) return base;
  }

  try {
    const url = new URL(record.image_url);
    const segment = url.pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : '';
  } catch {
    return '';
  }
}
