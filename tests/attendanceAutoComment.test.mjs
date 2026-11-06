import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAttendanceAutoComment } from '../lib/attendance/autoComment.js';
import { attendanceRowsForExcel } from '../lib/attendance/excel.js';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import { buildAttendanceUpsertRow } from '../lib/attendance/upsertRow.js';

const LAST = '2026-11-06T09:40:00.000Z';
const IN_0840 = '2026-11-05T23:40:00.000Z';
const START_0800 = '2026-11-05T23:00:00.000Z';
const OUT_1730 = '2026-11-06T08:30:00.000Z';

describe('buildAttendanceAutoComment', () => {
  it('퇴근 신호가 없으면 마지막 활동 흔적을 한 문장으로 적는다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [
        { type: 'fives', at: '2026-11-06T00:00:00.000Z' },
        { type: 'fives', at: '2026-11-06T03:00:00.000Z' },
        { type: 'frequent', at: LAST },
      ],
      bundles: [
        { type: 'fives', at: '2026-11-06T00:00:00.000Z', bundleSize: 2 },
        { type: 'frequent', at: LAST, bundleSize: 1 },
      ],
      clockOutAt: null,
      lastSignalAt: LAST,
    });
    assert.equal(
      result.autoComment,
      '퇴근 기록은 없지만 18:40까지 활동 흔적(3정5S 2건, 자주검사 1건)이 있어 그 무렵까지 근무한 것으로 보임'
    );
    assert.deepEqual(result.flags, []);
  });

  it('묶음이 하나면 확인 문장과 single_signal을 붙인다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [{ type: 'frequent', at: LAST }],
      bundles: [{ type: 'frequent', at: LAST, bundleSize: 1 }],
      clockOutAt: null,
      lastSignalAt: LAST,
    });
    assert.equal(
      result.autoComment,
      '퇴근 기록은 없지만 18:40까지 활동 흔적(자주검사 1건)이 있어 그 무렵까지 근무한 것으로 보임 · 활동 기록이 1건뿐이라 출·퇴근 확인이 필요함'
    );
    assert.deepEqual(result.flags, ['single_signal']);
  });

  it('출근이 정책 시작보다 늦으면 보정 문장을 적고, 이미 있으면 다시 적지 않는다', () => {
    const input = {
      rawSignals: [
        { type: 'frequent', at: IN_0840 },
        { type: 'fives', at: OUT_1730 },
      ],
      bundles: [
        { type: 'frequent', at: IN_0840, bundleSize: 1 },
        { type: 'fives', at: OUT_1730, bundleSize: 1 },
      ],
      clockInAt: IN_0840,
      clockOutAt: OUT_1730,
      lastSignalAt: OUT_1730,
      estimatedClockIn: START_0800,
      policyStartHm: '08:00',
    };
    const once = buildAttendanceAutoComment(input);
    assert.equal(once.autoComment, '출근 신호는 08:40이며 정책 시작 08:00으로 보정');
    const twice = buildAttendanceAutoComment({ ...input, existingText: once.autoComment });
    assert.equal(twice.autoComment, '');
  });

  it('퇴근 정시 보정은 코멘트에 넣지 않는다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [
        { type: 'frequent', at: START_0800 },
        { type: 'fives', at: '2026-11-06T07:53:00.000Z' },
      ],
      bundles: [
        { type: 'frequent', at: START_0800, bundleSize: 1 },
        { type: 'fives', at: '2026-11-06T07:53:00.000Z', bundleSize: 1 },
      ],
      clockInAt: START_0800,
      clockOutAt: '2026-11-06T07:53:00.000Z',
      lastSignalAt: '2026-11-06T07:53:00.000Z',
      estimatedClockIn: START_0800,
      policyStartHm: '08:00',
      clockOutAdjusted: true,
    });
    assert.equal(result.autoComment, '');
    assert.equal(result.autoComment.includes('정시'), false);
  });

  it('문서 스캔만 있으면 그 문장만 남긴다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [
        { type: 'document', at: IN_0840 },
        { type: 'document', at: OUT_1730 },
      ],
      bundles: [
        { type: 'document', at: IN_0840, bundleSize: 1 },
        { type: 'document', at: OUT_1730, bundleSize: 1 },
      ],
      clockInAt: IN_0840,
      clockOutAt: OUT_1730,
      lastSignalAt: OUT_1730,
      estimatedClockIn: IN_0840,
      policyStartHm: '08:00',
    });
    assert.equal(result.autoComment, '문서 스캔 기록만 있음');
  });

  it('출근·퇴근이 있고 특이사항이 없으면 빈 문자열이다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [
        { type: 'frequent', at: START_0800 },
        { type: 'fives', at: OUT_1730 },
      ],
      bundles: [
        { type: 'frequent', at: START_0800, bundleSize: 1 },
        { type: 'fives', at: OUT_1730, bundleSize: 1 },
      ],
      clockInAt: START_0800,
      clockOutAt: OUT_1730,
      lastSignalAt: OUT_1730,
      estimatedClockIn: START_0800,
      policyStartHm: '08:00',
    });
    assert.equal(result.autoComment, '');
    assert.deepEqual(result.flags, []);
  });

  it('겹치면 우선순위 높은 두 문장만 잇고 나머지는 뺀다', () => {
    const result = buildAttendanceAutoComment({
      rawSignals: [{ type: 'document', at: LAST }],
      bundles: [{ type: 'document', at: LAST, bundleSize: 1 }],
      clockInAt: LAST,
      clockOutAt: null,
      lastSignalAt: LAST,
      estimatedClockIn: START_0800,
      policyStartHm: '08:00',
    });
    assert.equal(
      result.autoComment,
      '퇴근 기록은 없지만 18:40까지 활동 흔적(문서스캔 1건)이 있어 그 무렵까지 근무한 것으로 보임 · 활동 기록이 1건뿐이라 출·퇴근 확인이 필요함'
    );
    assert.equal(result.autoComment.includes('문서 스캔 기록만 있음'), false);
    assert.equal(result.autoComment.includes('정책 시작'), false);
    assert.deepEqual(result.flags, ['single_signal']);
  });
});

