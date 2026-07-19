'use client';

import { useMemo, useState } from 'react';
import SignedImage from './SignedImage';
import { CONFIDENCE_LABELS, getCodeLabel } from '../lib/constants';
import { getDisplayName } from '../lib/analytics';
import ModalShell, { ModalFooterActions } from './ModalShell';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {'defect'|'sos'} props.codeSet
 * @param {Map<string, object>} props.recordsById
 * @param {Array<{id: string, code?: string, confidence?: string, reason?: string, error?: string}>} props.results
 * @param {Array<{value: string, label: string}>} props.codeOptions
 * @param {Array} [props.workerDirectory]
 * @param {(updates: Array<{id: string, code: string, ai_suggested_code, ai_confidence, ai_reason}>) => Promise<void>} props.onSave
 * @param {() => void} props.onClose
 */
export default function BatchClassifyReviewModal({
  title,
  codeSet,
  recordsById,
  results,
  codeOptions,
  workerDirectory,
  onSave,
  onClose,
}) {
  const successResults = results.filter((r) => !r.error);

  const [selections, setSelections] = useState(() => {
    const init = {};
    for (const r of successResults) {
      init[r.id] = r.code || '';
    }
    return init;
  });

  const aiMeta = useMemo(() => {
    const map = {};
    for (const r of successResults) {
      map[r.id] = { code: r.code, confidence: r.confidence, reason: r.reason };
    }
    return map;
  }, [successResults]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const savableCount = successResults.filter((r) => selections[r.id]).length;

  function approveAll() {
    const next = { ...selections };
    for (const r of successResults) {
      if (r.code) next[r.id] = r.code;
    }
    setSelections(next);
  }

  async function handleSave() {
    setError(null);
    const updates = successResults
      .filter((r) => selections[r.id])
      .map((r) => ({
        id: r.id,
        code: selections[r.id],
        ai_suggested_code: aiMeta[r.id]?.code ?? null,
        ai_confidence: aiMeta[r.id]?.confidence ?? null,
        ai_reason: aiMeta[r.id]?.reason ?? null,
      }));

    if (!updates.length) {
      setError('저장할 항목을 선택해 주세요.');
      return;
    }

    setSaving(true);
    try {
      await onSave(updates);
      onClose();
    } catch (err) {
      setError(err.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const footerContent = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={approveAll}
        disabled={saving || !successResults.length}
        className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
      >
        전체 승인
      </button>
      <ModalFooterActions
        onCancel={onClose}
        onConfirm={handleSave}
        cancelLabel="취소"
        confirmLabel={saving ? '저장 중...' : `선택 저장 (${savableCount})`}
        confirmDisabled={saving || savableCount === 0}
      />
    </div>
  );

  return (
    <ModalShell
      title={title}
      eyebrow="AI 일괄판정 검토"
      onClose={onClose}
      ariaLabel={title}
      maxWidthClass="md:max-w-3xl"
      footer={footerContent}
    >
      <div className="space-y-3 p-4 md:p-5">
        {results.map((r) => {
          const record = recordsById.get(r.id);
          const displayName = record?.worker_name
            ? getDisplayName(record.worker_name, workerDirectory)
            : null;
          const isLow = r.confidence === 'low';
          const rowClass = isLow
            ? 'border-warn/40 bg-warnSoft/30'
            : 'border-border bg-surface';

          if (r.error) {
            return (
              <div
                key={r.id}
                className="rounded-xl border border-danger/30 bg-dangerSoft/20 p-3 text-xs"
              >
                <span className="font-medium text-text">{displayName || r.id}</span>
                <span className="ml-2 text-danger">판정 실패: {r.error}</span>
              </div>
            );
          }

          return (
            <div key={r.id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row ${rowClass}`}>
              <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-surface2 sm:h-16 sm:w-16">
                {record?.image_url ? (
                  <SignedImage url={record.image_url} alt="" sizes="(max-width: 768px) 100vw, 64px" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
                    없음
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-text">{displayName || '작업자 미상'}</span>
                  {r.code ? (
                    <span className="text-muted">
                      AI: {r.code} ({getCodeLabel(codeSet, r.code)}) · 확신도:{' '}
                      {CONFIDENCE_LABELS[r.confidence] || r.confidence}
                    </span>
                  ) : (
                    <span className="text-muted">AI: 코드 없음</span>
                  )}
                  {isLow ? (
                    <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
                      확인 필요
                    </span>
                  ) : null}
                </div>
                {r.reason ? <p className="text-[11px] text-muted">{r.reason}</p> : null}
                <select
                  value={selections[r.id] || ''}
                  onChange={(e) => setSelections((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">코드 선택</option>
                  {codeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value} - {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger md:mx-5">
          {error}
        </div>
      ) : null}
    </ModalShell>
  );
}
