'use client';

import Link from 'next/link';
import { Home, Menu, MessageCircle, Sparkles } from 'lucide-react';

const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:bg-surface2';

export default function TopBar({ onMenuOpen, menuOpen }) {
  return (
    <header className="relative z-40 shrink-0 border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex min-h-16 w-full max-w-[100rem] items-center gap-1.5 px-2.5 py-2 sm:gap-3 sm:px-6 lg:justify-end lg:px-8">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          className={`${iconButton} lg:hidden`}
        >
          <Menu aria-hidden="true" size={21} />
        </button>
        <Link href="/dashboard" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center break-keep px-1 leading-tight lg:hidden">
          <span className="block text-xs font-semibold text-muted">디케이메탈</span>
          <span className="block text-base font-bold text-text">검사노트<span className="hidden sm:inline"> 관리</span></span>
        </Link>
        <Link
          href="/insight-lab"
          aria-label="인사이트 랩(AI대화)로 이동"
          title="인사이트 랩(AI대화)"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accentSoft px-2 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-white sm:px-3"
        >
          <Sparkles aria-hidden="true" size={19} />
          <span className="hidden sm:inline">인사이트 랩(AI대화)</span>
        </Link>
        <Link
          href="/settings/messages"
          aria-label="메시지 관리로 이동"
          title="메시지 관리"
          className={`${iconButton} sm:w-auto sm:gap-2 sm:px-3`}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FEE500] text-[#191919]">
            <MessageCircle aria-hidden="true" size={15} fill="currentColor" />
          </span>
          <span className="hidden text-sm font-semibold sm:inline">메시지 관리</span>
        </Link>
        <Link href="/dashboard" aria-label="대시보드로 이동" title="대시보드" className={iconButton}>
          <Home aria-hidden="true" size={19} />
        </Link>
      </div>
    </header>
  );
}
