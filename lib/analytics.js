import {
  INSPECTION_CYCLE_DAYS,
  FIVES_CYCLE_DAYS,
  TREND_RANGE_DAYS,
  SHIFT_STAGES,
  SHIFT_WINDOWS,
  SHIFT_STAGE_DAY_OFFSETS,
  STAGE_GRACE_MINUTES,
  defectLabel,
} from './constants';
import { formatISODate } from './dateRange';

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

/**
 * 화면 표시용 작업자 이름 (display_name이 있으면 우선, 없으면 workerName)
 * 내부 로직·DB 키에는 원본 worker_name을 계속 사용하세요.
 */
export function getDisplayName(workerName, workerDirectory) {
  if (!workerName) return workerName || '';
  const row = (workerDirectory || []).find((r) => r.worker_name === workerName);
  const alias = row?.display_name?.trim();
  return alias || workerName;
}

/**
 * worker_name → 표시이름 Map (반복 조회용)
 * display_name이 비어 있으면 원본 worker_name을 값으로 넣습니다.
 */
export function buildWorkerDisplayNameMap(workerDirectory) {
  const map = new Map();
  for (const row of workerDirectory || []) {
    if (!row.worker_name) continue;
    const alias = row.display_name?.trim();
    map.set(row.worker_name, alias || row.worker_name);
  }
  return map;
}

/** Map 또는 workerDirectory로 표시 이름 조회 */
export function resolveDisplayName(workerName, displayMapOrDirectory) {
  if (!workerName) return workerName || '';
  if (displayMapOrDirectory instanceof Map) {
    return displayMapOrDirectory.get(workerName) || workerName;
  }
  return getDisplayName(workerName, displayMapOrDirectory);
}

