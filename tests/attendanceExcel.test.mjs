import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { formatExportDateTime } from '../lib/exportExcel.js';
import {
  ATTENDANCE_EXPORT_MAX_DAYS,
  attendanceRecomputeNotice,
  attendanceRowsForExcel,
  buildAttendanceExcelBuffer,
  buildAttendanceRangeExcelBuffer,
  describeAttendanceExportRange,
  filterAttendanceExportRows,
  missingAttendanceWorkDates,
  omitHiddenAttendanceRows,
  summarizeAttendanceByOrganization,
} from '../lib/attendance/excel.js';

function row(partial) {
  return {
    work_date: '2026-10-26',
    worker_name: '진현주',
    shift: 'day',
    judgment: 'present',
    estimated_clock_in: '2026-10-25T23:00:00.000Z',
    estimated_clock_out: '2026-10-26T08:22:00.000Z',
    is_ot: false,
    first_signal_at: '2026-10-25T23:52:00.000Z',
    last_signal_at: '2026-10-26T08:22:00.000Z',
    signal_kinds: { rawCount: 1, mergedCount: 1, hadMerge: false, bundles: [] },
    judgment_rationale: { shift: 'day', rule: 'directory_default_shift' },
    flags: [],
    reviewed: true,
    confidence: 'high',
    ...partial,
  };
}

const displayMap = new Map([['진현주', '진현주'], ['김야간', '김야간']]);

function readWorkbook(buffer) {
  return XLSX.read(buffer, { type: 'buffer' });
}

describe('formatExportDateTime KST', () => {
  it('UTC 서버에서도 08:00 KST는 당일 08:00으로 적는다', () => {
    assert.equal(
      formatExportDateTime('2026-10-25T23:00:00.000Z'),
      '2026-10-26 08:00:00'
    );
    assert.equal(
      formatExportDateTime('2026-10-26T08:22:00.000Z'),
      '2026-10-26 17:22:00'
    );
    assert.equal(formatExportDateTime(''), '');
  });
});

describe('omitHiddenAttendanceRows', () => {
  it('removed·excluded 이름은 빼고, 포함 옵션이면 남긴다', () => {
    const rows = [
      row({ worker_name: '활성' }),
      row({ worker_name: '숨김' }),
      row({ worker_name: '제외' }),
    ];
    const hidden = new Set(['숨김', '제외']);
    assert.deepEqual(
      omitHiddenAttendanceRows(rows, hidden).map((r) => r.worker_name),
      ['활성']
    );
    assert.equal(
      omitHiddenAttendanceRows(rows, hidden, { includeHidden: true }).length,
      3
    );
  });

  it('퇴근 정시 보정은 엑셀 비고에 적는다', () => {
    const excel = attendanceRowsForExcel([
      row({
        judgment_rationale: {
          shift: 'day',
          rule: 'directory_default_shift',
          clockOutAdjusted: true,
          clockOutAt: '2026-10-26T07:53:00.000Z',
        },
      }),
    ]);
    assert.equal(excel[0].비고, '퇴근 정시 보정(원래 16:53)');
  });
});

