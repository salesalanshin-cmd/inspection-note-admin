import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import {
  ATTENDANCE_DEFAULT_POLICIES,
  resolvePolicyForWorker,
} from '../lib/attendance/policy.js';
import {
  FLAG_KOREAN_NIGHT_SIGNALS_REVIEW,
  FLAG_NATIONALITY_UNSET,
  RATIONALE_NATIONALITY_UNSET,
  RULE_KOREAN_DAY_FIXED,
  isAttendanceExcludedWorker,
  resolveAttendanceShift,
  selectSignalsForShift,
  SHIFT_DAY,
  SHIFT_NIGHT,
} from '../lib/attendance/shift.js';
import { buildAttendanceUpsertRow } from '../lib/attendance/upsertRow.js';

const WORK_DATE = '2026-10-21';
const DAY_POL = resolvePolicyForWorker(ATTENDANCE_DEFAULT_POLICIES, '주조', 'day');
const NIGHT_POL = resolvePolicyForWorker(ATTENDANCE_DEFAULT_POLICIES, '주조', 'night');

function sig(hm, type = 'fives', dayOffset = 0) {
  return {
    type,
    at: wallTimeOnWorkDate(WORK_DATE, hm, dayOffset).toISOString(),
  };
}

describe('resolveAttendanceShift priority & windows', () => {
  it('외국인 + 19:39 한 장만 → default_shift night 이면 야간', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('19:39')],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '베트남',
      defaultShift: 'night',
    });
    assert.equal(r.shift, SHIFT_NIGHT);
    assert.equal(r.rule, 'directory_default_shift');
  });

  it('08:00:06 + 19:53 + 00:01 → 야간(default), 08:00은 야간 구간 밖(전날 퇴근)', () => {
    const signals = [
      sig('08:00'), // 초 단위 오차는 wallTime 분 단위 — 08:00
      sig('19:53'),
      sig('00:01', 'fives', 1),
    ];
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals,
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '태국',
      defaultShift: 'night',
    });
    assert.equal(r.shift, SHIFT_NIGHT);
    const nightOnly = selectSignalsForShift(
      signals,
      WORK_DATE,
      SHIFT_NIGHT,
      DAY_POL,
      NIGHT_POL
    );
    assert.equal(nightOnly.length, 2);
    assert.ok(!nightOnly.some((s) => s.at === signals[0].at));
    assert.equal(nightOnly[0].at, signals[1].at);
  });

  it('08:07 + 20:41 — default_shift에 따라 주/야 갈림', () => {
    const signals = [sig('08:07'), sig('20:41')];
    const asNight = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals,
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '태국',
      defaultShift: 'night',
    });
    const asDay = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals,
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '태국',
      defaultShift: 'day',
    });
    assert.equal(asNight.shift, SHIFT_NIGHT);
    assert.equal(asDay.shift, SHIFT_DAY);
  });

  it('한국인 16:52는 당일 주간, 저녁 신호 없는 다음날 07:57은 야간 선택에서 빠진다', () => {
    const daySignals = [sig('16:52')];
    const nextMorning = [sig('07:57', 'fives', 1)];
    const d = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: daySignals,
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(d.shift, SHIFT_DAY);
    const dayOnly = selectSignalsForShift(
      daySignals,
      WORK_DATE,
      SHIFT_DAY,
      DAY_POL,
      NIGHT_POL
    );
    assert.equal(dayOnly.length, 1);

    const nightOfD = selectSignalsForShift(
      nextMorning,
      WORK_DATE,
      SHIFT_NIGHT,
      DAY_POL,
      NIGHT_POL
    );
    assert.equal(nightOfD.length, 0);

    const dayOfNext = selectSignalsForShift(
      nextMorning,
      '2026-10-22',
      SHIFT_DAY,
      DAY_POL,
      NIGHT_POL
    );
    assert.equal(dayOfNext.length, 1);
  });

  it('내국인, default_shift 없음, 07:55 신호 → day', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('07:55')],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '한국',
      defaultShift: null,
    });
    assert.equal(r.shift, SHIFT_DAY);
    assert.equal(r.rule, RULE_KOREAN_DAY_FIXED);
    assert.ok(!r.flags.includes(FLAG_KOREAN_NIGHT_SIGNALS_REVIEW));
  });

  it('내국인, 야간 신호만(20:00+익일 07:50) → day + 확인 필요 플래그', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('20:00'), sig('07:50', 'fives', 1)],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '한국',
      defaultShift: null,
    });
    assert.equal(r.shift, SHIFT_DAY);
    assert.equal(r.rule, RULE_KOREAN_DAY_FIXED);
    assert.ok(r.flags.includes(FLAG_KOREAN_NIGHT_SIGNALS_REVIEW));
  });

  it('내국인, default_shift=night, 야간 신호 → night', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('20:00'), sig('07:50', 'fives', 1)],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '한국',
      defaultShift: 'night',
    });
    assert.equal(r.shift, SHIFT_NIGHT);
    assert.equal(r.rule, 'directory_default_shift');
    assert.ok(!r.flags.includes(FLAG_KOREAN_NIGHT_SIGNALS_REVIEW));
  });

  it('외국인(김다운/압둘 유형) default_shift=night → night 유지', () => {
    const kim = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('08:00'), sig('19:53'), sig('00:01', 'fives', 1)],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '태국',
      defaultShift: 'night',
    });
    assert.equal(kim.shift, SHIFT_NIGHT);
    const abdul = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('20:02'), sig('20:09')],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '우즈베키스탄',
      defaultShift: 'night',
    });
    assert.equal(abdul.shift, SHIFT_NIGHT);
  });

  it('국적 미설정 플래그·rationale', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [sig('20:00')],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '',
      defaultShift: 'night',
    });
    assert.ok(r.flags.includes(FLAG_NATIONALITY_UNSET));
    assert.equal(r.nationalityStatus, RATIONALE_NATIONALITY_UNSET);
    assert.equal(r.shift, SHIFT_NIGHT);
  });

  it('recent 7일 다수가 default_shift 없을 때 적용', () => {
    const r = resolveAttendanceShift({
      workDate: WORK_DATE,
      signals: [],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '베트남',
      defaultShift: null,
      recentShifts: ['night', 'night', 'day'],
    });
    assert.equal(r.shift, SHIFT_NIGHT);
    assert.equal(r.rule, 'recent_7d_night_majority');
  });
});

