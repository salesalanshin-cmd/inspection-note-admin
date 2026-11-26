'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck, Camera, ChartColumn, ChartNoAxesCombined, ChevronDown, ClipboardCheck,
  ClipboardList, Clock, Database, FileCheck, FileScan, Files, History, LayoutDashboard,
  Library, ListChecks, ListTodo, LogOut, Megaphone, MessageCircle, MessagesSquare,
  ScanLine, Search, Trash2, TriangleAlert, UserRound, Users, Wrench, X,
} from 'lucide-react';
import { fetchWaitManagerCount } from '../lib/questions';

/** 상시 — 매일 확인 */
const DAILY_NAV = [
  { href: '/dashboard', label: '대시보드', code: '01', icon: LayoutDashboard },
  { href: '/dashboard/inspection', label: '생산·불량 현황', code: '19', icon: ChartColumn },
  { href: '/daily-performance', label: '일일 실적 관리', code: '02', icon: CalendarCheck },
  { href: '/frequent-check', label: '자주검사', code: '03', icon: ListChecks },
  { href: '/fives', label: '3정5S', code: '04', icon: Camera },
  { href: '/defects', label: '불량기록', code: '05', icon: TriangleAlert },
  { href: '/attendance', label: '근태', code: '14', icon: Clock },
  { href: '/equipment-checks', label: '설비·생산조건 점검', code: '21', icon: Wrench },
  { href: '/production-review', label: '생산 LOT 점검', code: '22', icon: ListChecks },
  { href: '/questions', label: '질문 답변', code: '13', icon: MessagesSquare, badgeKey: 'questions' },
  { href: '/notices', label: '공지사항', code: '09', icon: Megaphone },
];

/** 보조 — 주 단위·필요 시 확인 */
const WEEKLY_NAV = [
  { href: '/attendance/edits', label: '근태 수정 이력', code: '16', icon: History },
  { href: '/ai-accuracy', label: 'AI 오진율', code: '15', icon: ScanLine },
  { href: '/document-scans', label: '스캔 문서 검수', code: '06', icon: FileScan },
  { href: '/reports/daily', label: '작업일보', code: '18', icon: ClipboardList },
  { href: '/reports/kpi', label: '과제 성과지표', code: '20', icon: ChartNoAxesCombined },
  { href: '/worklog-review', label: '작업일보 검토', code: '17', icon: FileCheck },
  { href: '/documents', label: '문서', code: '06b', icon: Files },
  { href: '/knowledge', label: '지식 관리', code: '06d', icon: Library },
  { href: '/worker-detail', label: '작업자 상세조회', code: '08', icon: UserRound },
];

/** 개발 환경 전용 — 프로덕션 메뉴에서 제외 */
const DEV_NAV =
  process.env.NODE_ENV !== 'production'
    ? [{ href: '/ask', label: '지식 검색 테스트', code: '06c', icon: Search }]
    : [];

/** 설정 — 초기 세팅 후 거의 안 봄 (접힌 그룹) */
const SETTINGS_NAV = [
  { href: '/worker-management', label: '작업자 관리', code: '07', icon: Users },
  { href: '/inspection-items', label: '점검 항목 마스터', code: '22', icon: ListTodo },
  { href: '/settings/messages', label: '메시지 관리', code: '10', icon: MessageCircle },
  { href: '/trash', label: '휴지통', code: '11', icon: Trash2 },
  { href: '/master', label: 'MES 기준정보', code: '12', icon: Database },
];

