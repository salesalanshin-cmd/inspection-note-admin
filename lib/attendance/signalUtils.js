/**
 * @typedef {{ type: string, at: string, sourceId?: string, eventType?: string }} AttendanceSignal
 * @typedef {{
 *   type: string,
 *   at: string,
 *   merged: boolean,
 *   bundleSize: number,
 *   rawAts: string[],
 *   sourceId?: string,
 *   eventType?: string,
 * }} SignalBundle
 */

export const FLAG_MERGED_DUPLICATES = '중복 촬영 병합';

/**
 * 순수 함수: 신호 배열 → first/last + kinds 요약 (표시용)
 * @param {AttendanceSignal[]} signals
 */
export function summarizeSignals(signals) {
  const list = [...(signals || [])].sort(
    (a, b) => new Date(a.at) - new Date(b.at)
  );
  if (!list.length) {
    return {
      firstSignalAt: null,
      lastSignalAt: null,
      signalKinds: [],
      types: [],
    };
  }
  const types = [...new Set(list.map((s) => s.type).filter(Boolean))];
  return {
    firstSignalAt: list[0].at,
    lastSignalAt: list[list.length - 1].at,
    signalKinds: list.map((s) => ({
      type: s.type,
      at: s.at,
      ...(s.sourceId ? { sourceId: s.sourceId } : {}),
      ...(s.eventType ? { eventType: s.eventType } : {}),
    })),
    types,
  };
}

/**
 * 같은 종류·N분 이내 연속 신호 → 묶음. 대표 시각 = 묶음 시작.
 * 종류가 다르면 병합하지 않음.
 * @param {AttendanceSignal[]} signals
 * @param {number} [mergeMinutes=10]
 * @returns {{ bundles: SignalBundle[], rawCount: number, mergedCount: number, hadMerge: boolean }}
 */
export function mergeSignals(signals, mergeMinutes = 10) {
  const mergeMs = Math.max(0, Number(mergeMinutes) || 0) * 60 * 1000;
  const list = [...(signals || [])]
    .filter((s) => s?.at && s?.type)
    .sort((a, b) => {
      const dt = new Date(a.at) - new Date(b.at);
      if (dt !== 0) return dt;
      return String(a.type).localeCompare(String(b.type));
    });

  /** @type {SignalBundle[]} */
  const bundles = [];
  /** @type {Map<string, SignalBundle>} last open bundle per type */
  const openByType = new Map();

  for (const s of list) {
    const type = String(s.type);
    const atMs = new Date(s.at).getTime();
    const open = openByType.get(type);
    const lastInBundle = open?.rawAts?.[open.rawAts.length - 1] || open?.at;
    if (
      open &&
      mergeMs > 0 &&
      lastInBundle &&
      atMs - new Date(lastInBundle).getTime() <= mergeMs
    ) {
      open.rawAts.push(s.at);
      open.bundleSize += 1;
      open.merged = true;
      continue;
    }
    const bundle = {
      type,
      at: s.at,
      merged: false,
      bundleSize: 1,
      rawAts: [s.at],
      ...(s.sourceId ? { sourceId: s.sourceId } : {}),
      ...(s.eventType ? { eventType: s.eventType } : {}),
    };
    bundles.push(bundle);
    openByType.set(type, bundle);
  }

  bundles.sort((a, b) => new Date(a.at) - new Date(b.at));
  const rawCount = list.length;
  const mergedCount = bundles.length;
  const hadMerge = bundles.some((b) => b.merged);

  return { bundles, rawCount, mergedCount, hadMerge };
}

/**
 * 출근 = 최초 묶음. 퇴근 = 출근과 M분 이상 떨어진 마지막 묶음.
 * M분 안의 추가 묶음은 출근 중복(슬롯 1개만 소비).
 * @param {SignalBundle[]} bundles
 * @param {number} [minGapMinutes=60]
 */
