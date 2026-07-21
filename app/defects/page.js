'use client';

import { useEffect, useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import { defectLabel, DEFECT_CODE_LABELS } from '../../lib/constants';
import { parseMarkingData } from '../../lib/markingData';
import { buildWorkerDisplayNameMap, filterDefectsForDisplay } from '../../lib/analytics';
import { filterByCreatedAtDateRange, getRecentDaysRange, isDateRangeValid } from '../../lib/dateRange';
import { requestClassifyPhotosBatch } from '../../lib/classifyClient';
import { useGalleryBatchSelect } from '../../lib/useGalleryBatchSelect';
import { moveToTrash, TRASH_TABLES } from '../../lib/trash';
import {
  buildImageDownloadFilename,
  downloadImagesAsZip,
} from '../../lib/downloadImages';
import { countPendingDefectNotifications } from '../../lib/defectNotificationQueue';
import { supabase } from '../../lib/supabase';
import {
  insertAiCorrectionLog,
  resolveWasAiAccepted,
} from '../../lib/aiCorrectionLog';
import PageHeader from '../../components/PageHeader';
import SignedImage from '../../components/SignedImage';
import DefectEditModal from '../../components/DefectEditModal';
import BatchClassifyReviewModal from '../../components/BatchClassifyReviewModal';
import BatchClassifyProgress from '../../components/BatchClassifyProgress';
import ConfirmDialog from '../../components/ConfirmDialog';
import GalleryFloatingBar from '../../components/GalleryFloatingBar';
import { MarkingCountBadge } from '../../components/MarkingCountBadge';
import DateRangePicker from '../../components/DateRangePicker';
import FilterToolbar from '../../components/FilterToolbar';

import {
  exportToExcel,
  formatDateRangeForFilename,
  formatExportDateTime,
  resolveFileName,
} from '../../lib/exportExcel';

const selectClass =
  'bg-surface border border-border text-sm text-text px-4 py-2 rounded-xl focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

const exportBtnClass =
  'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0 md:min-h-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

const dangerBtnClass =
  'rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';

const DEFECT_CODE_OPTIONS = Object.entries(DEFECT_CODE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function DefectsPage() {
  const { loading, error, defects, refetch, workerDirectory } = useReports();
  const [worker, setWorker] = useState('all');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState(null);
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } =
    useGalleryBatchSelect();

  useEffect(() => {
    let cancelled = false;
    // 발송 대기 건수 — 알림톡 발송 UI는 추후 솔라피 연동 시 별도 구현
    countPendingDefectNotifications()
      .then((n) => {
        if (!cancelled) setPendingNotifyCount(n);
      })
      .catch(() => {
        if (!cancelled) setPendingNotifyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [defects, selected]);

  const visibleDefects = useMemo(
    () => filterDefectsForDisplay(defects, workerDirectory),
    [defects, workerDirectory]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const dateFilteredDefects = useMemo(
    () => filterByCreatedAtDateRange(visibleDefects, dateRange),
    [visibleDefects, dateRange]
  );

  const workers = useMemo(
    () => Array.from(new Set(dateFilteredDefects.map((d) => d.worker_name).filter(Boolean))).sort(),
    [dateFilteredDefects]
  );
  const types = useMemo(
    () => Array.from(new Set(dateFilteredDefects.map((d) => defectLabel(d)))).sort(),
    [dateFilteredDefects]
  );

  const filtered = dateFilteredDefects.filter(
    (d) => (worker === 'all' || d.worker_name === worker) && (type === 'all' || defectLabel(d) === type)
  );

  const canExport = isDateRangeValid(dateRange) && filtered.length > 0;

  const selectedRecords = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds]
  );

  const recordsById = useMemo(() => new Map(filtered.map((d) => [d.id, d])), [filtered]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('전체 데이터:', defects?.length, error);
    // eslint-disable-next-line no-console
    console.log('날짜 필터 후:', dateFilteredDefects.length, '표시:', filtered.length);
  }, [defects, error, dateFilteredDefects.length, filtered.length]);

  async function handleBatchClassify() {
    const items = selectedRecords
      .filter((d) => d.image_url)
      .map((d) => ({ id: d.id, imageUrl: d.image_url }));

    if (!items.length) {
      setBatchError('이미지가 있는 항목을 선택해 주세요.');
      return;
    }

    setBatchError(null);
    setBatchProgress({ done: 0, total: items.length });

    try {
      const results = await requestClassifyPhotosBatch(items, 'defect', (done, total) => {
        setBatchProgress({ done, total });
      });
      setBatchResults(results);
    } catch (err) {
      setBatchError(err.message);
    } finally {
      setBatchProgress(null);
    }
  }

  async function handleBatchSave(updates) {
    const responses = await Promise.all(
      updates.map((u) =>
        supabase
          .from('defect_reports')
          .update({
            defect_code: u.code,
            defect_type: DEFECT_CODE_LABELS[u.code],
            ai_suggested_code: u.ai_suggested_code,
            ai_confidence: u.ai_confidence,
            ai_reason: u.ai_reason,
          })
          .eq('id', u.id)
      )
    );
    const failed = responses.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    await Promise.all(
      updates.map((u) => {
        const record = recordsById.get(u.id);
        return insertAiCorrectionLog({
          sourceTable: 'defect_reports',
          sourceId: u.id,
          codeSet: 'defect',
          aiSuggestedCode: u.ai_suggested_code ?? null,
          aiConfidence: u.ai_confidence ?? null,
          aiReason: u.ai_reason ?? null,
          finalCode: u.code,
          finalNote: null,
          wasAiAccepted: resolveWasAiAccepted(true, u.ai_suggested_code, u.code),
          workerName: record?.worker_name || null,
        });
      })
    );

    clearAll();
    refetch();
  }

  async function handleDownloadSelected() {
    const items = selectedRecords
      .filter((d) => d.image_url)
      .map((d) => {
        const w = d.worker_name;
        return {
          imageUrl: d.image_url,
          filename: buildImageDownloadFilename(
            (w && (displayMap.get(w) || w)) || w,
            d.created_at
          ),
          bucket: 'defect-images',
        };
      });

    if (!items.length) {
      setBatchError('이미지가 있는 항목을 선택해 주세요.');
      return;
    }

    setBatchError(null);
    setDownloadLoading(true);
    try {
      await downloadImagesAsZip(items, '불량기록_선택.zip');
    } catch (err) {
      setBatchError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleMoveToTrash() {
    setTrashLoading(true);
    try {
      await moveToTrash(TRASH_TABLES.defect, [...selectedIds]);
      clearAll();
      setTrashConfirm(false);
      refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[defects trash]', err);
    } finally {
      setTrashLoading(false);
    }
  }

  function handleExportExcel() {
    const rows = filtered.map((d) => ({
      작업자: (d.worker_name && (displayMap.get(d.worker_name) || d.worker_name)) || '',
      유형: d.defect_code || '',
      세부유형: d.defect_type || '',
      촬영시각: formatExportDateTime(d.created_at),
      파일명: resolveFileName(d),
    }));
    exportToExcel(
      rows,
      `불량기록_${formatDateRangeForFilename(dateRange.start, dateRange.end)}.xlsx`
    );
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader eyebrow="RECORDS" title="불량 기록" description={`총 ${filtered.length}건`} />

      {pendingNotifyCount > 0 ? (
        <div className="px-4 pt-3 md:px-8">
          {/* 카카오 알림톡 발송 화면은 솔라피 등 준비 후 별도 구현. 지금은 pending 집계만. */}
          <span className="inline-flex items-center rounded-full bg-warnSoft px-3 py-1 text-xs font-medium text-warn">
            지적사항 알림 대기 {pendingNotifyCount}건
          </span>
        </div>
      ) : null}

      <div className="space-y-6 px-4 pb-8 pt-4 md:px-8">
        <div className="shrink-0 space-y-3 bg-bg pb-4">
          <FilterToolbar primary={<DateRangePicker value={dateRange} onChange={setDateRange} />}>
            <select
              value={worker}
              onChange={(e) => setWorker(e.target.value)}
              className={selectClass}
            >
              <option value="all">전체 작업자</option>
              {workers.map((w) => (
                <option key={w} value={w}>
                  {displayMap.get(w) || w}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={selectClass}
            >
              <option value="all">전체 유형</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!canExport}
              className={exportBtnClass}
            >
              엑셀 다운로드
            </button>
            <button
              type="button"
              onClick={() => selectAll(filtered)}
              disabled={filtered.length === 0}
              className={actionBtnClass}
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selectedCount === 0}
              className={actionBtnClass}
            >
              선택 해제
            </button>
          </FilterToolbar>

          {batchError ? (
            <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{batchError}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((d) => {
            const hasMarking = parseMarkingData(d.marking_data).length > 0;
            return (
              <div key={d.id} className="bg-surface rounded-xl shadow-card overflow-hidden group">
                <div
                  className="relative aspect-square bg-surface2 cursor-pointer"
                  onClick={() => setSelected(d)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(d);
                    }
                  }}
                  aria-label={`${defectLabel(d)} 수정`}
                >
                  <label
                    className="absolute left-2 top-2 z-30 flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/90"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(d.id)}
                      onChange={() => toggle(d.id)}
                      className="h-3.5 w-3.5 accent-accent"
                      aria-label={`${(d.worker_name && (displayMap.get(d.worker_name) || d.worker_name)) || '작업자'} 선택`}
                    />
                  </label>
                  {d.image_url ? (
                    <SignedImage url={d.image_url} alt={defectLabel(d)} bucket="defect-images" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">
                      이미지 없음
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 bg-dangerSoft text-danger text-[10px] font-medium rounded-full">
                    {defectLabel(d)}
                  </div>
                  {hasMarking && <MarkingCountBadge markingData={d.marking_data} />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(d);
                    }}
                    title="불량 기록 수정"
                    aria-label="불량 기록 수정"
                    className={`absolute z-20 flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-border bg-surface/90 text-muted transition-opacity hover:text-accent group-hover:opacity-100 ${
                      hasMarking ? 'bottom-2 right-2 opacity-0' : 'top-2 right-2 opacity-0'
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </div>
                <div className="p-2.5 text-[11px] md:text-xs">
                  <div className="font-medium text-text">
                    {(d.worker_name && (displayMap.get(d.worker_name) || d.worker_name)) || '작업자 미상'}
                  </div>
                  <div className="mt-0.5 text-muted">
                    {d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : ''}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted text-xs">
              조건에 맞는 기록이 없습니다
            </div>
          )}
        </div>
      </div>

      {selected && (
        <DefectEditModal
          report={selected}
          workerDirectory={workerDirectory}
          onClose={() => setSelected(null)}
          onSaved={() => refetch()}
        />
      )}

      {batchProgress ? (
        <BatchClassifyProgress
          done={batchProgress.done}
          total={batchProgress.total}
          label="불량 기록 AI 일괄판정 중..."
        />
      ) : null}

      {batchResults ? (
        <BatchClassifyReviewModal
          title="불량 기록 AI 일괄판정 결과"
          codeSet="defect"
          recordsById={recordsById}
          results={batchResults}
          codeOptions={DEFECT_CODE_OPTIONS}
          workerDirectory={workerDirectory}
          onSave={handleBatchSave}
          onClose={() => setBatchResults(null)}
        />
      ) : null}

      <ConfirmDialog
        open={trashConfirm}
        title="휴지통으로 이동"
        message={`선택한 ${selectedCount}개 항목을 휴지통으로 이동합니다. 휴지통에서 복구하거나 완전히 삭제할 수 있습니다.`}
        confirmLabel="휴지통으로 이동"
        confirmTone="danger"
        loading={trashLoading}
        onConfirm={handleMoveToTrash}
        onCancel={() => setTrashConfirm(false)}
      />

      {selectedCount > 0 && !batchProgress ? (
        <GalleryFloatingBar count={selectedCount}>
          <button
            type="button"
            onClick={handleBatchClassify}
            className={exportBtnClass}
          >
            AI 일괄판정
          </button>
          <button
            type="button"
            onClick={handleDownloadSelected}
            disabled={downloadLoading}
            className={actionBtnClass}
          >
            {downloadLoading ? '다운로드 중...' : `선택 ${selectedCount}개 다운로드`}
          </button>
          <button type="button" onClick={() => setTrashConfirm(true)} className={dangerBtnClass}>
            휴지통으로 이동
          </button>
        </GalleryFloatingBar>
      ) : null}
    </div>
  );
}
