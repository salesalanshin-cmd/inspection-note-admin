'use client';

import {
  getRecentDaysRange,
  getThisMonthRange,
  getTodayRange,
  isDateRangeValid,
} from '../lib/dateRange';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

const presetBtnClass =
  'rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text';

const PRESETS = [
  { label: '오늘', getRange: getTodayRange },
  { label: '최근 7일', getRange: () => getRecentDaysRange(7) },
  { label: '최근 30일', getRange: () => getRecentDaysRange(30) },
  { label: '이번 달', getRange: getThisMonthRange },
];

/**
 * @param {{ start: string, end: string }} value - YYYY-MM-DD
 * @param {(range: { start: string, end: string }) => void} onChange
 */
export default function DateRangePicker({ value, onChange }) {
  const valid = isDateRangeValid(value);

  function update(field, next) {
    onChange({ ...value, [field]: next });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value.start}
          onChange={(e) => update('start', e.target.value)}
          className={inputClass}
          aria-label="시작일"
        />
        <span className="text-xs text-muted">~</span>
        <input
          type="date"
          value={value.end}
          onChange={(e) => update('end', e.target.value)}
          className={inputClass}
          aria-label="종료일"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.getRange())}
            className={presetBtnClass}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {!valid && value.start && value.end ? (
        <p className="text-xs text-danger">시작일이 종료일보다 늦을 수 없습니다.</p>
      ) : null}
    </div>
  );
}

export { isDateRangeValid };
