import { CLOCK_OUT_ON_TIME_ADJUST_MINUTES } from '../constants.js';
import {
  ATTENDANCE_DEFAULT_POLICIES,
  resolvePolicyForWorker,
} from './policy.js';
import {
  buildSignalKindsPayload,
  FLAG_MERGED_DUPLICATES,
  mergeSignals,
  resolveClockFromBundles,
  summarizeSignals,
} from './signalUtils.js';
import { buildAttendanceAutoComment } from './autoComment.js';
import {
  formatJudgmentRationaleSummary,
  policyTimeDayOffset,
  resolveAttendanceShift,
  resolveEstimatedClockIn,
  resolveEstimatedClockOut,
  selectSignalsForShift,
  SHIFT_DAY,
  wallTimeOnWorkDate,
} from './shift.js';

export { wallTimeOnWorkDate };

/**
 * 근태 판정 (순수 함수)
 * - 교대 확정 → 조 window 신호 → N분 병합 → M분 퇴근 간격
 * - first/last 는 표시용. 판정은 묶음·출근/퇴근 후보로 계산.
 */

function policyMergeMinutes(policy) {
  const n = Number(policy?.signal_merge_minutes);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

function policyClockOutGapMinutes(policy) {
  const n = Number(policy?.clock_out_min_gap_minutes);
  return Number.isFinite(n) && n >= 0 ? n : 60;
}

/**
 * @param {object} opts
 */
export function judgeAttendance({
  workDate,
  signals,
  dayPolicy,
  nightPolicy,
  policy: policyOverride = null,
  nationality = null,
  defaultShift = null,
  recentShifts = [],
  shift: shiftOverride = null,
}) {
  const dayPol =
    dayPolicy ||
    resolvePolicyForWorker(ATTENDANCE_DEFAULT_POLICIES, null, 'day');
  const nightPol =
    nightPolicy ||
    resolvePolicyForWorker(ATTENDANCE_DEFAULT_POLICIES, '주조', 'night');

  const shiftInfo = resolveAttendanceShift({
    signals,
    workDate,
    dayPolicy: dayPol,
    nightPolicy: nightPol,
    nationality,
    defaultShift,
    recentShifts,
  });

  const shift =
    shiftOverride === 'day' || shiftOverride === 'night'
      ? shiftOverride
      : shiftInfo.shift || SHIFT_DAY;

  const policy =
    policyOverride || (shift === 'night' ? nightPol : dayPol);

  const shiftSignals = selectSignalsForShift(
    signals,
    workDate,
    shift,
    dayPol,
    nightPol
  );

  const mergeMinutes = policyMergeMinutes(policy);
  const gapMinutes = policyClockOutGapMinutes(policy);
  const { bundles, rawCount, mergedCount, hadMerge } = mergeSignals(
    shiftSignals,
    mergeMinutes
  );
  const clock = resolveClockFromBundles(bundles, gapMinutes);

  // 표시용 first/last = 원본 전체 (판정 입력 아님)
  const displaySummary = summarizeSignals(shiftSignals);

  const flags = [...(shiftInfo.flags || [])];
  if (hadMerge) flags.push(FLAG_MERGED_DUPLICATES);

  const rationale = {
    shift,
    rule: shiftOverride ? 'manual_override' : shiftInfo.rule,
    nationality: shiftInfo.nationality,
    nationalityStatus: shiftInfo.nationalityStatus || null,
    daySignalCount: shiftInfo.daySignalCount,
    nightSignalCount: shiftInfo.nightSignalCount,
    firstSignalAt: displaySummary.firstSignalAt,
    lastSignalAt: displaySummary.lastSignalAt,
    clockInAt: clock.clockInAt,
    clockOutAt: clock.clockOutAt,
    signalRawCount: rawCount,
    signalMergedCount: mergedCount,
    flags,
  };

  const signalKinds = buildSignalKindsPayload({
    rawSignals: shiftSignals,
    bundles,
    rawCount,
    mergedCount,
    hadMerge,
    clockInAt: clock.clockInAt,
    clockOutAt: clock.clockOutAt,
  });

  if (!clock.clockIn) {
    attachAutoComment(rationale, {
      rawSignals: shiftSignals,
      bundles,
      clockInAt: clock.clockInAt,
      clockOutAt: null,
      lastSignalAt: displaySummary.lastSignalAt,
    });
    return {
      judgment: 'unconfirmed',
      firstSignalAt: displaySummary.firstSignalAt,
      lastSignalAt: displaySummary.lastSignalAt,
      signalKinds,
      estimatedClockIn: null,
      estimatedClockOut: null,
      isOt: false,
      confidence: 'low',
      shift: shift || SHIFT_DAY,
      flags: [...new Set(flags)],
      judgmentRationale: rationale,
      clockOutConfirmed: false,
    };
  }

  const startHm =
    policy?.work_start_time || (shift === 'night' ? '20:00' : '08:00');
  const workEndHm = String(policy?.work_end_time || '').trim();
  const endHm = workEndHm || (shift === 'night' ? '08:00' : '17:00');
  const otThrHm =
    policy?.ot_threshold_time || (shift === 'night' ? '06:00' : '18:00');
  const otEndHm =
    policy?.ot_end_time || (shift === 'night' ? '08:00' : '20:00');

  const workStart = wallTimeOnWorkDate(workDate, startHm, 0);
  const workEnd = wallTimeOnWorkDate(
    workDate,
    endHm,
    policyTimeDayOffset(startHm, endHm)
  );
  const otThreshold = wallTimeOnWorkDate(
    workDate,
    otThrHm,
    policyTimeDayOffset(startHm, otThrHm)
  );
  const otEnd = wallTimeOnWorkDate(
    workDate,
    otEndHm,
    policyTimeDayOffset(startHm, otEndHm)
  );

  const estimatedClockInDate = resolveEstimatedClockIn(
    workStart,
    clock.clockInAt,
    policy?.adjust_minutes ?? 0
  );

  let estimatedClockOut = null;
  let isOt = false;
  const clockOutConfirmed = Boolean(clock.clockOut);

  if (clock.clockOut) {
    const outAt = new Date(clock.clockOutAt);
    isOt = outAt.getTime() >= otThreshold.getTime();
    estimatedClockOut = outAt.toISOString();
    // OT이고 정책 ot_end가 신호보다 늦을 때만 ot_end로 올림 (기존 동작 유지)
    if (isOt && otEnd.getTime() > outAt.getTime()) {
      estimatedClockOut = otEnd.toISOString();
    } else if (workEndHm) {
      const snapped = resolveEstimatedClockOut(
        workEnd,
        outAt,
        CLOCK_OUT_ON_TIME_ADJUST_MINUTES
      );
      estimatedClockOut = snapped.at;
      if (snapped.adjusted) rationale.clockOutAdjusted = true;
    }
  }

  attachAutoComment(rationale, {
    rawSignals: shiftSignals,
    bundles,
    clockInAt: clock.clockInAt,
    clockOutAt: clock.clockOutAt,
    lastSignalAt: displaySummary.lastSignalAt,
    estimatedClockIn: estimatedClockInDate.toISOString(),
    policyStartHm: startHm,
    existingText: formatJudgmentRationaleSummary(rationale),
  });

  return {
    judgment: 'present',
    firstSignalAt: displaySummary.firstSignalAt,
    lastSignalAt: displaySummary.lastSignalAt,
    signalKinds,
    estimatedClockIn: estimatedClockInDate.toISOString(),
    estimatedClockOut,
    isOt,
    confidence: resolveConfidence(bundles),
    shift,
    flags: [...new Set(flags)],
    judgmentRationale: rationale,
    clockOutConfirmed,
  };
}

function attachAutoComment(rationale, input) {
  const comment = buildAttendanceAutoComment(input);
  const baseFlags = Array.isArray(rationale.flags) ? rationale.flags : [];
  rationale.autoComment = comment.autoComment;
  rationale.flags = [...new Set([...baseFlags, ...comment.flags])];
}

function resolveConfidence(bundles) {
  const types = [...new Set((bundles || []).map((b) => b.type).filter(Boolean))];
  const count = (bundles || []).length;
  if (types.length >= 2 || count >= 3) return 'high';
  if (count >= 1) return 'medium';
  return 'low';
}

export function judgmentLabel(judgment) {
  if (judgment === 'present') return '출근';
  if (judgment === 'unconfirmed') return '미확인';
  return judgment || '—';
}
