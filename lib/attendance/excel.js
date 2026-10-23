import * as XLSX from 'xlsx';
import { formatExportDateTime } from '../exportExcel.js';
import { judgmentLabel } from './judge.js';
import {
  formatSignalListLabel,
  signalRawMergedCounts,
} from './signalUtils.js';
import {
  formatJudgmentRationaleSummary,
  shiftLabel,
} from './shift.js';

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

/** @returns {Buffer} */
export function buildAttendanceExcelBuffer(rows, displayMap) {
  const sheetRows = attendanceRowsForExcel(rows, displayMap);
  const empty = {
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
  const worksheet = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [empty]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '근태');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
