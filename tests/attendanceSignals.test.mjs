import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { judgeAttendance, wallTimeOnWorkDate } from '../lib/attendance/judge.js';
import { collectSignalsForWorkDate } from '../lib/attendance/signals.js';
import { attendanceRowsForExcel } from '../lib/attendance/excel.js';
import { fetchAllPages } from '../lib/attendance/pagedQuery.js';
import { formatSignalListLabel } from '../lib/attendance/signalUtils.js';

const WORK_DATE = '2026-10-21';
const COMPANY_ID = 'company-1';

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

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

function at(hm, extraMs = 0) {
  const base = wallTimeOnWorkDate(WORK_DATE, hm);
  return new Date(base.getTime() + extraMs).toISOString();
}

/**
 * 필터 → 시각·id 정렬 → range 를 적용하는 최소 쿼리.
 * from() 호출마다 새 빌더라 페이지가 서로 상태를 공유하지 않는다.
 */
function createClient(tables) {
  return {
    from(table) {
      const state = { filters: [], orders: [], range: null };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          state.filters.push((row) => row[col] === val);
          return api;
        },
        gte(col, val) {
          state.filters.push((row) => String(row[col]) >= String(val));
          return api;
        },
        lt(col, val) {
          state.filters.push((row) => String(row[col]) < String(val));
          return api;
        },
        or(expr) {
          if (expr === NOT_DELETED) {
            state.filters.push(
              (row) => row.is_deleted === false || row.is_deleted == null
            );
          }
          return api;
        },
        order(col, opts = {}) {
          state.orders.push({ col, asc: opts.ascending !== false });
          return api;
        },
        range(from, to) {
          state.range = [from, to];
          return api;
        },
        then(resolve, reject) {
          let rows = (tables[table] || []).filter((row) =>
            state.filters.every((fn) => fn(row))
          );
          if (state.orders.length) {
            rows = [...rows].sort((a, b) => {
              for (const order of state.orders) {
                if (a[order.col] < b[order.col]) return order.asc ? -1 : 1;
                if (a[order.col] > b[order.col]) return order.asc ? 1 : -1;
              }
              return 0;
            });
          }
          if (state.range) {
            const [from, to] = state.range;
            rows = rows.slice(from, to + 1);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

describe('문서 스캔 신호', () => {
  it('아침 문서 스캔 한 장만 있어도 출근', () => {
    const morning = at('08:30');
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [{ type: 'document', at: morning, sourceId: 'ocr-1' }],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.clockOutConfirmed, false);
    assert.equal(r.signalKinds.bundles[0].type, 'document');
    assert.equal(r.judgmentRationale.clockInAt, morning);
    assert.equal(formatSignalListLabel(r.signalKinds), '문서스캔');

    const excel = attendanceRowsForExcel([
      {
        work_date: WORK_DATE,
        worker_name: '김철수',
        shift: r.shift,
        judgment: r.judgment,
        signal_kinds: r.signalKinds,
        flags: r.flags,
      },
    ]);
    assert.equal(excel[0].신호목록, '문서스캔');
  });

  it('표시명 별칭은 연결되고, 매칭 실패·빈 이름·삭제·다른 회사는 제외', async () => {
    const morning = at('08:30');
    const supabase = createClient({
      ocr_results: [
        {
          id: 'alias',
          company_id: COMPANY_ID,
          worker_name: '철수',
          created_at: morning,
          is_deleted: false,
        },
        {
          id: 'unknown',
          company_id: COMPANY_ID,
          worker_name: '없는사람',
          created_at: morning,
          is_deleted: false,
        },
        {
          id: 'blank',
          company_id: COMPANY_ID,
          worker_name: '  ',
          created_at: morning,
          is_deleted: false,
        },
        {
          id: 'deleted',
          company_id: COMPANY_ID,
          worker_name: '김철수',
          created_at: morning,
          is_deleted: true,
        },
        {
          id: 'other-company',
          company_id: 'other',
          worker_name: '김철수',
          created_at: morning,
          is_deleted: false,
        },
      ],
    });
    const directory = [{ worker_name: '김철수', display_name: '철수' }];
    const warn = console.warn;
    console.warn = () => {};
    try {
      const byWorker = await collectSignalsForWorkDate(
        supabase,
        COMPANY_ID,
        WORK_DATE,
        directory
      );
      assert.deepEqual([...byWorker.keys()], ['김철수']);
      const signals = byWorker.get('김철수');
      assert.equal(signals.length, 1);
      assert.equal(signals[0].type, 'document');
      assert.equal(signals[0].sourceId, 'alias');
      assert.equal(signals[0].at, morning);
    } finally {
      console.warn = warn;
    }
  });

  it('문서 스캔은 10분 안에 병합되고, 다른 신호와 60분 이상 떨어지면 퇴근', () => {
    const clockIn = at('08:00');
    const merged = at('08:05');
    const clockOut = at('17:30');
    const r = judgeAttendance({
      workDate: WORK_DATE,
      signals: [
        { type: 'document', at: clockIn, sourceId: 'd1' },
        { type: 'document', at: merged, sourceId: 'd2' },
        { type: 'fives', at: clockOut, sourceId: 'f1' },
      ],
      policy: POLICY_DAY,
      nationality: '한국',
      defaultShift: 'day',
    });
    assert.equal(r.judgment, 'present');
    assert.equal(r.signalKinds.rawCount, 3);
    assert.equal(r.signalKinds.mergedCount, 2);
    assert.equal(r.signalKinds.hadMerge, true);
    assert.equal(r.signalKinds.bundles[0].type, 'document');
    assert.equal(r.signalKinds.bundles[0].bundleSize, 2);
    assert.equal(r.signalKinds.bundles[0].at, clockIn);
    assert.equal(r.signalKinds.bundles[1].type, 'fives');
    assert.equal(r.judgmentRationale.clockInAt, clockIn);
    assert.equal(r.judgmentRationale.clockOutAt, clockOut);
    assert.equal(r.clockOutConfirmed, true);
    assert.equal(formatSignalListLabel(r.signalKinds), '문서스캔×2, 3정5S');
  });
});

describe('fetchAllPages', () => {
  it('2500행을 1000행씩 모두 가져오고 중복이 없다', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `id-${String(i).padStart(4, '0')}`,
      created_at: new Date(Date.UTC(2026, 9, 21, 0, 0, Math.floor(i / 2))).toISOString(),
    }));
    for (let i = rows.length - 1; i > 0; i -= 1) {
      const j = (i * 17) % (i + 1);
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    let calls = 0;
    const { rows: fetched, error, truncated } = await fetchAllPages(
      () => {
        calls += 1;
        return createClient({ scans: rows }).from('scans');
      },
      { timeColumn: 'created_at', label: 'scans' }
    );

    assert.equal(error, null);
    assert.equal(truncated, false);
    assert.equal(calls, 3);
    assert.equal(fetched.length, 2500);
    assert.equal(new Set(fetched.map((row) => row.id)).size, 2500);
    for (let i = 1; i < fetched.length; i += 1) {
      const prev = fetched[i - 1];
      const cur = fetched[i];
      const timeOrder = prev.created_at <= cur.created_at;
      const idOrder = prev.created_at < cur.created_at || prev.id < cur.id;
      assert.equal(timeOrder && idOrder, true);
    }
  });

  it('페이지 상한에 도달하면 모은 행만 반환하고 경고한다', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `id-${String(i).padStart(4, '0')}`,
      created_at: new Date(Date.UTC(2026, 9, 21, 0, 0, i)).toISOString(),
    }));
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
      const { rows: fetched, truncated } = await fetchAllPages(
        () => createClient({ scans: rows }).from('scans'),
        { timeColumn: 'created_at', label: 'scans', maxPages: 2 }
      );
      assert.equal(truncated, true);
      assert.equal(fetched.length, 2000);
      assert.equal(warnings.length, 1);
      assert.match(String(warnings[0][0]), /scans/);
      assert.match(String(warnings[0][0]), /상한/);
    } finally {
      console.warn = warn;
    }
  });
});
