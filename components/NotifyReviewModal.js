'use client';

import { useMemo, useRef, useState } from 'react';
import { Copy, Check, Send, X, Loader2, RotateCcw } from 'lucide-react';
import { getDisplayName } from '../lib/analytics';
import {
  resolveNotifyTemplateType,
  buildNotifyVariables,
  renderTemplatePreview,
} from '../lib/notifyTemplates';
import ModalShell from './ModalShell';

/**
 * 실패 시 수동 전송용 자유 문구 (알림톡 템플릿과 별개)
 * @param {string} [date] YYYY-MM-DD 근무일
 */
function buildCopyMessage(row, workerDirectory, date) {
  const name = getDisplayName(row.worker_name, workerDirectory);
  const items = [];
  if (row.frequentCheck?.status === 'fail') {
    items.push(`${row.frequentCheck.detail} 검사`);
  }
  if (row.fives?.status === 'fail') items.push('3정5S 기록');
  if (row.documents?.status === 'fail') items.push('문서스캔 기록');

  const todayLocal = (() => {
    const d = new Date();
    if (d.getHours() < 8) d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  const dateStr = date || todayLocal;
  const isToday = dateStr === todayLocal;
  const datePhrase = isToday
    ? '오늘'
    : (() => {
        const [, m, d] = dateStr.split('-').map(Number);
        if (!m || !d) return dateStr;
        return `${m}월 ${d}일`;
      })();

  if (items.length === 0) {
    return `[검사노트] ${name}님, ${datePhrase} 담당 업무 기록이 모두 확인되었습니다. 감사합니다.`;
  }

  return `[검사노트] ${name}님, ${datePhrase}에 ${items.join('/')}이(가) 확인되지 않았습니다. 확인 후 기록해주세요.`;
}

const TEMPLATE_TYPE_LABELS = {
  frequent_check: '자주검사 미준수',
  fives: '3정5S 미준수',
  document: '문서스캔 미준수',
  combined: '복합 미준수',
  daily_summary: '오늘실적 종합',
  correction: '기록정정',
};

function buildTargets(rows, workerDirectory, date) {
  return (rows || []).map((row) => {
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
      copyText: buildCopyMessage(row, workerDirectory, date),
    };
  });
}

function summarizeResults(targets, sendResults) {
  const total = targets.length;
  let success = 0;
  let failed = 0;
  for (const t of targets) {
    const r = sendResults[t.workerName];
    if (!r) continue;
    if (r.success) success += 1;
    else failed += 1;
  }
  return { total, success, failed };
}

async function postSendTargets(targetsPayload) {
  const res = await fetch('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets: targetsPayload }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * 발송 핸들러 핵심 흐름 (응답 → 대상자별 결과 상태 반영):
 * 1) POST /api/send-notification
 * 2) res.ok 아니면 alert 후 return
 * 3) data.results[] 를 workerName 키로 sendResults에 저장
 * 4) 연락처 없는 대상은 "연락처 미등록" 실패로 보강
 * 5) onSendComplete(results) 호출 (부모는 목록 refetch — 선택 해제는 onClose에서)
 */
