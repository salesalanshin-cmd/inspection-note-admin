import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ISSUE_NO_CLOCK_OUT,
  ISSUE_SATURDAY_UNKNOWN,
  buildAttendanceCard,
  cardStatusForRow,
  formatKstHm,
  groupConsecutiveDates,
  issueShortShift,
  resolveEmptyDayStatus,
} from '../lib/attendance/card.js';

const NIGHT_TIMES = {
  day: { start: '08:00', end: '17:00' },
  night: { start: '20:00', end: '08:00' },
};

function row(partial) {
  return {
    worker_name: '김다운',
    work_date: '2026-10-14',
    shift: 'night',
    judgment: 'present',
    estimated_clock_in: '2026-10-14T10:52:00.000Z',
    estimated_clock_out: '2026-10-14T23:00:00.000Z',
    is_ot: true,
    confidence: 'high',
    reviewed: false,
    signal_kinds: { rawCount: 5, mergedCount: 5, hadMerge: false, bundles: [] },
    flags: ['확인 필요'],
    ...partial,
  };
}

function card(partial) {
  return buildAttendanceCard({
    worker: {
      worker_name: '김다운',
      display_name: '김다운',
      default_shift: 'night',
      process: '주조',
    },
    month: '2026-10',
    today: '2026-10-29',
    coveredTo: '2026-10-24',
    attendanceRows: [],
    shiftTimes: NIGHT_TIMES,
    goods: [],
    defects: [],
    fives: [],
    ...partial,
  });
}

describe('KST clock display', () => {
  it('UTC 23:00 은 KST 08:00 이고 23:00 으로 보이지 않는다', () => {
    assert.equal(formatKstHm('2026-10-14T23:00:00.000Z'), '08:00');
    assert.equal(formatKstHm('2026-10-25T23:00:00.000Z'), '08:00');
    assert.equal(formatKstHm('2026-10-14T10:52:00.000Z'), '19:52');
    assert.equal(formatKstHm(null), null);
  });
});

describe('empty day status', () => {
  const coveredTo = '2026-10-24';
  const today = '2026-10-29';

  it('coveredTo 이전의 빈 날은 휴무다', () => {
    assert.equal(resolveEmptyDayStatus('2026-10-10', coveredTo, today), 'off');
    assert.equal(resolveEmptyDayStatus('2026-10-24', coveredTo, today), 'off');
  });

  it('coveredTo 다음 일요일은 휴무, 월~토는 재계산 대기, 오늘 이후는 future', () => {
    assert.equal(resolveEmptyDayStatus('2026-10-25', coveredTo, today), 'off');
    assert.equal(resolveEmptyDayStatus('2026-10-26', coveredTo, today), 'pending_recalc');
    assert.equal(resolveEmptyDayStatus('2026-10-29', coveredTo, today), 'pending_recalc');
    assert.equal(resolveEmptyDayStatus('2026-10-30', coveredTo, today), 'future');
    assert.equal(resolveEmptyDayStatus('2026-10-31', coveredTo, today), 'future');
  });

  it('회사 집계가 오늘보다 뒤면 그 사이 빈 날은 휴무다', () => {
    assert.equal(resolveEmptyDayStatus('2026-10-30', '2026-10-31', today), 'off');
  });

  it('기준일이 일요일이면 그날은 휴무다', () => {
    assert.equal(resolveEmptyDayStatus('2026-11-01', '2026-10-24', '2026-11-01'), 'off');
  });
});

