import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAutoCommentToRationale } from '../lib/attendance/autoComment.js';
import {
  applyAttendanceExcelImport,
  buildAttendanceEditLogs,
  summarizeAttendanceCorrections,
  summarizeAttendanceEdits,
} from '../lib/attendance/excelImport.js';
import { kstWallToUtc } from '../lib/kst.js';

const WORK_DATE = '2026-11-06';
const CLOCK_IN = kstWallToUtc(2026, 10, 6, 8, 0, 0).toISOString();
const CLOCK_OUT = kstWallToUtc(2026, 10, 6, 17, 0, 0).toISOString();

function daily(extra = {}) {
  return {
    id: 'row-1',
    worker_name: '홍길동',
    work_date: WORK_DATE,
    shift: 'day',
    judgment: 'present',
    estimated_clock_in: CLOCK_IN,
    estimated_clock_out: CLOCK_OUT,
    is_ot: false,
    reviewed: false,
    judgment_rationale: { shift: 'day', rule: 'signal_pattern' },
    ...extra,
  };
}

const directory = [
  { worker_name: '홍길동', display_name: '길동' },
  { worker_name: '김철수', display_name: '' },
];

describe('applyAttendanceExcelImport', () => {
  it('표시명으로 맞추고 바뀐 조·출근을 확정과 이력으로 만든다', () => {
    const result = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      at: '2026-11-06T10:00:00.000Z',
      excelRows: [
        {
          근무일: WORK_DATE,
          작업자: '길동',
          조: '야간',
          판정: '출근',
          추정출근: '2026-11-06 20:00:00',
          추정퇴근: '2026-11-06 17:00:00',
          OT: 'N',
          검수: 'N',
        },
      ],
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.updates.length, 1);
    const update = result.updates[0];
    assert.equal(update.patch.reviewed, true);
    assert.equal(update.patch.shift, 'night');
    assert.equal(update.patch.judgment_rationale.rule, 'excel_import');
    assert.equal(update.patch.judgment_rationale.corrections.length, 1);
    assert.deepEqual(
      update.patch.judgment_rationale.corrections[0].changes.map((change) => change.field),
      ['shift', 'estimated_clock_in']
    );
  });

  it('같은 시각은 건너뛰고, 검수 Y만 있으면 이력 없이 확정한다', () => {
    const unchanged = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      excelRows: [
        {
          근무일: '2026/11/06',
          작업자: '홍길동',
          조: '주간',
          판정: '출근',
          추정출근: '2026-11-06 08:00:12',
          추정퇴근: '2026-11-06 17:00:00',
          OT: 'N',
        },
      ],
    });
    assert.equal(unchanged.updates.length, 0);
    assert.equal(unchanged.skipped, 1);

    const confirm = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      excelRows: [{ 근무일: WORK_DATE, 작업자: '홍길동', 검수: 'Y' }],
    });
    assert.equal(confirm.confirms.length, 1);
    assert.equal(confirm.updates.length, 0);
  });

  it('없는 작업자, 없는 행, 잘못된 조, 중복 행은 반영하지 않는다', () => {
    const result = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      excelRows: [
        { 근무일: WORK_DATE, 작업자: '없는사람', 조: '주간' },
        { 근무일: '2026-11-07', 작업자: '홍길동', 조: '주간' },
        { 근무일: WORK_DATE, 작업자: '김철수', 조: '저녁' },
        { 근무일: WORK_DATE, 작업자: '홍길동', 조: '야간' },
        { 근무일: WORK_DATE, 작업자: '길동', 조: '야간' },
      ],
    });
    assert.equal(result.updates.length, 1);
    assert.deepEqual(
      result.errors.map((error) => error.message),
      [
        '작업자를 찾을 수 없습니다',
        '저장된 근태 행이 없습니다',
        '조를 알 수 없습니다',
        '같은 작업자·근무일이 파일에 두 번 있습니다',
      ]
    );
  });

  it('표시명이 두 명과 겹치면 반영하지 않는다', () => {
    const result = applyAttendanceExcelImport({
      directory: [
        { worker_name: '홍길동', display_name: '길동' },
        { worker_name: '홍길순', display_name: '길동' },
      ],
      dailyRows: [daily()],
      excelRows: [{ 근무일: WORK_DATE, 작업자: '길동', 조: '야간' }],
    });
    assert.equal(result.updates.length, 0);
    assert.equal(result.errors[0].message, '동일 표시명 중복');
  });
});

describe('summarizeAttendanceCorrections', () => {
  it('같은 오판은 묶고 재계산 후에도 이력이 남는다', () => {
    const imported = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily(), daily({ id: 'row-2', worker_name: '김철수' })],
      excelRows: [
        { 근무일: WORK_DATE, 작업자: '홍길동', 조: '야간' },
        { 근무일: WORK_DATE, 작업자: '김철수', 조: '야간' },
      ],
    });
    const stored = imported.updates.map((update) => ({
      judgment_rationale: update.patch.judgment_rationale,
    }));
    const summary = summarizeAttendanceCorrections(stored);
    assert.equal(summary.total, 2);
    assert.deepEqual(summary.patterns, [{ label: '조 주간→야간', count: 2 }]);

    const kept = applyAutoCommentToRationale(stored[0].judgment_rationale, {
      autoComment: '새 코멘트',
      flags: [],
    });
    assert.equal(kept.corrections.length, 1);
    assert.equal(kept.rule, 'excel_import');
    assert.equal(kept.autoComment, '새 코멘트');
  });
});

