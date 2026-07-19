'use client';

import { useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  SOS_ERROR_CATEGORIES,
  SOS_ERROR_CODES,
  ZONE_CODES,
  fivesErrorCode,
  fivesLabel,
  getSosCategoryForCode,
} from '../lib/constants';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData, parseMarkingData } from '../lib/markingData';
import {
  buildImageDownloadFilename,
  downloadRecordImage,
} from '../lib/downloadImages';
import { syncFivesNotificationQueue } from '../lib/fivesNotificationQueue';
import {
  insertAiCorrectionLog,
  resolveWasAiAccepted,
} from '../lib/aiCorrectionLog';
import AiClassifyStatus from './AiClassifyStatus';
import AiMismatchDialog from './AiMismatchDialog';
import AiSuggestionBanner from './AiSuggestionBanner';
import SosRegionOverlay from './SosRegionOverlay';
import ImageZoom from './ImageZoom';
import ModalShell, { ModalFooterActions } from './ModalShell';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

const ZONE_ENTRIES = Object.entries(ZONE_CODES);
const SOS_CATEGORIES = Object.keys(SOS_ERROR_CATEGORIES);

function SosWholeSelect({ value, onChange, disabled }) {
  const category = getSosCategoryForCode(value || undefined);
  const codes = SOS_ERROR_CATEGORIES[category] || [];

  return (
    <div className="space-y-2">
      <select
        value={category}
        onChange={(e) => {
          const nextCodes = SOS_ERROR_CATEGORIES[e.target.value] || [];
          onChange(nextCodes[0] || '');
        }}
        className={inputClass}
        disabled={disabled}
      >
        {SOS_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        disabled={disabled}
      >
        <option value="">없음 (정상)</option>
        {codes.map((code) => (
          <option key={code} value={code}>
            {SOS_ERROR_CODES[code]} ({code})
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FivesEditModal({ report, onClose, onSaved }) {
  const [workerName, setWorkerName] = useState(report.worker_name || '');
  const [zoneCode, setZoneCode] = useState(report.zone_code || '');
  const [areaType, setAreaType] = useState(report.area_type || '');
  const [description, setDescription] = useState(report.description || '');
  const [errorCode, setErrorCode] = useState(fivesErrorCode(report));
  const [errorNote, setErrorNote] = useState(report.sos_error_note || '');
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const [drawMode, setDrawMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [pendingAi, setPendingAi] = useState(null);
  const [correctionReason, setCorrectionReason] = useState(null);
  const [aiCompletedAt, setAiCompletedAt] = useState(null);
  const imageContentRef = useRef(null);
  const markersRef = useRef(markers);
  const errorCodeRef = useRef(errorCode);
  const correctionReasonRef = useRef(correctionReason);
  markersRef.current = markers;
  errorCodeRef.current = errorCode;
  correctionReasonRef.current = correctionReason;

  const aspectRatio =
    report.image_width > 0 && report.image_height > 0
      ? report.image_width / report.image_height
      : 4 / 3;

  async function handleAiClassify() {
    if (!report.image_url) {
      setError('분석할 이미지가 없습니다.');
      return;
    }

    setClassifying(true);
    setError(null);
    setPendingAi(null);
    setCorrectionReason(null);
    try {
      const result = await requestClassifyPhoto(report.image_url, 'sos');
      const suggestion = {
        code: result.code && SOS_ERROR_CODES[result.code] ? result.code : null,
        confidence: result.confidence,
        reason: result.reason,
      };
      setAiSuggestion(suggestion);
      setAiCompletedAt(new Date());

      if (!suggestion.code) return;
      if (suggestion.code === (errorCodeRef.current || null)) return;
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
    setErrorCode(pendingAi.code);
    setCorrectionReason(null);
    setPendingAi(null);
  }

  function keepExistingValue(reason) {
    setCorrectionReason(reason);
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
      zone_code: zoneCode || null,
      area_type: areaType.trim() || null,
      description: description.trim() || null,
      sos_error_code: errorCode || null,
      sos_error_note: errorNote.trim() || null,
      marking_data: Array.isArray(nextMarkers) ? nextMarkers : [],
      ai_suggested_code: aiSuggestion?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: aiSuggestion?.confidence ?? report.ai_confidence ?? null,
      ai_reason: aiSuggestion?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const { error: updateError } = await supabase
      .from('fives_reports')
      .update(payload)
      .eq('id', report.id);

    if (updateError) {
      setSaving(false);
      setError(
        updateError.message?.includes('zone_code') ||
          updateError.message?.includes('marking_data')
          ? `${updateError.message} — migration 010(fives zone_code/marking_data) 적용이 필요합니다.`
          : updateError.message
      );
      return;
    }

    // 영역 지적사항 → 알림 대기열 동기화 (카카오 알림톡 발송은 추후 별도 구현)
    try {
      await syncFivesNotificationQueue({
        fivesReportId: report.id,
        workerName: workerName.trim() || report.worker_name || null,
        zoneCode: zoneCode || null,
        markers: nextMarkers,
      });
    } catch (queueErr) {
      setSaving(false);
      setError(
        queueErr.message?.includes('fives_notification_queue') ||
          queueErr.code === '42P01'
          ? `${queueErr.message || '알림 대기열 저장 실패'} — migration 011 적용이 필요합니다.`
          : queueErr.message || '알림 대기열 동기화에 실패했습니다.'
      );
      return;
    }

    const sessionAi = aiSuggestion;
    const finalCode = errorCode || null;
    const wasAiAccepted = resolveWasAiAccepted(!!sessionAi, sessionAi?.code, finalCode);
    await insertAiCorrectionLog({
      sourceTable: 'fives_reports',
      sourceId: report.id,
      codeSet: 'sos',
      aiSuggestedCode: sessionAi ? sessionAi.code ?? null : null,
      aiConfidence: sessionAi ? sessionAi.confidence ?? null : null,
      aiReason: sessionAi ? sessionAi.reason ?? null : null,
      finalCode,
      finalNote: errorNote.trim() || null,
      wasAiAccepted,
      workerName: workerName.trim() || report.worker_name || null,
      correctionReason: wasAiAccepted === false ? correctionReasonRef.current : null,
    });

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
      confirmDisabled={saving || classifying || !!pendingAi}
    />
  );

  const regionCount = parseMarkingData(markers).length;

  return (
    <ModalShell
      title={fivesLabel(report)}
      eyebrow="3정5S 기록 수정"
      onClose={onClose}
      ariaLabel="3정5S 기록 수정"
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
                alt={fivesLabel(report)}
                fit="contain"
                sizes="(max-width: 768px) 100vw, 800px"
                enableScaleControls
                contentRef={imageContentRef}
                panDisabled={drawMode}
              >
                <SosRegionOverlay
                  markers={markers}
                  imageWidth={report.image_width}
                  imageHeight={report.image_height}
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
                ? '이미지 위를 드래그해 지적 영역을 지정하세요.'
                : '돋보기·확대로 확인한 뒤, 영역 지정으로 지적 사항을 표시할 수 있습니다.'}
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

          {regionCount > 0 ? (
            <p className="mt-2 text-xs text-muted">지정된 영역 {regionCount}개</p>
          ) : null}
        </div>

        <div className="flex w-full flex-col p-4 md:w-80 md:shrink-0 md:p-5">
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAiClassify}
                disabled={classifying || saving || !report.image_url}
                className="min-h-[44px] w-full rounded-xl border border-accent/30 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
              >
                {classifying ? 'AI 분석 중...' : 'AI 자동판정 (전체)'}
              </button>
              <AiClassifyStatus classifying={classifying} completedAt={aiCompletedAt} />
            </div>

            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={downloading || saving || !report.image_url}
              className="min-h-[44px] w-full rounded-xl border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0"
            >
              {downloading ? '다운로드 중...' : '이미지 다운로드'}
            </button>

            {pendingAi ? (
              <AiMismatchDialog
                key={`sos-${pendingAi.code}-${aiCompletedAt?.getTime?.() || 0}`}
                codeSet="sos"
                currentCode={errorCode || null}
                pendingAi={pendingAi}
                onApply={applyAiSuggestion}
                onKeep={keepExistingValue}
              />
            ) : null}

            {!pendingAi && aiSuggestion ? (
              <AiSuggestionBanner
                code={aiSuggestion.code}
                confidence={aiSuggestion.confidence}
                reason={aiSuggestion.reason}
                codeSet="sos"
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
              <label className="mb-1.5 block text-xs text-muted">구역</label>
              <select
                value={zoneCode}
                onChange={(e) => setZoneCode(e.target.value)}
                className={inputClass}
              >
                <option value="">선택</option>
                {ZONE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} ({value})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">직접 메모 (선택)</label>
              <input
                type="text"
                value={areaType}
                onChange={(e) => setAreaType(e.target.value)}
                placeholder="구역 보조 메모"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">설명</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">SOS 오류 코드 (기록 전체)</label>
              <SosWholeSelect value={errorCode} onChange={setErrorCode} />
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
