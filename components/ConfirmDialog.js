'use client';

import ModalShell, { ModalFooterActions } from './ModalShell';

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
          cancelLabel="취소"
          confirmLabel={loading ? '처리 중...' : confirmLabel}
          confirmDisabled={loading}
          confirmClassName={confirmClassName}
        />
      }
    >
      <p className="px-4 py-5 text-sm leading-relaxed text-muted md:px-6">{message}</p>
    </ModalShell>
  );
}
