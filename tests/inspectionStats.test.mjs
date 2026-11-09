import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getWorkDateForRecord } from '../lib/analytics.js';
import { kstWallToUtc } from '../lib/kst.js';
import {
  activeFinishes,
  buildDailyStats,
  buildDefectPareto,
  buildInspectionReport,
  buildMergedDailyStats,
  buildMergedPareto,
  buildPhotoDaily,
  buildWeeklyStats,
  buildWorkReport,
  defectRate,
  isTestWorkerName,
  bucketInspectionDays,
  countWorkerNames,
  ocrDefectParts,
  ocrQuantities,
  paretoFromInspectionLines,
  photoWorkdayOf,
  previousWindow,
  resolveInspectionWindow,
  splitWorkerNames,
  summarizeInspectionPeriod,
  withWeekSource,
  workdayBounds,
} from '../lib/inspectionStats.js';

function at(day, hours, minutes = 0) {
  return kstWallToUtc(2026, 10, day, hours, minutes, 0).toISOString();
}

const lots = new Map([
  ['L1', { lot_id: 'L1', item_id: 'D098010', item_name: '브라켓' }],
  ['L2', { lot_id: 'L2', item_id: 'D100', item_name: '커버' }],
]);

describe('workday', () => {
  it('08:00 경계는 기존 근무일 유틸과 같다', () => {
    const before = at(8, 7, 59);
    const onTime = at(8, 8, 0);
    assert.equal(getWorkDateForRecord(before), '2026-11-07');
    assert.equal(getWorkDateForRecord(onTime), '2026-11-08');
    const bounds = workdayBounds('2026-11-08', '2026-11-08');
    assert.equal(bounds.start.toISOString(), onTime);
    assert.ok(new Date(before) < bounds.start);
    assert.equal(new Date(at(9, 8, 0)).getTime(), bounds.end.getTime());
  });
});

describe('finish aggregation', () => {
  const events = [
    {
      id: 's1',
      event_type: 'start',
      occurred_at: at(8, 9),
      worker_name: '김철수',
    },
    {
      id: 'f1',
      event_type: 'finish',
      occurred_at: at(8, 18),
      process_code: 'IN',
      lot_id: 'L1',
      worker_name: '김철수',
      qty_good: 8,
      qty_defect: 2,
      defect_breakdown: [{ code: 'A', qty: 2 }],
      start_event_id: 's1',
    },
    {
      id: 'c1',
      event_type: 'cancel',
      cancels_event_id: 'f1',
      occurred_at: at(8, 19),
    },
    {
      id: 'f2',
      event_type: 'finish',
      occurred_at: at(8, 7, 30),
      process_code: 'DC',
      lot_id: 'L2',
      worker_name: '박주간',
      qty_good: null,
      qty_defect: 0,
      defect_breakdown: [],
      start_event_id: null,
    },
    {
      id: 'f3',
      event_type: 'finish',
      occurred_at: at(9, 10),
      process_code: 'IN',
      lot_id: 'L1',
      worker_name: '신성호_test',
      qty_good: 5,
      qty_defect: 5,
      defect_breakdown: [{ code: 'B', qty: 5 }],
      start_event_id: null,
    },
    {
      id: 'f4',
      event_type: 'finish',
      occurred_at: at(8, 21),
      process_code: 'GR',
      lot_id: 'L1',
      worker_name: '김철수',
      qty_good: 3,
      qty_defect: 1,
      defect_breakdown: [{ code: 'A', qty: 1 }],
      start_event_id: null,
    },
  ];

  it('취소된 종료와 테스트 계정을 빼고, 분모 0이면 불량률은 null이다', () => {
    assert.equal(isTestWorkerName('신성호_test'), true);
    assert.equal(isTestWorkerName('김철수'), false);
    assert.equal(defectRate(1, 0), null);
    assert.equal(defectRate(1, 4), 0.25);
    const active = activeFinishes(events);
    assert.deepEqual(active.map((row) => row.id), ['f2', 'f4']);
    const daily = buildDailyStats(events, {
      from: '2026-11-07',
      to: '2026-11-09',
      lotsById: lots,
    });
    assert.deepEqual(daily, [
      {
        workday: '2026-11-07',
        inspectedQty: 0,
        defectQty: 0,
        defectRate: null,
        perfCount: 1,
      },
      {
        workday: '2026-11-08',
        inspectedQty: 4,
        defectQty: 1,
        defectRate: 0.25,
        perfCount: 1,
      },
    ]);
  });

  it('공정과 품번으로 거르고, 테스트 계정을 포함할 수 있다', () => {
    const included = buildDailyStats(events, {
      from: '2026-11-09',
      to: '2026-11-09',
      process: 'IN',
      item: 'D098010',
      excludeTestWorkers: false,
      lotsById: lots,
    });
    assert.equal(included.length, 1);
    assert.equal(included[0].inspectedQty, 10);
    assert.equal(included[0].defectQty, 5);
    const otherItem = buildDailyStats(events, {
      from: '2026-11-09',
      to: '2026-11-09',
      item: '없는품번',
      excludeTestWorkers: false,
      lotsById: lots,
    });
    assert.deepEqual(otherItem, []);
  });

  it('파레토는 수량 내림차순이고 누적비의 마지막은 1이다', () => {
    const pareto = buildDefectPareto(events, {
      from: '2026-11-07',
      to: '2026-11-09',
      excludeTestWorkers: false,
      lotsById: lots,
      defectNames: new Map([['A', '긁힘'], ['B', '치수']]),
    });
    assert.deepEqual(pareto.map((row) => row.code), ['B', 'A']);
    assert.equal(pareto[0].name, '치수');
    assert.equal(pareto[0].qty, 5);
    assert.equal(pareto[1].qty, 1);
    assert.equal(pareto[0].ratio, 5 / 6);
    assert.equal(pareto[1].cumRatio, 1);
  });

  it('주 합계는 일별 수량을 더하고 불량률을 다시 계산한다', () => {
    const daily = buildDailyStats(events, {
      from: '2026-11-07',
      to: '2026-11-09',
      excludeTestWorkers: false,
      lotsById: lots,
    });
    const weeks = buildWeeklyStats(daily);
    const totalInspected = daily.reduce((sum, day) => sum + day.inspectedQty, 0);
    const totalDefect = daily.reduce((sum, day) => sum + day.defectQty, 0);
    const summed = weeks.reduce((sum, week) => sum + week.inspectedQty, 0);
    assert.equal(summed, totalInspected);
    assert.equal(weeks.reduce((sum, week) => sum + week.defectQty, 0), totalDefect);
    assert.ok(weeks.every((week) => week.defectRate === defectRate(week.defectQty, week.inspectedQty)));
  });
});

