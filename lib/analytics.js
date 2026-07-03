import {
  INSPECTION_CYCLE_DAYS,
  FIVES_CYCLE_DAYS,
  TREND_RANGE_DAYS,
  SHIFT_STAGES,
  SHIFT_WINDOWS,
  defectLabel,
} from './constants';

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function dateKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

/** worker_directory에서 excluded=true인 작업자 이름 Set */
export function getExcludedWorkerNames(workerDirectory) {
  return new Set(
    (workerDirectory || [])
      .filter((row) => row.excluded && row.worker_name)
      .map((row) => row.worker_name)
  );
}

/** 실적 집계에서 제외할 작업자의 기록 필터링 */
export function filterByExcludedWorkers(rows, excludedNames) {
  const excluded =
    excludedNames instanceof Set ? excludedNames : new Set(excludedNames || []);
  if (!excluded.size) return rows;
  return rows.filter((r) => !r.worker_name || !excluded.has(r.worker_name));
}

function toExcludedSet(excludedNames) {
  if (excludedNames instanceof Set) return excludedNames;
  return new Set(excludedNames || []);
}

/**
 * 작업자별로 불량/양품/3정5S 기록을 집계하고 미준수 여부를 판정합니다.
 * 워커 로스터 테이블이 따로 없으므로, 세 테이블 중 한 번이라도 기록을 남긴
 * worker_name만 대상이 됩니다 (아직 한 번도 기록하지 않은 신규 작업자는 잡히지 않음).
 */
export function buildWorkerStats(defects, goods, fives, excludedNames = new Set()) {
  const excluded = toExcludedSet(excludedNames);
  const map = new Map();

  const touch = (name) => {
    if (!name || excluded.has(name)) return null;
    if (!map.has(name)) {
      map.set(name, {
        worker_name: name,
        defectCount: 0,
        goodCount: 0,
        fivesCount: 0,
        lastInspectionAt: null,
        lastFivesAt: null,
      });
    }
    return map.get(name);
  };

  for (const r of defects) {
    const w = touch(r.worker_name);
    if (!w) continue;
    w.defectCount += 1;
    if (!w.lastInspectionAt || new Date(r.created_at) > new Date(w.lastInspectionAt)) {
      w.lastInspectionAt = r.created_at;
    }
  }

  for (const r of goods) {
    const w = touch(r.worker_name);
    if (!w) continue;
    w.goodCount += 1;
    if (!w.lastInspectionAt || new Date(r.created_at) > new Date(w.lastInspectionAt)) {
      w.lastInspectionAt = r.created_at;
    }
  }

  for (const r of fives) {
    const w = touch(r.worker_name);
    if (!w) continue;
    w.fivesCount += 1;
    if (!w.lastFivesAt || new Date(r.created_at) > new Date(w.lastFivesAt)) {
      w.lastFivesAt = r.created_at;
    }
  }

  return Array.from(map.values())
    .map((w) => {
      const totalInspections = w.defectCount + w.goodCount;
      const defectRate = totalInspections > 0 ? w.defectCount / totalInspections : 0;
      const inspectionOverdue = daysAgo(w.lastInspectionAt) > INSPECTION_CYCLE_DAYS;
      const fivesOverdue = daysAgo(w.lastFivesAt) > FIVES_CYCLE_DAYS;
      return {
        ...w,
        totalInspections,
        defectRate,
        inspectionOverdue,
        fivesOverdue,
        needsAlert: inspectionOverdue || fivesOverdue,
      };
    })
    .sort((a, b) => b.totalInspections - a.totalInspections);
}

/** 최근 N일간 불량/양품 건수 추세 (일자별) */
export function buildTrend(defects, goods, days = TREND_RANGE_DAYS) {
  const buckets = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key.slice(5), defect: 0, good: 0 });
  }

  for (const r of defects) {
    const key = dateKey(r.created_at);
    if (buckets.has(key)) buckets.get(key).defect += 1;
  }
  for (const r of goods) {
    const key = dateKey(r.created_at);
    if (buckets.has(key)) buckets.get(key).good += 1;
  }

  return Array.from(buckets.values());
}

