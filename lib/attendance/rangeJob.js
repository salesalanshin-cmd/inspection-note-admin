import { eachDateInRange } from '../dateRange.js';
import { describeAttendanceExportRange } from './excel.js';

/**
 * 기간 재계산 요청 본문. overwriteReviewed를 넣지 않아 확인 완료 행은 유지된다.
 * @param {string} workDate
 */
export function buildAttendanceRecomputeBody(workDate) {
  return { workDate };
}

/**
 * 재계산할 근무일. 시작일부터 종료일까지 오름차순.
 * @returns {{ ok: boolean, dayCount: number, message: string, dates: string[] }}
 */
export function attendanceRangeDates(start, end) {
  const check = describeAttendanceExportRange({ start, end });
  if (!check.ok) return { ...check, dates: [] };
  return { ...check, dates: eachDateInRange({ start, end }) };
}

/**
 * 하루씩 순차 재계산. 실패한 날은 기록하고 다음 날로 넘어간다.
 * signal이 abort되면 진행 중인 호출 뒤 남은 날은 호출하지 않는다.
 */
export async function runAttendanceRangeRecompute({
  dates,
  recomputeDay,
  signal,
  onProgress,
}) {
  const failed = [];
  const list = dates || [];
  const total = list.length;

  for (let i = 0; i < list.length; i += 1) {
    if (signal?.aborted) {
      return { cancelled: true, failed, processed: i, total };
    }
    const workDate = list[i];
    onProgress?.({
      phase: 'running',
      index: i + 1,
      total,
      workDate,
      failed: [...failed],
    });
    try {
      await recomputeDay(workDate, signal);
    } catch (err) {
      if (signal?.aborted || err?.name === 'AbortError') {
        return { cancelled: true, failed, processed: i, total };
      }
      failed.push({
        workDate,
        error: err?.message || '재계산 실패',
      });
    }
  }

  return { cancelled: false, failed, processed: total, total };
}

/** @param {{ phase?: string, index?: number, total?: number, workDate?: string, processed?: number, cancelled?: boolean, failed?: Array<{workDate: string}> }} job */
export function formatRangeJobStatus(job) {
  if (!job || !job.total) return '';
  const failed = job.failed || [];
  const failedText = failed.length
    ? ` 실패: ${failed.map((item) => item.workDate).join(', ')}`
    : '';
  if (job.phase === 'running') {
    return `${job.index}/${job.total}일 처리 중 (${job.workDate})${failedText}`;
  }
  if (job.cancelled) {
    return `중단됨. ${job.processed ?? 0}/${job.total}일 완료.${failedText}`;
  }
  const succeeded = Math.max(0, (job.processed ?? job.total) - failed.length);
  if (failed.length) {
    return `${succeeded}/${job.total}일 완료.${failedText}`;
  }
  return `${job.total}/${job.total}일 완료`;
}
