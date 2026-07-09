'use client';

import Link from 'next/link';
import { Home } from 'lucide-react';

export default function TopBar() {
  return (
    <div className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-end border-b border-border bg-surface px-6">
      <Link
        href="/dashboard"
        aria-label="대시보드로 이동"
        title="대시보드"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:bg-surface2 hover:text-text"
      >
        <Home className="h-[18px] w-[18px]" strokeWidth={2} />
      </Link>
    </div>
  );
}