describe('describeAttendanceExportRange', () => {
  it('31일까지 허용하고 32일은 거절한다', () => {
    const ok = describeAttendanceExportRange({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.dayCount, ATTENDANCE_EXPORT_MAX_DAYS);
    assert.equal(ok.message, '');

    const over = describeAttendanceExportRange({
      start: '2026-10-01',
      end: '2026-11-01',
    });
    assert.equal(over.ok, false);
    assert.equal(over.dayCount, 32);
    assert.match(over.message, /최대 31일/);
    assert.match(over.message, /32일/);
  });

  it('종료일이 시작일보다 이르면 거절한다', () => {
    const result = describeAttendanceExportRange({
      start: '2026-10-26',
      end: '2026-10-25',
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /종료일/);
  });
});

describe('filterAttendanceExportRows', () => {
  const rows = [
    row({ worker_name: '진현주', shift: 'day', work_date: '2026-10-26' }),
    row({
      worker_name: '김야간',
      shift: 'night',
      work_date: '2026-10-26',
      judgment: 'unconfirmed',
    }),
    row({ worker_name: '진현주', shift: 'day', work_date: '2026-10-27' }),
  ];

  it('작업자와 조가 비어 있으면 전체를 남긴다', () => {
    assert.equal(filterAttendanceExportRows(rows, {}).length, 3);
  });

  it('작업자·조를 함께 적용한다', () => {
    const filtered = filterAttendanceExportRows(rows, {
      workerName: '진현주',
      shift: 'day',
    });
    assert.deepEqual(
      filtered.map((item) => item.work_date),
      ['2026-10-26', '2026-10-27']
    );
    assert.equal(
      filterAttendanceExportRows(rows, { workerName: '진현주', shift: 'night' }).length,
      0
    );
  });
});

describe('missing dates and recompute notice', () => {
  it('행이 없는 근무일만 안내하고 재계산 호출 문구를 포함한다', () => {
    const rows = [
      row({ work_date: '2026-10-25' }),
      row({ work_date: '2026-10-27' }),
    ];
    const missing = missingAttendanceWorkDates(rows, {
      start: '2026-10-25',
      end: '2026-10-27',
    });
    assert.deepEqual(missing, ['2026-10-26']);
    const notice = attendanceRecomputeNotice(missing);
    assert.match(notice, /2026-10-26/);
    assert.match(notice, /자동 재계산하지 않습니다/);
    assert.equal(attendanceRecomputeNotice([]), '');
  });
});

describe('range workbook', () => {
  it('기록 시트 컬럼은 기존 엑셀 행과 같고 요약 시트를 붙인다', () => {
    const stored = [
      row({ work_date: '2026-10-26', worker_name: '진현주', shift: 'day', is_ot: true }),
      row({
        work_date: '2026-10-26',
        worker_name: '김야간',
        shift: 'night',
        judgment: 'unconfirmed',
        is_ot: false,
        reviewed: false,
      }),
      row({
        work_date: '2026-10-27',
        worker_name: '진현주',
        shift: 'day',
        flags: ['확인 필요'],
      }),
    ];
    const missing = missingAttendanceWorkDates(stored, {
      start: '2026-10-25',
      end: '2026-10-27',
    });
    const exported = filterAttendanceExportRows(stored, {
      workerName: '진현주',
      shift: 'day',
    });
    const buffer = buildAttendanceRangeExcelBuffer(exported, displayMap, {
      start: '2026-10-25',
      end: '2026-10-27',
      dayCount: 3,
      workerLabel: '진현주',
      shiftLabel: '주간',
      missingDates: missing,
    });
    const workbook = readWorkbook(buffer);
    assert.deepEqual(workbook.SheetNames, ['기록', '요약']);

    const records = XLSX.utils.sheet_to_json(workbook.Sheets['기록']);
    const expected = attendanceRowsForExcel(exported, displayMap);
    assert.deepEqual(Object.keys(records[0]), Object.keys(expected[0]));
    assert.equal(records.length, 2);
    assert.equal(records[0]['근무일'], '2026-10-26');
    assert.equal(records[0]['추정출근'], '2026-10-26 08:00:00');
    assert.equal(records[0]['작업자'], '진현주');
    assert.equal(records[0]['조'], '주간');
    assert.equal(records[0]['판정'], '출근');
    assert.equal(records[0]['OT'], 'Y');
    assert.equal(records[1]['근무일'], '2026-10-27');

    const summary = XLSX.utils.sheet_to_json(workbook.Sheets['요약'], { header: 1 });
    const asMap = new Map(summary.filter((line) => line.length >= 2));
    assert.equal(asMap.get('시작일'), '2026-10-25');
    assert.equal(asMap.get('종료일'), '2026-10-27');
    assert.equal(asMap.get('일수'), 3);
    assert.equal(
      summary.find((line) => line[0] === '작업자' && line[1] === '진현주')?.[1],
      '진현주'
    );
    assert.equal(asMap.get('조'), '주간');
    assert.equal(asMap.get('행 수'), 2);
    assert.equal(asMap.get('출근'), 2);
    assert.equal(asMap.get('재계산 필요 근무일'), '2026-10-25');
    assert.deepEqual(
      summary.find((line) => line[0] === '2026-10-26'),
      ['2026-10-26', 1, 1, 0, 1]
    );
    assert.deepEqual(
      summary.find((line) => line[0] === '2026-10-27'),
      ['2026-10-27', 1, 1, 0, 0]
    );
    assert.deepEqual(
      summary.find((line) => line[1] === '출근일수'),
      ['작업자', '출근일수', 'OT일수', '미확인', '확인 필요']
    );
    assert.deepEqual(
      summary.find((line) => line[0] === '진현주' && line.length === 5),
      ['진현주', 2, 1, 0, 1]
    );
  });

  it('메일용 버퍼는 근태 시트 하나만 유지한다', () => {
    const buffer = buildAttendanceExcelBuffer([row({ id: 'row-1' })], displayMap);
    const workbook = readWorkbook(buffer);
    assert.deepEqual(workbook.SheetNames, ['근태']);
    const header = XLSX.utils.sheet_to_json(workbook.Sheets['근태'], { header: 1 })[0];
    assert.equal(header[0], '근무일');
    assert.equal(header.at(-3), '행ID');
    assert.equal(header.at(-2), '작업자ID');
    assert.equal(header.at(-1), '조직');
    assert.equal(header.includes('비고'), true);
    const records = XLSX.utils.sheet_to_json(workbook.Sheets['근태']);
    assert.equal(records[0]['행ID'], 'row-1');
    assert.equal(records[0]['작업자ID'], '진현주');
  });

  it('조직별 집계는 현재 소속으로 출근·미확인·OT를 센다', () => {
    const organizations = new Map([
      ['진현주', '1공장'],
      ['김야간', ''],
    ]);
    const summary = summarizeAttendanceByOrganization(
      [
        row({ worker_name: '진현주', judgment: 'present', is_ot: true }),
        row({ worker_name: '진현주', judgment: 'unconfirmed', is_ot: false }),
        row({ worker_name: '김야간', judgment: 'present', is_ot: false }),
        row({ worker_name: '없는사람', judgment: 'unconfirmed', is_ot: true }),
      ],
      organizations
    );
    assert.deepEqual(summary, [
      { organization: '1공장', present: 1, unconfirmed: 1, ot: 1 },
      { organization: '미설정', present: 1, unconfirmed: 1, ot: 1 },
    ]);
  });
});
