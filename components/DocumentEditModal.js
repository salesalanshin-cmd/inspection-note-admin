'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { DOC_ERROR_CODES, docLabel } from '../lib/constants';
import { requestClassifyPhoto } from '../lib/classifyClient';
import AiSuggestionBanner from './AiSuggestionBanner';
import SignedImage from './SignedImage';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

export default function DocumentEditModal({ report, onClose, onSaved }) {
  const [workerName, setWorkerName] = useState(report.worker_name || '');
  const [docType, setDocType] = useState(report.doc_type || '');
  const [docTitle, setDocTitle] = useState(report.doc_title || '');
  const [errorCode, setErrorCode] = useState(report.doc_error_code || '');
  const [errorNote, setErrorNote] = useState(report.doc_error_note || '');
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);

  async function handleAiClassify() {
    if (!report.image_url) {
      setError('분석할 이미지가 없습니다.');
      return;
    }

    setClassifying(true);
    setError(null);
    try {
      const result = await requestClassifyPhoto(report.image_url, 'doc');
      setAiSuggestion(result);
      if (result.code && DOC_ERROR_CODES[result.code]) {
        setErrorCode(result.code);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setClassifying(false);
    }
  }

  async function handleSave() {
    setError(null);

    const payload = {
      worker_name: workerName.trim() || null,
      doc_type: docType.trim() || null,
      doc_title: docTitle.trim() || null,
      doc_error_code: errorCode || null,
      doc_error_note: errorNote.trim() || null,
      ai_suggested_code: aiSuggestion?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: aiSuggestion?.confidence ?? report.ai_confidence ?? null,
      ai_reason: aiSuggestion?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const { error: updateError } = await supabase
      .from('ocr_results')
      .update(payload)
      .eq('id', report.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSaved?.();
    onClose?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="문서스캔 수정"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-xs font-medium text-accent">문서스캔 수정</div>
            <h2 className="text-lg font-semibold text-text">{docLabel(report)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-text"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="border-b border-border p-5 md:flex-1 md:border-b-0 md:border-r md:overflow-y-auto">
            <div className="relative mx-auto w-full max-h-[50vh] bg-surface2 rounded-xl overflow-hidden md:max-h-[60vh] aspect-[3/4]">
              {report.image_url ? (
                <SignedImage
                  url={report.image_url}
                  alt={docLabel(report)}
                  fit="contain"
                  sizes="800px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                  이미지 없음
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full flex-col p-5 md:w-80 md:shrink-0">
            <div className="space-y-4 flex-1">
              <button
                type="button"
                onClick={handleAiClassify}
                disabled={classifying || saving || !report.image_url}
                className="w-full rounded-xl border border-accent/30 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {classifying ? 'AI 분석 중...' : 'AI 자동판정'}
              </button>

              {aiSuggestion ? (
                <AiSuggestionBanner
                  code={aiSuggestion.code}
                  confidence={aiSuggestion.confidence}
                  reason={aiSuggestion.reason}
                  codeSet="doc"
                />
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs text-muted">작업자</label>
                <input
                  type="text"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted">문서 유형</label>
                <input
                  type="text"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted">문서 제목</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted">오류 코드</label>
                <select
                  value={errorCode}
                  onChange={(e) => setErrorCode(e.target.value)}
                  className={inputClass}
                >
                  <option value="">없음 (정상)</option>
                  {Object.entries(DOC_ERROR_CODES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted">오류 메모</label>
                <input
                  type="text"
                  value={errorNote}
                  onChange={(e) => setErrorNote(e.target.value)}
                  placeholder="추가 메모"
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{error}</div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || classifying}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
