'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UNMATCHED_EMPTY_NAME } from '../../lib/attendance/unmatchedNames';

function NameTable({ rows, showRegister }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-2 py-1.5 font-medium">이름</th>
            <th className="px-2 py-1.5 font-medium">건수</th>
            <th className="px-2 py-1.5 font-medium">종류</th>
            <th className="px-2 py-1.5 font-medium">마지막 신호</th>
            <th className="px-2 py-1.5 font-medium">최근 근무일</th>
            {showRegister ? <th className="px-2 py-1.5 font-medium"> </th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.status}-${row.name}`} className="border-t border-border">
              <td className="px-2 py-2 font-medium text-text">{row.name}</td>
              <td className="px-2 py-2 tabular-nums text-text">{row.count}</td>
              <td className="px-2 py-2 text-muted">{row.typeLabel || '—'}</td>
              <td className="px-2 py-2 tabular-nums text-muted">{row.lastAtLabel}</td>
              <td className="px-2 py-2 tabular-nums text-muted">{row.lastWorkDate}</td>
              {showRegister ? (
                <td className="px-2 py-2 text-right">
                  {row.name === UNMATCHED_EMPTY_NAME ? null : (
                    <Link
                      href={`/worker-management?addName=${encodeURIComponent(row.name)}`}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-border px-2.5 py-1 text-xs text-text hover:bg-surface2"
                    >
                      작업자 등록
                    </Link>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function UnmatchedNamesNotice({ summary }) {
  const [open, setOpen] = useState(false);
  const count = summary?.unregistered?.length || 0;
  if (!count) return null;

  return (
    <section className="rounded-xl border border-warn/30 bg-warnSoft print:hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-sm font-medium text-text">
          미등록 이름 {count}명
          <span className="ml-2 font-normal text-muted">최근 {summary.days}일 신호</span>
        </span>
        <span className="text-xs text-muted">{open ? '닫기' : '목록'}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-warn/30 px-4 py-3">
          <NameTable rows={summary.unregistered} showRegister />
          {summary.hidden?.length ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">
                숨김/퇴사 {summary.hidden.length}명 — 미등록 수에는 넣지 않습니다
              </div>
              <NameTable rows={summary.hidden} showRegister={false} />
            </div>
          ) : null}
          {summary.truncated ? (
            <p className="text-xs text-muted">신호가 많아 일부만 집계했습니다.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
