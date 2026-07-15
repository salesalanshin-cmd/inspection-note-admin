'use client';

import { X } from 'lucide-react';

/**
 * 마킹 영역 우측 상단 삭제 버튼 (선택/호버 시에만 노출)
 */
export default function RegionDeleteButton({ visible, onDelete, className = '' }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      className={`absolute -right-2.5 -top-2.5 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow-sm transition-opacity hover:opacity-90 ${className}`.trim()}
      aria-label="이 영역 삭제"
      title="이 영역 삭제"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete?.();
      }}
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.5} />
    </button>
  );
}
