'use client';

import Link from 'next/link';
import { Home, Menu, Sparkles } from 'lucide-react';

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
        href="/insight-lab"
        aria-label="인사이트 랩(AI대화)로 이동"
        title="인사이트 랩(AI대화)"
        className="group relative inline-flex h-10 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-r from-accent/15 to-accent/0 px-2.5 text-xs font-medium text-text transition-colors hover:from-accent/25 hover:to-accent/5 hover:text-accent"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
        <span className="hidden sm:inline">인사이트 랩(AI대화)</span>
        <span className="sm:hidden">AI</span>
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
