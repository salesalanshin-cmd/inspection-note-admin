import { getCodeLabel } from './constants.js';
import { addKstDays, formatKstISODate, getKstDay, startOfKstDay } from './kst.js';

export const ACCURACY_LOW_SAMPLE_MAX = 4;
export const ACCURACY_TREND_WEEKS = 8;

/** KST 달력 월요일 00:00. 일요일은 직전 월요일. */
export function startOfKstWeek(date) {
  const day = getKstDay(date);
  const offset = day === 0 ? 6 : day - 1;
  return addKstDays(startOfKstDay(date), -offset);
}

export function addKstWeeks(weekStart, weeks) {
  return addKstDays(startOfKstWeek(weekStart), weeks * 7);
}

/** [weekStart, 다음 월요일) */
export function isInKstWeek(createdAt, weekStart) {
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return false;
  const start = startOfKstWeek(weekStart).getTime();
  const end = addKstDays(startOfKstWeek(weekStart), 7).getTime();
  return time >= start && time < end;
}

export function formatAccuracyPercent(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  const pct = Math.round(rate * 1000) / 10;
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(1)}%`;
}

function codeKey(value) {
  const text = value == null ? '' : String(value).trim();
  return text;
}

function labelFor(code) {
  if (!code) return '코드 없음';
  return getCodeLabel('defect', code) || code;
}

function rateOf(corrected, judged) {
  if (!judged) return null;
  return corrected / judged;
}

function isDefectJudgement(row) {
  if (row?.code_set !== 'defect') return false;
  return row.was_ai_accepted === true || row.was_ai_accepted === false;
}

/**
 * 선택 주의 AI 제안 코드별 오진율. 오진율 높은 순.
 * @returns {Array<{ code: string, label: string, judged: number, accepted: number, corrected: number, rate: number|null, lowSample: boolean }>}
 */
export function summarizeWeekAccuracy(rows, weekStart) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (!isDefectJudgement(row) || !isInKstWeek(row.created_at, weekStart)) continue;
    const code = codeKey(row.ai_suggested_code);
    const current = buckets.get(code) || {
      code,
      label: labelFor(code),
      judged: 0,
      accepted: 0,
      corrected: 0,
    };
    current.judged += 1;
    if (row.was_ai_accepted === true) current.accepted += 1;
    else current.corrected += 1;
    buckets.set(code, current);
  }

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      rate: rateOf(row.corrected, row.judged),
      lowSample: row.judged <= ACCURACY_LOW_SAMPLE_MAX,
    }))
    .sort((a, b) => {
      const ar = a.rate ?? -1;
      const br = b.rate ?? -1;
      if (br !== ar) return br - ar;
      if (b.judged !== a.judged) return b.judged - a.judged;
      return a.label.localeCompare(b.label, 'ko');
    });
}

/**
 * weekStart를 끝으로 하는 최근 n주 전체 오진율. 오래된 주가 앞.
 */
export function weeklyAccuracyTrend(rows, weekStart, weeks = ACCURACY_TREND_WEEKS) {
  const end = startOfKstWeek(weekStart);
  const points = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = addKstDays(end, -7 * index);
    let judged = 0;
    let corrected = 0;
    for (const row of rows || []) {
      if (!isDefectJudgement(row) || !isInKstWeek(row.created_at, start)) continue;
      judged += 1;
      if (row.was_ai_accepted === false) corrected += 1;
    }
    const endDay = addKstDays(start, 6);
    points.push({
      weekStart: start,
      startIso: formatKstISODate(start),
      label: `${formatKstISODate(start).slice(5).replace('-', '/')}–${formatKstISODate(endDay).slice(5).replace('-', '/')}`,
      judged,
      corrected,
      rate: rateOf(corrected, judged),
    });
  }
  return points;
}

/**
 * 이번 주 정정 조합 상위 limit개. 제품명이 있으면 그 조합에서 가장 많은 제품.
 */
export function topCorrectionCombos(rows, weekStart, limit = 5) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (row?.was_ai_accepted !== false) continue;
    if (!isDefectJudgement(row) || !isInKstWeek(row.created_at, weekStart)) continue;
    const aiCode = codeKey(row.ai_suggested_code);
    const finalCode = codeKey(row.final_code);
    const key = `${aiCode}\0${finalCode}`;
    const current = buckets.get(key) || {
      aiCode,
      finalCode,
      aiLabel: labelFor(aiCode),
      finalLabel: labelFor(finalCode),
      count: 0,
      products: new Map(),
    };
    current.count += 1;
    const product = String(row.product_name || '').trim();
    if (product) current.products.set(product, (current.products.get(product) || 0) + 1);
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.aiLabel.localeCompare(b.aiLabel, 'ko'))
    .slice(0, limit)
    .map((row) => {
      let topProduct = null;
      let topProductCount = 0;
      for (const [name, count] of row.products) {
        if (
          count > topProductCount ||
          (count === topProductCount && topProduct && name.localeCompare(topProduct, 'ko') < 0)
        ) {
          topProduct = name;
          topProductCount = count;
        }
      }
      return {
        aiCode: row.aiCode,
        finalCode: row.finalCode,
        aiLabel: row.aiLabel,
        finalLabel: row.finalLabel,
        count: row.count,
        topProduct,
        topProductCount,
      };
    });
}

export function formatKstWeekRange(weekStart) {
  const start = startOfKstWeek(weekStart);
  const end = addKstDays(start, 6);
  return `${formatKstISODate(start)} – ${formatKstISODate(end)}`;
}
