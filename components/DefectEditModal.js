'use client';

import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFECT_CODE_LABELS, defectLabel } from '../lib/constants';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData } from '../lib/markingData';
import AiSuggestionBanner from './AiSuggestionBanner';
import EditableMarkerOverlay from './EditableMarkerOverlay';
import SignedImage from './SignedImage';
import ModalShell, { ModalFooterActions } from './ModalShell';

const DEFECT_CODE_ENTRIES = Object.entries(DEFECT_CODE_LABELS);
const DEFAULT_DEFECT_CODE = DEFECT_CODE_ENTRIES[0]?.[0] ?? '';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function resolveInitialCode(report) {
  if (report.defect_code && DEFECT_CODE_LABELS[report.defect_code]) {
    return report.defect_code;
  }
  return DEFAULT_DEFECT_CODE;
}

export default function DefectEditModal({ report, onClose, onSaved }) {
  const [code, setCode] = useState(() => resolveInitialCode(report));
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const originalMarkers = useRef(cloneMarkingData(report.marking_data));
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const imageContainerRef = useRef(null);

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
      defect_code: code,
      defect_type: DEFECT_CODE_LABELS[code],
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

  const footerButtons = (
    <ModalFooterActions
      onCancel={onClose}
      onConfirm={handleSave}
      cancelLabel="취소"
      confirmLabel={saving ? '저장 중...' : '저장'}
      confirmDisabled={saving || classifying}
    />
  );

  return (
    <ModalShell
      title={defectLabel(report)}
      eyebrow="불량 기록 수정"
      onClose={onClose}
      ariaLabel="불량 기록 수정"
      footer={<div className="md:hidden">{footerButtons}</div>}
    >
      <div className="flex flex-col md:flex-row md:overflow-hidden">
        <div className="border-b border-border p-4 md:flex-1 md:border-b-0 md:border-r md:p-5 md:overflow-y-auto">
          <div
            ref={imageContainerRef}
            className="relative mx-auto w-full overflow-hidden bg-surface2 md:max-h-[60vh] md:rounded-xl"
            style={{ aspectRatio }}
          >
            {report.image_url ? (
              <>
                <SignedImage
                  url={report.image_url}
                  alt={defectLabel(report)}
                  fit="contain"
                  sizes="(max-width: 768px) 100vw, 800px"
                  bucket="defect-images"
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
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
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
              <div className="font-medium text-text">{report.worker_name || '작업자 미상'}</div>
            </div>
            <div>
              <div className="text-xs text-muted">마킹 수</div>
              <div className="font-medium text-text">{markers.length}개</div>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col p-4 md:w-80 md:shrink-0 md:p-5">
          <div className="flex-1 space-y-4">
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
              <label className="mb-1.5 block text-xs text-muted">불량 유형</label>
              <select value={code} onChange={(e) => setCode(e.target.value)} className={inputClass}>
                {DEFECT_CODE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} {label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{error}</div>
            )}
          </div>

          <div className="mt-6 hidden justify-end gap-2 md:flex">{footerButtons}</div>
        </div>
      </div>
    </ModalShell>
  );
}
