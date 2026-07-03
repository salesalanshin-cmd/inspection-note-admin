'use client';

export default function BatchClassifyProgress({ done, total, label }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-card">
        <p className="text-sm font-medium text-text">{label || 'AI 일괄판정 중...'}</p>
        <p className="mt-1 text-xs text-muted">
          {done} / {total}건 처리됨 ({pct}%)
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
