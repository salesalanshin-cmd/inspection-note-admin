'use client';

const selectClass =
  'mb-3 w-full min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 md:hidden';

/**
 * 모바일 카드 리스트 상단 정렬 드롭다운 (데스크톱에서는 숨김)
 * @param {{ value: string, label: string }[]} options - value 형식: "sortKey:sortDir"
 */
export default function MobileSortSelect({ value, options, onChange, className = '' }) {
  return (
    <select
      className={`${selectClass} ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="정렬 기준"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function parseSortValue(combined) {
  const sep = combined.lastIndexOf(':');
  return {
    key: combined.slice(0, sep),
    dir: combined.slice(sep + 1),
  };
}