describe('photos and work report', () => {
  it('사진 근무일은 저장된 work_date 를 우선하고 삭제 건은 사진 수에서 뺀다', () => {
    const rows = buildPhotoDaily([
      { worker_name: '김철수', work_date: '2026-11-08', created_at: at(7, 12), is_deleted: false },
      { worker_name: '김철수', work_date: null, created_at: at(8, 7, 59), is_deleted: false },
      { worker_name: '김철수', work_date: '2026-11-08', created_at: at(8, 12), is_deleted: true },
      { worker_name: '신성호_test', work_date: '2026-11-08', created_at: at(8, 12), is_deleted: false },
    ], { from: '2026-11-07', to: '2026-11-08' });
    assert.equal(photoWorkdayOf({ work_date: '2026-11-08', created_at: at(7, 12) }), '2026-11-08');
    assert.deepEqual(rows, [
      { workday: '2026-11-07', photoCount: 1, deletedCount: 0 },
      { workday: '2026-11-08', photoCount: 1, deletedCount: 1 },
    ]);
  });

  it('작업일보는 종료 한 줄과 사진 건수를 나누고 착수 시각을 붙인다', () => {
    const report = buildWorkReport({
      workday: '2026-11-08',
      events: [
        {
          id: 'f1',
          event_type: 'finish',
          occurred_at: at(8, 18),
          process_code: 'IN',
          lot_id: 'L1',
          worker_name: '김철수',
          qty_good: 8,
          qty_defect: 2,
          defect_breakdown: [{ code: 'A', qty: 2 }],
          start_event_id: 's1',
        },
      ],
      photos: [
        { id: 'p1', worker_name: '김철수', work_date: '2026-11-08', is_deleted: false },
        { id: 'p2', worker_name: '김철수', work_date: '2026-11-08', is_deleted: true },
      ],
      lotsById: lots,
      startsById: new Map([['s1', { id: 's1', occurred_at: at(8, 9) }]]),
      processNames: new Map([['IN', '검사']]),
      defectNames: new Map([['A', '긁힘']]),
    });
    assert.equal(report.inspectedQty, 10);
    assert.equal(report.defectQty, 2);
    assert.equal(report.photoCount, 1);
    assert.equal(report.lines[0].processName, '검사');
    assert.equal(report.lines[0].itemName, '브라켓');
    assert.equal(report.lines[0].startedAt, at(8, 9));
    assert.equal(report.lines[0].defectBreakdown[0].name, '긁힘');
    assert.equal(report.byProcess[0].name, '검사');
  });
});

