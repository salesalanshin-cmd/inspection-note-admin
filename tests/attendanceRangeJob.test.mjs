import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attendanceRangeDates,
  buildAttendanceRecomputeBody,
  formatRangeJobStatus,
  runAttendanceRangeRecompute,
} from '../lib/attendance/rangeJob.js';

describe('attendanceRangeDates', () => {
  it('시작일부터 오름차순이고 32일은 거절한다', () => {
    const dates = attendanceRangeDates('2026-10-18', '2026-10-20');
    assert.equal(dates.ok, true);
    assert.deepEqual(dates.dates, ['2026-10-18', '2026-10-19', '2026-10-20']);

    const over = attendanceRangeDates('2026-10-01', '2026-11-01');
    assert.equal(over.ok, false);
    assert.deepEqual(over.dates, []);
    assert.match(over.message, /31일/);
  });
});

describe('buildAttendanceRecomputeBody', () => {
  it('확인 완료 행을 덮어쓰는 옵션을 넣지 않는다', () => {
    const body = buildAttendanceRecomputeBody('2026-10-26');
    assert.deepEqual(body, { workDate: '2026-10-26' });
    assert.equal(Object.hasOwn(body, 'overwriteReviewed'), false);
  });
});

describe('runAttendanceRangeRecompute', () => {
  it('날짜 순서대로 호출하고 실패한 날 뒤도 계속한다', async () => {
    const calls = [];
    const seen = [];
    const result = await runAttendanceRangeRecompute({
      dates: ['2026-10-18', '2026-10-19', '2026-10-20'],
      onProgress: (progress) => seen.push(progress.index),
      recomputeDay: async (workDate) => {
        calls.push(workDate);
        if (workDate === '2026-10-19') throw new Error('신호 조회 실패');
      },
    });
    assert.deepEqual(calls, ['2026-10-18', '2026-10-19', '2026-10-20']);
    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(result.cancelled, false);
    assert.equal(result.processed, 3);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].workDate, '2026-10-19');
    assert.match(result.failed[0].error, /신호 조회 실패/);
    assert.match(
      formatRangeJobStatus({
        phase: 'running',
        index: 2,
        total: 3,
        workDate: '2026-10-19',
        failed: [],
      }),
      /2\/3일 처리 중/
    );
    assert.match(
      formatRangeJobStatus({
        phase: 'done',
        total: 3,
        processed: 3,
        failed: result.failed,
      }),
      /2\/3일 완료/
    );
    assert.match(
      formatRangeJobStatus({
        phase: 'done',
        total: 3,
        processed: 3,
        failed: result.failed,
      }),
      /2026-10-19/
    );
  });

  it('중단하면 남은 날짜는 호출하지 않는다', async () => {
    const controller = new AbortController();
    const calls = [];
    const result = await runAttendanceRangeRecompute({
      dates: ['2026-10-18', '2026-10-19', '2026-10-20'],
      signal: controller.signal,
      recomputeDay: async (workDate) => {
        calls.push(workDate);
        if (workDate === '2026-10-18') controller.abort();
      },
    });
    assert.deepEqual(calls, ['2026-10-18']);
    assert.equal(result.cancelled, true);
    assert.equal(result.processed, 1);
    assert.match(
      formatRangeJobStatus({
        cancelled: true,
        processed: 1,
        total: 3,
        failed: [],
      }),
      /중단됨/
    );
  });
});
