'use client';

import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFECT_CODE_LABELS, defectLabel } from '../lib/constants';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData } from '../lib/markingData';
import AiSuggestionBanner from './AiSuggestionBanner';
import EditableMarkerOverlay from './EditableMarkerOverlay';
import SignedImage from './SignedImage';

const OTHER_VALUE = '__other__';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

export default function DefectEditModal({ report, onClose, onSaved }) {
  const initialIsKnown = report.defect_code && DEFECT_CODE_LABELS[report.defect_code];
  const [code, setCode] = useState(initialIsKnown ? report.defect_code : OTHER_VALUE);
  const [customType, setCustomType] = useState(
    initialIsKnown ? '' : report.defect_type || report.defect_code || ''
  );
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const originalMarkers = useRef(cloneMarkingData(report.marking_data));
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const imageContainerRef = useRef(null);

  const isOther = code === OTHER_VALUE;
  const aspectRatio =
    report.image_width > 0 && report.image_height > 0
      ? report.image_width / report.image_height
      : 4 / 3;

  function handleResetMarkings() {
    const restored = cloneMarkingData(originalMarkers.current);
    setMarkers(restored);
  }

  async function handleAiClassify() {
    if (!report.image_url) {
      setError('분석할 이미지가 없습니다.');
      return;
    }

    setClassifying(true);
    setError(null);
    try {
      const result = await requestClassifyPhoto(report.image_url, 'defect');
      setAiSuggestion(result);
      if (result.code && DEFECT_CODE_LABELS[result.code]) {
        setCode(result.code);
        setCustomType('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setClassifying(false);
    }
  }

  async function handleSave() {
    setError(null);

    if (isOther && !customType.trim()) {
      setError('불량 유형을 직접 입력해 주세요.');
      return;
    }

    const defectPayload = isOther
      ? { defect_code: null, defect_type: customType.trim() }
      : { defect_code: code, defect_type: DEFECT_CODE_LABELS[code] };

    const payload = {
      ...defectPayload,
      marking_data: markers,
      marking_count: markers.length,
      ai_suggested_code: aiSuggestion?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: aiSuggestion?.confidence ?? report.ai_confidence ?? null,
      ai_reason: aiSuggestion?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const { error: updateError } = await supabase
      .from('defect_reports')
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
      aria-label="불량 기록 수정"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-xs font-medium text-accent">불량 기록 수정</div>
            <h2 className="text-lg font-semibold text-text">{defectLabel(report)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface2 hover:text-text"
            aria-label="닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="border-b border-border p-5 md:flex-1 md:border-b-0 md:border-r md:overflow-y-auto">
            <div
              ref={imageContainerRef}
              className="relative mx-auto w-full max-h-[50vh] bg-surface2 rounded-xl overflow-hidden md:max-h-[60vh]"
              style={{ aspectRatio }}
            >
              {report.image_url ? (
                <>
                  <SignedImage
                    url={report.image_url}
                    alt={defectLabel(report)}
                    fit="contain"
                    sizes="800px"
                  />
                  {markers.length > 0 && (
                    <EditableMarkerOverlay
                      markers={markers}
                      imageWidth={report.image_width}
                      imageHeight={report.image_height}
                      containerRef={imageContainerRef}
                      onChange={setMarkers}
                    />
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                  이미지 없음
                </div>
              )}
            </div>

            {markers.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  마킹을 드래그해 위치를, 모서리 핸들로 크기를 조정할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={handleResetMarkings}
                  className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text"
                >
                  위치 초기화
                </button>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted">작업자</div>
                <div className="text-text font-medium">{report.worker_name || '작업자 미상'}</div>
              </div>
              <div>
                <div className="text-xs text-muted">마킹 수</div>
                <div className="text-text font-medium">{markers.length}개</div>
              </div>
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
                  codeSet="defect"
                />
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs text-muted">불량 코드</label>
                <select value={code} onChange={(e) => setCode(e.target.value)} className={inputClass}>
                  {Object.entries(DEFECT_CODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({value})
                    </option>
                  ))}
                  <option value={OTHER_VALUE}>기타 (직접 입력)</option>
                </select>
              </div>

              {isOther && (
                <div>
                  <label className="mb-1.5 block text-xs text-muted">불량 유형 (직접 입력)</label>
                  <input
                    type="text"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="예: 표면 스크래치"
                    className={inputClass}
                  />
                </div>
              )}

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
