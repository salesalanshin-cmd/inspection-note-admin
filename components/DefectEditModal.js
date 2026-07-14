'use client';

import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFECT_CODE_LABELS, CONFIDENCE_LABELS, defectLabel } from '../lib/constants';
import { getDisplayName } from '../lib/analytics';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData } from '../lib/markingData';
import {
  buildImageDownloadFilename,
  downloadRecordImage,
} from '../lib/downloadImages';
import AiSuggestionBanner from './AiSuggestionBanner';
import EditableMarkerOverlay from './EditableMarkerOverlay';
import ImageZoom from './ImageZoom';
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

/** AI/외부 응답 코드를 DEFECT_CODE_LABELS 키로 정규화 */
function normalizeDefectCode(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (DEFECT_CODE_LABELS[trimmed]) return trimmed;
  const upper = trimmed.toUpperCase();
  if (DEFECT_CODE_LABELS[upper]) return upper;
  return (
    Object.keys(DEFECT_CODE_LABELS).find((k) => k.toLowerCase() === trimmed.toLowerCase()) ||
    null
  );
}

function formatCodeLabel(code) {
  if (!code) return '(없음)';
  const label = DEFECT_CODE_LABELS[code];
  return label ? `${code} (${label})` : code;
}

export default function DefectEditModal({ report, workerDirectory, onClose, onSaved }) {
  const [code, setCode] = useState(() => resolveInitialCode(report));
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const originalMarkers = useRef(cloneMarkingData(report.marking_data));
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [pendingAi, setPendingAi] = useState(null);
  const imageContainerRef = useRef(null);
  // 저장 시 stale closure 방지용 — 항상 최신 code/markers 참조
  const codeRef = useRef(code);
  const markersRef = useRef(markers);
  const aiSuggestionRef = useRef(aiSuggestion);
  codeRef.current = code;
  markersRef.current = markers;
  aiSuggestionRef.current = aiSuggestion;

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
    setPendingAi(null);
    try {
      const result = await requestClassifyPhoto(report.image_url, 'defect');
      const normalized = normalizeDefectCode(result.code);
      const suggestion = {
        code: normalized,
        confidence: result.confidence,
        reason: result.reason,
      };
      setAiSuggestion(suggestion);

      // labels에 없는 코드면 드롭다운에 넣을 수 없음 — 배너만 표시
      if (!normalized) return;

      // 현재 폼 값과 같으면 바로 안내만 (팝업 없음)
      if (normalized === codeRef.current) return;

      // 다르면 덮어쓰지 않고 확인 팝업
      setPendingAi(suggestion);
    } catch (err) {
      setError(err.message);
    } finally {
      setClassifying(false);
    }
  }

  function applyAiSuggestion() {
    if (!pendingAi?.code) {
      setPendingAi(null);
      return;
    }
    setCode(pendingAi.code);
    setPendingAi(null);
  }

  function dismissAiSuggestion() {
    setPendingAi(null);
  }

  async function handleDownloadImage() {
    if (!report.image_url) {
      setError('다운로드할 이미지가 없습니다.');
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      const w = report.worker_name;
      await downloadRecordImage({
        imageUrl: report.image_url,
        filename: buildImageDownloadFilename(
          w ? getDisplayName(w, workerDirectory) : w,
          report.created_at
        ),
        bucket: 'defect-images',
      });
    } catch (err) {
      setError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    setError(null);

    const nextCode = codeRef.current;
    const nextMarkers = markersRef.current;
    const nextAi = aiSuggestionRef.current;

    if (!nextCode || !DEFECT_CODE_LABELS[nextCode]) {
      setError('유효한 불량 유형을 선택해 주세요.');
      return;
    }

    const payload = {
      defect_code: nextCode,
      defect_type: DEFECT_CODE_LABELS[nextCode],
      marking_data: nextMarkers,
      marking_count: nextMarkers.length,
      ai_suggested_code: nextAi?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: nextAi?.confidence ?? report.ai_confidence ?? null,
      ai_reason: nextAi?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const { data, error: updateError } = await supabase
      .from('defect_reports')
      .update(payload)
      .eq('id', report.id)
      .select('id, defect_code, defect_type')
      .maybeSingle();
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (!data) {
      setError('저장되지 않았습니다. 권한(RLS) 또는 레코드 상태를 확인해 주세요.');
      return;
    }

    onSaved?.(data);
    onClose?.();
  }

  const footerButtons = (
    <ModalFooterActions
      onCancel={onClose}
      onConfirm={handleSave}
      cancelLabel="취소"
      confirmLabel={saving ? '저장 중...' : '저장'}
      confirmDisabled={saving || classifying || !!pendingAi}
    />
  );

  const titleLabel = DEFECT_CODE_LABELS[code] || defectLabel(report);

  return (
    <ModalShell
      title={titleLabel}
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
              <ImageZoom
                url={report.image_url}
                alt={titleLabel}
                fit="contain"
                sizes="(max-width: 768px) 100vw, 800px"
                bucket="defect-images"
              >
                {markers.length > 0 && (
                  <EditableMarkerOverlay
                    markers={markers}
                    imageWidth={report.image_width}
                    imageHeight={report.image_height}
                    containerRef={imageContainerRef}
                    onChange={setMarkers}
                  />
                )}
              </ImageZoom>
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
              <div className="font-medium text-text">
                {report.worker_name
                  ? getDisplayName(report.worker_name, workerDirectory)
                  : '작업자 미상'}
              </div>
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
              className="min-h-[44px] w-full rounded-xl border border-accent/30 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
            >
              {classifying ? 'AI 분석 중...' : 'AI 자동판정'}
            </button>

            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={downloading || saving || !report.image_url}
              className="min-h-[44px] w-full rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
            >
              {downloading ? '다운로드 중...' : '이미지 다운로드'}
            </button>

            {pendingAi ? (
              <div
                className="rounded-xl border border-accent/30 bg-surface p-3 shadow-card"
                role="dialog"
                aria-label="AI 판정 결과 확인"
              >
                <p className="text-sm font-medium text-text">AI 판정 결과가 다릅니다</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  기존: <span className="text-text">{formatCodeLabel(code)}</span>
                  <br />
                  → AI 제안:{' '}
                  <span className="font-medium text-accent">{formatCodeLabel(pendingAi.code)}</span>
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
                    onClick={applyAiSuggestion}
                    className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
                  >
                    AI 제안 적용
                  </button>
                  <button
                    type="button"
                    onClick={dismissAiSuggestion}
                    className="min-h-[44px] flex-1 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0"
                  >
                    기존 값 유지
                  </button>
                </div>
              </div>
            ) : null}

            {!pendingAi && aiSuggestion ? (
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
