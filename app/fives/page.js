'use client';

import { useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import { SOS_ERROR_CODES, fivesErrorCode, fivesLabel } from '../../lib/constants';
import {
  exportToExcel,
  formatDateRangeForFilename,
  formatExportDateTime,
  resolveFileName,
} from '../../lib/exportExcel';
import { filterByCreatedAtDateRange, getRecentDaysRange, isDateRangeValid } from '../../lib/dateRange';
import { sortRows, toggleSortKey } from '../../lib/tableSort';
import { requestClassifyPhotosBatch } from '../../lib/classifyClient';
import { useGalleryBatchSelect } from '../../lib/useGalleryBatchSelect';
import { moveToTrash, TRASH_TABLES } from '../../lib/trash';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import SortableTh from '../../components/SortableTh';
import FivesEditModal from '../../components/FivesEditModal';
import BatchClassifyReviewModal from '../../components/BatchClassifyReviewModal';
import BatchClassifyProgress from '../../components/BatchClassifyProgress';
import ConfirmDialog from '../../components/ConfirmDialog';
import GalleryFloatingBar from '../../components/GalleryFloatingBar';
import DateRangePicker from '../../components/DateRangePicker';

const exportBtnClass =
  'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0';

const dangerBtnClass =
  'rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';

const SOS_CODE_OPTIONS = Object.entries(SOS_ERROR_CODES).map(([value, label]) => ({
  value,
  label,
}));

function getFivesSortValue(record, key) {
  switch (key) {
    case 'worker_name':
      return record.worker_name || '';
    case 'area_type':
      return record.area_type || '';
    case 'sos_code':
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
  const { loading, error, fives, refetch } = useReports();
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [selected, setSelected] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } =
    useGalleryBatchSelect();

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

  function handleSort(column) {
    const next = toggleSortKey(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
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
            sos_code: u.code,
            area_type: SOS_ERROR_CODES[u.code],
            ai_suggested_code: u.ai_suggested_code,
            ai_confidence: u.ai_confidence,
            ai_reason: u.ai_reason,
          })
          .eq('id', u.id)
      )
    );
    const failed = responses.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    clearAll();
    refetch();
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
      작업자: f.worker_name || '',
      구역: f.area_type || '',
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
    <div className="flex h-[calc(100vh)] flex-col overflow-hidden">
      <PageHeader eyebrow="WORKPLACE" title="3정5S 기록" description={`총 ${filtered.length}건`} />

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-8 pt-4">
        <PageTableShell
          toolbar={
            <>
              <div className="flex flex-wrap items-start gap-3">
                <DateRangePicker value={dateRange} onChange={setDateRange} />
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
                  className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={selectedCount === 0}
                  className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
                >
                  선택 해제
                </button>
              </div>

              {batchError ? (
                <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{batchError}</div>
              ) : null}
            </>
          }
          table={
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                  <th className="w-10 px-4 py-3">
                    <span className="sr-only">선택</span>
                  </th>
                  <SortableTh column="worker_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    작업자
                  </SortableTh>
                  <SortableTh column="area_type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    구역
                  </SortableTh>
                  <SortableTh column="sos_code" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    SOS 코드
                  </SortableTh>
                  <SortableTh column="description" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    설명
                  </SortableTh>
                  <SortableTh column="created_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    촬영시각
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((f) => (
                  <tr
                    key={f.id}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface2/40"
                    onClick={() => setSelected(f)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected(f.id)}
                        onChange={() => toggle(f.id)}
                        className="h-3.5 w-3.5 accent-accent"
                        aria-label={`${f.worker_name || '작업자'} 선택`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-text">{f.worker_name || '작업자 미상'}</td>
                    <td className="px-4 py-3 text-text">{fivesLabel(f)}</td>
                    <td className="px-4 py-3 text-muted">{fivesErrorCode(f) || '-'}</td>
                    <td className="px-4 py-3 text-muted">{f.description || '-'}</td>
                    <td className="px-4 py-3 text-muted">
                      {f.created_at ? new Date(f.created_at).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted">
                      조건에 맞는 기록이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          }
        />
      </div>

      {selected ? (
        <FivesEditModal
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
          <button type="button" onClick={() => setTrashConfirm(true)} className={dangerBtnClass}>
            휴지통으로 이동
          </button>
        </GalleryFloatingBar>
      ) : null}
    </div>
  );
}
