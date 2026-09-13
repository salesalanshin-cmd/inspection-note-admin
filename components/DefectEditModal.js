'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCompanyId } from '../lib/company';
import { DEFECT_CODE_LABELS, defectLabel } from '../lib/constants';
import { getDefectCodeDefinition } from '../lib/defectCodeDefinitions';
import { getDisplayName } from '../lib/analytics';
import { requestClassifyPhoto } from '../lib/classifyClient';
import { cloneMarkingData } from '../lib/markingData';
import {
  buildImageDownloadFilename,
  downloadRecordImage,
} from '../lib/downloadImages';
import { syncDefectNotificationQueue } from '../lib/defectNotificationQueue';
import {
  insertAiCorrectionLog,
  resolveWasAiAccepted,
} from '../lib/aiCorrectionLog';
import {
  fetchDefectActionMessages,
  findDefectThread,
  getActionOutcome,
  getIneffectiveActions,
  sendDefectAction,
} from '../lib/defectActions';
import AiClassifyStatus from './AiClassifyStatus';
import AiMismatchDialog from './AiMismatchDialog';
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

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

function ActionOutcomeBadge({ outcome }) {
  if (outcome === 'effective') {
    return (
      <span className="inline-flex rounded-full bg-goodSoft px-2 py-0.5 text-[11px] font-medium text-good">
        해결됨
      </span>
    );
  }
  if (outcome === 'ineffective') {
    return (
      <span className="inline-flex rounded-full bg-dangerSoft px-2 py-0.5 text-[11px] font-medium text-danger">
        미해결
      </span>
    );
  }
  if (outcome === 'unknown') {
    return (
      <span className="inline-flex rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium text-muted">
        결과 대기
      </span>
    );
  }
  return null;
}

function pickManagerWorker(workerDirectory) {
  const managers = (workerDirectory || []).filter(
    (w) => w?.role === 'manager' && w?.worker_name && !w.removed
  );
  return managers[0]?.worker_name || '관리자';
}

