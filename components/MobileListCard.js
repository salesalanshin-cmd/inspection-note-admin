'use client';

export function MobileCardField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-text">{children}</div>
    </div>
  );
}

export default function MobileListCard({ header, badge, leading, children, className = '', onClick }) {
  const interactive = Boolean(onClick);
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(e);
              }
            }
          : undefined
      }
      className={`mb-3 w-full rounded-xl border border-border bg-surface p-4 text-left transition-colors ${
        interactive ? 'cursor-pointer hover:bg-surface2/40' : ''
      } ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        {leading ? <div className="shrink-0 pt-0.5">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-base font-semibold text-text">{header}</div>
            {badge ? <div className="shrink-0">{badge}</div> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
