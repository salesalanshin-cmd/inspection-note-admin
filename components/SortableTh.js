'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * @param {{
 *   column: string,
 *   sortKey: string|null,
 *   sortDir: 'asc'|'desc',
 *   onSort: (column: string) => void,
 *   children: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export default function SortableTh({ column, sortKey, sortDir, onSort, children, className = '' }) {
  const active = sortKey === column;

  return (
    <th
      className={`px-4 py-3 cursor-pointer select-none transition-colors hover:text-text ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          sortDir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )
        ) : null}
      </span>
    </th>
  );
}