export default function DefectEditModal({
  report,
  workerDirectory,
  productNameOptions = [],
  onClose,
  onSaved,
  onActionSent,
}) {
  const [code, setCode] = useState(() => resolveInitialCode(report));
  const [productName, setProductName] = useState(() =>
    report.product_name ? String(report.product_name) : ''
  );
  const [markers, setMarkers] = useState(() => cloneMarkingData(report.marking_data));
  const originalMarkers = useRef(cloneMarkingData(report.marking_data));
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [pendingAi, setPendingAi] = useState(null);
  const [correctionReason, setCorrectionReason] = useState(null);
  const [aiCompletedAt, setAiCompletedAt] = useState(null);
  const imageContainerRef = useRef(null);
  // 저장 시 stale closure 방지용 — 항상 최신 code/markers 참조
  const codeRef = useRef(code);
  const productNameRef = useRef(productName);
  const markersRef = useRef(markers);
  const aiSuggestionRef = useRef(aiSuggestion);
  const correctionReasonRef = useRef(correctionReason);
  codeRef.current = code;
  productNameRef.current = productName;
  markersRef.current = markers;
  aiSuggestionRef.current = aiSuggestion;
  correctionReasonRef.current = correctionReason;

  const [actionText, setActionText] = useState('');
  const [notifyWorker, setNotifyWorker] = useState(true);
  const [actionSending, setActionSending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionInfo, setActionInfo] = useState(null);
  const [actionLoading, setActionLoading] = useState(true);
  const [actionMessages, setActionMessages] = useState([]);

  const productDatalistId = `defect-product-names-${report.id}`;

  const aspectRatio =
    report.image_width > 0 && report.image_height > 0
      ? report.image_width / report.image_height
      : 4 / 3;

  const loadActionHistory = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const companyId = await getCompanyId();
      const thread = await findDefectThread(report.id, companyId);
      if (!thread) {
        setActionMessages([]);
        return;
      }
      const messages = await fetchDefectActionMessages(thread.id, companyId);
      setActionMessages(messages);
    } catch (err) {
      setActionError(err.message || '조치 이력을 불러오지 못했습니다.');
      setActionMessages([]);
    } finally {
      setActionLoading(false);
    }
  }, [report.id]);

  useEffect(() => {
    loadActionHistory();
  }, [loadActionHistory]);

  const historyItems = useMemo(() => {
    return (actionMessages || []).filter((m) => {
      if (m.msg_type === 'action' && m.author_role === 'manager') return true;
      if (m.author_role === 'worker' && (m.msg_type === 'result' || m.meta?.outcome)) {
        return true;
      }
      return false;
    });
  }, [actionMessages]);

  const ineffectiveActions = useMemo(
    () => getIneffectiveActions(actionMessages),
    [actionMessages]
  );
  const latestIneffective = ineffectiveActions.length
    ? ineffectiveActions[ineffectiveActions.length - 1]
    : null;

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
    setCorrectionReason(null);
    try {
      const result = await requestClassifyPhoto(report.image_url, 'defect', {
        productName: productNameRef.current,
      });
      const normalized = normalizeDefectCode(result.code);
      const suggestion = {
        code: normalized,
        confidence: result.confidence,
        reason: result.reason,
      };
      setAiSuggestion(suggestion);
      setAiCompletedAt(new Date());

      if (!normalized) return;
      if (normalized === codeRef.current) return;
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

  async function handleSendAction() {
    setActionError(null);
    setActionInfo(null);
    const text = actionText.trim();
    if (!text) {
      setActionError('조치 내용을 입력하세요.');
      return;
    }

    setActionSending(true);
    try {
      await sendDefectAction({
        report: {
          ...report,
          defect_code: codeRef.current || report.defect_code,
          defect_type: DEFECT_CODE_LABELS[codeRef.current] || report.defect_type,
          product_name: String(productNameRef.current || '').trim() || report.product_name,
        },
        actionText: text,
        notifyWorker,
        managerWorker: pickManagerWorker(workerDirectory),
      });
      setActionText('');
      setActionInfo(notifyWorker ? '조치를 등록하고 알림을 보냈습니다.' : '조치를 등록했습니다.');
      await loadActionHistory();
      onActionSent?.();
    } catch (err) {
      setActionError(err.message || '조치 등록에 실패했습니다.');
    } finally {
      setActionSending(false);
    }
  }

  async function handleSave() {
    setError(null);

    const nextCode = codeRef.current;
    const nextMarkers = markersRef.current;
    const nextAi = aiSuggestionRef.current;
    const nextProductName = String(productNameRef.current || '').trim() || null;

    if (!nextCode || !DEFECT_CODE_LABELS[nextCode]) {
      setError('유효한 불량 유형을 선택해 주세요.');
      return;
    }

    const payload = {
      defect_code: nextCode,
      defect_type: DEFECT_CODE_LABELS[nextCode],
      product_name: nextProductName,
      marking_data: Array.isArray(nextMarkers) ? nextMarkers : [],
      marking_count: Array.isArray(nextMarkers) ? nextMarkers.length : 0,
      ai_suggested_code: nextAi?.code ?? report.ai_suggested_code ?? null,
      ai_confidence: nextAi?.confidence ?? report.ai_confidence ?? null,
      ai_reason: nextAi?.reason ?? report.ai_reason ?? null,
    };

    setSaving(true);
    const companyId = await getCompanyId();
    const { data, error: updateError } = await supabase
      .from('defect_reports')
      .update(payload)
      .eq('id', report.id)
      .eq('company_id', companyId)
      .select('id, defect_code, defect_type, product_name')
      .maybeSingle();

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }
    if (!data) {
      setSaving(false);
      setError('저장되지 않았습니다. 권한(RLS) 또는 레코드 상태를 확인해 주세요.');
      return;
    }

    try {
      await syncDefectNotificationQueue({
        defectReportId: report.id,
        workerName: report.worker_name || null,
        markers: nextMarkers,
        reportDefectCode: nextCode,
        reportDefectType: DEFECT_CODE_LABELS[nextCode],
      });
    } catch (queueErr) {
      setSaving(false);
      setError(
        queueErr.message?.includes('defect_notification_queue') || queueErr.code === '42P01'
          ? `${queueErr.message || '알림 대기열 저장 실패'} — migration 012 적용이 필요합니다.`
          : queueErr.message || '알림 대기열 동기화에 실패했습니다.'
      );
      return;
    }

    const sessionAi = nextAi;
    const wasAiAccepted = resolveWasAiAccepted(!!sessionAi, sessionAi?.code, nextCode);
    await insertAiCorrectionLog({
      sourceTable: 'defect_reports',
      sourceId: report.id,
      codeSet: 'defect',
      aiSuggestedCode: sessionAi ? sessionAi.code ?? null : null,
      aiConfidence: sessionAi ? sessionAi.confidence ?? null : null,
      aiReason: sessionAi ? sessionAi.reason ?? null : null,
      finalCode: nextCode,
      finalNote: null,
      wasAiAccepted,
      workerName: report.worker_name || null,
      correctionReason: wasAiAccepted === false ? correctionReasonRef.current : null,
    });

    setSaving(false);
    onSaved?.(data);
    onClose?.();
  }

  const footerButtons = (
    <ModalFooterActions
      onCancel={onClose}
      onConfirm={handleSave}
      cancelLabel="취소"
      confirmLabel={saving ? '저장 중...' : '저장'}
      confirmDisabled={saving || classifying || !!pendingAi || actionSending}
    />
  );

  const titleLabel = DEFECT_CODE_LABELS[code] || defectLabel(report);
  const selectedDefinition = getDefectCodeDefinition(code);

  return (
    <ModalShell
      title={titleLabel}
      eyebrow="불량 기록 수정"
      onClose={onClose}
      ariaLabel="불량 기록 수정"
      maxWidthClass="md:max-w-5xl"
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
                <EditableMarkerOverlay
                  markers={markers}
                  imageWidth={report.image_width}
                  imageHeight={report.image_height}
                  containerRef={imageContainerRef}
                  onChange={setMarkers}
                />
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
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleAiClassify}
                disabled={classifying || saving || !report.image_url}
                className="min-h-[44px] w-full rounded-xl border border-accent/30 bg-accentSoft px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
              >
                {classifying ? 'AI 분석 중...' : 'AI 자동판정'}
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
                key={`defect-${pendingAi.code}-${aiCompletedAt?.getTime?.() || 0}`}
                codeSet="defect"
                currentCode={code}
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
                codeSet="defect"
              />
            ) : null}

            <div>
              <label htmlFor={productDatalistId} className="mb-1.5 block text-xs text-muted">
                제품명
              </label>
              <input
                id={productDatalistId}
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                list={`${productDatalistId}-list`}
                placeholder="제품명 입력 (선택)"
                autoComplete="off"
                className={inputClass}
              />
              <datalist id={`${productDatalistId}-list`}>
                {productNameOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-muted">불량 유형</label>
              <select value={code} onChange={(e) => setCode(e.target.value)} className={inputClass}>
                {DEFECT_CODE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} - {label}
                  </option>
                ))}
              </select>
              {selectedDefinition?.definition ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  {selectedDefinition.definition}
                </p>
              ) : null}
            </div>

            {error && (
              <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{error}</div>
            )}
          </div>

          <div className="mt-6 hidden justify-end gap-2 md:flex">{footerButtons}</div>
        </div>
      </div>

      <div className="border-t border-border p-4 md:p-5">
        <h3 className="text-sm font-semibold text-text">조치 보내기</h3>
        <p className="mt-1 text-xs text-muted">
          조치를 등록하면 대화방이 생성되고, 작업자가 결과를 남길 수 있습니다.
        </p>

        {latestIneffective ? (
          <div className="mt-3 rounded-xl border border-danger/30 bg-dangerSoft px-3 py-2.5 text-xs text-danger">
            <div className="font-medium">이전 조치가 효과가 없었습니다</div>
            <p className="mt-1 whitespace-pre-wrap text-danger/90">
              {latestIneffective.body_ko || latestIneffective.body || ''}
            </p>
            <p className="mt-1 text-[11px] text-danger/80">같은 조치를 다시 보내지 마세요.</p>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          <label className="block text-xs text-muted" htmlFor={`defect-action-${report.id}`}>
            조치 내용
          </label>
          <textarea
            id={`defect-action-${report.id}`}
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            rows={3}
            placeholder="작업자에게 전달할 조치 내용을 입력하세요"
            className={inputClass}
            disabled={actionSending}
          />
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-text md:min-h-0">
            <input
              type="checkbox"
              checked={notifyWorker}
              onChange={(e) => setNotifyWorker(e.target.checked)}
              className="h-4 w-4 accent-accent"
              disabled={actionSending}
            />
            작업자에게 알림
          </label>
          <button
            type="button"
            onClick={handleSendAction}
            disabled={actionSending || !report.worker_name}
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            {actionSending ? '등록 중...' : '조치 등록'}
          </button>
          {!report.worker_name ? (
            <p className="text-xs text-danger">작업자가 없어 조치를 보낼 수 없습니다.</p>
          ) : null}
          {actionError ? (
            <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{actionError}</div>
          ) : null}
          {actionInfo ? (
            <div className="rounded-xl bg-goodSoft px-3 py-2 text-xs text-good">{actionInfo}</div>
          ) : null}
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-medium text-muted">조치 이력</h4>
          {actionLoading ? (
            <p className="mt-2 text-xs text-muted">불러오는 중...</p>
          ) : historyItems.length === 0 ? (
            <p className="mt-2 text-xs text-muted">아직 등록된 조치가 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {historyItems.map((m) => {
                const isManagerAction =
                  m.author_role === 'manager' && m.msg_type === 'action';
                const outcome = isManagerAction ? getActionOutcome(m) : m.meta?.outcome;
                const roleLabel = isManagerAction
                  ? '관리자 조치'
                  : outcome === 'effective'
                    ? '작업자 결과 · O'
                    : outcome === 'ineffective'
                      ? '작업자 결과 · X'
                      : '작업자 결과';
                return (
                  <li
                    key={m.id}
                    className="rounded-xl border border-border bg-surface2/60 px-3 py-2.5"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="font-medium text-text">{roleLabel}</span>
                      {m.author_worker ? <span>{m.author_worker}</span> : null}
                      <span>{formatDateTime(m.created_at)}</span>
                      {isManagerAction ? <ActionOutcomeBadge outcome={outcome} /> : null}
                      {!isManagerAction &&
                      (outcome === 'effective' || outcome === 'ineffective') ? (
                        <ActionOutcomeBadge outcome={outcome} />
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-text">
                      {m.body_ko || m.body || ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
