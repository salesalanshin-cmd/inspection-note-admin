import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupWorkerRecordsByDate, tagInspectionStage } from '../lib/analytics.js';
import { resolveRecordShift } from '../lib/attendance/resolveRecordShift.js';
import { kstWallToUtc } from '../lib/kst.js';

const WORKER = '김주간';
const DAY = '2026-11-06';
const PREV = '2026-11-05';

function at(y, m, d, hh, mm) {
  return kstWallToUtc(y, m - 1, d, hh, mm).toISOString();
}

const AT_0840 = at(2026, 11, 6, 8, 40);
const AT_0830 = at(2026, 11, 6, 8, 30);
const AT_0750 = at(2026, 11, 6, 7, 50);
const EVENING = at(2026, 11, 5, 21, 0);

function nightRow(extra = {}) {
  return {
    worker_name: WORKER,
    work_date: PREV,
    shift: 'night',
    reviewed: false,
    first_signal_at: EVENING,
    ...extra,
  };
}

function dayRow(extra = {}) {
  return {
    worker_name: WORKER,
    work_date: DAY,
    shift: 'day',
    reviewed: false,
    first_signal_at: AT_0840,
    ...extra,
  };
}

describe('resolveRecordShift', () => {
  it('08:40 주간 근태는 당일 주간', () => {
    const resolved = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0840,
      attendanceRows: [dayRow()],
    });
    assert.equal(resolved.workDate, DAY);
    assert.equal(resolved.shift, 'day');
    assert.equal(resolved.source, 'attendance');

    const tagged = tagInspectionStage(
      { worker_name: WORKER, created_at: AT_0840 },
      [],
      [],
      [dayRow()]
    );
    assert.equal(tagged.stage, '초품');
    assert.equal(tagged.shift, 'day');
    assert.notEqual(tagged.stage, '일반');
  });

  it('08:40 + 전날 야간 근태 + 저녁 신호는 전날 야간, 07:50은 야간 종품', () => {
    const resolved = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0840,
      attendanceRows: [nightRow()],
    });
    assert.equal(resolved.workDate, PREV);
    assert.equal(resolved.shift, 'night');
    assert.equal(resolved.source, 'attendance');

    const late = tagInspectionStage(
      { worker_name: WORKER, created_at: AT_0840 },
      [],
      [],
      [nightRow()]
    );
    assert.equal(late.workDate, PREV);
    assert.equal(late.shift, 'night');

    const finalStage = tagInspectionStage(
      { worker_name: WORKER, created_at: AT_0750 },
      [],
      [],
      [nightRow()]
    );
    assert.equal(finalStage.workDate, PREV);
    assert.equal(finalStage.shift, 'night');
    assert.equal(finalStage.stage, '종품');
  });

  it('근태 행이 없으면 기존 단계 판정과 같다', () => {
    const record = { worker_name: WORKER, created_at: at(2026, 11, 6, 10, 0) };
    const before = tagInspectionStage(record, [], [record]);
    const after = tagInspectionStage(record, [], [record], []);
    assert.equal(after.stage, before.stage);
    assert.equal(after.shift, before.shift);
    assert.equal(after.stage, '초품');
    assert.equal(resolveRecordShift({
      workerName: WORKER,
      timestamp: record.created_at,
      attendanceRows: [],
    }).source, 'fallback');
  });

  it('reviewed 행이 확정되지 않은 야간 귀속보다 우선한다', () => {
    const reviewedDay = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0840,
      attendanceRows: [nightRow({ reviewed: false }), dayRow({ reviewed: true })],
    });
    assert.equal(reviewedDay.workDate, DAY);
    assert.equal(reviewedDay.shift, 'day');

    const reviewedNight = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0840,
      attendanceRows: [nightRow({ reviewed: true }), dayRow({ reviewed: false })],
    });
    assert.equal(reviewedNight.workDate, PREV);
    assert.equal(reviewedNight.shift, 'night');
  });

  it('문서 스캔 08:30은 야간 근태면 전날, 주간 근태면 당일', () => {
    const night = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0830,
      attendanceRows: [nightRow()],
    });
    assert.equal(night.workDate, PREV);
    assert.equal(night.shift, 'night');

    const day = resolveRecordShift({
      workerName: WORKER,
      timestamp: AT_0830,
      attendanceRows: [dayRow({ first_signal_at: AT_0830 })],
    });
    assert.equal(day.workDate, DAY);
    assert.equal(day.shift, 'day');

    const grouped = groupWorkerRecordsByDate(
      [{ worker_name: WORKER, created_at: AT_0830, id: 'doc-1' }],
      WORKER,
      [nightRow()]
    );
    assert.equal(grouped[0].date, PREV);
  });
});