describe('night worker card', () => {
  it('야간 시각·시간·이슈·집계를 저장값으로만 만든다', () => {
    const result = card({
      attendanceRows: [
        row({
          work_date: '2026-10-14',
          estimated_clock_in: '2026-10-14T10:52:00.000Z',
          estimated_clock_out: '2026-10-14T23:00:00.000Z',
          is_ot: true,
          confidence: 'high',
          signal_kinds: { rawCount: 8, mergedCount: 5, hadMerge: true },
        }),
        row({
          work_date: '2026-10-02',
          judgment: 'present',
          estimated_clock_in: '2026-10-02T11:00:00.000Z',
          estimated_clock_out: null,
          is_ot: false,
          confidence: 'medium',
          signal_kinds: { rawCount: 1, mergedCount: 1, hadMerge: false },
        }),
        row({
          work_date: '2026-10-21',
          estimated_clock_in: '2026-10-21T10:53:00.000Z',
          estimated_clock_out: '2026-10-21T15:01:00.000Z',
          is_ot: false,
          confidence: 'medium',
          signal_kinds: { rawCount: 2, mergedCount: 2, hadMerge: false },
        }),
        row({
          work_date: '2026-10-03',
          judgment: 'unconfirmed',
          estimated_clock_in: null,
          estimated_clock_out: null,
          is_ot: false,
          confidence: 'low',
          signal_kinds: { rawCount: 0, mergedCount: 0, hadMerge: false },
          flags: ['내국인 야간 신호, 확인 필요'],
        }),
        row({
          work_date: '2026-10-05',
          judgment: 'unconfirmed',
          estimated_clock_in: null,
          estimated_clock_out: null,
          is_ot: false,
          confidence: 'low',
          reviewed: true,
        }),
      ],
    });

    const byDate = new Map(result.days.map((day) => [day.date, day]));
    const fourteenth = byDate.get('2026-10-14');
    assert.equal(fourteenth.status, 'present');
    assert.equal(fourteenth.inAt, '19:52');
    assert.equal(fourteenth.outAt, '08:00');
    assert.equal(fourteenth.ot, true);
    assert.equal(fourteenth.hours, 12.1);
    assert.equal(fourteenth.signalCount, 5);
    assert.equal(fourteenth.confidence, 'high');

    assert.equal(byDate.get('2026-10-02').outAt, null);
    assert.equal(byDate.get('2026-10-02').hours, null);
    assert.equal(byDate.get('2026-10-21').inAt, '19:53');
    assert.equal(byDate.get('2026-10-21').outAt, '00:01');
    assert.equal(byDate.get('2026-10-21').hours, 4.1);
    assert.equal(byDate.get('2026-10-04').status, 'off');
    assert.equal(byDate.get('2026-10-25').status, 'off');
    assert.equal(byDate.get('2026-10-26').status, 'pending_recalc');
    assert.equal(byDate.get('2026-10-31').status, 'future');

    assert.equal(result.worker.shift, '야간');
    assert.equal(result.worker.shiftStart, '20:00');
    assert.equal(result.worker.shiftEnd, '08:00');
    assert.equal(result.worker.employeeNo, null);
    assert.equal(result.worker.name, '김다운');
    assert.deepEqual(result.coveredRange, { from: '2026-10-01', to: '2026-10-24' });
    assert.ok(result.pendingRecalcDates.includes('2026-10-26'));
    assert.ok(result.pendingRecalcDates.includes('2026-10-29'));
    assert.equal(result.pendingRecalcDates.includes('2026-10-25'), false);
    assert.equal(result.pendingRecalcDates.includes('2026-10-30'), false);

    assert.equal(result.summary.presentDays, 3);
    assert.equal(result.summary.unknownDays, 2);
    assert.equal(result.summary.recordedDays, 5);
    assert.equal(result.summary.otCount, 1);
    assert.equal(result.summary.mergedDays, 1);
    assert.equal(result.summary.reviewed, 1);
    assert.equal(result.summary.totalHours, 16.3);
    assert.deepEqual(result.summary.confidence, { high: 1, medium: 2, low: 2 });

    assert.deepEqual(result.issues, [
      { date: '2026-10-02', message: ISSUE_NO_CLOCK_OUT },
      { date: '2026-10-03', message: ISSUE_SATURDAY_UNKNOWN },
      { date: '2026-10-21', message: issueShortShift('00:01', '4.1') },
    ]);
    assert.equal(result.issues.some((item) => item.message.includes('내국인')), false);
    assert.equal(result.issues.some((item) => item.date === '2026-10-05'), false);
  });

  it('별칭이 있으면 제목에 쓰고 키는 worker_name 이다', () => {
    const result = card({
      worker: {
        worker_name: 'kim',
        display_name: '김다운',
        default_shift: 'night',
      },
      attendanceRows: [row({ worker_name: 'kim' })],
    });
    assert.equal(result.worker.id, 'kim');
    assert.equal(result.worker.name, '김다운');
  });
});

