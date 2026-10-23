import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import {
  FLAG_MERGED_DUPLICATES,
  mergeSignals,
  resolveClockFromBundles,
} from '../lib/attendance/signalUtils.js';

const WORK_DATE = '2026-10-21';

const POLICY = {
  shift: 'day',
  work_start_time: '08:00',
  work_end_time: '20:00',
  ot_threshold_time: '18:00',
  ot_end_time: '20:00',
  adjust_minutes: 0,
  window_start_time: '07:00',
  window_end_time: '20:30',
  signal_merge_minutes: 10,
  clock_out_min_gap_minutes: 60,
};

function at(hm, sec = 0) {
  const [h, m] = hm.split(':').map(Number);
  const base = wallTimeOnWorkDate(WORK_DATE, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return new Date(base.getTime() + sec * 1000).toISOString();
}

describe('mergeSignals', () => {
  it('10분 이내 같은 종류는 한 묶음, 대표는 시작 시각', () => {
    const { bundles, rawCount, mergedCount, hadMerge } = mergeSignals(
      [
        { type: 'fives', at: at('08:00', 1) },
        { type: 'fives', at: at('08:00', 20) },
      ],
      10
    );
    assert.equal(rawCount, 2);
    assert.equal(mergedCount, 1);
    assert.equal(hadMerge, true);
    assert.equal(bundles[0].at, at('08:00', 1));
    assert.equal(bundles[0].bundleSize, 2);
  });

  it('9분은 병합, 11분은 분리', () => {
    const t0 = at('08:00', 0);
    const t9 = new Date(new Date(t0).getTime() + 9 * 60 * 1000).toISOString();
    const t11 = new Date(new Date(t0).getTime() + 11 * 60 * 1000).toISOString();
    const merge9 = mergeSignals(
      [
        { type: 'fives', at: t0 },
        { type: 'fives', at: t9 },
      ],
      10
    );
    assert.equal(merge9.mergedCount, 1);
    const merge11 = mergeSignals(
      [
        { type: 'fives', at: t0 },
        { type: 'fives', at: t11 },
      ],
      10
    );
    assert.equal(merge11.mergedCount, 2);
  });

  it('서로 다른 종류는 병합하지 않음', () => {
    const { mergedCount, bundles } = mergeSignals(
      [
        { type: 'fives', at: at('08:00', 1) },
        { type: 'frequent', at: at('08:00', 20) },
      ],
      10
    );
    assert.equal(mergedCount, 2);
    assert.equal(bundles[0].type, 'fives');
    assert.equal(bundles[1].type, 'frequent');
  });
});

describe('resolveClockFromBundles gap', () => {
  it('59분은 퇴근 미인정, 61분은 인정', () => {
    const t0 = at('08:00', 0);
    const t59 = new Date(new Date(t0).getTime() + 59 * 60 * 1000).toISOString();
    const t61 = new Date(new Date(t0).getTime() + 61 * 60 * 1000).toISOString();
    const bundles59 = mergeSignals(
      [
        { type: 'fives', at: t0 },
        { type: 'fives', at: t59 },
      ],
      10
    ).bundles;
    const c59 = resolveClockFromBundles(bundles59, 60);
    assert.equal(c59.clockOut, null);

    const bundles61 = mergeSignals(
      [
        { type: 'fives', at: t0 },
        { type: 'fives', at: t61 },
      ],
      10
    ).bundles;
    const c61 = resolveClockFromBundles(bundles61, 60);
    assert.equal(c61.clockOutAt, t61);
  });
});

describe('judgeAttendance merge + clock-out', () => {
  it('08:00:01 + 08:00:20 + 20:02 → 출근 08:00, 퇴근 20:02', () => {
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [
        { type: 'fives', at: at('08:00', 1) },
        { type: 'fives', at: at('08:00', 20) },
        { type: 'fives', at: at('20:02', 0) },
      ],
      policy: POLICY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString());
    assert.equal(r.estimatedClockOut, at('20:02', 0));
    assert.equal(r.signalKinds.rawCount, 3);
    assert.equal(r.signalKinds.mergedCount, 2);
    assert.ok(r.flags.includes(FLAG_MERGED_DUPLICATES));
    assert.equal(r.clockOutConfirmed, true);
  });

  it('같은 두 장만 → 출근만, 퇴근 미확인', () => {
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [
        { type: 'fives', at: at('08:00', 1) },
        { type: 'fives', at: at('08:00', 20) },
      ],
      policy: POLICY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString());
    assert.equal(r.estimatedClockOut, null);
    assert.equal(r.clockOutConfirmed, false);
    assert.equal(r.signalKinds.mergedCount, 1);
  });
});
