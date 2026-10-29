import * as XLSX from 'xlsx';
import { countDaysInRange, eachDateInRange, isDateRangeValid } from '../dateRange.js';
import { formatExportDateTime } from '../exportExcel.js';
import { judgmentLabel } from './judge.js';
import {
  formatSignalListLabel,
  signalRawMergedCounts,
} from './signalUtils.js';
import {
  formatJudgmentRationaleSummary,
  hasNeedsReviewFlag,
  shiftLabel,
} from './shift.js';

/** 기간 엑셀에 포함하는 최대 일수 (시작일·종료일 포함) */
export const ATTENDANCE_EXPORT_MAX_DAYS = 31;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function flagsLabel(flags) {
  if (!Array.isArray(flags) || !flags.length) return '';
  return flags.join(',');
}

/**
 * @param {Array} rows attendance_daily
 * @param {Map<string,string>} [displayMap]
 */
export function attendanceRowsForExcel(rows, displayMap = new Map()) {
  return (rows || []).map((r) => {
    const counts = signalRawMergedCounts(r.signal_kinds);
    return {
      근무일: r.work_date || '',
      작업자: displayMap.get(r.worker_name) || r.worker_name || '',
      조: shiftLabel(r.shift),
      판정: judgmentLabel(r.judgment),
      추정출근: formatExportDateTime(r.estimated_clock_in),
      추정퇴근: formatExportDateTime(r.estimated_clock_out),
      OT: r.is_ot ? 'Y' : 'N',
      신호최초: formatExportDateTime(r.first_signal_at),
      신호최종: formatExportDateTime(r.last_signal_at),
      '신호수(원본)': counts.raw,
      '신호수(병합)': counts.merged,
      신호목록: formatSignalListLabel(r.signal_kinds),
      중복병합: counts.hadMerge ? '중복 촬영 병합' : '',
      판정근거: formatJudgmentRationaleSummary(r.judgment_rationale),
      플래그: flagsLabel(r.flags),
      검수: r.reviewed ? 'Y' : 'N',
      신뢰도: r.confidence || '',
    };
  });
}

function emptyRecordRow() {
  return {
    근무일: '',
    작업자: '',
    조: '',
    판정: '',
    추정출근: '',
    추정퇴근: '',
    OT: '',
    신호최초: '',
    신호최종: '',
    '신호수(원본)': '',
    '신호수(병합)': '',
    신호목록: '',
    중복병합: '',
    판정근거: '',
    플래그: '',
    검수: '',
    신뢰도: '',
  };
}

function recordsWorksheet(rows, displayMap) {
  const sheetRows = attendanceRowsForExcel(rows, displayMap);
  return XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [emptyRecordRow()]);
}

/**
 * 기간 엑셀 범위. 일수는 시작일·종료일 포함.
 * @returns {{ ok: boolean, dayCount: number, message: string }}
 */
export function describeAttendanceExportRange({ start, end }) {
  if (!start || !end || !YMD.test(start) || !YMD.test(end)) {
    return { ok: false, dayCount: 0, message: '시작일과 종료일을 선택하세요.' };
  }
  if (!isDateRangeValid({ start, end })) {
    return {
      ok: false,
      dayCount: 0,
      message: '종료일은 시작일보다 빠를 수 없습니다.',
    };
  }
  const dayCount = countDaysInRange({ start, end });
  if (dayCount > ATTENDANCE_EXPORT_MAX_DAYS) {
    return {
      ok: false,
      dayCount,
      message: `한 번에 최대 ${ATTENDANCE_EXPORT_MAX_DAYS}일까지 받을 수 있습니다. 현재 ${dayCount}일입니다.`,
    };
  }
  return { ok: true, dayCount, message: '' };
}

/** 작업자·조 필터. 빈 값은 전체. */
export function filterAttendanceExportRows(rows, { workerName = '', shift = '' } = {}) {
  const name = String(workerName || '').trim();
  const wantShift = shift === 'day' || shift === 'night' ? shift : '';
  return (rows || []).filter((row) => {
    if (name && row?.worker_name !== name) return false;
    if (wantShift && row?.shift !== wantShift) return false;
    return true;
  });
}

/** 범위 안에 attendance_daily 행이 하나도 없는 근무일 */
export function missingAttendanceWorkDates(rows, { start, end }) {
  if (!YMD.test(String(start || '')) || !YMD.test(String(end || ''))) return [];
  if (!isDateRangeValid({ start, end })) return [];
  const present = new Set(
    (rows || []).map((row) => row?.work_date).filter(Boolean)
  );
  return eachDateInRange({ start, end }).filter((day) => !present.has(day));
}