describe('judgeAttendance with windows', () => {
  it('주간 확정 07:50 출근 + 22:00 퇴근 → 출근, 퇴근 22:00, OT', () => {
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [sig('07:50'), sig('22:00')],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.shift, SHIFT_DAY);
    assert.equal(r.judgment, 'present');
    assert.equal(r.isOt, true);
    assert.equal(r.estimatedClockOut, sig('22:00').at);
    assert.equal(r.clockOutConfirmed, true);
  });

  it('외국인 야간 default → 추정 20:00~익일 08:00, 19:39 보정', () => {
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [sig('19:39'), sig('07:50', 'fives', 1)],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '베트남',
      defaultShift: 'night',
    });
    assert.equal(r.shift, SHIFT_NIGHT);
    assert.equal(r.estimatedClockIn, wallTimeOnWorkDate(WORK_DATE, '19:39').toISOString());
    assert.equal(
      r.estimatedClockOut,
      wallTimeOnWorkDate(WORK_DATE, '08:00', 1).toISOString()
    );
  });
});

describe('buildAttendanceUpsertRow reviewed 보존', () => {
  it('reviewed 행은 조·판정·시각을 덮어쓰지 않음', () => {
    const judged = judgeAttendance({
      workDate: WORK_DATE,
      signals: [sig('21:00'), sig('06:00', 'fives', 1)],
      dayPolicy: DAY_POL,
      nightPolicy: NIGHT_POL,
      nationality: '베트남',
      defaultShift: 'night',
    });
    assert.equal(judged.shift, SHIFT_NIGHT);

    const prev = {
      reviewed: true,
      reviewed_by: 'admin',
      reviewed_at: '2026-10-22T00:00:00.000Z',
      judgment: 'present',
      shift: 'day',
      estimated_clock_in: wallTimeOnWorkDate(WORK_DATE, '08:00').toISOString(),
      estimated_clock_out: wallTimeOnWorkDate(WORK_DATE, '17:00').toISOString(),
      is_ot: false,
      judgment_rationale: { shift: 'day', rule: 'manual_override' },
      flags: [],
      notes: '수동',
    };

    const row = buildAttendanceUpsertRow({
      companyId: 'c1',
      workDate: WORK_DATE,
      workerName: '테스트',
      judged,
      prev,
      overwriteReviewed: false,
    });

    assert.equal(row.shift, 'day');
    assert.equal(row.estimated_clock_in, prev.estimated_clock_in);
    assert.equal(row.reviewed, true);
    assert.equal(row.first_signal_at, judged.firstSignalAt);
  });
});

describe('exclude test accounts', () => {
  it('_test / excluded / removed 제외', () => {
    assert.equal(
      isAttendanceExcludedWorker({ worker_name: '신성호_test', excluded: false }),
      true
    );
    assert.equal(
      isAttendanceExcludedWorker({ worker_name: '김다운', excluded: true }),
      true
    );
    assert.equal(
      isAttendanceExcludedWorker({ worker_name: '김다운', excluded: false }),
      false
    );
  });
});

describe('policy night fallback', () => {
  it('사상 야간 없으면 주조 야간 정책', () => {
    const policies = ATTENDANCE_DEFAULT_POLICIES.filter(
      (p) => !(p.target_value === '사상' && p.shift === 'night')
    );
    const p = resolvePolicyForWorker(policies, '사상', 'night');
    assert.equal(p.target_value, '주조');
    assert.equal(p.shift, 'night');
    assert.equal(p.window_start_time, '19:00');
  });
});
