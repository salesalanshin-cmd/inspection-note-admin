'use client';

/**
 * Sticky toolbar + scrollable table area for list pages.
 */
export default function PageTableShell({ toolbar, table, footer }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 shrink-0 space-y-3 bg-bg pb-4">{toolbar}</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
        <div className="min-h-0 flex-1 overflow-y-auto max-md:px-0 max-md:py-1">{table}</div>
      </div>
      {footer ? <div className="shrink-0 pt-3">{footer}</div> : null}
    </div>
  );
}