function isActive(pathname, href) {
  if (!pathname) return false;
  if (href === '/attendance') {
    return pathname === '/attendance' || pathname.startsWith('/attendance/card');
  }
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, onNavigate, badge }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-nav-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      title={`${item.code} · ${item.label}`}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-base leading-snug transition-colors ${
        active
          ? 'bg-accentSoft font-bold text-accent'
          : 'font-medium text-text hover:bg-surface2'
      }`}
    >
      <Icon size={19} strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" className={`shrink-0 ${active ? '' : 'text-muted'}`} />
      <span className="min-w-0 flex-1 break-keep">{item.label}</span>
      {badge != null && badge > 0 ? (
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-dangerSoft px-2 py-0.5 text-xs font-bold text-danger">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavSection({ label, children }) {
  return (
    <div className="mb-4">
      {label ? (
        <div className="px-3 pb-1.5 pt-2 text-sm font-bold text-muted">
          {label}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SettingsGroup({ pathname, onNavigate }) {
  const settingsActive = SETTINGS_NAV.some((item) => isActive(pathname, item.href));
  const [open, setOpen] = useState(settingsActive);

  useEffect(() => {
    if (settingsActive) setOpen(true);
  }, [settingsActive]);

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-muted transition-colors hover:bg-surface2 hover:text-text"
        aria-expanded={open}
      >
        <span>설정</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="mt-0.5">
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MainNav({ pathname, onNavigate, questionBadge }) {
  const weeklyItems = [...WEEKLY_NAV, ...DEV_NAV];

  const badgeFor = (item) => (item.badgeKey === 'questions' ? questionBadge : null);

  return (
    <>
      <NavSection label="일상">
        {DAILY_NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            onNavigate={onNavigate}
            badge={badgeFor(item)}
          />
        ))}
      </NavSection>

      <NavSection label="보조">
        {weeklyItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>

      <SettingsGroup pathname={pathname} onNavigate={onNavigate} />
    </>
  );
}

function SidebarFooter({ onLogout, loggingOut }) {
  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <button
        type="button"
        onClick={onLogout}
        disabled={loggingOut}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface2 disabled:opacity-50"
      >
        <LogOut size={17} aria-hidden="true" />
        {loggingOut ? '로그아웃 중...' : '로그아웃'}
      </button>
    </div>
  );
}

/** 로고(shrink-0) + 메뉴만 스크롤(flex-1 overflow-y-auto) + 하단(shrink-0). absolute/fixed 없음. */
function SidebarPanel({ pathname, onNavigate, onLogout, loggingOut, questionBadge, onClose }) {
  const navRef = useRef(null);

  useEffect(() => {
    const active = navRef.current?.querySelector('[data-nav-active="true"]');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [pathname]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-4">
        <Link href="/dashboard" onClick={onNavigate} className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <ClipboardCheck size={24} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0 break-keep">
            <div className="text-xs font-semibold text-muted">(주)디케이메탈</div>
            <div className="text-lg font-bold leading-snug text-text">검사노트 관리</div>
          </div>
        </Link>
        {onClose ? (
          <button type="button" autoFocus onClick={onClose} aria-label="메뉴 닫기" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text hover:bg-surface2">
            <X aria-hidden="true" size={22} />
          </button>
        ) : null}
      </div>
      <nav
        ref={navRef}
        aria-label="관리자 메뉴"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        <MainNav pathname={pathname} onNavigate={onNavigate} questionBadge={questionBadge} />
      </nav>
      <SidebarFooter onLogout={onLogout} loggingOut={loggingOut} />
    </div>
  );
}

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [questionBadge, setQuestionBadge] = useState(0);
  const dialogRef = useRef(null);

  const loadQuestionBadge = useCallback(async () => {
    try {
      const count = await fetchWaitManagerCount();
      setQuestionBadge(count);
    } catch {
      setQuestionBadge(0);
    }
  }, []);

  useEffect(() => {
    loadQuestionBadge();
    const timer = window.setInterval(loadQuestionBadge, 60_000);
    return () => window.clearInterval(timer);
  }, [loadQuestionBadge, pathname]);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mobileOpen || !dialog) return;
    dialog.showModal();
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktop.matches) onMobileClose?.();
    };
    closeOnDesktop();
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      dialog.close();
    };
  }, [mobileOpen, onMobileClose]);

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
      <aside className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-surface lg:flex 2xl:w-[17rem] print:!hidden">
        <SidebarPanel
          pathname={pathname}
          onNavigate={undefined}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          questionBadge={questionBadge}
        />
      </aside>

      <dialog
        ref={dialogRef}
        id="mobile-navigation"
        aria-label="관리자 메뉴"
        onCancel={(event) => { event.preventDefault(); onMobileClose?.(); }}
        onClick={(event) => { if (event.target === event.currentTarget) onMobileClose?.(); }}
        className="fixed inset-y-0 left-0 right-auto m-0 h-[100dvh] max-h-none w-[min(22rem,90vw)] max-w-none overflow-hidden border-0 bg-surface p-0 text-text shadow-xl backdrop:bg-slate-950/45 print:!hidden"
      >
        <SidebarPanel
          pathname={pathname}
          onNavigate={handleNavigate}
          onClose={onMobileClose}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          questionBadge={questionBadge}
        />
      </dialog>
    </>
  );
}
