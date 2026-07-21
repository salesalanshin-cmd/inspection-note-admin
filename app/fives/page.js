'use client';

import { useEffect, useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import { SOS_ERROR_CODES, ZONE_CODES, fivesErrorCode, fivesLabel, getZoneLabel } from '../../lib/constants';
import { parseMarkingData } from '../../lib/markingData';
import { buildWorkerDisplayNameMap } from '../../lib/analytics';
import {
  exportToExcel,
  formatDateRangeForFilename,
  formatExportDateTime,
  resolveFileName,
} from '../../lib/exportExcel';
import { filterByCreatedAtDateRange, getRecentDaysRange, isDateRangeValid } from '../../lib/dateRange';
import { sortRows } from '../../lib/tableSort';
import { requestClassifyPhotosBatch } from '../../lib/classifyClient';
import {
  insertAiCorrectionLog,
  resolveWasAiAccepted,
} from '../../lib/aiCorrectionLog';
import { useGalleryBatchSelect } from '../../lib/useGalleryBatchSelect';
import { moveToTrash, TRASH_TABLES } from '../../lib/trash';
import {
  buildImageDownloadFilename,
  downloadImagesAsZip,
} from '../../lib/downloadImages';
import { countPendingFivesNotifications } from '../../lib/fivesNotificationQueue';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import SignedImage from '../../components/SignedImage';
import MobileSortSelect, { parseSortValue } from '../../components/MobileSortSelect';
import FilterToolbar from '../../components/FilterToolbar';
import FivesEditModal from '../../components/FivesEditModal';
import BatchClassifyReviewModal from '../../components/BatchClassifyReviewModal';
import BatchClassifyProgress from '../../components/BatchClassifyProgress';
import ConfirmDialog from '../../components/ConfirmDialog';
import GalleryFloatingBar from '../../components/GalleryFloatingBar';
import DateRangePicker from '../../components/DateRangePicker';

const exportBtnClass =
  'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

const dangerBtnClass =
  'min-h-[44px] rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';

const desktopSortClass =
  'hidden min-h-[44px] shrink-0 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 md:block md:min-h-0';

const SOS_CODE_OPTIONS = Object.entries(SOS_ERROR_CODES).map(([value, label]) => ({
  value,
  label,
}));

const FIVES_SORT_OPTIONS = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'worker_name:asc', label: '작업자명순' },
  { value: 'zone_code:asc', label: '구역순' },
];

function getFivesSortValue(record, key) {
  switch (key) {
    case 'worker_name':
      return record.worker_name || '';
    case 'zone_code':
      return record.zone_code || record.area_type || '';
    case 'area_type':
      return record.area_type || '';
    case 'sos_error_code':
      return fivesErrorCode(record) || '';
    case 'description':
      return record.description || '';
    case 'created_at':
      return record.created_at ? new Date(record.created_at).getTime() : 0;
    default:
      return record.created_at ? new Date(record.created_at).getTime() : 0;
  }
}