/** 불량 유형별 건수 breakdown (상위 항목 순) */
export function buildDefectBreakdown(defects) {
  const map = new Map();
  for (const r of defects) {
    const label = defectLabel(r);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseHm(hm) {
  const [h, m] = hm.split(':').map(Number);
  return { h, m };
}

/** 근무일·조·단계별 검사 시간 윈도우 (로컬 시각) */
export function getShiftStageWindow(workDate, shift, stage) {
  const [startHm, endHm] = SHIFT_WINDOWS[shift][stage];
  const { h: sh, m: sm } = parseHm(startHm);
  const { h: eh, m: em } = parseHm(endHm);

  const base = startOfDay(workDate);

  if (shift === 'night' && stage === '초품') {
    base.setDate(base.getDate() - 1);
  }

  const start = new Date(base);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(base);
  end.setHours(eh, em, 59, 999);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

/** worker_directory에서 수동 지정된 근무조만 반환 ('day' | 'night' | null) */
export function getManualWorkerShift(workerDirectory, worker_name) {
  const row = (workerDirectory || []).find((r) => r.worker_name === worker_name);
  if (!row) return null;
  if (row.default_shift === 'day' || row.default_shift === 'night') return row.default_shift;
  return null;
}

/** @deprecated getManualWorkerShift 사용 */
export function getWorkerShiftMap(workerDirectory) {
  const map = new Map();
  for (const row of workerDirectory || []) {
    if (!row.worker_name) continue;
    const manual = getManualWorkerShift([row], row.worker_name);
    if (manual) map.set(row.worker_name, manual);
  }
  return map;
}

/** 근무일 범위(전일 20시~당일 24시) 내 기록 필터 */
function filterRecordsOnWorkDate(records, workDate) {
  const rangeStart = new Date(workDate);
  rangeStart.setDate(rangeStart.getDate() - 1);
  rangeStart.setHours(20, 0, 0, 0);
  const rangeEnd = endOfDay(workDate);
  return records.filter((r) => {
    if (!r.created_at) return false;
    const t = new Date(r.created_at);
    return t >= rangeStart && t <= rangeEnd;
  });
}

/** 기록 시간대로 주간/야간 자동 판단 (해당일 기록 없으면 'unknown') */
export function autoDetectShiftFromRecords(records, workDate) {
  const dayRecords = filterRecordsOnWorkDate(records, workDate);
  if (!dayRecords.length) return 'unknown';

  const hasNight = dayRecords.some((r) => {
    const h = new Date(r.created_at).getHours();
    return h >= 20 || h < 6;
  });
  if (hasNight) return 'night';

  const hasDay = dayRecords.some((r) => {
    const h = new Date(r.created_at).getHours();
    return h >= 8 && h < 20;
  });
  if (hasDay) return 'day';

  return 'unknown';
}

function resolveWorkerShiftInfo(worker_name, workerDirectory, allRecords, workDate) {
  const manual = getManualWorkerShift(workerDirectory, worker_name);
  if (manual) {
    return { shift: manual, shiftSource: 'manual' };
  }
  return { shift: autoDetectShiftFromRecords(allRecords, workDate), shiftSource: 'auto' };
}

function stageCheck(records, workDate, shift, stage) {
  const { start, end } = getShiftStageWindow(workDate, shift, stage);
  const match = records.find((r) => {
    if (!r.created_at) return false;
    const t = new Date(r.created_at);
    return t >= start && t <= end;
  });
  return { done: !!match, at: match?.created_at ?? null };
}

function collectWorkerNames(defects, goods, fives) {
  const names = new Set();
  for (const rows of [defects, goods, fives]) {
    for (const r of rows) {
      if (r.worker_name) names.add(r.worker_name);
    }
  }
  return names;
}

/** 기록 + worker_directory에 등록된 작업자 이름 전체 */
export function collectAllWorkerNames(defects, goods, fives, workerDirectory) {
  const names = collectWorkerNames(defects, goods, fives);
  for (const row of workerDirectory || []) {
    if (row.worker_name) names.add(row.worker_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

function groupRecordsByWorker(defects, goods, fives) {
  const map = new Map();
  for (const row of [...defects, ...goods, ...fives]) {
    if (!row.worker_name || !row.created_at) continue;
    if (!map.has(row.worker_name)) map.set(row.worker_name, []);
    map.get(row.worker_name).push(row);
  }
  return map;
}

function groupInspectionsByWorker(defects, goods) {
  const map = new Map();
  for (const row of [...defects, ...goods]) {
    if (!row.worker_name || !row.created_at) continue;
    if (!map.has(row.worker_name)) map.set(row.worker_name, []);
    map.get(row.worker_name).push(row);
  }
  return map;
}

function filterRecordsInWorkRange(records, workDate) {
  const rangeStart = new Date(workDate);
  rangeStart.setDate(rangeStart.getDate() - 1);
  rangeStart.setHours(20, 0, 0, 0);
  const rangeEnd = endOfDay(workDate);
  return records.filter((r) => {
    const t = new Date(r.created_at);
    return t >= rangeStart && t <= rangeEnd;
  });
}

/**
 * 선택한 근무일 기준 자주검사(초·중·종) 준수 현황
 * 불량·양품 기록의 시간대만으로 검사 여부 판정 (defect_stage 무관)
 * 근무조: worker_directory 수동 지정 최우선, 없으면 당일 기록으로 자동 판단
 * @param {Array} defects - defect_reports
 * @param {Array} goods - good_reports
 * @param {Array} fives - fives_reports (작업자 목록·조 자동 판단용)
 * @param {Date} [date] - 근무일 (기본: 오늘)
 * @param {Set|Array} [excludedNames] - 실적 제외 작업자
 * @param {Array} [workerDirectory] - worker_directory 행 목록
 */
export function buildFrequentInspectionCompliance(
  defects,
  goods,
  fives,
  date = new Date(),
  excludedNames = new Set(),
  workerDirectory = []
) {
  const workDate = startOfDay(date);
  const excluded = toExcludedSet(excludedNames);
  const workerNames = collectWorkerNames(defects, goods, fives);
  const byWorkerAll = groupRecordsByWorker(defects, goods, fives);
  const byWorkerInspection = groupInspectionsByWorker(defects, goods);

  const results = [];
  for (const worker_name of workerNames) {
    if (excluded.has(worker_name)) continue;
    const allRecords = byWorkerAll.get(worker_name) || [];
    const { shift, shiftSource } = resolveWorkerShiftInfo(
      worker_name,
      workerDirectory,
      allRecords,
      workDate
    );

    if (shift === 'unknown') {
      const stages = {};
      for (const stage of SHIFT_STAGES) {
        stages[stage] = { done: null, at: null, skipped: true };
      }
      results.push({
        worker_name,
        shift,
        shiftSource,
        ...stages,
        allOk: false,
        noData: true,
      });
      continue;
    }

    const dayRangeRecords = filterRecordsInWorkRange(
      byWorkerInspection.get(worker_name) || [],
      workDate
    );

    const stages = {};
    for (const stage of SHIFT_STAGES) {
      stages[stage] = stageCheck(dayRangeRecords, workDate, shift, stage);
    }

    const allOk = SHIFT_STAGES.every((s) => stages[s].done);
    results.push({ worker_name, shift, shiftSource, ...stages, allOk, noData: false });
  }

  return results.sort((a, b) => a.worker_name.localeCompare(b.worker_name, 'ko'));
}

/**
 * 최근 N일(근무일 기준, endDate 포함 과거) 작업자별 자주검사 완료 집계
 * @returns {Map<string, { worker_name, completedCount, expectedCount, completionRate }>}
 */
export function buildWorkerFrequentSummary(
  defects,
  goods,
  fives,
  workerDirectory,
  endDate = new Date(),
  days = 7,
  excludedNames = new Set()
) {
  const summary = new Map();
  const end = startOfDay(endDate);

  for (let i = 0; i < days; i += 1) {
    const workDate = new Date(end);
    workDate.setDate(workDate.getDate() - i);

    const compliance = buildFrequentInspectionCompliance(
      defects,
      goods,
      fives,
      workDate,
      excludedNames,
      workerDirectory
    );

    for (const row of compliance) {
      if (!summary.has(row.worker_name)) {
        summary.set(row.worker_name, {
          worker_name: row.worker_name,
          completedCount: 0,
          expectedCount: 0,
          completionRate: null,
        });
      }

      const agg = summary.get(row.worker_name);
      if (row.shift === 'unknown') continue;

      agg.expectedCount += SHIFT_STAGES.length;
      for (const stage of SHIFT_STAGES) {
        if (row[stage]?.done === true) {
          agg.completedCount += 1;
        }
      }
    }
  }

  for (const agg of summary.values()) {
    agg.completionRate =
      agg.expectedCount > 0 ? agg.completedCount / agg.expectedCount : null;
  }

  return summary;
}

/**
 * endDate 포함 과거 N일간 작업자별 3정5S 기록 일수 집계
 * @returns {Map<string, { worker_name, completedDays, totalDays, completionRate }>}
 */
export function buildWorkerFivesSummary(
  fives,
  workerDirectory,
  endDate = new Date(),
  days = 7,
  excludedNames = new Set()
) {
  const excluded = toExcludedSet(excludedNames);
  const summary = new Map();
  const end = startOfDay(endDate);
  const rangeStart = new Date(end);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  for (const row of fives) {
    if (!row.worker_name || excluded.has(row.worker_name) || !row.created_at) continue;

    const recordDay = startOfDay(new Date(row.created_at));
    if (recordDay < rangeStart || recordDay > end) continue;

    if (!summary.has(row.worker_name)) {
      summary.set(row.worker_name, {
        worker_name: row.worker_name,
        dayKeys: new Set(),
        completedDays: 0,
        totalDays: days,
        completionRate: 0,
      });
    }
    summary.get(row.worker_name).dayKeys.add(dateKey(row.created_at));
  }

  for (const agg of summary.values()) {
    agg.completedDays = agg.dayKeys.size;
    agg.completionRate = agg.completedDays / days;
    delete agg.dayKeys;
  }

  return summary;
}

/** 작업자별 최근 자주검사·3정5S 수행 시각 */
export function buildWorkerLastActivityMap(defects, goods, fives) {
  const map = new Map();

  const touch = (name) => {
    if (!map.has(name)) {
      map.set(name, { lastFrequentCheckAt: null, lastFivesAt: null });
    }
    return map.get(name);
  };

  for (const row of [...defects, ...goods]) {
    if (!row.worker_name || !row.created_at) continue;
    const entry = touch(row.worker_name);
    if (
      !entry.lastFrequentCheckAt ||
      new Date(row.created_at) > new Date(entry.lastFrequentCheckAt)
    ) {
      entry.lastFrequentCheckAt = row.created_at;
    }
  }

  for (const row of fives) {
    if (!row.worker_name || !row.created_at) continue;
    const entry = touch(row.worker_name);
    if (!entry.lastFivesAt || new Date(row.created_at) > new Date(entry.lastFivesAt)) {
      entry.lastFivesAt = row.created_at;
    }
  }

  return map;
}

/** 당일 자주검사 단계별 완료/대상 요약 및 시간대 경과 미준수 작업자 */
export function summarizeTodayFrequentCompliance(compliance, workDate = new Date()) {
  const workDay = startOfDay(workDate);
  const now = new Date();

  const stages = SHIFT_STAGES.map((stage) => {
    let completed = 0;
    let target = 0;
    for (const row of compliance) {
      if (row.shift === 'unknown' || row.noData) continue;
      target += 1;
      if (row[stage]?.done) completed += 1;
    }
    return { stage, completed, target };
  });

  const nonCompliant = new Set();
  for (const row of compliance) {
    if (row.shift === 'unknown' || row.noData) continue;
    for (const stage of SHIFT_STAGES) {
      if (row[stage]?.done) continue;
      const { end } = getShiftStageWindow(workDay, row.shift, stage);
      if (now > end) nonCompliant.add(row.worker_name);
    }
  }

  return {
    stages,
    nonCompliantWorkers: [...nonCompliant].sort((a, b) => a.localeCompare(b, 'ko')),
  };
}

/** 당일 3정5S 기록 현황 */
export function summarizeTodayFives(fives, defects, goods, excludedNames = new Set()) {
  const excluded = toExcludedSet(excludedNames);
  const todayKey = dateKey(new Date());

  const allWorkers = collectWorkerNames(defects, goods, fives);
  const activeWorkers = [...allWorkers].filter((name) => !excluded.has(name));

  const recordedToday = new Set();
  for (const row of fives) {
    if (!row.worker_name || excluded.has(row.worker_name) || !row.created_at) continue;
    if (dateKey(row.created_at) === todayKey) {
      recordedToday.add(row.worker_name);
    }
  }

  const missingWorkers = activeWorkers
    .filter((name) => !recordedToday.has(name))
    .sort((a, b) => a.localeCompare(b, 'ko'));

  const totalWorkers = activeWorkers.length;
  const recordedCount = recordedToday.size;

  return {
    recordedCount,
    totalWorkers,
    completionRate: totalWorkers > 0 ? recordedCount / totalWorkers : 0,
    missingWorkers,
  };
}

const COMPLIANCE_SHIFT_ORDER = ['day', 'night', 'unknown'];
const COMPLIANCE_SHIFT_GROUP_LABELS = {
  day: '주간조',
  night: '야간조',
  unknown: '미정',
};

/** 자주검사 현황을 주간→야간→미정 순으로 그룹화 (그룹 내 이름순) */
export function groupComplianceByShift(compliance) {
  const buckets = Object.fromEntries(COMPLIANCE_SHIFT_ORDER.map((shift) => [shift, []]));

  for (const row of compliance) {
    const shift = COMPLIANCE_SHIFT_ORDER.includes(row.shift) ? row.shift : 'unknown';
    buckets[shift].push(row);
  }

  for (const shift of COMPLIANCE_SHIFT_ORDER) {
    buckets[shift].sort((a, b) => a.worker_name.localeCompare(b.worker_name, 'ko'));
  }

  return COMPLIANCE_SHIFT_ORDER.filter((shift) => buckets[shift].length > 0).map((shift) => ({
    shift,
    label: COMPLIANCE_SHIFT_GROUP_LABELS[shift],
    rows: buckets[shift],
  }));
}

/** 엑셀 등 플랫 목록용: 주간→야간→미정 순 정렬 */
export function sortComplianceByShift(compliance) {
  return groupComplianceByShift(compliance).flatMap((group) => group.rows);
}

/** @deprecated buildFrequentInspectionCompliance 사용 */
export function buildShiftCompliance(defects, date = new Date()) {
  return buildFrequentInspectionCompliance(defects, [], [], date);
}

/** 미준수 작업자만 추출 (알림톡 등 후속 기능용) */
export function getFrequentInspectionNonCompliantWorkers(compliance) {
  return compliance.filter((row) => !row.allOk && !row.noData);
}

/** @deprecated getFrequentInspectionNonCompliantWorkers 사용 */
export function getShiftNonCompliantWorkers(compliance) {
  return getFrequentInspectionNonCompliantWorkers(compliance);
}
