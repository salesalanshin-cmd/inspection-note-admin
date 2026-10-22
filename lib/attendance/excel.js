import * as XLSX from 'xlsx';
import { formatExportDateTime } from '../exportExcel.js';
import { judgmentLabel } from './judge.js';

const SIGNAL_TYPE_LABELS = {
  fives: '3정5S',
  frequent: '자주검사',
  defect: '불량',
  lot_move: 'LOT이동',
  production: '실적',
  lot: 'LOT', // 레거시
};

function signalKindsLabel(kinds) {
  if (!Array.isArray(kinds) || !kinds.length) return '';
  const types = [...new Set(kinds.map((k) => k.type).filter(Boolean))];
  return types.map((t) => SIGNAL_TYPE_LABELS[t] || t).join(',');
}

/**
 * @param {Array} rows attendance_daily
 * @param {Map<string,string>} [displayMap]
 */
export function attendanceRowsForExcel(rows, displayMap = new Map()) {
  return (rows || []).map((r) => ({
    근무일: r.work_date || '',
    작업자: displayMap.get(r.worker_name) || r.worker_name || '',
    판정: judgmentLabel(r.judgment),
    추정출근: formatExportDateTime(r.estimated_clock_in),
    추정퇴근: formatExportDateTime(r.estimated_clock_out),
    OT: r.is_ot ? 'Y' : 'N',
    신호최초: formatExportDateTime(r.first_signal_at),
    신호최종: formatExportDateTime(r.last_signal_at),
    신호종류: signalKindsLabel(r.signal_kinds),
    검수: r.reviewed ? 'Y' : 'N',
    신뢰도: r.confidence || '',
  }));
}

/** @returns {Buffer} */
export function buildAttendanceExcelBuffer(rows, displayMap) {
  const sheetRows = attendanceRowsForExcel(rows, displayMap);
  const worksheet = XLSX.utils.json_to_sheet(
    sheetRows.length
      ? sheetRows
      : [
          {
            근무일: '',
            작업자: '',
            판정: '',
            추정출근: '',
            추정퇴근: '',
            OT: '',
            신호최초: '',
            신호최종: '',
            신호종류: '',
            검수: '',
            신뢰도: '',
          },
        ]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '근태');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
