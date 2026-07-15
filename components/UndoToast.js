'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const DEFAULT_MS = 3000;

/**
 * 하단 고정 실행취소 토스트 (document.body 포탈)
 */
export default function UndoToast({
  open,
  message = '영역을 삭제했습니다.',
  onUndo,
  onDismiss,
  durationMs = DEFAULT_MS,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs, onDismiss]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[11000] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-border bg-text px-4 py-2.5 text-sm text-white shadow-card">
        <span className="min-w-0 flex-1 text-[13px] leading-snug">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/25"
        >
          실행취소
        </button>
      </div>
    </div>,
    document.body
  );
}
