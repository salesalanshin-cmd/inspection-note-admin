'use client';

import Link from 'next/link';
import { Home, Sparkles } from 'lucide-react';

export default function TopBar() {
  return (
    <div className="sticky top-0 z-40 hidden h-14 shrink-0 items-center justify-end gap-2 border-b border-border bg-surface px-6 md:flex">
      <Link
        href="/insight-lab"
        aria-label="인사이트 랩(AI대화)로 이동"
        title="인사이트 랩(AI대화)"
        className="group relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-r from-accent/15 to-accent/0 px-2.5 text-xs font-medium text-text transition-colors hover:from-accent/25 hover:to-accent/5 hover:text-accent"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
        <span>인사이트 랩(AI대화)</span>
      </Link>
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