/** 재계산은 하지 않고, 저장분이 없는 날만 안내 */
export function attendanceRecomputeNotice(missingDates) {
  const dates = missingDates || [];
  if (!dates.length) return '';
  const shown = dates.slice(0, 8).join(', ');
  const more = dates.length > 8 ? ` 외 ${dates.length - 8}일` : '';
  return `저장된 판정이 없는 근무일: ${shown}${more}. 이 날짜는 파일에 포함되지 않습니다. 필요하면 해당 날짜를 연 뒤 재계산하세요. 다운로드는 저장된 행만 사용하며 자동 재계산하지 않습니다.`;
}

export function buildAttendanceRangeSummaryAoa(rows, meta = {}) {
  const list = rows || [];
  const present = list.filter((row) => row.judgment === 'present').length;
  const unconfirmed = list.filter((row) => row.judgment === 'unconfirmed').length;
  const ot = list.filter((row) => row.is_ot).length;
  const missing = meta.missingDates || [];
  const byDate = new Map();
  for (const row of list) {
    const day = row.work_date || '';
    if (!day) continue;
    const bucket = byDate.get(day) || { rows: 0, present: 0, unconfirmed: 0, ot: 0 };
    bucket.rows += 1;
    if (row.judgment === 'present') bucket.present += 1;
    if (row.judgment === 'unconfirmed') bucket.unconfirmed += 1;
    if (row.is_ot) bucket.ot += 1;
    byDate.set(day, bucket);
  }

  const aoa = [
    ['항목', '값'],
    ['시작일', meta.start || ''],
    ['종료일', meta.end || ''],
    ['일수', meta.dayCount ?? ''],
    ['작업자', meta.workerLabel || '전체'],
    ['조', meta.shiftLabel || '전체'],
    ['행 수', list.length],
    ['출근', present],
    ['미확인', unconfirmed],
    ['OT', ot],
    ['재계산 필요 근무일', missing.length ? missing.join(', ') : '없음'],
    [],
    ['근무일', '행 수', '출근', '미확인', 'OT'],
  ];
  for (const day of [...byDate.keys()].sort()) {
    const bucket = byDate.get(day);
    aoa.push([day, bucket.rows, bucket.present, bucket.unconfirmed, bucket.ot]);
  }

  aoa.push([]);
  aoa.push(['작업자', '출근일수', 'OT일수', '미확인', '확인 필요']);
  const displayMap = meta.displayMap instanceof Map ? meta.displayMap : new Map();
  const byWorker = new Map();
  for (const row of list) {
    const name = row.worker_name || '';
    if (!name) continue;
    const bucket = byWorker.get(name) || {
      present: 0,
      ot: 0,
      unconfirmed: 0,
      review: 0,
    };
    if (row.judgment === 'present') bucket.present += 1;
    if (row.is_ot) bucket.ot += 1;
    if (row.judgment === 'unconfirmed') bucket.unconfirmed += 1;
    if (hasNeedsReviewFlag(row.flags)) bucket.review += 1;
    byWorker.set(name, bucket);
  }
  const workerRows = [...byWorker.entries()]
    .map(([name, bucket]) => ({
      label: displayMap.get(name) || name,
      ...bucket,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  for (const worker of workerRows) {
    aoa.push([
      worker.label,
      worker.present,
      worker.ot,
      worker.unconfirmed,
      worker.review,
    ]);
  }
  return aoa;
}

/** 기록 시트(기존 컬럼) + 요약 시트 */
export function buildAttendanceRangeWorkbook(rows, displayMap = new Map(), meta = {}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, recordsWorksheet(rows, displayMap), '기록');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      buildAttendanceRangeSummaryAoa(rows, { ...meta, displayMap })
    ),
    '요약'
  );
  return workbook;
}

/** @returns {Buffer} */
export function buildAttendanceRangeExcelBuffer(rows, displayMap, meta) {
  return XLSX.write(buildAttendanceRangeWorkbook(rows, displayMap, meta), {
    type: 'buffer',
    bookType: 'xlsx',
  });
}

/** 브라우저 다운로드. 메일용 단일 시트 버퍼와는 별도. */
export function saveAttendanceRangeExcel(rows, displayMap, meta, filename) {
  XLSX.writeFile(buildAttendanceRangeWorkbook(rows, displayMap, meta), filename);
}

/** @returns {Buffer} */
export function buildAttendanceExcelBuffer(rows, displayMap) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, recordsWorksheet(rows, displayMap), '근태');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
