/**
 * 재계산 upsert 한 행. reviewed면 관리자 판정·조·시각 유지, 신호만 갱신.
 */
export function buildAttendanceUpsertRow({
  companyId,
  workDate,
  workerName,
  judged,
  prev = null,
  overwriteReviewed = false,
  nowIso = new Date().toISOString(),
}) {
  if (prev?.reviewed && !overwriteReviewed) {
    return {
      company_id: companyId,
      worker_name: workerName,
      work_date: workDate,
      first_signal_at: judged.firstSignalAt,
      last_signal_at: judged.lastSignalAt,
      signal_kinds: judged.signalKinds,
      judgment: prev.judgment,
      estimated_clock_in: prev.estimated_clock_in,
      estimated_clock_out: prev.estimated_clock_out,
      is_ot: prev.is_ot,
      shift: prev.shift ?? judged.shift,
      judgment_rationale: prev.judgment_rationale ?? judged.judgmentRationale,
      flags: prev.flags ?? judged.flags,
      confidence: judged.confidence,
      reviewed: true,
      reviewed_by: prev.reviewed_by,
      reviewed_at: prev.reviewed_at,
      notes: prev.notes,
      updated_at: nowIso,
    };
  }

  return {
    company_id: companyId,
    worker_name: workerName,
    work_date: workDate,
    first_signal_at: judged.firstSignalAt,
    last_signal_at: judged.lastSignalAt,
    signal_kinds: judged.signalKinds,
    judgment: judged.judgment,
    estimated_clock_in: judged.estimatedClockIn,
    estimated_clock_out: judged.estimatedClockOut,
    is_ot: judged.isOt,
    shift: judged.shift,
    judgment_rationale: judged.judgmentRationale,
    flags: judged.flags || [],
    confidence: judged.confidence,
    reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: nowIso,
  };
}
