import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import { summarizeSignals } from '../lib/attendance/signalUtils.js';
import { resolvePolicyForWorker } from '../lib/attendance/policy.js';
import {
  buildWorkerDirIndex,
  resolveWorkerName,
} from '../lib/attendance/lotSources.js';

const POLICY_DAY = {
  shift: 'day',
  work_start_time: '08:00',
  work_end_time: '17:00',
  ot_threshold_time: '18:00',
  ot_end_time: '20:00',
  adjust_minutes: 0,
  window_start_time: '07:00',
  window_end_time: '20:30',
  signal_merge_minutes: 10,
  clock_out_min_gap_minutes: 60,
};

const WORK_DATE = '2026-10-21';

describe('judgeAttendance', () => {
  it('신호 없음 → 미확인', () => {
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [],
      policy: POLICY_DAY,
    });
    assert.equal(r.judgment, 'unconfirmed');
    assert.equal(r.estimatedClockIn, null);
    assert.equal(r.isOt, false);
  });

  it('늦게 찍어도 출근 + 추정 출근은 정책 시작 (퇴근 신호 없으면 null)', () => {
    const late = wallTimeOnWorkDate(WORK_DATE, '14:00').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'fives', at: late }],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString());
    assert.equal(r.estimatedClockOut, null);
    assert.equal(r.clockOutConfirmed, false);
  });

  it('이른 신호가 있어도 추정 출근을 신호 시각 이하로 내리지 않음', () => {
    const early = wallTimeOnWorkDate(WORK_DATE, '07:30').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'frequent', at: early }],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString());
    assert.ok(new Date(r.firstSignalAt) < new Date(r.estimatedClockIn));
  });

  it('18시 이후 신호 → OT·퇴근 반영', () => {
    const morning = wallTimeOnWorkDate(WORK_DATE, '09:00').toISOString();
    const evening = wallTimeOnWorkDate(WORK_DATE, '18:30').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [
        { type: 'fives', at: morning },
        { type: 'defect', at: evening },
      ],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.isOt, true);
    assert.equal(r.estimatedClockOut, wallTimeOnWorkDate(WORK_DATE, '20:00').toISOString());
  });

  it('교차 시간: 근무일 경계 직전 신호는 전날 근무일로 분류되는 전제', () => {
    const sig = wallTimeOnWorkDate(WORK_DATE, '23:00').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'lot_move', at: sig }],
      policy: POLICY_DAY,
    });
    assert.equal(r.judgment, 'present');
  });

  it('3정5S 없이 LOT 스캔(lot_move)만 있어도 출근', () => {
    const at = wallTimeOnWorkDate(WORK_DATE, '10:30').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'lot_move', at, sourceId: 'm1' }],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.signalKinds.bundles[0].type, 'lot_move');
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString());
  });

  it('실적(production)만 있어도 출근', () => {
    const at = wallTimeOnWorkDate(WORK_DATE, '11:00').toISOString();
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'production', at, eventType: 'start' }],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.signalKinds.bundles[0].type, 'production');
  });
});

describe('summarizeSignals / policy', () => {
  it('신호 정렬·종류 요약', () => {
    const s = summarizeSignals([
      { type: 'defect', at: '2026-10-21T10:00:00.000Z' },
      { type: 'fives', at: '2026-10-21T01:00:00.000Z' },
    ]);
    assert.equal(s.firstSignalAt, '2026-10-21T01:00:00.000Z');
    assert.deepEqual(s.types.sort(), ['defect', 'fives']);
  });

  it('공정별 정책 매칭', () => {
    const policies = [
      { target_type: 'process', target_value: '주조', shift: 'day', work_end_time: '20:00' },
      { target_type: 'default', target_value: null, shift: 'day', work_end_time: '17:00' },
    ];
    assert.equal(resolvePolicyForWorker(policies, '주조').work_end_time, '20:00');
    assert.equal(resolvePolicyForWorker(policies, '가공').work_end_time, '17:00');
  });

  it('worker_directory 이름/표시명 매칭, 실패는 unmatched', () => {
    const idx = buildWorkerDirIndex([
      { worker_name: '김작업', display_name: 'Kim' },
    ]);
    const unmatched = [];
    assert.equal(resolveWorkerName('김작업', idx, unmatched), '김작업');
    assert.equal(resolveWorkerName('Kim', idx, unmatched), '김작업');
    assert.equal(resolveWorkerName('모르는사람', idx, unmatched), null);
    assert.deepEqual(unmatched, ['모르는사람']);
  });
});
