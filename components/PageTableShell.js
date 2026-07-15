'use client';

/**
 * Sticky toolbar + scrollable table area for list pages.
 * - variant="fill": 화면 높이를 채우고 표 영역만 스크롤 (기본)
 * - variant="flow": 문서 흐름으로 배치 (부모 overflow에서 스크롤)
 */
export default function PageTableShell({
  toolbar,
  table,
  footer,
  stickyToolbar = true,
  stickyTop = 0,
  variant = 'fill',
}) {
  const toolbarEl = toolbar ? (
    <div
      className={`shrink-0 space-y-3 bg-bg pb-4 ${stickyToolbar ? 'sticky z-10' : ''}`.trim()}
      style={stickyToolbar ? { top: stickyTop } : undefined}
    >
      {toolbar}
    </div>
  ) : null;

  if (variant === 'flow') {
    return (
      <div>
        {toolbarEl}
        <div className="rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
          <div className="max-md:px-0 max-md:py-1">{table}</div>
        </div>
        {footer ? <div className="pt-3">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbarEl}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
        <div className="min-h-0 flex-1 overflow-y-auto max-md:px-0 max-md:py-1">{table}</div>
      </div>
      {footer ? <div className="shrink-0 pt-3">{footer}</div> : null}
    </div>
  );
}
