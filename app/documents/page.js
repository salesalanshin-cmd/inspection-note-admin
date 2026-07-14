'use client';

import { useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  DOC_ERROR_CODES,
  docLabel,
} from '../../lib/constants';
import { buildWorkerDisplayNameMap } from '../../lib/analytics';
import { filterByCreatedAtDateRange, getRecentDaysRange, isDateRangeValid } from '../../lib/dateRange';
import { moveToTrash, TRASH_TABLES } from '../../lib/trash';
import {
  buildImageDownloadFilename,
  downloadImagesAsZip,
} from '../../lib/downloadImages';
import { useGalleryBatchSelect } from '../../lib/useGalleryBatchSelect';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import SignedImage from '../../components/SignedImage';
import DocumentEditModal from '../../components/DocumentEditModal';
import DateRangePicker from '../../components/DateRangePicker';
import FilterToolbar from '../../components/FilterToolbar';
import ConfirmDialog from '../../components/ConfirmDialog';
import GalleryFloatingBar from '../../components/GalleryFloatingBar';
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

export default function DocumentsPage() {
  const { loading, error, docs, refetch, workerDirectory } = useReports();
  const [worker, setWorker] = useState('all');
  const [docType, setDocType] = useState('all');
  const [errorCode, setErrorCode] = useState('all');
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [selected, setSelected] = useState(null);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [batchError, setBatchError] = useState(null);
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } =
    useGalleryBatchSelect();

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const dateFiltered = useMemo(
    () => filterByCreatedAtDateRange(docs, dateRange),
    [docs, dateRange]
  );

  const workers = useMemo(
    () => Array.from(new Set(dateFiltered.map((d) => d.worker_name).filter(Boolean))).sort(),
    [dateFiltered]
  );

  const docTypes = useMemo(
    () => Array.from(new Set(dateFiltered.map((d) => d.doc_type).filter(Boolean))).sort(),
    [dateFiltered]
  );

  const filtered = dateFiltered.filter((d) => {
    if (worker !== 'all' && d.worker_name !== worker) return false;
    if (docType !== 'all' && d.doc_type !== docType) return false;
    if (errorCode === 'none' && d.doc_error_code) return false;
    if (errorCode !== 'all' && errorCode !== 'none' && d.doc_error_code !== errorCode) return false;
    return true;
  });

  const selectedRecords = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds]
  );

  const errorCount = filtered.filter((d) => d.doc_error_code).length;
  const normalRate =
    filtered.length > 0
      ? `${Math.round(((filtered.length - errorCount) / filtered.length) * 100)}%`
      : '—';

  const canExport = isDateRangeValid(dateRange) && filtered.length > 0;

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
        };
      });

    if (!items.length) {
      setBatchError('이미지가 있는 항목을 선택해 주세요.');
      return;
    }

    setBatchError(null);
    setDownloadLoading(true);
    try {
      await downloadImagesAsZip(items, '문서스캔_선택.zip');
    } catch (err) {
      setBatchError(err.message || '이미지 다운로드에 실패했습니다.');
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleMoveToTrash() {
    setTrashLoading(true);
    try {
      await moveToTrash(TRASH_TABLES.doc, [...selectedIds]);
      clearAll();
      setTrashConfirm(false);
      refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[documents trash]', err);
    } finally {
      setTrashLoading(false);
    }
  }

  function handleExportExcel() {
    const rows = filtered.map((d) => ({
      작업자: (d.worker_name && (displayMap.get(d.worker_name) || d.worker_name)) || '',
      문서유형: d.doc_type || '',
      오류코드: d.doc_error_code || '',
      오류내용: d.doc_error_code ? DOC_ERROR_CODES[d.doc_error_code] || '' : '',
      오류메모: d.doc_error_note || '',
      촬영시각: formatExportDateTime(d.created_at),
      파일명: resolveFileName(d),
    }));
    exportToExcel(
      rows,
      `문서스캔_${formatDateRangeForFilename(dateRange.start, dateRange.end)}.xlsx`
    );
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader eyebrow="DOCUMENTS" title="문서스캔" description={`총 ${filtered.length}건`} />

      <div className="space-y-6 px-4 pb-8 pt-4 md:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="총 스캔 건수" value={filtered.length} />
          <StatCard label="오류 건수" value={errorCount} tone="danger" />
          <StatCard label="정상률" value={normalRate} tone="good" />
        </div>

        <div className="sticky top-0 z-10 shrink-0 bg-bg pb-4">
          <FilterToolbar primary={<DateRangePicker value={dateRange} onChange={setDateRange} />}>
            <select value={worker} onChange={(e) => setWorker(e.target.value)} className={selectClass}>
              <option value="all">전체 작업자</option>
              {workers.map((w) => (
                <option key={w} value={w}>
                  {displayMap.get(w) || w}
                </option>
              ))}
            </select>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={selectClass}>
              <option value="all">전체 문서유형</option>
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
              className={selectClass}
            >
              <option value="all">전체 오류코드</option>
              <option value="none">오류 없음</option>
              {Object.entries(DOC_ERROR_CODES).map(([code, label]) => (
                <option key={code} value={code}>
                  {label} ({code})
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
        </div>

        {batchError ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{batchError}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((d) => (
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
                  <SignedImage url={d.image_url} alt={docLabel(d)} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">
                    이미지 없음
                  </div>
                )}
                {d.doc_error_code ? (
                  <div className="absolute bottom-2 left-2 z-20 px-2 py-0.5 bg-warnSoft text-warn text-[10px] font-medium rounded-full">
                    {DOC_ERROR_CODES[d.doc_error_code] || d.doc_error_code}
                  </div>
                ) : null}
              </div>
              <div className="p-2.5 text-[11px] md:text-xs">
                <div className="truncate font-medium text-text">
                  {d.doc_title || d.doc_type || '문서'}
                </div>
                <div className="mt-0.5 text-muted">
                  {(d.worker_name && (displayMap.get(d.worker_name) || d.worker_name)) ||
                    '작업자 미상'}
                </div>
                <div className="mt-0.5 text-muted">
                  {d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : ''}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted text-xs">
              조건에 맞는 기록이 없습니다
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <DocumentEditModal
          report={selected}
          onClose={() => setSelected(null)}
          onSaved={() => refetch()}
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

      <GalleryFloatingBar count={selectedCount}>
        <button
          type="button"
          onClick={handleDownloadSelected}
          disabled={downloadLoading}
          className={actionBtnClass}
        >
          {downloadLoading ? '다운로드 중...' : `선택 ${selectedCount}개 다운로드`}
        </button>
        <button type="button" onClick={() => setTrashConfirm(true)} className={dangerBtnClass}>
          선택 {selectedCount}개 휴지통으로 이동
        </button>
      </GalleryFloatingBar>
    </div>
  );
}
