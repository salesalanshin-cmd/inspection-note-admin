'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

/**
 * 미완료 담당 업무를 문장으로 조합한 알림 메시지를 생성합니다.
 * 미완료 항목이 없으면(전체 완료자를 선택한 경우) 확인 문구를 반환합니다.
 */
function buildMessage(row) {
  const items = [];
  if (row.frequentCheck?.status === 'fail') {
    // detail 예: "중품/종품"
    items.push(`${row.frequentCheck.detail} 검사`);
  }
  if (row.fives?.status === 'fail') items.push('3정5S 기록');
  if (row.documents?.status === 'fail') items.push('문서스캔 기록');

  if (items.length === 0) {
    return `[검사노트] ${row.worker_name}님, 오늘 담당 업무 기록이 모두 확인되었습니다. 감사합니다.`;
  }

  return `[검사노트] ${row.worker_name}님, 오늘 ${items.join('/')}이(가) 확인되지 않았습니다. 확인 후 기록해주세요.`;
}

// NOTE: 이 모달은 실제 문자/알림톡을 발송하지 않습니다. 현재는 관리자가 문구를
// 검토·수정하고 복사해서 문자앱/카카오톡에 직접 붙여넣는 임시 방식입니다.
// 추후 문자 API / 카카오 알림톡 API가 연동되면, 이 자리(각 카드의 복사 버튼
// 옆, 그리고 하단 액션 영역)에 실제 "발송" 버튼을 추가할 예정입니다.
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
      // 클립보드 접근 실패 시 조용히 무시 (브라우저 권한 등)
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
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-text">알림 발송 검토</h3>
            <p className="mt-0.5 text-xs text-muted">
              선택한 {rows?.length ?? 0}명의 안내 문구입니다. 내용을 수정한 뒤 복사해 문자/카톡으로
              보내세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-text"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {(rows || []).map((row) => {
            const hasPhone = !!row.phone_number;
            const copied = copiedKey === row.worker_name;
            return (
              <div
                key={row.worker_name}
                className="rounded-xl border border-border bg-surface p-4"
              >
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface2"
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

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          {/* 추후 문자/알림톡 API 연동 시 이 영역에 실제 "전체 발송" 버튼을 추가할 예정 */}
          <p className="text-[11px] text-muted">
            실제 발송 기능은 준비 중입니다. 지금은 복사 후 직접 전송해 주세요.
          </p>
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {copiedKey === '__all__' ? (
              <Check className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={2} />
            )}
            {copiedKey === '__all__' ? '전체 복사됨' : '전체 메시지 한번에 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
