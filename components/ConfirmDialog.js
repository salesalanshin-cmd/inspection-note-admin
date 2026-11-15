'use client';

import ModalShell, { ModalFooterActions } from './ModalShell';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = '취소',
  confirmTone = 'accent',
  onConfirm,
  onCancel,
  loading = false,
  error = null,
}) {
  if (!open) return null;

  const confirmClassName =
    confirmTone === 'danger'
      ? 'min-h-[44px] rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0'
      : 'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';

  return (
    <ModalShell
      title={title}
      onClose={onCancel}
      ariaLabel={title}
      maxWidthClass="md:max-w-md"
      zClass="z-[70]"
      footer={
        <ModalFooterActions
          onCancel={onCancel}
          onConfirm={onConfirm}
          cancelLabel={cancelLabel}
          confirmLabel={loading ? '처리 중...' : confirmLabel}
          confirmDisabled={loading}
          confirmClassName={confirmClassName}
        />
      }
    >
      <div className="space-y-3 px-4 py-5 md:px-6">
        <p className="text-sm leading-relaxed text-muted">{message}</p>
        {error ? (
          <p className="text-sm leading-relaxed text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