describe('sunday judgment display', () => {
  it('일요일 미확인은 휴무로 보이고 집계와 확인 필요에서 빠진다', () => {
    const sundayUnknown = row({
      work_date: '2026-10-04',
      judgment: 'unconfirmed',
      estimated_clock_in: '2026-10-04T11:00:00.000Z',
      estimated_clock_out: '2026-10-04T15:00:00.000Z',
      is_ot: false,
      confidence: 'low',
      signal_kinds: { rawCount: 1, mergedCount: 1, hadMerge: false },
      flags: ['내국인 야간 신호, 확인 필요'],
    });
    const result = card({
      today: '2026-11-08',
      coveredTo: '2026-10-31',
      attendanceRows: [
        sundayUnknown,
        row({
          work_date: '2026-10-11',
          judgment: 'present',
          estimated_clock_in: '2026-10-11T10:53:00.000Z',
          estimated_clock_out: '2026-10-11T15:01:00.000Z',
          is_ot: false,
          confidence: 'high',
          signal_kinds: { rawCount: 2, mergedCount: 2, hadMerge: false },
        }),
        row({
          work_date: '2026-10-03',
          judgment: 'unconfirmed',
          estimated_clock_in: null,
          estimated_clock_out: null,
          is_ot: false,
          confidence: 'low',
          signal_kinds: { rawCount: 0, mergedCount: 0, hadMerge: false },
        }),
      ],
    });

    const byDate = new Map(result.days.map((day) => [day.date, day]));
    assert.equal(cardStatusForRow('unconfirmed', '2026-10-04'), 'off');
    assert.equal(cardStatusForRow('present', '2026-10-11'), 'present');
    assert.equal(byDate.get('2026-10-04').status, 'off');
    assert.equal(byDate.get('2026-10-11').status, 'present');
    assert.equal(byDate.get('2026-10-03').status, 'unknown');
    assert.equal(sundayUnknown.judgment, 'unconfirmed');

    assert.equal(result.summary.presentDays, 1);
    assert.equal(result.summary.unknownDays, 1);
    assert.equal(result.summary.recordedDays, 2);
    assert.deepEqual(result.summary.confidence, { high: 1, medium: 0, low: 1 });
    assert.deepEqual(result.issues.map((item) => item.date), ['2026-10-03', '2026-10-11']);
    assert.equal(result.issues[1].message, issueShortShift('00:01', '4.1'));
  });
});

