/**
 * @typedef {{ type: string, at: string, sourceId?: string, eventType?: string }} AttendanceSignal
 */

/**
 * 순수 함수: 신호 배열 → first/last + kinds 요약
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