describe('ocr inspection source', () => {
  it('최종검사는 양품과 불량을 더하고, 공용 작업일보는 작업수량을 검사수량으로 본다', () => {
    assert.deepEqual(ocrQuantities({ qty: 8, defect_qty: 2, qty_kind: 'good' }), {
      good: 8,
      defect: 2,
      inspected: 10,
    });
    assert.deepEqual(ocrQuantities({ qty: 10, defect_qty: 4, qty_kind: 'work' }), {
      inspected: 10,
      defect: 4,
      good: 6,
    });
    assert.equal(ocrQuantities({ qty: null, defect_qty: 1, qty_kind: 'good' }), null);
  });

  it('불량유형은 code가 없으면 raw_code를 쓴다', () => {
    assert.deepEqual(ocrDefectParts([
      { code: 'A01', raw_code: 'A0I', qty: 2 },
      { code: null, raw_code: '긁힘', qty: 1 },
      { code: '', raw_code: '', qty: 3 },
    ]), [
      { code: 'A01', qty: 2 },
      { code: '긁힘', qty: 1 },
    ]);
  });

  it('앱 IN 실적이 있는 날은 앱만 쓰고, 없는 날은 OCR을 쓴다', () => {
    const events = [
      {
        id: 'f1',
        event_type: 'finish',
        occurred_at: at(8, 18),
        process_code: 'IN',
        lot_id: 'L1',
        worker_name: '김철수',
        qty_good: 8,
        qty_defect: 2,
        defect_breakdown: [{ code: 'A', qty: 2 }],
      },
      {
        id: 'f-gr',
        event_type: 'finish',
        occurred_at: at(7, 18),
        process_code: 'GR',
        lot_id: 'L1',
        worker_name: '김철수',
        qty_good: 1,
        qty_defect: 0,
        defect_breakdown: [],
      },
    ];
    const ocrRows = [
      {
        id: 'o1',
        process_code: 'IN',
        is_duplicate: false,
        work_date: '2026-11-08',
        qty: 100,
        qty_kind: 'good',
        defect_qty: 1,
        defect_breakdown: [{ code: 'B', qty: 1 }],
        needs_review: false,
      },
      {
        id: 'o2',
        process_code: 'IN',
        is_duplicate: false,
        work_date: '2026-11-07',
        qty: 10,
        qty_kind: 'work',
        defect_qty: 4,
        defect_breakdown: [{ code: null, raw_code: 'B', qty: 4 }],
        needs_review: true,
        sheet_worker: '박주간',
      },
      {
        id: 'memo',
        process_code: 'IN',
        is_duplicate: false,
        work_date: '2026-11-07',
        qty: null,
        qty_kind: 'work',
        defect_qty: 0,
        task_note: '선별',
        needs_review: true,
      },
    ];
    const daily = buildMergedDailyStats(events, ocrRows, {
      from: '2026-11-07',
      to: '2026-11-08',
      lotsById: lots,
    });
    const day7 = daily.find((row) => row.workday === '2026-11-07');
    const day8 = daily.find((row) => row.workday === '2026-11-08');
    assert.equal(day8.source, 'app');
    assert.equal(day8.inspectedQty, 10);
    assert.equal(day8.defectQty, 2);
    assert.equal(day7.source, 'ocr');
    assert.equal(day7.inspectedQty, 11);
    assert.equal(day7.defectQty, 4);

    const pareto = buildMergedPareto(events, ocrRows, {
      from: '2026-11-07',
      to: '2026-11-08',
      lotsById: lots,
      defectNames: new Map([['A', '긁힘']]),
    });
    assert.deepEqual(pareto.map((row) => [row.code, row.qty]), [['B', 4], ['A', 2]]);

    const weeks = withWeekSource(daily, buildWeeklyStats(daily));
    assert.equal(weeks.length, 1);
    assert.equal(weeks[0].source, undefined);

    const report = buildInspectionReport({
      workday: '2026-11-07',
      events,
      ocrRows,
      lotsById: lots,
      defectNames: new Map([['B', '치수']]),
    });
    assert.equal(report.source, 'ocr');
    assert.equal(report.lines.length, 2);
    assert.equal(report.lines.find((line) => line.id === 'memo').memoOnly, true);
    assert.equal(report.lines.find((line) => line.id === 'o2').reviewed, false);
    assert.equal(report.lines.find((line) => line.id === 'o2').defectBreakdown[0].name, '치수');
    assert.equal(report.inspectedQty, 10);
    assert.equal(report.qtyGood, 6);
    assert.equal(report.defectQty, 4);
    assert.equal(report.workerCount, 1);
    assert.equal(report.topDefects[0].code, 'B');

    const appDay = buildInspectionReport({
      workday: '2026-11-08',
      events,
      ocrRows,
      lotsById: lots,
      startsById: new Map([['s1', { occurred_at: at(8, 9) }]]),
    });
    assert.equal(appDay.source, 'app');
    assert.equal(appDay.lines.length, 1);
    assert.equal(appDay.lines[0].source, 'app');
    assert.equal(appDay.lines[0].reviewed, true);
    assert.equal(appDay.lines[0].itemCode, 'D098010');
    assert.equal(appDay.inspectedQty, 10);
  });

  it('쉼표로 적힌 이름은 검사자 수로 나눈다', () => {
    assert.deepEqual(splitWorkerNames('배경희, 이미영'), ['배경희', '이미영']);
    assert.deepEqual(splitWorkerNames('배경희，이미영,'), ['배경희', '이미영']);
    assert.equal(countWorkerNames(['배경희, 이미영', '배경희']), 2);
    const report = buildInspectionReport({
      workday: '2026-11-02',
      ocrRows: [
        {
          id: 'a',
          process_code: 'IN',
          is_duplicate: false,
          work_date: '2026-11-02',
          qty: 760,
          qty_kind: 'work',
          defect_qty: 0,
          sheet_worker: '배경희, 이미영',
        },
        {
          id: 'b',
          process_code: 'IN',
          is_duplicate: false,
          work_date: '2026-11-02',
          qty: 100,
          qty_kind: 'work',
          defect_qty: 0,
          sheet_worker: '배경희, 이미영',
        },
      ],
    });
    assert.equal(report.workerCount, 2);
    assert.equal(report.lines[0].workerName, '배경희, 이미영');
  });
});