export default function FivesPage() {
  const { loading, error, fives, refetch, workerDirectory } = useReports();
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [selected, setSelected] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [pendingNotifyCount, setPendingNotifyCount] = useState(0);
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } =
    useGalleryBatchSelect();

  useEffect(() => {
    let cancelled = false;
    // 발송 대기 건수 — 알림톡 발송 UI는 추후 솔라피 연동 시 별도 구현
    countPendingFivesNotifications()
      .then((n) => {
        if (!cancelled) setPendingNotifyCount(n);
      })
      .catch(() => {
        if (!cancelled) setPendingNotifyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [fives, selected]);

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const filtered = useMemo(
    () => filterByCreatedAtDateRange(fives, dateRange),
    [fives, dateRange]
  );

  const sortedRows = useMemo(
    () => sortRows(filtered, sortKey, sortDir, getFivesSortValue),
    [filtered, sortKey, sortDir]
  );

  const canExport = isDateRangeValid(dateRange) && filtered.length > 0;

  const selectedRecords = useMemo(
    () => filtered.filter((f) => selectedIds.has(f.id)),
    [filtered, selectedIds]
  );

  const recordsById = useMemo(() => new Map(filtered.map((f) => [f.id, f])), [filtered]);

  function handleMobileSort(combined) {
    const { key, dir } = parseSortValue(combined);
    setSortKey(key);
    setSortDir(dir);
  }

  async function handleBatchClassify() {
    const items = selectedRecords
      .filter((f) => f.image_url)
      .map((f) => ({ id: f.id, imageUrl: f.image_url }));

    if (!items.length) {
      setBatchError('이미지가 있는 항목을 선택해 주세요.');
      return;
    }

    setBatchError(null);
    setBatchProgress({ done: 0, total: items.length });

    try {
      const results = await requestClassifyPhotosBatch(items, 'sos', (done, total) => {
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
          .from('fives_reports')
          .update({
            sos_error_code: u.code,
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
          sourceTable: 'fives_reports',
          sourceId: u.id,
          codeSet: 'sos',
          aiSuggestedCode: u.ai_suggested_code ?? null,
          aiConfidence: u.ai_confidence ?? null,
          aiReason: u.ai_reason ?? null,
          finalCode: u.code,
          finalNote: record?.sos_error_note || null,
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
      .filter((f) => f.image_url)
      .map((f) => {
        const w = f.worker_name;
        return {
          imageUrl: f.image_url,
          filename: buildImageDownloadFilename(
            (w && (displayMap.get(w) || w)) || w,
            f.created_at
          ),
        };
      });

    if (!items.length) {
      setBatchError('이미지가 있는 항목을 선택해 주세요.');
      return;
    }

    setBatchError(null);
    setDownloadLoading(true);
    try {
      await downloadImagesAsZip(items, '3정5S기록_선택.zip');
    } catch (err) {
      setBatchError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleMoveToTrash() {
    setTrashLoading(true);
    try {
      await moveToTrash(TRASH_TABLES.fives, [...selectedIds]);
      clearAll();
      setTrashConfirm(false);
      refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[fives trash]', err);
    } finally {
      setTrashLoading(false);
    }
  }

  function handleExportExcel() {
    const rows = sortedRows.map((f) => ({
      작업자: (f.worker_name && (displayMap.get(f.worker_name) || f.worker_name)) || '',
      구역: getZoneLabel(f.zone_code) || f.area_type || '',
      구역코드: f.zone_code || '',
      SOS코드: fivesErrorCode(f) || '',
      설명: f.description || '',
      촬영시각: formatExportDateTime(f.created_at),
      파일명: resolveFileName(f),
    }));
    exportToExcel(
      rows,
      `3정5S기록_${formatDateRangeForFilename(dateRange.start, dateRange.end)}.xlsx`
    );
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader eyebrow="WORKPLACE" title="3정5S 기록" description={`총 ${filtered.length}건`} />

      {pendingNotifyCount > 0 ? (
        <div className="px-4 pt-3 md:px-8">
          {/* 카카오 알림톡 발송 화면은 솔라피 등 준비 후 별도 구현. 지금은 pending 집계만. */}
          <span className="inline-flex items-center rounded-full bg-warnSoft px-3 py-1 text-xs font-medium text-warn">
            지적사항 알림 대기 {pendingNotifyCount}건
          </span>
        </div>
      ) : null}

      <div className="space-y-6 px-4 pb-8 pt-4 md:px-8">
        <PageTableShell
          variant="flow"
          stickyToolbar={false}
          toolbar={
            <FilterToolbar
              primary={<DateRangePicker value={dateRange} onChange={setDateRange} />}
            >
              <select
                className={desktopSortClass}
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => handleMobileSort(e.target.value)}
                aria-label="정렬 기준"
              >
                {FIVES_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
              {batchError ? (
                <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{batchError}</div>
              ) : null}
            </FilterToolbar>
          }
          table={
            <>
              <MobileSortSelect
                value={`${sortKey}:${sortDir}`}
                options={FIVES_SORT_OPTIONS}
                onChange={handleMobileSort}
              />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                {sortedRows.map((f) => {
                  const errorCode = fivesErrorCode(f);
                  const displayName =
                    (f.worker_name && (displayMap.get(f.worker_name) || f.worker_name)) || '작업자';
                  return (
                    <div key={f.id} className="group overflow-hidden rounded-xl bg-surface shadow-card">
                      <div
                        className="relative aspect-square cursor-pointer bg-surface2"
                        onClick={() => setSelected(f)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(f);
                          }
                        }}
                        aria-label={`${displayName} 3정5S 기록 수정`}
                      >
                        <label
                          className="absolute left-2 top-2 z-30 flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/90"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected(f.id)}
                            onChange={() => toggle(f.id)}
                            className="h-3.5 w-3.5 accent-accent"
                            aria-label={`${displayName} 선택`}
                          />
                        </label>
                        {f.image_url ? (
                          <SignedImage url={f.image_url} alt={fivesLabel(f)} />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                            이미지 없음
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 right-2 z-20 flex flex-wrap gap-1">
                          {f.zone_code && ZONE_CODES[f.zone_code] ? (
                            <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-medium text-accent">
                              {getZoneLabel(f.zone_code)}
                            </span>
                          ) : f.area_type ? (
                            <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-medium text-accent">
                              {f.area_type}
                            </span>
                          ) : null}
                          {(() => {
                            const markCount = parseMarkingData(f.marking_data).filter((m) => m.code).length;
                            return markCount > 0 ? (
                              <span className="rounded-full bg-dangerSoft px-2 py-0.5 text-[10px] font-medium text-danger">
                                지적 {markCount}건
                              </span>
                            ) : null;
                          })()}
                          {errorCode ? (
                            <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
                              {errorCode}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="p-2.5 text-[11px] md:text-xs">
                        <div className="font-medium text-text">
                          {f.worker_name
                            ? displayMap.get(f.worker_name) || f.worker_name
                            : '작업자 미상'}
                        </div>
                        <div className="mt-0.5 text-muted">
                          {f.created_at ? new Date(f.created_at).toLocaleString('ko-KR') : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {sortedRows.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-xs text-muted">
                    조건에 맞는 기록이 없습니다
                  </div>
                ) : null}
              </div>
            </>
          }
        />
      </div>

      {selected ? (
        <FivesEditModal
          key={selected.id}
          report={selected}
          onClose={() => setSelected(null)}
          onSaved={() => refetch()}
        />
      ) : null}

      {batchProgress ? (
        <BatchClassifyProgress
          done={batchProgress.done}
          total={batchProgress.total}
          label="3정5S AI 일괄판정 중..."
        />
      ) : null}

      {batchResults ? (
        <BatchClassifyReviewModal
          title="3정5S AI 일괄판정 결과"
          codeSet="sos"
          recordsById={recordsById}
          results={batchResults}
          codeOptions={SOS_CODE_OPTIONS}
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
          <button type="button" onClick={handleBatchClassify} className={exportBtnClass}>
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
