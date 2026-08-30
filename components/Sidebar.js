'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { fetchWaitManagerCount } from '../lib/questions';

/** 상시 — 매일 확인 */
const DAILY_NAV = [
  { href: '/dashboard', label: '대시보드', code: '01' },
  { href: '/daily-performance', label: '일일 실적 관리', code: '02' },
  { href: '/frequent-check', label: '자주검사 현황', code: '03' },
  { href: '/fives', label: '3정5S', code: '04' },
  { href: '/defects', label: '불량기록', code: '05' },
  { href: '/questions', label: '질문 답변', code: '13', badgeKey: 'questions' },
  { href: '/notices', label: '공지사항', code: '09' },
];

/** 보조 — 주 단위·필요 시 확인 */
const WEEKLY_NAV = [
  { href: '/document-scans', label: '스캔 문서 검수', code: '06' },
  { href: '/documents', label: 'AI 매뉴얼 관리', code: '06b' },
  { href: '/worker-detail', label: '작업자 상세조회', code: '08' },
];

/** 개발 환경 전용 — 프로덕션 메뉴에서 제외 */
const DEV_NAV =
  process.env.NODE_ENV !== 'production'
    ? [{ href: '/ask', label: '지식 검색 테스트', code: '06c' }]
    : [];

/** 설정 — 초기 세팅 후 거의 안 봄 (접힌 그룹) */
const SETTINGS_NAV = [
  { href: '/worker-management', label: '작업자 관리', code: '07' },
  { href: '/settings/messages', label: '메시지 관리', code: '10' },
  { href: '/trash', label: '휴지통', code: '11' },
  { href: '/master', label: 'MES 기준정보', code: '12' },
];

const INSIGHT_LAB_NAV = {
  href: '/insight-lab',
  label: '인사이트 랩',
};

function isActive(pathname, href) {
  return pathname?.startsWith(href);
}

function NavLink({ item, active, onNavigate, badge }) {
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
      <span className="flex-1">{item.label}</span>
      {badge != null && badge > 0 ? (
        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavSection({ label, children }) {
  return (
    <div className="mb-1">
      {label ? (
        <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted">
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
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted transition-colors hover:bg-surface2 hover:text-text"
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

function InsightLabNavLink({ active, onNavigate, mobile = false }) {
  return (
    <Link
      href={INSIGHT_LAB_NAV.href}
      onClick={onNavigate}
      className={`group ${mobile ? 'flex' : 'relative flex'} items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-gradient-to-r from-accent/20 to-accent/0 text-accent'
          : 'bg-gradient-to-r from-accent/10 to-accent/0 text-text hover:from-accent/20'
      }`}
    >
      {!mobile ? (
        <span
          className={`absolute bottom-1 left-0 top-1 w-1 rounded-full bg-accent ${
            active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
          }`}
        />
      ) : null}
      <Sparkles
        className={`ml-1 h-4 w-4 shrink-0 ${active ? 'text-accent' : 'text-accent group-hover:text-accent'}`}
        strokeWidth={2}
      />
      <span>{INSIGHT_LAB_NAV.label}</span>
    </Link>
  );
}

function MainNav({ pathname, onNavigate, questionBadge }) {
  const weeklyItems = [...WEEKLY_NAV, ...DEV_NAV];

  const badgeFor = (item) => (item.badgeKey === 'questions' ? questionBadge : null);

  return (
    <>
      <NavSection label={null}>
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

function SidebarPanel({ pathname, onNavigate, onLogout, loggingOut, questionBadge }) {
  return (
    <>
      <Link href="/dashboard" onClick={onNavigate} className="block cursor-pointer px-5 py-6">
        <div className="text-xs font-medium text-accent">(주)디케이메탈</div>
        <div className="mt-1 text-lg font-semibold text-text">검사노트 관리</div>
      </Link>
      <nav className="min-h-0 flex-1 px-3 py-2">
        <MainNav pathname={pathname} onNavigate={onNavigate} questionBadge={questionBadge} />
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
            active={isActive(pathname, INSIGHT_LAB_NAV.href)}
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

function MobileSidebarPanel({ pathname, onNavigate, onLogout, loggingOut, questionBadge }) {
  return (
    <div className="flex min-h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="block cursor-pointer px-5 py-6">
        <div className="text-xs font-medium text-accent">(주)디케이메탈</div>
        <div className="mt-1 text-lg font-semibold text-text">검사노트 관리</div>
      </Link>

      <nav className="min-h-0 flex-1 px-3 py-2">
        <MainNav pathname={pathname} onNavigate={onNavigate} questionBadge={questionBadge} />
      </nav>

      <div className="px-3 pb-3">
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
            mobile
            active={isActive(pathname, INSIGHT_LAB_NAV.href)}
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
    </div>
  );
}

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [questionBadge, setQuestionBadge] = useState(0);
  const onMobileCloseRef = useRef(onMobileClose);
  const ignoreOverlayCloseRef = useRef(false);

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
          questionBadge={questionBadge}
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
          <MobileSidebarPanel
            pathname={pathname}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            loggingOut={loggingOut}
            questionBadge={questionBadge}
          />
        </aside>
      </div>
    </>
  );
}
