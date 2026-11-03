/**
 * 일요일/월요일 경계.
 * 익일 07:00~09:00만 있는 신호는 전날 야간을 만들지 않는다.
 *
 * 2026-10-25(일) · 2026-10-26(월)
 * 기본 정책: 주간 07:00~20:30, 야간 19:00~익일 09:00 (끝 미포함)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import {
  ATTENDANCE_DEFAULT_POLICIES,
  resolvePolicyForWorker,
} from '../lib/attendance/policy.js';
import {
  FLAG_KOREAN_NIGHT_SIGNALS_REVIEW,
  RULE_KOREAN_DAY_FIXED,
  getAttendanceSignalQueryRange,
  partitionSignalsForWorkDate,
  resolveEstimatedClockIn,
} from '../lib/attendance/shift.js';
import { formatKstISODate, getKstHours, getKstMinutes } from '../lib/kst.js';

const SUN = '2026-10-25';
const MON = '2026-10-26';
const WED = '2026-10-21';
const THU = '2026-10-22';

const DAY_POL = resolvePolicyForWorker(ATTENDANCE_DEFAULT_POLICIES, '주조', 'day');
const NIGHT_POL = resolvePolicyForWorker(
  ATTENDANCE_DEFAULT_POLICIES,
  '주조',
  'night'
);

function at(workDate, hm, dayOffset = 0, type = 'fives') {
  return {
    type,
    at: wallTimeOnWorkDate(workDate, hm, dayOffset).toISOString(),
  };
}

/** 수집 단계와 같이, 그 근무일 조회창(D-1 17:00 ~ D+1 09:00) 안의 신호만. */
function signalsInQuery(workDate, signals) {
  const { start, end } = getAttendanceSignalQueryRange(workDate);
  return signals.filter((s) => {
    const t = new Date(s.at).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

function judgeDay(workDate, signals, profile) {
  return judgeAttendance({
    workDate,
    signals: signalsInQuery(workDate, signals),
    dayPolicy: DAY_POL,
    nightPolicy: NIGHT_POL,
    nationality: profile.nationality,
    defaultShift: profile.defaultShift ?? null,
    recentShifts: profile.recentShifts ?? [],
  });
}

function kstWall(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatKstISODate(d)} ${pad(getKstHours(d))}:${pad(getKstMinutes(d))}`;
}

function utcWall(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function snapshot(workDate, signals, profile) {
  const judged = judgeDay(workDate, signals, profile);
  return {
    workDate,
    shift: judged.shift,
    rule: judged.judgmentRationale.rule,
    judgment: judged.judgment,
    daySignalCount: judged.judgmentRationale.daySignalCount,
    nightSignalCount: judged.judgmentRationale.nightSignalCount,
    kept: judged.signalKinds.raw.length,
    flags: judged.flags,
    clockInKst: kstWall(judged.estimatedClockIn),
    clockInUtc: utcWall(judged.estimatedClockIn),
    clockOutKst: kstWall(judged.estimatedClockOut),
    clockOutUtc: utcWall(judged.estimatedClockOut),
    firstKst: kstWall(judged.firstSignalAt),
    firstUtc: utcWall(judged.firstSignalAt),
    lastKst: kstWall(judged.lastSignalAt),
    lastUtc: utcWall(judged.lastSignalAt),
  };
}

const morningOnly = [at(MON, '08:12')];
const morningAndAfternoon = [at(MON, '08:52'), at(MON, '17:22', 0, 'frequent')];
const beforeDayWindow = [at(MON, '06:40')];
const afterOverlap = [at(MON, '10:00')];

describe('10/26 08:12 신호가 어느 근무일 창에 들어가는지', () => {
  it('월요일 08:12는 일요일 야간 창과 월요일 주간 창에 동시에 속한다', () => {
    const signal = morningOnly[0];
    const sun = partitionSignalsForWorkDate([signal], SUN, DAY_POL, NIGHT_POL);
    const mon = partitionSignalsForWorkDate([signal], MON, DAY_POL, NIGHT_POL);

    assert.equal(sun.daySignals.length, 0);
    assert.equal(sun.nightSignals.length, 1);
    assert.equal(mon.daySignals.length, 1);
    assert.equal(mon.nightSignals.length, 0);
    assert.equal(kstWall(signal.at), '2026-10-26 08:12');
    assert.equal(utcWall(signal.at), '2026-10-25 23:12');
    assert.equal(kstWall(sun.nightWin.end.toISOString()), '2026-10-26 09:00');
    assert.equal(kstWall(mon.dayWin.start.toISOString()), '2026-10-26 07:00');
  });

  it('06:40은 일요일 야간에만, 10:00은 월요일 주간에만 속한다', () => {
    const early = partitionSignalsForWorkDate(beforeDayWindow, SUN, DAY_POL, NIGHT_POL);
    const earlyMon = partitionSignalsForWorkDate(beforeDayWindow, MON, DAY_POL, NIGHT_POL);
    const late = partitionSignalsForWorkDate(afterOverlap, SUN, DAY_POL, NIGHT_POL);
    const lateMon = partitionSignalsForWorkDate(afterOverlap, MON, DAY_POL, NIGHT_POL);

    assert.equal(early.nightSignals.length, 1);
    assert.equal(early.daySignals.length, 0);
    assert.equal(earlyMon.daySignals.length, 0);
    assert.equal(earlyMon.nightSignals.length, 0);
    assert.equal(late.daySignals.length, 0);
    assert.equal(late.nightSignals.length, 0);
    assert.equal(lateMon.daySignals.length, 1);
    assert.equal(lateMon.nightSignals.length, 0);
  });
});

describe('월요일 아침만 있을 때 근무일별 현재 판정', () => {
  const profiles = {
    korean: { nationality: '한국', defaultShift: null, recentShifts: [] },
    foreignOpen: { nationality: '베트남', defaultShift: null, recentShifts: [] },
    foreignDefaultDay: { nationality: '베트남', defaultShift: 'day', recentShifts: [] },
    foreignRecentDay: {
      nationality: '베트남',
      defaultShift: null,
      recentShifts: ['day', 'day', 'day', 'day', 'day', 'day'],
    },
    foreignRecentNight: {
      nationality: '베트남',
      defaultShift: null,
      recentShifts: ['night', 'night', 'night', 'night'],
    },
  };

  it('내국인 주간 고정: 일요일은 신호 없음, 월요일 행이 08:12를 가져간다', () => {
    const sun = snapshot(SUN, morningOnly, profiles.korean);
    const mon = snapshot(MON, morningOnly, profiles.korean);

    assert.equal(sun.shift, 'day');
    assert.equal(sun.rule, RULE_KOREAN_DAY_FIXED);
    assert.equal(sun.judgment, 'unconfirmed');
    assert.equal(sun.kept, 0);
    assert.equal(sun.daySignalCount, 0);
    assert.equal(sun.nightSignalCount, 1);
    assert.ok(sun.flags.includes(FLAG_KOREAN_NIGHT_SIGNALS_REVIEW));

    assert.equal(mon.shift, 'day');
    assert.equal(mon.judgment, 'present');
    assert.equal(mon.kept, 1);
    assert.equal(mon.clockInKst, '2026-10-26 08:00');
    assert.equal(mon.clockInUtc, '2026-10-25 23:00');
    assert.equal(mon.firstKst, '2026-10-26 08:12');
    assert.equal(mon.firstUtc, '2026-10-25 23:12');
  });

  it('월요일 08:12만 있으면 일요일은 야간이 되지 않고 신호는 월요일 주간에만 남는다', () => {
    const sun = snapshot(SUN, morningOnly, profiles.foreignOpen);
    const mon = snapshot(MON, morningOnly, profiles.foreignOpen);

    assert.equal(sun.shift, 'day');
    assert.equal(sun.rule, 'signal_overlap_deferred');
    assert.equal(sun.judgment, 'unconfirmed');
    assert.equal(sun.kept, 0);
    assert.equal(sun.daySignalCount, 0);
    assert.equal(sun.nightSignalCount, 1);

    assert.equal(mon.shift, 'day');
    assert.equal(mon.rule, 'signal_day_majority');
    assert.equal(mon.judgment, 'present');
    assert.equal(mon.kept, 1);
    assert.equal(mon.clockInKst, '2026-10-26 08:00');
    assert.equal(mon.firstKst, '2026-10-26 08:12');
  });

  it('default_shift=day 또는 최근 7일 주간 다수면 일요일은 주간이고 아침 신호는 월요일에만 있다', () => {
    for (const profile of [profiles.foreignDefaultDay, profiles.foreignRecentDay]) {
      const sun = snapshot(SUN, morningOnly, profile);
      const mon = snapshot(MON, morningOnly, profile);
      assert.equal(sun.shift, 'day');
      assert.equal(sun.kept, 0);
      assert.equal(sun.judgment, 'unconfirmed');
      assert.equal(mon.shift, 'day');
      assert.equal(mon.kept, 1);
      assert.equal(mon.judgment, 'present');
    }
    assert.equal(
      snapshot(SUN, morningOnly, profiles.foreignDefaultDay).rule,
      'directory_default_shift'
    );
    assert.equal(
      snapshot(SUN, morningOnly, profiles.foreignRecentDay).rule,
      'recent_7d_day_majority'
    );
  });

  it('최근 야간 다수여도 주간 신호만 있는 날은 주간이고, 겹침 아침은 일요일에 붙지 않는다', () => {
    const sun = snapshot(SUN, morningOnly, profiles.foreignRecentNight);
    const mon = snapshot(MON, morningAndAfternoon, profiles.foreignRecentNight);

    assert.equal(sun.shift, 'night');
    assert.equal(sun.rule, 'recent_7d_night_majority');
    assert.equal(sun.judgment, 'unconfirmed');
    assert.equal(sun.kept, 0);

    assert.equal(mon.shift, 'day');
    assert.equal(mon.rule, 'day_signals_over_recent_night');
    assert.equal(mon.judgment, 'present');
    assert.equal(mon.kept, 2);
    assert.equal(mon.daySignalCount, 2);
    assert.equal(mon.nightSignalCount, 0);
  });

  it('06:40 신호는 주간으로 확정된 월요일 행에 붙지 않는다', () => {
    const koreanMon = snapshot(MON, beforeDayWindow, profiles.korean);
    const openSun = snapshot(SUN, beforeDayWindow, profiles.foreignOpen);
    const openMon = snapshot(MON, beforeDayWindow, profiles.foreignOpen);

    assert.equal(koreanMon.kept, 0);
    assert.equal(koreanMon.judgment, 'unconfirmed');
    assert.equal(openSun.shift, 'night');
    assert.equal(openSun.kept, 1);
    assert.equal(openSun.clockInKst, '2026-10-25 20:00');
    assert.equal(openMon.kept, 0);
  });

  it('같은 패턴을 수요일/목요일에 두면 요일과 무관하게 같은 규칙이 나온다', () => {
    const thuMorning = [at(THU, '08:12')];
    const sun = snapshot(SUN, morningOnly, profiles.foreignOpen);
    const mon = snapshot(MON, morningOnly, profiles.foreignOpen);
    const wed = snapshot(WED, thuMorning, profiles.foreignOpen);
    const thu = snapshot(THU, thuMorning, profiles.foreignOpen);

    assert.equal(wed.shift, sun.shift);
    assert.equal(wed.rule, sun.rule);
    assert.equal(wed.judgment, sun.judgment);
    assert.equal(wed.kept, sun.kept);
    assert.equal(thu.shift, mon.shift);
    assert.equal(thu.rule, mon.rule);
    assert.equal(thu.kept, mon.kept);
    assert.equal(wed.judgment, 'unconfirmed');
    assert.equal(thu.clockInUtc, '2026-10-21 23:00');
  });
});

describe('추정출근 23:00', () => {
  it('정책 기본 출근은 08:00 또는 20:00이고 23:00은 없다', () => {
    for (const policy of ATTENDANCE_DEFAULT_POLICIES) {
      assert.notEqual(policy.work_start_time, '23:00');
      assert.ok(['08:00', '20:00'].includes(policy.work_start_time));
    }
  });

  it('주간 첫 신호가 08:00 이후이면 추정출근은 정책 08:00이고 UTC로는 전날 23:00이다', () => {
    const workDate = MON;
    const judged = judgeDay(workDate, morningAndAfternoon, {
      nationality: '한국',
      defaultShift: 'day',
      recentShifts: [],
    });
    const workStart = wallTimeOnWorkDate(workDate, '08:00');

    assert.equal(judged.shift, 'day');
    assert.equal(judged.judgment, 'present');
    assert.equal(judged.judgmentRationale.rule, RULE_KOREAN_DAY_FIXED);
    assert.equal(judged.estimatedClockIn, workStart.toISOString());
    assert.equal(kstWall(judged.estimatedClockIn), '2026-10-26 08:00');
    assert.equal(utcWall(judged.estimatedClockIn), '2026-10-25 23:00');
    assert.equal(kstWall(judged.firstSignalAt), '2026-10-26 08:52');
    assert.equal(utcWall(judged.firstSignalAt), '2026-10-25 23:52');
    assert.equal(kstWall(judged.lastSignalAt), '2026-10-26 17:22');
    assert.equal(utcWall(judged.lastSignalAt), '2026-10-26 08:22');
    assert.equal(judged.estimatedClockOut, judged.lastSignalAt);

    const snapped = resolveEstimatedClockIn(workStart, judged.firstSignalAt, 30);
    assert.equal(snapped.toISOString(), workStart.toISOString());
  });
});
