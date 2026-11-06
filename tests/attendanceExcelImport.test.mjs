import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAutoCommentToRationale } from '../lib/attendance/autoComment.js';
import {
  applyAttendanceExcelImport,
  summarizeAttendanceCorrections,
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
    assert.equal(result.errors[0].message, '작업자 이름이 여러 명과 겹칩니다');
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
