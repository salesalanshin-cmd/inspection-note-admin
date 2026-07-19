'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

function formatCompletedAt(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return '방금 전';
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * AI 자동판정 버튼 근처 상태 표시.
 * @param {{ classifying?: boolean, completedAt?: Date|number|null }} props
 */
export default function AiClassifyStatus({ classifying, completedAt }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!completedAt || classifying) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [completedAt, classifying]);

  if (classifying) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} aria-hidden />
        <span>AI 분석 중...</span>
      </div>
    );
  }

  if (!completedAt) return null;

  const timeLabel = formatCompletedAt(completedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-good">
      <span className="inline-flex items-center gap-1 font-medium">
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        AI 판독 완료
      </span>
      {timeLabel ? <span className="text-muted">{timeLabel}</span> : null}
    </div>
  );
}
