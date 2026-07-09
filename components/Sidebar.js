'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: '대시보드', code: '01' },
  { href: '/workers', label: '작업자 현황', code: '02' },
  { href: '/daily-performance', label: '일일 실적 관리', code: '03' },
  { href: '/frequent-check', label: '자주검사 현황', code: '04' },
  { href: '/fives', label: '3정5S', code: '05' },
  { href: '/defects', label: '불량기록', code: '06' },
  { href: '/documents', label: '문서스캔', code: '07' },
];

const SETTINGS_NAV = [
  { href: '/worker-management', label: '작업자 관리', code: '08' },
  { href: '/trash', label: '휴지통', code: '09' },
];

const INSIGHT_LAB_NAV = {
  href: '/insight-lab',
  label: '인사이트 랩',
};

function NavLink({ item, active }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors ${
        active
          ? 'bg-accentSoft text-accent font-medium'
          : 'text-muted hover:text-text hover:bg-surface2'
      }`}
    >
      <span className="text-xs text-muted">{item.code}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function InsightLabNavLink({ active }) {
  return (
    <Link
      href={INSIGHT_LAB_NAV.href}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'bg-gradient-to-r from-accent/10 to-transparent text-accent font-medium'
          : 'bg-gradient-to-r from-accent/5 to-transparent text-text hover:from-accent/10'
      }`}
    >
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-gradient-to-b from-accent to-[#6366F1] ${
          active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
        }`}
      />
      <Sparkles
        className={`ml-1 h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-accent/70 group-hover:text-accent'}`}
        strokeWidth={2}
      />
      <span>{INSIGHT_LAB_NAV.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="w-60 shrink-0 bg-surface shadow-sidebar flex flex-col">
      <div className="px-5 py-6">
        <div className="text-xs font-medium text-accent">(주)디케이메탈</div>
        <div className="text-lg font-semibold text-text mt-1">검사노트 관리</div>
      </div>
      <nav className="flex-1 py-2 px-3 min-h-0">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname?.startsWith(item.href)} />
        ))}
        <div className="my-3 border-t border-border" />
        <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          운영 설정
        </div>
        {SETTINGS_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname?.startsWith(item.href)} />
        ))}
      </nav>

      <div className="px-3 pb-3 shrink-0">
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <span className="rounded-full bg-gradient-to-r from-accent to-[#6366F1] px-1.5 py-0.5 text-[8px] font-bold leading-none text-white">
              AI
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              인사이트 랩
            </span>
          </div>
          <InsightLabNavLink active={pathname?.startsWith(INSIGHT_LAB_NAV.href)} />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-border space-y-3">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full rounded-xl border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
        >
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
        <div className="text-xs text-muted leading-relaxed">
          INSPECTION NOTE
          <br />
          ADMIN CONSOLE v0.1
        </div>
      </div>
    </aside>
  );
}
