'use client';

export default function GalleryFloatingBar({ count, children }) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 shadow-card">
      <span className="text-sm text-text">{count}개 선택됨</span>
      {children}
    </div>
  );
}
