'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import ModalShell from './ModalShell';

/**
 * 미완료 담당 업무를 문장으로 조합한 알림 메시지를 생성합니다.
 * 미완료 항목이 없으면(전체 완료자를 선택한 경우) 확인 문구를 반환합니다.
 */
function buildMessage(row) {
  const items = [];
  if (row.frequentCheck?.status === 'fail') {
    items.push(`${row.frequentCheck.detail} 검사`);
  }
  if (row.fives?.status === 'fail') items.push('3정5S 기록');
  if (row.documents?.status === 'fail') items.push('문서스캔 기록');

  if (items.length === 0) {
    return `[검사노트] ${row.worker_name}님, 오늘 담당 업무 기록이 모두 확인되었습니다. 감사합니다.`;
  }

  return `[검사노트] ${row.worker_name}님, 오늘 ${items.join('/')}이(가) 확인되지 않았습니다. 확인 후 기록해주세요.`;
}

export default function NotifyReviewModal({ rows, onClose }) {
  const [messages, setMessages] = useState(() =>
    Object.fromEntries((rows || []).map((r) => [r.worker_name, buildMessage(r)]))
  );
  const [copiedKey, setCopiedKey] = useState(null);

  function flashCopied(key) {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function copyOne(name) {
    try {
      await navigator.clipboard.writeText(messages[name] ?? '');
      flashCopied(name);
    } catch {
      // 클립보드 접근 실패 시 조용히 무시
    }
  }

  async function copyAll() {
    const text = (rows || [])
      .map((r) => `▶ ${r.worker_name}\n${messages[r.worker_name] ?? ''}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      flashCopied('__all__');
    } catch {
      // no-op
    }
  }

  return (
    <ModalShell
      title="알림 발송 검토"
      onClose={onClose}
      ariaLabel="알림 발송 검토"
      maxWidthClass="md:max-w-2xl"
      zClass="z-[80]"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted md:text-xs">
            실제 발송 기능은 준비 중입니다. 지금은 복사 후 직접 전송해 주세요.
          </p>
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
          >
            {copiedKey === '__all__' ? (
              <Check className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={2} />
            )}
            {copiedKey === '__all__' ? '전체 복사됨' : '전체 메시지 한번에 복사'}
          </button>
        </div>
      }
    >
      <p className="border-b border-border px-4 py-3 text-xs text-muted md:px-6">
        선택한 {rows?.length ?? 0}명의 안내 문구입니다. 내용을 수정한 뒤 복사해 문자/카톡으로 보내세요.
      </p>

      <div className="space-y-3 px-4 py-4 md:px-6">
        {(rows || []).map((row) => {
          const hasPhone = !!row.phone_number;
          const copied = copiedKey === row.worker_name;
          return (
            <div key={row.worker_name} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-text">{row.worker_name}</span>
                  {hasPhone ? (
                    <span className="text-xs text-muted">{row.phone_number}</span>
                  ) : (
                    <span className="inline-block rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
                      연락처 미등록
                    </span>
                  )}
                </div>
              </div>

              <textarea
                value={messages[row.worker_name] ?? ''}
                onChange={(e) =>
                  setMessages((prev) => ({ ...prev, [row.worker_name]: e.target.value }))
                }
                rows={3}
                className="mt-2.5 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyOne(row.worker_name)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface2"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-good" strokeWidth={2.25} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                  {copied ? '복사됨' : '복사'}
                </button>
                {!hasPhone ? (
                  <span className="text-[11px] text-warn">연락처 먼저 등록하세요</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