describe('inspection dashboard period', () => {
  const days = [
    {
      workday: '2026-11-02',
      inspectedQty: 100,
      defectQty: 10,
      qtyGood: 90,
      defectRate: 0.1,
      lines: [
        { id: '1', workerName: '배경희, 이미영', itemCode: 'A', qtyGood: 90, qtyDefect: 10, source: 'ocr', reviewed: false, memoOnly: false, startLabel: '08:00', defectBreakdown: [{ code: 'A002', name: '소착', qty: 10 }] },
      ],
    },
    {
      workday: '2026-11-03',
      inspectedQty: 50,
      defectQty: 0,
      qtyGood: 50,
      defectRate: 0,
      lines: [
        { id: '2', workerName: '배경희', itemCode: 'B', qtyGood: 50, qtyDefect: 0, source: 'app', reviewed: true, memoOnly: false, startLabel: '09:00', defectBreakdown: [] },
      ],
    },
  ];

  it('일평균은 근무일 수로, 1인 1일은 그날의 검사자 수로 나눈다', () => {
    const summary = summarizeInspectionPeriod(days);
    assert.equal(summary.inspectedQty, 150);
    assert.equal(summary.dayCount, 2);
    assert.equal(summary.dailyAverage, 75);
    assert.equal(summary.personDays, 3);
    assert.equal(summary.perPersonDaily, 50);
    const months = bucketInspectionDays(days, 'month');
    assert.equal(months.length, 1);
    assert.equal(months[0].defectRate, 10 / 150);
    const pareto = paretoFromInspectionLines(summary.lines, 10);
    assert.equal(pareto[0].name, '소착');
    assert.equal(pareto[0].cumRatio, 1);
  });

  it('직전 기간은 같은 달력 일수다', () => {
    assert.deepEqual(previousWindow('2026-11-08', '2026-11-08'), { from: '2026-11-07', to: '2026-11-07' });
    assert.deepEqual(previousWindow('2026-11-01', '2026-11-03'), { from: '2026-10-29', to: '2026-10-31' });
    assert.deepEqual(resolveInspectionWindow({ preset: 'project', today: '2026-11-09' }), {
      preset: 'project',
      from: '2026-06-01',
      to: '2026-11-09',
    });
    assert.deepEqual(resolveInspectionWindow({ preset: '30', today: '2026-11-09' }), {
      preset: '30',
      from: '2026-10-11',
      to: '2026-11-09',
    });
  });
});
