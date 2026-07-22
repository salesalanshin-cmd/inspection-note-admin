'use client';

import { useMemo, useState } from 'react';
import { Copy, Check, Send, X, Loader2 } from 'lucide-react';
import { getDisplayName } from '../lib/analytics';
import {
  resolveNotifyTemplateType,
  buildNotifyVariables,
  renderTemplatePreview,
} from '../lib/notifyTemplates';
import ModalShell from './ModalShell';

/**
 * 복사/수동 전송용 자유 문구 (알림톡 템플릿과 별개 — 실패 시 대안)
 */
function buildCopyMessage(row, workerDirectory) {
  const name = getDisplayName(row.worker_name, workerDirectory);
  const items = [];
  if (row.frequentCheck?.status === 'fail') {
    items.push(`${row.frequentCheck.detail} 검사`);
  }
  if (row.fives?.status === 'fail') items.push('3정5S 기록');
  if (row.documents?.status === 'fail') items.push('문서스캔 기록');

  if (items.length === 0) {
    return `[검사노트] ${name}님, 오늘 담당 업무 기록이 모두 확인되었습니다. 감사합니다.`;
  }

  return `[검사노트] ${name}님, 오늘 ${items.join('/')}이(가) 확인되지 않았습니다. 확인 후 기록해주세요.`;
}

const TEMPLATE_TYPE_LABELS = {
  frequent_check: '자주검사 미준수',
  fives: '3정5S 미준수',
  document: '문서스캔 미준수',
  combined: '복합 미준수',
  daily_summary: '오늘실적 종합',
  correction: '기록정정',
};

export default function NotifyReviewModal({ rows, workerDirectory, date, onClose }) {
  const [messages, setMessages] = useState(() =>
    Object.fromEntries(
      (rows || []).map((r) => [r.worker_name, buildCopyMessage(r, workerDirectory)])
    )
  );
  const [copiedKey, setCopiedKey] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState({});

  const targets = useMemo(
    () =>
      (rows || []).map((row) => {
        const displayName = getDisplayName(row.worker_name, workerDirectory);
        const templateType = resolveNotifyTemplateType(row);
        const variables = buildNotifyVariables(row, {
          displayName,
          date: date || new Date().toISOString().slice(0, 10),
        });
        return {
          workerName: row.worker_name,
          phoneNumber: row.phone_number || '',
          displayName,
          templateType,
          variables,
          preview: renderTemplatePreview(templateType, variables),
        };
      }),
    [rows, workerDirectory, date]
  );

  const sendableCount = targets.filter((t) => t.phoneNumber).length;

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
      .map((r) => {
        const label = getDisplayName(r.worker_name, workerDirectory);
        return `▶ ${label}\n${messages[r.worker_name] ?? ''}`;
      })
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      flashCopied('__all__');
    } catch {
      // no-op
    }
  }

  async function handleSendAlimtalk() {
    if (sending) return;
    if (sendableCount === 0) {
      window.alert('연락처가 등록된 대상자가 없습니다.');
      return;
    }
    const ok = window.confirm(
      '카카오 알림톡으로 실제 발송됩니다. 계속하시겠습니까?'
    );
    if (!ok) return;

    setSending(true);
    setSendResults({});

    try {
      const payload = {
        targets: targets
          .filter((t) => t.phoneNumber)
          .map((t) => ({
            workerName: t.workerName,
            phoneNumber: t.phoneNumber,
            templateType: t.templateType,
            variables: t.variables,
          })),
      };

      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        window.alert(data.error || '발송 요청에 실패했습니다.');
        return;
      }

      const next = {};
      for (const r of data.results || []) {
        next[r.workerName] = {
          success: Boolean(r.success),
          error: r.error || null,
        };
      }
      // 연락처 없는 대상도 UI에 표시
      for (const t of targets) {
        if (!t.phoneNumber && !next[t.workerName]) {
          next[t.workerName] = { success: false, error: '연락처 미등록' };
        }
      }
      setSendResults(next);
    } catch (err) {
      window.alert(err?.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
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
            카카오 알림톡으로 발송합니다. 실패 시 아래 복사 문구를 대안으로 사용하세요.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={copyAll}
              disabled={sending}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0"
            >
              {copiedKey === '__all__' ? (
                <Check className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={2} />
              )}
              {copiedKey === '__all__' ? '전체 복사됨' : '전체 메시지 복사'}
            </button>
            <button
              type="button"
              onClick={handleSendAlimtalk}
              disabled={sending || sendableCount === 0}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Send className="h-4 w-4" strokeWidth={2} />
              )}
              {sending ? '발송 중...' : `카카오 알림톡 발송 (${sendableCount}명)`}
            </button>
          </div>
        </div>
      }
    >
      <p className="border-b border-border px-4 py-3 text-xs text-muted md:px-6">
        선택한 {rows?.length ?? 0}명에게 승인된 알림톡 템플릿으로 발송합니다. 미리보기를
        확인한 뒤 발송하세요.
      </p>

      <div className="space-y-3 px-4 py-4 md:px-6">
        {targets.map((target) => {
          const result = sendResults[target.workerName];
          const hasPhone = !!target.phoneNumber;
          const copied = copiedKey === target.workerName;
          return (
            <div
              key={target.workerName}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-text">
                    {target.displayName}
                  </span>
                  {hasPhone ? (
                    <span className="text-xs text-muted">{target.phoneNumber}</span>
                  ) : (
                    <span className="inline-block rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
                      연락처 미등록
                    </span>
                  )}
                  <span className="inline-block rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-muted">
                    {TEMPLATE_TYPE_LABELS[target.templateType] || target.templateType}
                  </span>
                </div>
                {result ? (
                  result.success ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-good">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                      발송 성공
                    </span>
                  ) : (
                    <span className="inline-flex max-w-[55%] shrink-0 items-start gap-1 text-xs font-medium text-danger">
                      <X className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                      <span>{result.error || '발송 실패'}</span>
                    </span>
                  )
                ) : null}
              </div>

              <pre className="mt-2.5 whitespace-pre-wrap rounded-xl border border-border bg-surface2 px-3 py-2 text-sm leading-relaxed text-text">
                {target.preview}
              </pre>

              <p className="mt-3 text-[11px] text-muted">수동 전송용 복사 문구</p>
              <textarea
                value={messages[target.workerName] ?? ''}
                onChange={(e) =>
                  setMessages((prev) => ({
                    ...prev,
                    [target.workerName]: e.target.value,
                  }))
                }
                rows={2}
                className="mt-1 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyOne(target.workerName)}
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
