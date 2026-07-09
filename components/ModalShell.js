'use client';

import { X } from 'lucide-react';

/**
 * 데스크톱: 중앙 카드형 모달 / 모바일: 풀스크린 + sticky 헤더·푸터
 */
export default function ModalShell({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  ariaLabel,
  maxWidthClass = 'md:max-w-4xl',
  maxHeightClass = 'md:max-h-[92vh]',
  zClass = 'z-50',
}) {
  return (
    <div
      className={`fixed inset-0 ${zClass} flex md:items-center md:justify-center md:bg-black/50 md:p-4`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
    >
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-surface md:h-auto md:rounded-xl md:shadow-card ${maxHeightClass} ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[2.5rem_1fr_2.5rem] items-center border-b border-border bg-surface px-3 py-3 md:flex md:grid-cols-none md:items-center md:justify-between md:px-5 md:py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-text md:hidden"
            aria-label="닫기"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="min-w-0 text-center md:text-left">
            {eyebrow ? (
              <div className="hidden text-xs font-medium text-accent md:block">{eyebrow}</div>
            ) : null}
            <h2 className="truncate text-base font-semibold text-text md:text-lg">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-text md:flex"
            aria-label="닫기"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 shrink-0 border-t border-border bg-surface px-4 py-3 md:static md:px-5 md:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ModalFooterActions({ onCancel, onConfirm, cancelLabel = '취소', confirmLabel, confirmDisabled, confirmClassName }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={confirmDisabled}
        className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className={
          confirmClassName ||
          'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0'
        }
      >
        {confirmLabel}
      </button>
    </div>
  );
}
