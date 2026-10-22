import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  startOfKstDay,
} from '../kst.js';
import { summarizeSignals } from './signalUtils.js';

/**
 * 근태 판정 (순수 함수 — 테스트 대상)
 *
 * - 신호 있으면 present(출근), 없으면 unconfirmed(미확인)
 * - 추정 출근 = 정책 시작. 신호가 그보다 일러도 추정은 정책 시작 유지
 *   (신호 시각 이하로 보정하지 않음)
 * - 추정 퇴근 = 정책 종료. OT 기준 이후 신호가 있으면 is_ot + ot_end_time
 */

function parseHm(hm) {
  const parts = String(hm || '00:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return { h, m };
}

/** 근무일(YYYY-MM-DD) + HH:mm → UTC Date (KST 벽시계) */
export function wallTimeOnWorkDate(workDate, hm, dayOffset = 0) {
  const midnight = startOfKstDay(workDate);
  const { h, m } = parseHm(hm);
  return new Date(
    midnight.getTime() +
      dayOffset * MS_PER_DAY +
      h * MS_PER_HOUR +
      m * MS_PER_MINUTE
  );
}

/**
 * @param {object} opts
 * @param {string} opts.workDate
 * @param {Array} opts.signals
 * @param {object} opts.policy
 */
export function judgeAttendance({ workDate, signals, policy }) {
  const summary = summarizeSignals(signals);
  const hasSignal = summary.signalKinds.length > 0;

  if (!hasSignal) {
    return {
      judgment: 'unconfirmed',
      firstSignalAt: null,
      lastSignalAt: null,
      signalKinds: [],
      estimatedClockIn: null,
      estimatedClockOut: null,
      isOt: false,
      confidence: 'low',
    };
  }

  const workStart = wallTimeOnWorkDate(workDate, policy.work_start_time || '08:00');
  const workEnd = wallTimeOnWorkDate(workDate, policy.work_end_time || '17:00');
  const otThreshold = wallTimeOnWorkDate(
    workDate,
    policy.ot_threshold_time || '18:00'
  );
  const otEnd = wallTimeOnWorkDate(workDate, policy.ot_end_time || '20:00');

  // 추정 출근 = 정책 시작 (이른 신호로 더 이르게 내리지 않음)
  // adjust_minutes는 향후 UI 보정용으로 정책에 보관 (자동 판정에서는 시작 시각 고정)
  void policy.adjust_minutes;
  const estimatedClockIn = workStart;

  const lastAt = new Date(summary.lastSignalAt);
  const isOt = lastAt.getTime() >= otThreshold.getTime();
  const estimatedClockOut = isOt ? otEnd : workEnd;

  return {
    judgment: 'present',
    firstSignalAt: summary.firstSignalAt,
    lastSignalAt: summary.lastSignalAt,
    signalKinds: summary.signalKinds,
    estimatedClockIn: estimatedClockIn.toISOString(),
    estimatedClockOut: estimatedClockOut.toISOString(),
    isOt,
    confidence: resolveConfidence(summary),
  };
}

function resolveConfidence(summary) {
  const types = summary.types || [];
  const count = summary.signalKinds.length;
  if (types.length >= 2 || count >= 3) return 'high';
  if (count >= 1) return 'medium';
  return 'low';
}

export function judgmentLabel(judgment) {
  if (judgment === 'present') return '출근';
  if (judgment === 'unconfirmed') return '미확인';
  return judgment || '—';
}