describe('day worker and sparse worker', () => {
  it('주간 출퇴근은 KST 로 같은 날 시각이고 8시간 이상이면 이슈가 없다', () => {
    const result = buildAttendanceCard({
      worker: { worker_name: '박주간', display_name: '', default_shift: 'day' },
      month: '2026-10',
      today: '2026-10-29',
      coveredTo: '2026-10-24',
      shiftTimes: NIGHT_TIMES,
      attendanceRows: [
        {
          worker_name: '박주간',
          work_date: '2026-10-07',
          shift: 'day',
          judgment: 'present',
          estimated_clock_in: '2026-10-06T23:00:00.000Z',
          estimated_clock_out: '2026-10-07T08:00:00.000Z',
          is_ot: false,
          confidence: 'high',
          reviewed: false,
          signal_kinds: { rawCount: 3, mergedCount: 3, hadMerge: false },
        },
      ],
    });
    const day = result.days.find((item) => item.date === '2026-10-07');
    assert.equal(result.worker.shift, '주간');
    assert.equal(result.worker.shiftStart, '08:00');
    assert.equal(result.worker.name, '박주간');
    assert.equal(day.inAt, '08:00');
    assert.equal(day.outAt, '17:00');
    assert.equal(day.hours, 9);
    assert.deepEqual(result.issues, []);
  });

  it('행이 거의 없어도 월 전체가 깨지지 않는다', () => {
    const result = card({
      worker: { worker_name: '신규', display_name: null, default_shift: 'day' },
      attendanceRows: [],
    });
    assert.equal(result.days.length, 31);
    assert.equal(result.summary.presentDays, 0);
    assert.equal(result.summary.recordedDays, 0);
    assert.equal(result.summary.totalHours, 0);
    assert.equal(result.summary.otCount, 0);
    assert.deepEqual(result.issues, []);
    assert.equal(result.inspection.total, 0);
    assert.equal(result.defects.length, 0);
    assert.equal(result.days.filter((day) => day.status === 'pending_recalc').length, 4);
    assert.equal(result.days.filter((day) => day.status === 'future').length, 2);
  });
});

describe('inspection denominator', () => {
  it('출근일과 촬영이 있는 날의 합집합이고 allOk 만 정상이다', () => {
    const goods = [
      { worker_name: '김다운', created_at: '2026-10-14T11:00:00.000Z' },
      { worker_name: '김다운', created_at: '2026-10-14T16:30:00.000Z' },
      { worker_name: '김다운', created_at: '2026-10-14T21:00:00.000Z' },
      { worker_name: '김다운', created_at: '2026-10-26T11:10:00.000Z' },
    ];
    const fives = [
      { worker_name: '김다운', created_at: '2026-10-09T12:00:00.000Z' },
    ];
    const result = card({
      attendanceRows: [
        row({ work_date: '2026-10-14' }),
        row({ work_date: '2026-10-21', signal_kinds: { mergedCount: 1, hadMerge: false } }),
        row({
          work_date: '2026-10-09',
          judgment: 'unconfirmed',
          estimated_clock_in: null,
          estimated_clock_out: null,
          is_ot: false,
          confidence: 'low',
        }),
      ],
      goods,
      fives,
      defects: [
        {
          worker_name: '김다운',
          created_at: '2026-10-14T11:30:00.000Z',
          defect_type: '기포',
        },
        {
          worker_name: '김다운',
          created_at: '2026-10-14T12:00:00.000Z',
          defect_type: '기포',
        },
        {
          worker_name: '다른사람',
          created_at: '2026-10-14T12:00:00.000Z',
          defect_type: '크랙',
        },
      ],
    });

    const dates = result.inspection.days.map((day) => day.date);
    assert.deepEqual(dates, ['2026-10-14', '2026-10-21', '2026-10-26']);
    assert.equal(result.inspection.total, 3);
    assert.equal(result.inspection.fullCompliantDays, 1);
    assert.equal(result.inspection.firstDone, 2);
    assert.equal(result.inspection.middleDone, 1);
    assert.equal(result.inspection.lastDone, 1);
    const full = result.inspection.days.find((day) => day.date === '2026-10-14');
    assert.deepEqual(
      { first: full.first, middle: full.middle, last: full.last },
      { first: true, middle: true, last: true }
    );
    const pending = result.inspection.days.find((day) => day.date === '2026-10-26');
    assert.equal(pending.first, true);
    assert.equal(pending.middle, false);
    assert.equal(result.days.find((day) => day.date === '2026-10-26').status, 'pending_recalc');
    assert.deepEqual(result.defects, [{ subtype: '기포', count: 2 }]);
  });
});

describe('pending range label', () => {
  it('이어진 재계산 대기를 한 구간으로 묶는다', () => {
    assert.deepEqual(groupConsecutiveDates(['2026-10-26', '2026-10-27', '2026-10-29']), [
      { from: '2026-10-26', to: '2026-10-27' },
      { from: '2026-10-29', to: '2026-10-29' },
    ]);
  });
});