export function resolveClockFromBundles(bundles, minGapMinutes = 60) {
  const sorted = [...(bundles || [])].sort(
    (a, b) => new Date(a.at) - new Date(b.at)
  );
  if (!sorted.length) {
    return {
      clockIn: null,
      clockOut: null,
      clockInAt: null,
      clockOutAt: null,
      duplicateOfClockIn: [],
    };
  }

  const gapMs = Math.max(0, Number(minGapMinutes) || 0) * 60 * 1000;
  const clockIn = sorted[0];
  const clockInMs = new Date(clockIn.at).getTime();
  const duplicateOfClockIn = [];
  /** @type {SignalBundle|null} */
  let clockOut = null;

  for (let i = 1; i < sorted.length; i += 1) {
    const b = sorted[i];
    const t = new Date(b.at).getTime();
    if (t - clockInMs < gapMs) {
      duplicateOfClockIn.push(b);
      continue;
    }
    clockOut = b;
  }

  return {
    clockIn,
    clockOut,
    clockInAt: clockIn.at,
    clockOutAt: clockOut?.at || null,
    duplicateOfClockIn,
  };
}

/** signal_kinds 저장용 JSON (원본 목록 + 묶음 메타) */
export function buildSignalKindsPayload({
  rawSignals,
  bundles,
  rawCount,
  mergedCount,
  hadMerge,
  clockInAt,
  clockOutAt,
}) {
  const rawList = [...(rawSignals || [])].sort(
    (a, b) => new Date(a.at) - new Date(b.at)
  );
  return {
    rawCount,
    mergedCount,
    hadMerge: Boolean(hadMerge),
    clockInAt: clockInAt || null,
    clockOutAt: clockOutAt || null,
    bundles: (bundles || []).map((b) => ({
      type: b.type,
      at: b.at,
      merged: Boolean(b.merged),
      bundleSize: b.bundleSize,
      rawAts: b.rawAts || [b.at],
      ...(b.sourceId ? { sourceId: b.sourceId } : {}),
      ...(b.eventType ? { eventType: b.eventType } : {}),
    })),
    // 하위 호환: 배열처럼 map 하던 UI를 위해 raw도 포함
    raw: rawList.map((s) => ({
      type: s.type,
      at: s.at,
      ...(s.sourceId ? { sourceId: s.sourceId } : {}),
      ...(s.eventType ? { eventType: s.eventType } : {}),
    })),
  };
}

export function signalRawMergedCounts(signalKinds) {
  if (!signalKinds) return { raw: 0, merged: 0, hadMerge: false };
  if (Array.isArray(signalKinds)) {
    return { raw: signalKinds.length, merged: signalKinds.length, hadMerge: false };
  }
  if (typeof signalKinds === 'object') {
    return {
      raw: Number(signalKinds.rawCount) || (signalKinds.raw || []).length || 0,
      merged:
        Number(signalKinds.mergedCount) ||
        (signalKinds.bundles || []).length ||
        0,
      hadMerge: Boolean(signalKinds.hadMerge),
    };
  }
  return { raw: 0, merged: 0, hadMerge: false };
}

export function formatSignalListLabel(signalKinds) {
  const SIGNAL_TYPE_LABELS = {
    fives: '3정5S',
    frequent: '자주검사',
    defect: '불량',
    lot_move: 'LOT이동',
    production: '실적',
    lot: 'LOT',
  };
  if (!signalKinds) return '—';
  const bundles = Array.isArray(signalKinds)
    ? signalKinds
    : signalKinds.bundles || signalKinds.raw || [];
  if (!bundles.length) return '—';
  return bundles
    .map((b) => {
      const label = SIGNAL_TYPE_LABELS[b.type] || b.type;
      const extra = b.merged || (b.bundleSize && b.bundleSize > 1)
        ? `×${b.bundleSize || 1}`
        : '';
      return `${label}${extra}`;
    })
    .join(', ');
}
