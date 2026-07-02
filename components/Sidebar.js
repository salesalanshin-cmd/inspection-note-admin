'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: '대시보드', code: '01' },
  { href: '/workers', label: '작업자 현황', code: '02' },
  { href: '/defects', label: '불량 기록', code: '03' },
  { href: '/fives', label: '3정5S', code: '04' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <div className="text-[11px] tracking-[0.25em] text-accent font-mono">SOONHAN LABS</div>
        <div className="font-display text-lg font-semibold text-text mt-1">검사노트 관제실</div>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm border-l-2 transition-colors ${
                active
                  ? 'border-accent bg-surface2 text-text'
                  : 'border-transparent text-muted hover:text-text hover:bg-surface2/60'
              }`}
            >
              <span className="font-mono text-xs text-accent/80">{item.code}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-border text-[11px] text-muted font-mono leading-relaxed">
        INSPECTION NOTE
        <br />
        ADMIN CONSOLE v0.1
      </div>
    </aside>
  );
}
