'use client';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmTone = 'accent',
  onConfirm,
  onCancel,
  loading = false,
}) {
  if (!open) return null;

  const confirmClass =
    confirmTone === 'danger'
      ? 'rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50'
      : 'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <p className="mt-2 text-sm text-muted leading-relaxed">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
          >
            취소
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className={confirmClass}>
            {loading ? '처리 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
