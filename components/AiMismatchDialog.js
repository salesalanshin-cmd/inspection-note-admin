'use client';

import { useState } from 'react';
import { CONFIDENCE_LABELS, getCodeLabel } from '../lib/constants';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function formatCodeLabel(codeSet, code) {
  if (!code) return '(없음)';
  const label = getCodeLabel(codeSet, code);
  return label ? `${code} (${label})` : code;
}

/**
 * AI 제안이 현재 값과 다를 때 적용/유지 선택.
 * "기존 값 유지" 시 선택적 오판 사유 입력.
 */
export default function AiMismatchDialog({
  codeSet,
  currentCode,
  pendingAi,
  onApply,
  onKeep,
}) {
  const [step, setStep] = useState('choose');
  const [reason, setReason] = useState('');

  if (!pendingAi) return null;

  function handleKeepConfirm() {
    onKeep?.(reason.trim() || null);
    setStep('choose');
    setReason('');
  }

  if (step === 'reason') {
    return (
      <div
        className="rounded-xl border border-accent/30 bg-surface p-3 shadow-card"
        role="dialog"
        aria-label="AI 오판 사유"
      >
        <p className="text-sm font-medium text-text">기존 값 유지</p>
        <label className="mt-2 block text-xs leading-relaxed text-muted">
          AI가 왜 잘못 판단했는지 짧게 남겨주세요 (선택사항)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="밀핀 자국이랑 헷갈리기 쉬운 표면 무늬였음"
          className={`${inputClass} mt-1.5`}
          autoFocus
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleKeepConfirm}
            className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('choose');
              setReason('');
            }}
            className="min-h-[44px] flex-1 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0"
          >
            뒤로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-accent/30 bg-surface p-3 shadow-card"
      role="dialog"
      aria-label="AI 판정 결과 확인"
    >
      <p className="text-sm font-medium text-text">AI 판정 결과가 다릅니다</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        기존: <span className="text-text">{formatCodeLabel(codeSet, currentCode)}</span>
        <br />
        → AI 제안:{' '}
        <span className="font-medium text-accent">
          {formatCodeLabel(codeSet, pendingAi.code)}
        </span>
        <br />
        확신도: {CONFIDENCE_LABELS[pendingAi.confidence] || pendingAi.confidence || '-'}
        {pendingAi.reason ? (
          <>
            <br />
            이유: {pendingAi.reason}
          </>
        ) : null}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onApply}
          className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
        >
          AI 제안 적용
        </button>
        <button
          type="button"
          onClick={() => setStep('reason')}
          className="min-h-[44px] flex-1 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0"
        >
          기존 값 유지
        </button>
      </div>
    </div>
  );
}
