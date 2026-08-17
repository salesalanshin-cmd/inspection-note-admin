'use client';

import { DEFAULT_PROCESS_FILTER, PROCESS_FILTER_ALL, WORKER_PROCESSES } from '../lib/constants';

const selectClass =
  'min-h-[44px] w-full flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 md:w-auto md:flex-none md:min-h-0';

/**
 * 현황 화면 공통 공정 필터.
 * 기본값 주조. "전체"는 미지정(process null) 작업자까지 포함.
 */
export default function ProcessFilterSelect({
  value = DEFAULT_PROCESS_FILTER,
  onChange,
  className = '',
}) {
  return (
    <label className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <span className="shrink-0 text-xs text-muted">공정</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="공정"
        className={selectClass}
      >
        {WORKER_PROCESSES.map((process) => (
          <option key={process} value={process}>
            {process}
          </option>
        ))}
        <option value={PROCESS_FILTER_ALL}>전체</option>
      </select>
    </label>
  );
}