describe('judgeAttendance 코멘트', () => {
  const policy = {
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
  const workDate = '2026-10-21';

  it('코멘트를 붙여도 조·출근·퇴근·OT는 그대로다', () => {
    const clockIn = wallTimeOnWorkDate(workDate, '08:40').toISOString();
    const clockOut = wallTimeOnWorkDate(workDate, '17:30').toISOString();
    const judged = judgeAttendance({
      workDate,
      signals: [
        { type: 'frequent', at: clockIn },
        { type: 'fives', at: clockOut },
      ],
      policy,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(judged.judgment, 'present');
    assert.equal(judged.shift, 'day');
    assert.equal(judged.isOt, false);
    assert.equal(judged.estimatedClockIn, wallTimeOnWorkDate(workDate, '08:00').toISOString());
    assert.equal(judged.estimatedClockOut, clockOut);
    assert.equal(judged.judgmentRationale.autoComment, '출근 신호는 08:40이며 정책 시작 08:00으로 보정');
    assert.equal(judged.flags.includes('single_signal'), false);
  });

  it('묶음 하나의 single_signal은 근거에만 있고 판정 플래그 목록에는 없다', () => {
    const at = wallTimeOnWorkDate(workDate, '10:00').toISOString();
    const judged = judgeAttendance({
      workDate,
      signals: [{ type: 'frequent', at }],
      policy,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(judged.estimatedClockOut, null);
    assert.equal(judged.isOt, false);
    assert.equal(judged.judgmentRationale.flags.includes('single_signal'), true);
    assert.equal(judged.flags.includes('single_signal'), false);
    assert.equal(judged.judgmentRationale.autoComment.includes('활동 기록이 1건뿐이라'), true);
  });
});

describe('확정 행과 엑셀 비고', () => {
  it('확정 행은 판정 근거를 유지하고 코멘트만 바꾼다', () => {
    const workDate = '2026-10-21';
    const judged = judgeAttendance({
      workDate,
      signals: [{ type: 'frequent', at: wallTimeOnWorkDate(workDate, '10:00').toISOString() }],
      policy: {
        shift: 'day',
        work_start_time: '08:00',
        work_end_time: '17:00',
        ot_threshold_time: '18:00',
        ot_end_time: '20:00',
        window_start_time: '07:00',
        window_end_time: '20:30',
      },
      nationality: '한국',
      defaultShift: 'day',
    });
    const prev = {
      reviewed: true,
      judgment: 'present',
      shift: 'day',
      estimated_clock_in: wallTimeOnWorkDate(workDate, '08:00').toISOString(),
      estimated_clock_out: wallTimeOnWorkDate(workDate, '17:00').toISOString(),
      is_ot: false,
      judgment_rationale: { shift: 'day', rule: 'manual_override', flags: ['기존'] },
      flags: ['기존'],
    };
    const row = buildAttendanceUpsertRow({
      companyId: 'c1',
      workDate,
      workerName: '김',
      judged,
      prev,
    });
    assert.equal(row.shift, 'day');
    assert.equal(row.judgment, 'present');
    assert.equal(row.estimated_clock_in, prev.estimated_clock_in);
    assert.equal(row.estimated_clock_out, prev.estimated_clock_out);
    assert.equal(row.is_ot, false);
    assert.equal(row.judgment_rationale.rule, 'manual_override');
    assert.equal(row.judgment_rationale.shift, 'day');
    assert.equal(row.judgment_rationale.autoComment, judged.judgmentRationale.autoComment);
    assert.deepEqual(row.judgment_rationale.flags, ['기존', 'single_signal']);
    assert.deepEqual(row.flags, ['기존']);
  });

  it('엑셀 비고는 기존 문구 뒤에 코멘트를 붙인다', () => {
    const excel = attendanceRowsForExcel([
      {
        judgment_rationale: {
          clockOutAdjusted: true,
          clockOutAt: '2026-10-26T07:53:00.000Z',
          autoComment: '문서 스캔 기록만 있음',
        },
      },
    ]);
    assert.equal(excel[0].비고, '퇴근 정시 보정(원래 16:53) 문서 스캔 기록만 있음');
  });
});
