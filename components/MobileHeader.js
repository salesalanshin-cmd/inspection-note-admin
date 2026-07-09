'use client';

import Link from 'next/link';
import { Home, Menu } from 'lucide-react';

export default function MobileHeader({ onMenuOpen }) {
  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 md:hidden">
      <button
        type="button"
        onClick={onMenuOpen}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:bg-surface2 hover:text-text"
        aria-label="메뉴 열기"
      >
        <Menu className="h-5 w-5" strokeWidth={2} />
      </button>
      <Link
        href="/dashboard"
        className="min-w-0 flex-1 truncate text-sm font-semibold text-text"
      >
        디케이메탈 검사노트
      </Link>
      <Link
        href="/dashboard"
        aria-label="대시보드로 이동"
        title="대시보드"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:bg-surface2 hover:text-text"
      >
        <Home className="h-[18px] w-[18px]" strokeWidth={2} />
      </Link>
    </header>
  );
}
