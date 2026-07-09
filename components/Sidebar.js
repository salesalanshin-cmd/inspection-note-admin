'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: '대시보드', code: '01' },
  { href: '/workers', label: '작업자 현황', code: '02' },
  { href: '/daily-performance', label: '일일 실적 관리', code: '03' },
  { href: '/frequent-check', label: '자주검사 현황', code: '04' },
  { href: '/fives', label: '3정5S', code: '05' },
  { href: '/defects', label: '불량기록', code: '06' },
  { href: '/inspection-history', label: '자주검사 이력조회', code: '07' },
  { href: '/documents', label: '문서스캔', code: '08' },
];

const SETTINGS_NAV = [
  { href: '/worker-management', label: '작업자 관리', code: '09' },
  { href: '/trash', label: '휴지통', code: '10' },
];

const INSIGHT_LAB_NAV = {
  href: '/insight-lab',
  label: '인사이트 랩',
};

function NavLink({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'bg-accentSoft font-medium text-accent'
          : 'text-muted hover:bg-surface2 hover:text-text'
      }`}
    >
      <span className="text-xs text-muted">{item.code}</span>
      <span>{item.label}</span>
    </Link>
  );
}

function InsightLabNavLink({ active, onNavigate }) {
  return (
    <Link
      href={INSIGHT_LAB_NAV.href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-gradient-to-r from-accent/20 to-accent/0 text-accent'
          : 'bg-gradient-to-r from-accent/10 to-accent/0 text-text hover:from-accent/20'
      }`}
    >
      <span
        className={`absolute bottom-1 left-0 top-1 w-1 rounded-full bg-accent ${
          active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
        }`}
      />
      <Sparkles
        className={`ml-1 h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-accent group-hover:text-accent'}`}
        strokeWidth={2}
      />
      <span>{INSIGHT_LAB_NAV.label}</span>
    </Link>
  );
}

function SidebarPanel({ pathname, onNavigate, onLogout, loggingOut }) {
  return (
    <>
      <Link href="/dashboard" onClick={onNavigate} className="block cursor-pointer px-5 py-6">
        <div className="text-xs font-medium text-accent">(주)디케이메탈</div>
        <div className="mt-1 text-lg font-semibold text-text">검사노트 관리</div>
      </Link>
      <nav className="min-h-0 flex-1 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname?.startsWith(item.href)}
            onNavigate={onNavigate}
          />
        ))}
        <div className="my-3 border-t border-border" />
        <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          운영 설정
        </div>
        {SETTINGS_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname?.startsWith(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="shrink-0 px-3 pb-3">
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[8px] font-bold leading-none text-white shadow-sm">
              AI
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              인사이트 랩
            </span>
          </div>
          <InsightLabNavLink
            active={pathname?.startsWith(INSIGHT_LAB_NAV.href)}
            onNavigate={onNavigate}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="w-full rounded-xl border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
        >
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
        <div className="text-xs leading-relaxed text-muted">
          INSPECTION NOTE
          <br />
          ADMIN CONSOLE v0.1
        </div>
      </div>
    </>
  );
}

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const onMobileCloseRef = useRef(onMobileClose);
  const ignoreOverlayCloseRef = useRef(false);

  onMobileCloseRef.current = onMobileClose;

  useEffect(() => {
    onMobileCloseRef.current?.();
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    ignoreOverlayCloseRef.current = true;
    const unlockTimer = window.setTimeout(() => {
      ignoreOverlayCloseRef.current = false;
    }, 350);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(unlockTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  function handleOverlayClose() {
    if (ignoreOverlayCloseRef.current) return;
    onMobileClose?.();
  }

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

  function handleNavigate() {
    onMobileClose?.();
  }

  return (
    <>
      <aside className="hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-surface shadow-sidebar md:flex">
        <SidebarPanel
          pathname={pathname}
          onNavigate={undefined}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
      </aside>

      <div
        className={`fixed inset-0 z-[60] md:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
        onClick={handleOverlayClose}
      >
        <div
          aria-hidden
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <aside
          onClick={(e) => e.stopPropagation()}
          className={`absolute left-0 top-0 flex h-full w-[80%] max-w-[320px] flex-col overflow-y-auto bg-surface shadow-sidebar transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarPanel
            pathname={pathname}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            loggingOut={loggingOut}
          />
        </aside>
      </div>
    </>
  );
}
