import { INSPECTION_CYCLE_DAYS, FIVES_CYCLE_DAYS, TREND_RANGE_DAYS, defectLabel } from './constants';

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function dateKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

/**
 * 작업자별로 불량/양품/3정5S 기록을 집계하고 미준수 여부를 판정합니다.
 * 워커 로스터 테이블이 따로 없으므로, 세 테이블 중 한 번이라도 기록을 남긴
 * worker_name만 대상이 됩니다 (아직 한 번도 기록하지 않은 신규 작업자는 잡히지 않음).
 */
export function buildWorkerStats(defects, goods, fives) {
  const map = new Map();

  const touch = (name) => {
    if (!name) return null;
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
