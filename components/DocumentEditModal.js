'use client';

import { useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DOC_ERROR_CODES, docLabel } from '../lib/constants';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData, parseMarkingData } from '../lib/markingData';
import {
  buildImageDownloadFilename,
  downloadRecordImage,
} from '../lib/downloadImages';
import { syncDocumentNotificationQueue } from '../lib/documentNotificationQueue';
import AiSuggestionBanner from './AiSuggestionBanner';
import DocRegionOverlay from './DocRegionOverlay';
import ImageZoom from './ImageZoom';
import ModalShell, { ModalFooterActions } from './ModalShell';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

export default function DocumentEditModal({ report, onClose, onSaved }) {
  const [workerName, setWorkerName] = useState(report.worker_name || '');
  const [docType, setDocType] = useState(report.doc_type || '');
  const [docTitle, setDocTitle] = useState(report.doc_title || '');
  const [errorCode, setErrorCode] = useState(report.doc_error_code || '');
  const [errorNote, setErrorNote] = useState(report.doc_error_note || '');
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const [imageWidth, setImageWidth] = useState(report.image_width || 0);
  const [imageHeight, setImageHeight] = useState(report.image_height || 0);
  const [drawMode, setDrawMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const imageContentRef = useRef(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  // Fives와 동일하게 report.marking_data로 초기화 + DB 재조회로 동기화
  useEffect(() => {
    let cancelled = false;
    setMarkers(cloneMarkingData(report.marking_data));
    setImageWidth(report.image_width || 0);
    setImageHeight(report.image_height || 0);

    (async () => {
      const { data, error: fetchError } = await supabase
        .from('ocr_results')
        .select('marking_data')
        .eq('id', report.id)
        .maybeSingle();
      if (cancelled || fetchError || !data) return;
      setMarkers(cloneMarkingData(data.marking_data));
    })();

    return () => {
      cancelled = true;
    };
  }, [report.id, report.marking_data, report.image_width, report.image_height]);

  const aspectRatio =
    imageWidth > 0 && imageHeight > 0
      ? imageWidth / imageHeight
      : report.image_width > 0 && report.image_height > 0
        ? report.image_width / report.image_height
        : 3 / 4;

  function handleNaturalSize({ width, height }) {
    if (!(width > 0 && height > 0)) return;
    setImageWidth((prev) => prev || width);
    setImageHeight((prev) => prev || height);
  }

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

  async function handleDownloadImage() {
    if (!report.image_url) {
      setError('다운로드할 이미지가 없습니다.');
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      await downloadRecordImage({
        imageUrl: report.image_url,
        filename: buildImageDownloadFilename(report.worker_name, report.created_at),
      });
    } catch (err) {
      setError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    setError(null);

    const nextMarkers = markersRef.current;

    const payload = {
      worker_name: workerName.trim() || null,
      doc_type: docType.trim() || null,
      doc_title: docTitle.trim() || null,
      doc_error_code: errorCode || null,
      doc_error_note: errorNote.trim() || null,
      marking_data: Array.isArray(nextMarkers) ? nextMarkers : [],
      ai_suggested_code: aiSuggestion?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: aiSuggestion?.confidence ?? report.ai_confidence ?? null,
      ai_reason: aiSuggestion?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const { error: updateError } = await supabase
      .from('ocr_results')
      .update(payload)
      .eq('id', report.id);

    if (updateError) {
      setSaving(false);
      setError(
        updateError.message?.includes('marking_data')
          ? `${updateError.message} — Supabase에 migration 008(ocr_results.marking_data) 적용이 필요합니다.`
          : updateError.message
      );
      return;
    }

    // 영역 지적사항 → 알림 대기열 동기화 (카카오 알림톡 발송은 추후 별도 구현)
    try {
      await syncDocumentNotificationQueue({
        ocrResultId: report.id,
        workerName: workerName.trim() || report.worker_name || null,
        markers: nextMarkers,
      });
    } catch (queueErr) {
      setSaving(false);
      setError(
        queueErr.message?.includes('document_notification_queue') ||
          queueErr.code === '42P01'
          ? `${queueErr.message || '알림 대기열 저장 실패'} — migration 009 적용이 필요합니다.`
          : queueErr.message || '알림 대기열 동기화에 실패했습니다.'
      );
      return;
    }

    setSaving(false);
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
      title={docLabel(report)}
      eyebrow="문서스캔 수정"
      onClose={onClose}
      ariaLabel="문서스캔 수정"
      footer={<div className="md:hidden">{footerButtons}</div>}
    >
      <div className="flex flex-col md:flex-row md:overflow-hidden">
        <div className="border-b border-border p-4 md:flex-1 md:border-b-0 md:border-r md:p-5 md:overflow-y-auto">
          <div
            className="relative mx-auto w-full overflow-hidden bg-surface2 md:max-h-[60vh] md:rounded-xl"
            style={{ aspectRatio }}
          >
            {report.image_url ? (
              <ImageZoom
                url={report.image_url}
                alt={docLabel(report)}
                fit="contain"
                sizes="(max-width: 768px) 100vw, 800px"
                enableScaleControls
                contentRef={imageContentRef}
                panDisabled={drawMode}
                onNaturalSize={handleNaturalSize}
              >
                <DocRegionOverlay
                  markers={markers}
                  imageWidth={imageWidth || report.image_width}
                  imageHeight={imageHeight || report.image_height}
                  imageUrl={report.image_url}
                  containerRef={imageContentRef}
                  onChange={setMarkers}
                  drawMode={drawMode}
                />
              </ImageZoom>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                이미지 없음
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {drawMode
                ? '이미지 위를 드래그해 오류 영역을 지정하세요.'
                : '돋보기·확대로 확인한 뒤, 영역 지정으로 오류 칸을 표시할 수 있습니다.'}
            </p>
            <button
              type="button"
              onClick={() => setDrawMode((v) => !v)}
              disabled={!report.image_url || saving}
              aria-pressed={drawMode}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                drawMode
                  ? 'border-accent bg-accentSoft text-accent'
                  : 'border-border text-muted hover:bg-surface2 hover:text-text'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" strokeWidth={2.25} />
              {drawMode ? '영역 지정 중' : '영역 지정'}
            </button>
          </div>

          {parseMarkingData(markers).length > 0 ? (
            <p className="mt-2 text-xs text-muted">
              지정된 영역 {parseMarkingData(markers).length}개
            </p>
          ) : null}
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
              <label className="mb-1.5 block text-xs text-muted">오류 코드 (문서 전체)</label>
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

          <div className="mt-6 hidden justify-end gap-2 md:flex">{footerButtons}</div>
        </div>
      </div>
    </ModalShell>
  );
}
