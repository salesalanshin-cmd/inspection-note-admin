'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

const mobileTouchClass =
  '[&_button]:min-h-[44px] [&_select]:min-h-[44px] [&_input]:min-h-[44px]';

/**
 * 데스크톱: 가로 배치 / 모바일: primary(날짜 네비 등) 고정 + 필터 아코디언
 */
export default function FilterToolbar({ primary, children, aside, className = '' }) {
  const [open, setOpen] = useState(false);
  const hasFilters = Boolean(children) || Boolean(aside);

  return (
    <div className={className}>
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {primary}
            {children}
          </div>
          {aside ? <div className="flex flex-wrap items-center justify-end gap-2">{aside}</div> : null}
        </div>
      </div>

      {/* Mobile */}
      <div className={`md:hidden space-y-2 ${mobileTouchClass}`}>
        {primary ? <div className="w-full">{primary}</div> : null}
        {hasFilters ? (
          <>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface2"
              aria-expanded={open}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} />
              필터 옵션
            </button>
            {open ? (
              <div className="flex flex-col gap-2 [&>*]:w-full">
                {children}
                {aside}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