/** worker_directory에서 removed=true(목록에서 숨김)인 작업자 이름 Set */
export function getRemovedWorkerNames(workerDirectory) {
  return new Set(
    (workerDirectory || [])
      .filter((row) => row.removed && row.worker_name)
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

/** worker_directory 행의 불량관리(담당) 여부 (handles_defects / defect_enabled, 기본 true) */
export function isDefectManagementEnabled(row) {
  if (!row) return true;
  return row.handles_defects ?? row.defect_enabled ?? true;
}

/**
 * 불량 기록 페이지 표시용 필터
 * - 불량관리 ON인 작업자만 표시 (제외·관리자 작업자도 불량관리 ON이면 포함)
 * - 디렉터리에 없는 작업자는 기본 ON으로 표시
 */
export function filterDefectsForDisplay(defects, workerDirectory) {
  const byName = new Map(
    (workerDirectory || []).filter((r) => r.worker_name).map((r) => [r.worker_name, r])
  );
  return (defects || []).filter((d) => {
    if (!d.worker_name) return true;
    return isDefectManagementEnabled(byName.get(d.worker_name));
  });
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

/** 최근 N일간 불량/양품 건수 추세 (일자별, 달력 N일 범위 중 월~금만) */
export function buildTrend(defects, goods, days = TREND_RANGE_DAYS) {
  const buckets = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const weekday = d.getDay();
    // 토요일(6)·일요일(0)은 워킹데이가 아니므로 추세 포인트에서 제외
    if (weekday === 0 || weekday === 6) continue;
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

function getWorkRangeBounds(workDate) {
  const start = startOfDay(workDate);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** 달력 날짜(00:00 기준)가 같은지 비교 */
export function isSameCalendarDay(dateA, dateB) {
  return startOfDay(dateA).getTime() === startOfDay(dateB).getTime();
}

/**
 * 기록 시각이 속한 "근무일"(YYYY-MM-DD)을 반환합니다.
 * getWorkRangeBounds와 동일하게 08:00을 경계로, 08:00 이전이면 전날,
 * 08:00 이후(포함)면 당일을 근무일로 봅니다.
 */
export function getWorkDateForRecord(createdAt) {
  const d = new Date(createdAt);
  if (d.getHours() < 8) {
    d.setDate(d.getDate() - 1);
  }
  return formatISODate(d);
}

function parseHm(hm) {
  const [h, m] = hm.split(':').map(Number);
  return { h, m };
}

function applyHmOnWorkDate(workDate, dayOffset, hm) {
  const d = startOfDay(workDate);
  d.setDate(d.getDate() + dayOffset);
  const { h, m } = parseHm(hm);
  d.setHours(h, m, 0, 0);
  return d;
}

/** 근무일·조·단계별 검사 시간 윈도우 (로컬 시각, 종료 시각은 미포함) */
export function getShiftStageWindow(workDate, shift, stage) {
  const [startHm, endHmExclusive] = SHIFT_WINDOWS[shift][stage];
  const offsets = SHIFT_STAGE_DAY_OFFSETS[shift][stage];

  const start = applyHmOnWorkDate(workDate, offsets.start, startHm);
  const endBoundary = applyHmOnWorkDate(workDate, offsets.end, endHmExclusive);
  const end = new Date(endBoundary.getTime() - 1);

  // 경계에서 살짝 벗어난 사진도 인정하도록 앞뒤로 여유 시간 부여
  start.setMinutes(start.getMinutes() - STAGE_GRACE_MINUTES);
  end.setMinutes(end.getMinutes() + STAGE_GRACE_MINUTES);

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

/** 근무일 범위(당일 08시~익일 08시, 끝 미포함) 내 기록 필터 */
function filterRecordsOnWorkDate(records, workDate) {
  const { start, end } = getWorkRangeBounds(workDate);
  return records.filter((r) => {
    if (!r.created_at) return false;
    const t = new Date(r.created_at);
    return t >= start && t < end;
  });
}

/** 기록 시간대로 주간/야간 자동 판단 (해당일 기록 없으면 'unknown') */
export function autoDetectShiftFromRecords(records, workDate) {
  const dayRecords = filterRecordsOnWorkDate(records, workDate);
  if (!dayRecords.length) return 'unknown';

  const hasNight = dayRecords.some((r) => {
    const h = new Date(r.created_at).getHours();
    return h >= 20 || h < 8;
  });
  if (hasNight) return 'night';

  const hasDay = dayRecords.some((r) => {
    const h = new Date(r.created_at).getHours();
    return h >= 8 && h < 20;
  });
  if (hasDay) return 'day';

  return 'unknown';
}

export function resolveWorkerShiftInfo(worker_name, workerDirectory, allRecords, workDate) {
  const manual = getManualWorkerShift(workerDirectory, worker_name);
  if (manual) {
    return { shift: manual, shiftSource: 'manual' };
  }
  return { shift: autoDetectShiftFromRecords(allRecords, workDate), shiftSource: 'auto' };
}

/**
 * defect/good 기록 한 건의 자주검사 단계(초·중·종품/일반)와 근무조를 판정합니다.
 * 근무조 자동 판정이 사진 한 장에 휘둘리지 않도록, 해당 작업자의 전체 기록
 * 배열(allWorkerRecords)을 넘겨 buildFrequentInspectionCompliance와 동일한
 * 방식으로 조를 결정합니다.
 */
export function tagInspectionStage(record, workerDirectory, allWorkerRecords) {
  if (!record?.created_at) {
    return { stage: '일반', shift: 'unknown' };
  }

  const createdAt = new Date(record.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return { stage: '일반', shift: 'unknown' };
  }

  const shiftRecords =
    Array.isArray(allWorkerRecords) && allWorkerRecords.length ? allWorkerRecords : [record];

  const workDateCandidates = [
    startOfDay(createdAt),
    startOfDay(new Date(createdAt.getTime() - 86400000)),
  ];

  for (const workDate of workDateCandidates) {
    const { shift } = resolveWorkerShiftInfo(
      record.worker_name,
      workerDirectory,
      shiftRecords,
      workDate
    );
    if (shift === 'unknown') continue;

    for (const stage of SHIFT_STAGES) {
      const { start, end } = getShiftStageWindow(workDate, shift, stage);
      if (createdAt >= start && createdAt <= end) {
        return { stage, shift };
      }
    }
  }

  const manual = getManualWorkerShift(workerDirectory, record.worker_name);
  const hour = createdAt.getHours();
  const inferredShift =
    manual || (hour >= 20 || hour < 6 ? 'night' : hour >= 8 && hour < 20 ? 'day' : 'unknown');

  return { stage: '일반', shift: inferredShift };
}

/**
 * 특정 작업자의 기록을 근무일(YYYY-MM-DD)별로 그룹핑합니다.
 * 달력 날짜가 아니라 08:00 경계의 근무일 기준이라, /frequent-check의
 * 미준수 판정과 동일한 그룹으로 묶입니다.
 * @returns {{ date: string, count: number, records: object[] }[]}
 */
export function groupWorkerRecordsByDate(records, workerName) {
  if (!workerName) return [];

  const buckets = new Map();

  for (const record of records || []) {
    if (record.worker_name !== workerName || !record.created_at) continue;
    const date = getWorkDateForRecord(record.created_at);
    if (!buckets.has(date)) {
      buckets.set(date, { date, count: 0, records: [] });
    }
    const group = buckets.get(date);
    group.count += 1;
    group.records.push(record);
  }

  for (const group of buckets.values()) {
    group.records.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return Array.from(buckets.values()).sort((a, b) => b.date.localeCompare(a.date));
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

/** 기록 + worker_directory에 등록된 작업자 이름 전체 (removed=true는 목록에서 제외) */
export function collectAllWorkerNames(defects, goods, fives, workerDirectory) {
  const names = collectWorkerNames(defects, goods, fives);
  for (const row of workerDirectory || []) {
    if (row.worker_name) names.add(row.worker_name);
  }
  const removed = getRemovedWorkerNames(workerDirectory);
  return [...names]
    .filter((name) => !removed.has(name))
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

/** removed 포함 전체 작업자 이름 (관리용 전체 목록) */
export function collectEveryWorkerName(defects, goods, fives, workerDirectory) {
  const names = collectWorkerNames(defects, goods, fives);
  for (const row of workerDirectory || []) {
    if (row.worker_name) names.add(row.worker_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 메모에 '퇴사' 포함 여부 */
export function hasResignedNote(note) {
  return typeof note === 'string' && note.includes('퇴사');
}

/**
 * 작업자 관리 목록 상태 뱃지
 * @returns {{ label: string, tone: 'good'|'warn'|'danger'|'muted' }}
 */
export function getWorkerListStatus(row) {
  if (row?.removed) return { label: '숨김', tone: 'muted' };
  if (hasResignedNote(row?.note)) return { label: '퇴사', tone: 'danger' };
  if (row?.excluded) return { label: '제외(관리자)', tone: 'warn' };
  return { label: '활성', tone: 'good' };
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
  const { start, end } = getWorkRangeBounds(workDate);
  return records.filter((r) => {
    const t = new Date(r.created_at);
    return t >= start && t < end;
  });
}

/** 근무일 범위 내 특정 작업자 기록 */
export function recordsForWorkerInWorkRange(records, worker_name, workDate) {
  return filterRecordsInWorkRange(
    records.filter((r) => r.worker_name === worker_name && r.created_at),
    workDate
  );
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
 * 선택한 근무일 기준 작업자별 당일 자주검사·3정5S 이행 현황
 * @returns {Map<string, { frequentStages: Array<{ label: string, done: boolean }>, fivesDone: boolean }>}
 */
export function buildWorkerDailyStatusMap(
  defects,
  goods,
  fives,
  workerDirectory,
  date = new Date(),
  excludedNames = new Set()
) {
  const workDate = startOfDay(date);
  const compliance = buildFrequentInspectionCompliance(
    defects,
    goods,
    fives,
    workDate,
    excludedNames,
    workerDirectory
  );

  const map = new Map();
  for (const row of compliance) {
    map.set(row.worker_name, {
      frequentStages: SHIFT_STAGES.map((stage) => ({
        label: stage,
        done: row.noData ? false : row[stage]?.done === true,
      })),
      fivesDone: recordsForWorkerInWorkRange(fives, row.worker_name, workDate).length > 0,
    });
  }

  return map;
}

/** TrafficLightDots용 자주검사 단계 배열 */
export function complianceStagesForDots(row) {
  return SHIFT_STAGES.map((stage) => ({
    label: stage,
    done: row.noData ? false : row[stage]?.done === true,
  }));
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
  const excluded = toExcludedSet(excludedNames);
  const end = startOfDay(endDate);

  const weekdayDates = [];
  for (let i = 0; i < days; i += 1) {
    const workDate = new Date(end);
    workDate.setDate(workDate.getDate() - i);
    const dayOfWeek = workDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    weekdayDates.push(workDate);
  }

  const expectedCount = weekdayDates.length * SHIFT_STAGES.length;
  const summary = new Map();

  for (const worker_name of collectAllWorkerNames(defects, goods, fives, workerDirectory)) {
    if (excluded.has(worker_name)) continue;
    summary.set(worker_name, {
      worker_name,
      completedCount: 0,
      expectedCount,
      completionRate: 0,
    });
  }

  for (const workDate of weekdayDates) {
    const compliance = buildFrequentInspectionCompliance(
      defects,
      goods,
      fives,
      workDate,
      excludedNames,
      workerDirectory
    );

    for (const row of compliance) {
      if (excluded.has(row.worker_name)) continue;
      if (!summary.has(row.worker_name)) {
        summary.set(row.worker_name, {
          worker_name: row.worker_name,
          completedCount: 0,
          expectedCount,
          completionRate: 0,
        });
      }

      if (row.noData) continue;

      const agg = summary.get(row.worker_name);
      for (const stage of SHIFT_STAGES) {
        if (row[stage]?.done === true) {
          agg.completedCount += 1;
        }
      }
    }
  }

  for (const agg of summary.values()) {
    agg.completionRate = agg.completedCount / agg.expectedCount;
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

/**
 * 전체 작업자 기준 최근 N일 자주검사·3정5S 이행률
 * - buildWorkerFrequentSummary / buildWorkerFivesSummary를 전체 작업자 기준으로 호출해
 *   모든 작업자의 완료/대상 수치를 합산합니다.
 * @returns {{ overallFrequentRate: number|null, overallFivesRate: number|null }}
 *   대상 합이 0이면 각 값은 null
 */
export function buildOverallComplianceRate(
  defects,
  goods,
  fives,
  workerDirectory,
  endDate = new Date()
) {
  const frequentSummary = buildWorkerFrequentSummary(
    defects,
    goods,
    fives,
    workerDirectory,
    endDate
  );
  const fivesSummary = buildWorkerFivesSummary(fives, workerDirectory, endDate);

  let frequentCompleted = 0;
  let frequentExpected = 0;
  for (const agg of frequentSummary.values()) {
    frequentCompleted += agg.completedCount;
    frequentExpected += agg.expectedCount;
  }

  let fivesCompleted = 0;
  let fivesTotal = 0;
  for (const agg of fivesSummary.values()) {
    fivesCompleted += agg.completedDays;
    fivesTotal += agg.totalDays;
  }

  return {
    overallFrequentRate:
      frequentExpected > 0 ? frequentCompleted / frequentExpected : null,
    overallFivesRate: fivesTotal > 0 ? fivesCompleted / fivesTotal : null,
  };
}

/**
 * 선택한 근무일 기준 작업자별 일일 실적(담당 업무 이행 현황).
 * worker_directory의 excluded=false 작업자만 기준 목록으로 사용하며,
 * 담당(handles_*)으로 지정된 업무만 판정하고 미담당 업무는 status:'na'로 표시합니다.
 *
 * @param {Array} defects - defect_reports
 * @param {Array} goods - good_reports
 * @param {Array} fives - fives_reports
 * @param {Array} docs - ocr_results
 * @param {Array} workerDirectory - worker_directory 행 목록
 * @param {Date} [date] - 근무일 (기본: 오늘)
 * @returns {Array<{
 *   worker_name: string,
 *   phone_number: string,
 *   frequentCheck: { status: 'ok'|'fail'|'na', detail: string },
 *   fives: { status: 'ok'|'fail'|'na', detail: string },
 *   documents: { status: 'ok'|'fail'|'na', detail: string },
 *   defectCount: number,
 *   overallStatus: 'ok'|'warning'
 * }>}
 */
export function buildDailyPerformance(
  defects,
  goods,
  fives,
  docs,
  workerDirectory,
  date = new Date()
) {
  const workDate = startOfDay(date);
  const excludedNames = getExcludedWorkerNames(workerDirectory);
  const removedNames = getRemovedWorkerNames(workerDirectory);

  // worker_directory 행을 이름으로 매핑 (담당 업무·연락처 조회용)
  const directoryByName = new Map(
    (workerDirectory || [])
      .filter((row) => row.worker_name)
      .map((row) => [row.worker_name, row])
  );

  // 1) 기록(defects/goods/fives/docs)에 등장한 모든 작업자 이름 수집
  const allNames = collectWorkerNames(defects, goods, fives);
  for (const r of docs || []) {
    if (r.worker_name) allNames.add(r.worker_name);
  }
  // 2) 아직 기록은 없지만 worker_directory에 등록된 이름도 합침
  for (const name of directoryByName.keys()) {
    allNames.add(name);
  }

  // 3) removed=true 또는 excluded=true인 이름은 제외
  // 4) 각 이름은 worker_directory 값이 있으면 그 값을, 없으면 기본값 사용
  //    (worker-management의 신규 작업자 기본값과 동일)
  const baseWorkers = [...allNames]
    .filter((name) => !removedNames.has(name) && !excludedNames.has(name))
    .map((name) => {
      const row = directoryByName.get(name);
      return {
        worker_name: name,
        handles_frequent_check: row?.handles_frequent_check ?? true,
        handles_fives: row?.handles_fives ?? true,
        handles_documents: row?.handles_documents ?? false,
        phone_number: row?.phone_number ?? '',
      };
    });

  // 자주검사 준수 결과 (야간조 시간대 등 기존 로직 재사용)
  const compliance = buildFrequentInspectionCompliance(
    defects,
    goods,
    fives,
    workDate,
    excludedNames,
    workerDirectory
  );
  const complianceByWorker = new Map(compliance.map((r) => [r.worker_name, r]));

  const results = baseWorkers.map((row) => {
    const name = row.worker_name;

    // 자주검사
    let frequentCheck;
    if (!row.handles_frequent_check) {
      frequentCheck = { status: 'na', detail: '' };
    } else {
      const c = complianceByWorker.get(name);
      const missing = [];
      if (!c || c.noData) {
        missing.push(...SHIFT_STAGES);
      } else {
        for (const stage of SHIFT_STAGES) {
          if (!c[stage]?.done) missing.push(stage);
        }
      }
      frequentCheck =
        missing.length === 0
          ? { status: 'ok', detail: `${SHIFT_STAGES.join('·')} 완료` }
          : { status: 'fail', detail: missing.join('/') };
    }

    // 3정5S
    let fivesStatus;
    if (!row.handles_fives) {
      fivesStatus = { status: 'na', detail: '' };
    } else {
      const has = recordsForWorkerInWorkRange(fives, name, workDate).length > 0;
      fivesStatus = has
        ? { status: 'ok', detail: '기록 완료' }
        : { status: 'fail', detail: '미기록' };
    }

    // 문서스캔
    let documentsStatus;
    if (!row.handles_documents) {
      documentsStatus = { status: 'na', detail: '' };
    } else {
      const has = recordsForWorkerInWorkRange(docs, name, workDate).length > 0;
      documentsStatus = has
        ? { status: 'ok', detail: '기록 완료' }
        : { status: 'fail', detail: '미기록' };
    }

    // 불량 보고 수 (담당 여부와 무관, 참고용)
    const defectCount = recordsForWorkerInWorkRange(defects, name, workDate).length;

    const anyFail =
      frequentCheck.status === 'fail' ||
      fivesStatus.status === 'fail' ||
      documentsStatus.status === 'fail';

    return {
      worker_name: name,
      phone_number: row.phone_number || '',
      frequentCheck,
      fives: fivesStatus,
      documents: documentsStatus,
      defectCount,
      overallStatus: anyFail ? 'warning' : 'ok',
    };
  });

  return results.sort((a, b) => a.worker_name.localeCompare(b.worker_name, 'ko'));
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

/**
 * 오늘 근무일 기준 주간/야간 × 초·중·종 단계별 자주검사 현황
 * - started=false: 아직 시간대 시작 전 (대상 집계 안 함)
 * - started=true: 해당 조·자주검사 담당자 대상 대비 완료 인원
 * @returns {Array<{
 *   shift: 'day'|'night',
 *   shiftLabel: string,
 *   stage: string,
 *   started: boolean,
 *   ended: boolean,
 *   completedCount: number|null,
 *   targetCount: number|null,
 *   missingWorkers: string[]
 * }>}
 */
export function buildTodayShiftSummary(
  defects,
  goods,
  workerDirectory,
  now = new Date(),
  fives = []
) {
  const workDateStr = getWorkDateForRecord(now);
  const workDay = startOfDay(new Date(`${workDateStr}T00:00:00`));
  const excluded = getExcludedWorkerNames(workerDirectory);
  const removed = getRemovedWorkerNames(workerDirectory);

  const directoryByName = new Map(
    (workerDirectory || [])
      .filter((row) => row.worker_name)
      .map((row) => [row.worker_name, row])
  );

  const names = collectAllWorkerNames(defects, goods, fives, workerDirectory);
  const byWorkerAll = groupRecordsByWorker(defects, goods, fives);
  const byWorkerInspection = groupInspectionsByWorker(defects, goods);

  const workers = [];
  for (const worker_name of names) {
    if (excluded.has(worker_name) || removed.has(worker_name)) continue;
    const dir = directoryByName.get(worker_name);
    if (dir && dir.handles_frequent_check === false) continue;

    const allRecords = byWorkerAll.get(worker_name) || [];
    const { shift } = resolveWorkerShiftInfo(
      worker_name,
      workerDirectory,
      allRecords,
      workDay
    );
    if (shift === 'unknown') continue;

    const dayRecords = filterRecordsInWorkRange(
      byWorkerInspection.get(worker_name) || [],
      workDay
    );
    const stages = {};
    for (const stage of SHIFT_STAGES) {
      stages[stage] = stageCheck(dayRecords, workDay, shift, stage);
    }
    workers.push({ worker_name, shift, stages });
  }

  const shiftDefs = [
    { shift: 'day', shiftLabel: '주간' },
    { shift: 'night', shiftLabel: '야간' },
  ];

  const results = [];
  for (const { shift, shiftLabel } of shiftDefs) {
    const shiftWorkers = workers.filter((w) => w.shift === shift);
    for (const stage of SHIFT_STAGES) {
      const { start, end } = getShiftStageWindow(workDay, shift, stage);
      const started = now >= start;
      const ended = now > end;

      if (!started) {
        results.push({
          shift,
          shiftLabel,
          stage,
          started: false,
          ended: false,
          completedCount: null,
          targetCount: null,
          missingWorkers: [],
        });
        continue;
      }

      let completedCount = 0;
      const missingWorkers = [];
      for (const w of shiftWorkers) {
        if (w.stages[stage]?.done) completedCount += 1;
        else missingWorkers.push(w.worker_name);
      }

      results.push({
        shift,
        shiftLabel,
        stage,
        started: true,
        ended,
        completedCount,
        targetCount: shiftWorkers.length,
        missingWorkers: missingWorkers.sort((a, b) => a.localeCompare(b, 'ko')),
      });
    }
  }

  return results;
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

/**
 * 자주검사 담당자 기준 단계별 완료 인원 요약 (그래프용)
 * @returns {Array<{ stage: string, completed: number, target: number, pending: number }>}
 */
export function buildFrequentStageCompletionSummary(compliance, eligibleWorkerNames) {
  const eligible = toExcludedSet(eligibleWorkerNames);

  return SHIFT_STAGES.map((stage) => {
    let completed = 0;
    let target = 0;
    for (const row of compliance) {
      if (!eligible.has(row.worker_name)) continue;
      if (row.shift === 'unknown' || row.noData) continue;
      target += 1;
      if (row[stage]?.done) completed += 1;
    }
    return {
      stage,
      completed,
      target,
      pending: Math.max(0, target - completed),
    };
  });
}

/**
 * 주간/야간 × 초·중·종 단계별 완료 인원 요약
 * @returns {Array<{ shift: 'day'|'night', shiftLabel: string, stages: Array<{ stage: string, completed: number, target: number, pending: number }> }>}
 */
export function buildFrequentStageCompletionByShift(compliance, eligibleWorkerNames) {
  const eligible = toExcludedSet(eligibleWorkerNames);
  const shiftDefs = [
    { shift: 'day', shiftLabel: '주간' },
    { shift: 'night', shiftLabel: '야간' },
  ];

  return shiftDefs.map(({ shift, shiftLabel }) => ({
    shift,
    shiftLabel,
    stages: SHIFT_STAGES.map((stage) => {
      let completed = 0;
      let target = 0;
      for (const row of compliance) {
        if (!eligible.has(row.worker_name)) continue;
        if (row.shift !== shift || row.noData) continue;
        target += 1;
        if (row[stage]?.done) completed += 1;
      }
      return {
        stage,
        completed,
        target,
        pending: Math.max(0, target - completed),
      };
    }),
  }));
}

/**
 * 특정 조·단계에서 미실시(done:false)인 작업자 이름 목록
 * @param {Array} compliance - buildFrequentInspectionCompliance 결과
 * @param {'day'|'night'} shift
 * @param {string} stage - 초품|중품|종품
 */
export function getStageNonComplianceList(compliance, shift, stage) {
  const names = [];
  for (const row of compliance) {
    if (row.shift !== shift || row.noData) continue;
    const stageResult = row[stage];
    if (!stageResult || stageResult.done) continue;
    names.push(row.worker_name);
  }
  return names.sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 시간대가 이미 끝났는데 기록이 없는 자주검사 미준수자 (우선순위 정렬)
 * @returns {Array<{ worker_name: string, overdueStages: string[], priority: number, labels: string[] }>}
 */
export function buildOverdueFrequentMisses(compliance, workDate, now = new Date(), eligibleWorkerNames) {
  const eligible = toExcludedSet(eligibleWorkerNames);
  const workDay = startOfDay(workDate);
  const results = [];

  for (const row of compliance) {
    if (!eligible.has(row.worker_name)) continue;
    if (row.shift === 'unknown' || row.noData) continue;

    const overdueStages = [];
    let priority = SHIFT_STAGES.length;

    for (let i = 0; i < SHIFT_STAGES.length; i += 1) {
      const stage = SHIFT_STAGES[i];
      if (row[stage]?.done) continue;
      const { end } = getShiftStageWindow(workDay, row.shift, stage);
      if (now > end) {
        if (priority === SHIFT_STAGES.length) priority = i;
        overdueStages.push(stage);
      }
    }

    if (overdueStages.length === 0) continue;

    results.push({
      worker_name: row.worker_name,
      overdueStages,
      priority,
      labels: overdueStages.map((stage) => `${stage} 미실시`),
    });
  }

  return results.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (b.overdueStages.length !== a.overdueStages.length) {
      return b.overdueStages.length - a.overdueStages.length;
    }
    return a.worker_name.localeCompare(b.worker_name, 'ko');
  });
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
  day: '주간 시프트',
  night: '야간 시프트',
  unknown: '시프트 미정',
};

/** 자주검사 행의 미준수 단계 수 (noData면 3) */
export function countNonCompliantStages(row) {
  if (row.noData) return SHIFT_STAGES.length;
  return SHIFT_STAGES.filter((stage) => !row[stage]?.done).length;
}

/** 미준수 단계가 많은 순 → 적은 순 → 이름순 */
export function sortComplianceByNonCompliance(rows) {
  return [...rows].sort((a, b) => {
    const diff = countNonCompliantStages(b) - countNonCompliantStages(a);
    if (diff !== 0) return diff;
    return a.worker_name.localeCompare(b.worker_name, 'ko');
  });
}

/**
 * 완료율 기반 상태 라벨 (자주검사·3정5S 공통)
 * @param {number|null|undefined} rate - 0~1 완료율
 * @returns {{ label: '정상'|'미흡'|'불량', tone: 'good'|'warn'|'danger' }}
 */
export function getComplianceStatusLabel(rate) {
  if (rate === 1) {
    return { label: '정상', tone: 'good' };
  }
  if (rate != null && rate > 0.5 && rate < 1) {
    return { label: '미흡', tone: 'warn' };
  }
  return { label: '불량', tone: 'danger' };
}

/** 자주검사 현황을 주간→야간→미정 순으로 그룹화 (그룹 내 미준수 단계 많은 순) */
export function groupComplianceByShift(compliance) {
  const buckets = Object.fromEntries(COMPLIANCE_SHIFT_ORDER.map((shift) => [shift, []]));

  for (const row of compliance) {
    const shift = COMPLIANCE_SHIFT_ORDER.includes(row.shift) ? row.shift : 'unknown';
    buckets[shift].push(row);
  }

  for (const shift of COMPLIANCE_SHIFT_ORDER) {
    buckets[shift] = sortComplianceByNonCompliance(buckets[shift]);
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
