'use client';

import { parseMarkingData } from '../lib/markingData';

/** 썸네일용 — 마킹 도형 없이 우측 상단 뱃지만 표시 */
export function MarkingCountBadge({ markingData, className = '' }) {
  const count = parseMarkingData(markingData).length;
  if (!count) return null;

  return (
    <div
      className={`absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full bg-dangerSoft px-1.5 py-0.5 text-[10px] font-medium text-danger ${className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      마킹 {count}
    </div>
  );
}