describe('엑셀 행 매칭과 시각', () => {
  it('행ID, 작업자ID, 표시명 순으로 찾고 같은 표시명은 건너뛴다', () => {
    const rows = [
      daily({ id: 'row-a' }),
      daily({ id: 'row-b', worker_name: '김철수', judgment_rationale: { rule: 'directory_default_shift' } }),
    ];
    const directoryWithDup = [
      ...directory,
      { worker_name: '홍길순', display_name: '길동' },
    ];
    const byId = applyAttendanceExcelImport({
      directory: directoryWithDup,
      dailyRows: rows,
      excelRows: [{ 행ID: 'row-b', 근무일: WORK_DATE, 작업자: '길동', 조: '야간' }],
    });
    assert.equal(byId.updates[0].id, 'row-b');

    const byWorkerId = applyAttendanceExcelImport({
      directory: directoryWithDup,
      dailyRows: rows,
      excelRows: [{ 작업자ID: '홍길동', 근무일: WORK_DATE, 작업자: '길동', 조: '야간' }],
    });
    assert.equal(byWorkerId.updates[0].id, 'row-a');

    const skipped = applyAttendanceExcelImport({
      directory: directoryWithDup,
      dailyRows: rows,
      excelRows: [{ 근무일: WORK_DATE, 작업자: '길동', 조: '야간' }],
    });
    assert.equal(skipped.updates.length, 0);
    assert.equal(skipped.errors[0].message, '동일 표시명 중복');
    assert.equal(skipped.preview[0].status, 'error');
  });

  it('HH:mm은 근무일 KST로 읽고 출근보다 이른 퇴근은 다음 날이다', () => {
    const result = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      excelRows: [
        {
          근무일: WORK_DATE,
          작업자ID: '홍길동',
          추정출근: '20:00',
          추정퇴근: '06:00',
        },
      ],
    });
    assert.equal(result.errors.length, 0);
    assert.equal(
      result.updates[0].patch.estimated_clock_in,
      kstWallToUtc(2026, 10, 6, 20, 0, 0).toISOString()
    );
    assert.equal(
      result.updates[0].patch.estimated_clock_out,
      kstWallToUtc(2026, 10, 7, 6, 0, 0).toISOString()
    );
  });

  it('출근·퇴근 빈 칸은 값을 지우지 않는다', () => {
    const result = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      excelRows: [{ 근무일: WORK_DATE, 작업자: '홍길동', 조: '야간', 추정출근: '', 추정퇴근: '' }],
    });
    assert.deepEqual(
      result.updates[0].changes.map((change) => change.field),
      ['shift']
    );
    assert.equal(result.updates[0].patch.estimated_clock_in, undefined);
    assert.equal(result.updates[0].patch.estimated_clock_out, undefined);
  });
});

describe('수정 이력과 요약', () => {
  it('바꾼 필드마다 같은 batch_id와 수정 전 규칙을 남긴다', () => {
    const imported = applyAttendanceExcelImport({
      directory,
      dailyRows: [daily()],
      at: '2026-11-06T10:00:00.000Z',
      excelRows: [{ 근무일: WORK_DATE, 작업자ID: '홍길동', 조: '야간', OT: 'Y' }],
    });
    const logs = buildAttendanceEditLogs({
      companyId: 'company-1',
      attendanceId: imported.updates[0].id,
      workerName: imported.updates[0].workerName,
      workDate: imported.updates[0].workDate,
      changes: imported.updates[0].changes,
      source: 'excel',
      originalRule: imported.updates[0].originalRule,
      editedBy: 'excel',
      editedAt: '2026-11-06T10:00:00.000Z',
      batchId: 'batch-1',
    });
    assert.equal(logs.length, 2);
    assert.deepEqual(
      logs.map((log) => log.field),
      ['shift', 'is_ot']
    );
    assert.equal(logs.every((log) => log.batch_id === 'batch-1'), true);
    assert.equal(logs.every((log) => log.original_rule === 'signal_pattern'), true);
    assert.equal(logs[0].source, 'excel');
    assert.equal(logs[0].old_value, 'day');
    assert.equal(logs[0].new_value, 'night');
  });

  it('규칙 비율은 판정 행이 없으면 나누지 않는다', () => {
    const summary = summarizeAttendanceEdits(
      [
        {
          attendance_id: 'a',
          worker_name: '홍길동',
          field: 'shift',
          old_value: 'day',
          new_value: 'night',
          original_rule: 'signal_pattern',
          edited_at: '2026-11-06T01:00:00.000Z',
        },
        {
          attendance_id: 'a',
          worker_name: '홍길동',
          field: 'is_ot',
          old_value: 'false',
          new_value: 'true',
          original_rule: 'signal_pattern',
          edited_at: '2026-11-06T02:00:00.000Z',
        },
        {
          attendance_id: 'b',
          worker_name: '김철수',
          field: 'shift',
          old_value: 'night',
          new_value: 'day',
          original_rule: 'gone',
          edited_at: '2026-11-06T03:00:00.000Z',
        },
      ],
      [
        { judgment_rationale: { rule: 'signal_pattern' } },
        { judgment_rationale: { rule: 'signal_pattern' } },
      ]
    );
    assert.equal(summary.total, 3);
    assert.equal(summary.rowCount, 2);
    assert.equal(summary.workerCount, 2);
    assert.equal(summary.dayToNight, 1);
    assert.equal(summary.nightToDay, 1);
    assert.equal(summary.lines.length, 4);
    const signal = summary.byRule.find((item) => item.rule === 'signal_pattern');
    assert.equal(signal.editedRows, 1);
    assert.equal(signal.judgedRows, 2);
    assert.equal(signal.ratio, 0.5);
    const missing = summary.byRule.find((item) => item.rule === 'gone');
    assert.equal(missing.judgedRows, 0);
    assert.equal(missing.ratio, null);
    const empty = summarizeAttendanceEdits([], []);
    assert.equal(empty.total, 0);
    assert.equal(empty.byRule.length, 0);
  });
});