export default function NotifyReviewModal({
  rows,
  workerDirectory,
  date,
  onClose,
  onSendComplete,
}) {
  // 부모에서 발송 직후 선택을 비워도 결과 UI가 유지되도록 최초 rows를 고정
  const initialRowsRef = useRef(rows);
  const [copiedKey, setCopiedKey] = useState(null);
  const [sending, setSending] = useState(false);
  const [retryingName, setRetryingName] = useState(null);
  const [sendResults, setSendResults] = useState({});
  const [sendFinished, setSendFinished] = useState(false);

  const targets = useMemo(
    () => buildTargets(initialRowsRef.current, workerDirectory, date),
    [workerDirectory, date]
  );

  const sendableCount = targets.filter((t) => t.phoneNumber).length;
  const hasAnyResult = Object.keys(sendResults).length > 0;
  const hasFailures =
    hasAnyResult && Object.values(sendResults).some((r) => r && !r.success);
  const summary = useMemo(
    () => summarizeResults(targets, sendResults),
    [targets, sendResults]
  );

  function flashCopied(key) {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  async function copyAll() {
    const text = targets
      .map((t) => `▶ ${t.displayName}\n${t.copyText}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      flashCopied('__all__');
    } catch {
      // no-op
    }
  }

  function applyResults(partialMap, { markFinished = true } = {}) {
    setSendResults((prev) => {
      const next = { ...prev, ...partialMap };
      for (const t of targets) {
        if (!t.phoneNumber && !next[t.workerName]) {
          next[t.workerName] = { success: false, error: '연락처 미등록' };
        }
      }
      return next;
    });
    if (markFinished) setSendFinished(true);

    // 부모 refetch용 — 최신 맵을 한 번 더 조립해 전달 (setState 업데이터 밖)
    const merged = { ...sendResults, ...partialMap };
    for (const t of targets) {
      if (!t.phoneNumber && !merged[t.workerName]) {
        merged[t.workerName] = { success: false, error: '연락처 미등록' };
      }
    }
    if (typeof onSendComplete === 'function') {
      onSendComplete(merged);
    }
  }

  async function handleSendAlimtalk() {
    if (sending || sendFinished) return;
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
      const payload = targets
        .filter((t) => t.phoneNumber)
        .map((t) => ({
          workerName: t.workerName,
          phoneNumber: t.phoneNumber,
          templateType: t.templateType,
          variables: t.variables,
        }));

      const { res, data } = await postSendTargets(payload);

      if (!res.ok) {
        window.alert(data.error || '발송 요청에 실패했습니다.');
        return;
      }

      const next = {};
      for (const r of data.results || []) {
        if (!r?.workerName) continue;
        next[r.workerName] = {
          success: Boolean(r.success),
          error: r.error || null,
        };
      }
      applyResults(next);
    } catch (err) {
      window.alert(err?.message || '발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  }

  async function handleRetryOne(workerName) {
    if (sending || retryingName) return;
    const target = targets.find((t) => t.workerName === workerName);
    if (!target?.phoneNumber) {
      applyResults(
        { [workerName]: { success: false, error: '연락처 미등록' } },
        { markFinished: true }
      );
      return;
    }

    const ok = window.confirm(
      `${target.displayName}님에게 다시 알림톡을 발송할까요?`
    );
    if (!ok) return;

    setRetryingName(workerName);
    try {
      const { res, data } = await postSendTargets([
        {
          workerName: target.workerName,
          phoneNumber: target.phoneNumber,
          templateType: target.templateType,
          variables: target.variables,
        },
      ]);

      if (!res.ok) {
        window.alert(data.error || '재시도에 실패했습니다.');
        return;
      }

      const r = data.results?.[0];
      applyResults(
        {
          [workerName]: {
            success: Boolean(r?.success),
            error: r?.success ? null : r?.error || '발송 실패',
          },
        },
        { markFinished: true }
      );
    } catch (err) {
      window.alert(err?.message || '재시도 중 오류가 발생했습니다.');
    } finally {
      setRetryingName(null);
    }
  }

  function handleClose() {
    if (typeof onClose === 'function') onClose({ sent: sendFinished });
  }

  const busy = sending || Boolean(retryingName);

  return (
    <ModalShell
      title="알림 발송 검토"
      onClose={handleClose}
      ariaLabel="알림 발송 검토"
      maxWidthClass="md:max-w-2xl"
      zClass="z-[80]"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted md:text-xs">
            {sendFinished
              ? hasFailures
                ? '실패 건은 옆의 재시도 또는 메시지 복사로 처리할 수 있습니다.'
                : '발송이 완료되었습니다. 닫으면 목록이 갱신됩니다.'
              : '카카오 알림톡으로 발송합니다.'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {sendFinished ? (
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
              >
                닫기
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSendAlimtalk}
                disabled={busy || sendableCount === 0}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2} />
                )}
                {sending ? '발송 중...' : `카카오 알림톡 발송 (${sendableCount}명)`}
              </button>
            )}
            {hasFailures ? (
              <button
                type="button"
                onClick={copyAll}
                disabled={busy}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
              >
                {copiedKey === '__all__' ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {copiedKey === '__all__' ? '복사됨' : '전체 메시지 복사'}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="border-b border-border px-4 py-3 md:px-6">
        {hasAnyResult ? (
          <p className="text-sm font-medium text-text">
            {summary.total}명 중 {summary.success}명 발송 완료
            {summary.failed > 0 ? (
              <span className="text-danger">, {summary.failed}명 실패</span>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-muted">
            선택한 {targets.length}명에게 승인된 알림톡 템플릿으로 발송합니다. 미리보기를
            확인한 뒤 발송하세요.
          </p>
        )}
      </div>

      <div className="space-y-3 px-4 py-4 md:px-6">
        {targets.map((target) => {
          const result = sendResults[target.workerName];
          const hasPhone = !!target.phoneNumber;
          const isRetrying = retryingName === target.workerName;
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
                      발송 완료
                    </span>
                  ) : (
                    <div className="flex max-w-[60%] shrink-0 flex-col items-end gap-1.5">
                      <span className="inline-flex items-start gap-1 text-xs font-medium text-danger">
                        <X className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                        <span className="break-words">{result.error || '발송 실패'}</span>
                      </span>
                      {hasPhone ? (
                        <button
                          type="button"
                          onClick={() => handleRetryOne(target.workerName)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
                        >
                          {isRetrying ? (
                            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                          ) : (
                            <RotateCcw className="h-3 w-3" strokeWidth={2} />
                          )}
                          {isRetrying ? '재시도 중…' : '재시도'}
                        </button>
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>

              <pre className="mt-2.5 max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-xl border border-border bg-surface2 px-3 py-2 text-sm leading-relaxed text-text [overflow-wrap:anywhere]">
                {target.preview}
              </pre>

              {!hasPhone ? (
                <p className="mt-2 text-[11px] text-warn">연락처 먼저 등록하세요</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
