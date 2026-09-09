'use client';

import { Fragment, useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildFrequentInspectionCompliance,
  buildWorkerDisplayNameMap,
  complianceStagesForDots,
  countNonCompliantStages,
  getExcludedWorkerNames,
  groupComplianceByShift,
  sortComplianceByShift,
  tagInspectionStage,
} from '../../lib/analytics';
import { DEFAULT_PROCESS_FILTER, SHIFT_STAGES, defectLabel } from '../../lib/constants';
import { sortRows, toggleSortKey } from '../../lib/tableSort';
import {
  exportToExcel,
  formatDateRangeForFilename,
  formatExportDateTime,
  resolveFileName,
} from '../../lib/exportExcel';
import {
  countDaysInRange,
  eachDateInRange,
  filterByCreatedAtDateRange,
  getRecentDaysRange,
  isDateRangeValid,
  startOfLocalDay as startOfDay,
} from '../../lib/dateRange';
import { useGalleryBatchSelect } from '../../lib/useGalleryBatchSelect';
import {
  buildImageDownloadFilename,
  downloadImagesAsZip,
} from '../../lib/downloadImages';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import SortableTh from '../../components/SortableTh';
import FilterToolbar from '../../components/FilterToolbar';
import DateRangePicker from '../../components/DateRangePicker';
import TrafficLightDots from '../../components/TrafficLightDots';
import MobileSortSelect, { parseSortValue } from '../../components/MobileSortSelect';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerHistoryModal from '../../components/WorkerHistoryModal';
import ProcessFilterSelect from '../../components/ProcessFilterSelect';
import SignedImage from '../../components/SignedImage';
import GalleryFloatingBar from '../../components/GalleryFloatingBar';
import InspectionHistoryDetailModal, {
  ResultBadge,
  StageBadge,
} from '../../components/InspectionHistoryDetailModal';

const exportBtnClass =
  'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

const desktopSortClass =
  'hidden min-h-[44px] shrink-0 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 md:block md:min-h-0';

const selectClass =
  'min-h-[44px] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 md:min-h-0';

const MAX_EXPORT_DAYS = 90;

const FREQUENT_SORT_OPTIONS = [
  { value: 'nonCompliant:desc', label: '미준수 단계 많은순' },
  { value: 'worker_name:asc', label: '작업자명순' },
  { value: 'overall:asc', label: '종합판정 (정상 우선)' },
  { value: 'shift:asc', label: '시프트순' },
];

const GALLERY_SORT_OPTIONS = [
  { value: 'created_at:desc', label: '최신순' },
  { value: 'created_at:asc', label: '오래된순' },
  { value: 'worker_name:asc', label: '작업자명순' },
];

const VIEW_TABS = [
  { id: 'status', label: '현황' },
  { id: 'gallery', label: '사진' },
];

const dayNavBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0';

function complianceToExportRows(dateStr, rows, displayMap) {
  return rows.map((row) => {
    const exportRow = {
      날짜: dateStr,
      작업자: displayMap.get(row.worker_name) || row.worker_name,
      시프트: shiftLabel(row.shift),
    };
    for (const stage of SHIFT_STAGES) {
      exportRow[`${stage} 상태`] = stageStatusText(row[stage]);
      exportRow[`${stage} 시각`] = row[stage].at ? formatExportDateTime(row[stage].at) : '';
    }
    exportRow['종합판정'] = overallStatusText(row);
    return exportRow;
  });
}

function shiftLabel(shift) {
  if (shift === 'night') return '야간';
  if (shift === 'unknown') return '미정';
  return '주간';
}

function stageStatusText(stageResult) {
  if (stageResult.skipped) return '데이터없음';
  if (stageResult.done) return '완료';
  return '미실시';
}

function overallStatusText(row) {
  if (row.noData) return '데이터없음';
  if (row.allOk) return '정상';
  return '미준수';
}

function formatWorkDate(date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function ShiftBadge({ shift, shiftSource }) {
  if (shift === 'unknown') {
    return (
      <span className="inline-block rounded-full bg-warnSoft px-2.5 py-0.5 text-xs font-medium text-warn">
        미정
      </span>
    );
  }

  const isDay = shift === 'day';
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isDay ? 'bg-accentSoft text-accent' : 'bg-surface2 text-text'
        }`}
      >
        {isDay ? '주간' : '야간'}
      </span>
      {shiftSource === 'manual' ? (
        <span className="text-[11px] text-muted" title="작업자 관리에서 고정 설정됨">
          🔒
        </span>
      ) : null}
    </span>
  );
}

function OverallBadge({ row }) {
  if (row.noData) {
    return (
      <span className="inline-block rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium text-muted">
        데이터 없음
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        row.allOk ? 'bg-goodSoft text-good' : 'bg-dangerSoft text-danger'
      }`}
    >
      {row.allOk ? '정상' : '미준수'}
    </span>
  );
}

function getComplianceSortValue(row, key) {
  switch (key) {
    case 'worker_name':
      return row.worker_name;
    case 'shift':
      if (row.shift === 'day') return 0;
      if (row.shift === 'night') return 1;
      return 2;
    case 'nonCompliant':
      return countNonCompliantStages(row);
    case 'overall':
      if (row.noData) return 2;
      return row.allOk ? 0 : 1;
    default:
      return row.worker_name;
  }
}

function getGallerySortValue(record, key) {
  switch (key) {
    case 'worker_name':
      return record.worker_name || '';
    case 'created_at':
      return record.created_at ? new Date(record.created_at).getTime() : 0;
    default:
      return record.created_at ? new Date(record.created_at).getTime() : 0;
  }
}

/**
 * 자주검사 사진 = good_reports ∪ defect_reports
 * (현황 판정·WorkerHistoryModal과 동일 소스. 별도 테이블 없음)
 */
function buildInspectionPhotoRows(defects, goods) {
  return [
    ...(defects || []).map((r) => ({
      ...r,
      recordType: 'defect',
      listKey: `defect-${r.id}`,
    })),
    ...(goods || []).map((r) => ({
      ...r,
      recordType: 'good',
      listKey: `good-${r.id}`,
    })),
  ];
}

export default function FrequentCheckPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();
  const [viewTab, setViewTab] = useState('status');

  // ——— 현황 탭 ———
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [processFilter, setProcessFilter] = useState(DEFAULT_PROCESS_FILTER);
  const [exportDateRange, setExportDateRange] = useState(() => getRecentDaysRange(7));
  const [sortKey, setSortKey] = useState('nonCompliant');
  const [sortDir, setSortDir] = useState('desc');
  const [modalWorker, setModalWorker] = useState(null);

  // ——— 사진 탭 ———
  const [galleryDateRange, setGalleryDateRange] = useState(() => getRecentDaysRange(7));
  const [galleryWorker, setGalleryWorker] = useState('all');
  const [gallerySortKey, setGallerySortKey] = useState('created_at');
  const [gallerySortDir, setGallerySortDir] = useState('desc');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const { selectedIds, selectedCount, toggle, selectAll, clearAll, isSelected } =
    useGalleryBatchSelect((item) => item.listKey);

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const compliance = useMemo(
    () =>
      buildFrequentInspectionCompliance(
        defects,
        goods,
        fives,
        date,
        excludedNames,
        workerDirectory,
        processFilter
      ),
    [defects, goods, fives, date, excludedNames, workerDirectory, processFilter]
  );

  const groupedCompliance = useMemo(() => {
    const groups = groupComplianceByShift(compliance);
    return groups.map((group) => ({
      ...group,
      rows: sortRows(group.rows, sortKey, sortDir, getComplianceSortValue),
    }));
  }, [compliance, sortKey, sortDir]);

  const exportDayCount = countDaysInRange(exportDateRange);
  const exportRangeValid = isDateRangeValid(exportDateRange);
  const exportRangeTooLong = exportRangeValid && exportDayCount > MAX_EXPORT_DAYS;
  const canExport = exportRangeValid && !exportRangeTooLong;

  const photoRows = useMemo(
    () => buildInspectionPhotoRows(defects, goods),
    [defects, goods]
  );

  const dateFilteredPhotos = useMemo(
    () => filterByCreatedAtDateRange(photoRows, galleryDateRange),
    [photoRows, galleryDateRange]
  );

  const galleryWorkers = useMemo(
    () =>
      Array.from(new Set(dateFilteredPhotos.map((r) => r.worker_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ko')
      ),
    [dateFilteredPhotos]
  );

  const galleryFiltered = useMemo(() => {
    const filtered = dateFilteredPhotos.filter(
      (r) => galleryWorker === 'all' || r.worker_name === galleryWorker
    );
    const byWorker = new Map();
    for (const r of photoRows) {
      if (!r.worker_name) continue;
      if (!byWorker.has(r.worker_name)) byWorker.set(r.worker_name, []);
      byWorker.get(r.worker_name).push(r);
    }
    const enriched = filtered.map((r) => {
      const { stage, shift } = tagInspectionStage(
        r,
        workerDirectory,
        byWorker.get(r.worker_name) || [r]
      );
      return { ...r, stage, shift };
    });
    return sortRows(enriched, gallerySortKey, gallerySortDir, getGallerySortValue);
  }, [
    dateFilteredPhotos,
    galleryWorker,
    photoRows,
    workerDirectory,
    gallerySortKey,
    gallerySortDir,
  ]);

  const canExportGallery =
    isDateRangeValid(galleryDateRange) && galleryFiltered.length > 0;

  const selectedGalleryRecords = useMemo(
    () => galleryFiltered.filter((r) => selectedIds.has(r.listKey)),
    [galleryFiltered, selectedIds]
  );

  function handleExportExcel() {
    const dates = eachDateInRange(exportDateRange);
    const rows = [];

    for (const dateStr of dates) {
      const dayCompliance = buildFrequentInspectionCompliance(
        defects,
        goods,
        fives,
        new Date(`${dateStr}T00:00:00`),
        excludedNames,
        workerDirectory,
        processFilter
      );
      const sorted = sortComplianceByShift(dayCompliance);
      rows.push(...complianceToExportRows(dateStr, sorted, displayMap));
    }

    exportToExcel(
      rows,
      `자주검사현황_${formatDateRangeForFilename(exportDateRange.start, exportDateRange.end)}.xlsx`
    );
  }

  function handleExportGalleryExcel() {
    const rows = galleryFiltered.map((r) => ({
      촬영일시: formatExportDateTime(r.created_at),
      작업자: displayMap.get(r.worker_name) || r.worker_name || '',
      구분: r.recordType === 'good' ? '양품' : '불량',
      불량유형: r.recordType === 'defect' ? defectLabel(r) : '',
      검사단계: r.stage || '',
      시프트: shiftLabel(r.shift),
      파일명: resolveFileName(r),
    }));
    exportToExcel(
      rows,
      `자주검사사진_${formatDateRangeForFilename(galleryDateRange.start, galleryDateRange.end)}.xlsx`
    );
  }

  function handleSort(column) {
    const next = toggleSortKey(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function handleMobileSort(combined) {
    const { key, dir } = parseSortValue(combined);
    setSortKey(key);
    setSortDir(dir);
  }

  function handleGallerySort(combined) {
    const { key, dir } = parseSortValue(combined);
    setGallerySortKey(key);
    setGallerySortDir(dir);
  }

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
  }

  async function handleDownloadSelected() {
    const items = selectedGalleryRecords
      .filter((r) => r.image_url)
      .map((r) => ({
        imageUrl: r.image_url,
        filename: buildImageDownloadFilename(
          r.worker_name ? displayMap.get(r.worker_name) || r.worker_name : r.worker_name,
          r.created_at
        ),
        ...(r.recordType === 'defect' ? { bucket: 'defect-images' } : {}),
      }));
    if (!items.length) return;
    setDownloadLoading(true);
    try {
      await downloadImagesAsZip(
        items,
        `자주검사_${formatDateRangeForFilename(galleryDateRange.start, galleryDateRange.end)}.zip`
      );
    } catch (err) {
      alert(err.message || '다운로드에 실패했습니다.');
    } finally {
      setDownloadLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  const clickableRowClass =
    'cursor-pointer transition-colors hover:bg-surface2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="FREQUENT CHECK"
        title="자주검사"
        description={
          viewTab === 'gallery'
            ? `양품·불량 촬영 기록 · 총 ${galleryFiltered.length}건`
            : '근무 시프트는 작업자 관리 설정(고정) 또는 당일 기록(자동)으로 결정되며, 초품·중품·종품 검사 준수 여부를 확인합니다.'
        }
      />

      <div className="border-b border-border px-4 md:px-8">
        <div className="flex gap-1">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setViewTab(t.id)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                viewTab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {viewTab === 'status' ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-4 md:px-8">
          <PageTableShell
            toolbar={
              <FilterToolbar
                primary={
                  <div className="flex w-full items-center gap-2 md:w-auto">
                    <button
                      type="button"
                      onClick={() => shiftDay(-1)}
                      className={`${dayNavBtnClass} flex-1 md:flex-none`}
                      aria-label="이전 날"
                    >
                      ◀ 이전날
                    </button>
                    <span className="min-w-0 flex-1 text-center text-sm font-medium text-text md:min-w-[10rem]">
                      {formatWorkDate(date)}
                    </span>
                    <button
                      type="button"
                      onClick={() => shiftDay(1)}
                      className={`${dayNavBtnClass} flex-1 md:flex-none`}
                      aria-label="다음 날"
                    >
                      다음날 ▶
                    </button>
                  </div>
                }
                aside={
                  <>
                    <p className="text-xs text-muted md:text-right">
                      시프트가 고정(🔒)된 작업자는 설정값을 우선 적용합니다. 미정인 작업자는 당일 기록
                      시간대로 자동 판단하며, 기록이 없으면 데이터 없음으로 표시됩니다.
                    </p>
                    {exportRangeTooLong ? (
                      <p className="text-xs text-warn md:text-right">
                        엑셀 다운로드는 최대 {MAX_EXPORT_DAYS}일까지 선택할 수 있습니다. (현재{' '}
                        {exportDayCount}일)
                      </p>
                    ) : null}
                  </>
                }
              >
                <ProcessFilterSelect value={processFilter} onChange={setProcessFilter} />
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={!canExport}
                  className={exportBtnClass}
                >
                  엑셀 다운로드
                </button>
                <DateRangePicker value={exportDateRange} onChange={setExportDateRange} />
              </FilterToolbar>
            }
            table={
              <>
                <MobileSortSelect
                  value={`${sortKey}:${sortDir}`}
                  options={FREQUENT_SORT_OPTIONS}
                  onChange={handleMobileSort}
                />
                <div className="md:hidden">
                  {groupedCompliance.map((group) => (
                    <Fragment key={group.shift}>
                      <div className="mb-2 mt-1 px-1 text-xs font-medium text-muted">
                        {group.label} ({group.rows.length}명)
                      </div>
                      {group.rows.map((row) => (
                        <MobileListCard
                          key={row.worker_name}
                          header={displayMap.get(row.worker_name) || row.worker_name}
                          badge={<OverallBadge row={row} />}
                          className={clickableRowClass}
                          onClick={() => setModalWorker(row.worker_name)}
                        >
                          <MobileCardField label="시프트">
                            <ShiftBadge shift={row.shift} shiftSource={row.shiftSource} />
                          </MobileCardField>
                          <MobileCardField label="자주검사" className="col-span-2">
                            <TrafficLightDots stages={complianceStagesForDots(row)} />
                          </MobileCardField>
                        </MobileListCard>
                      ))}
                    </Fragment>
                  ))}
                  {compliance.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted">
                      기록된 작업자가 없습니다
                    </div>
                  ) : null}
                </div>
                <table className="hidden w-full text-sm md:table">
                  <thead>
                    <tr className="sticky top-0 z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                      <SortableTh
                        column="worker_name"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        작업자
                      </SortableTh>
                      <SortableTh
                        column="shift"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        시프트
                      </SortableTh>
                      <SortableTh
                        column="nonCompliant"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        자주검사
                      </SortableTh>
                      <SortableTh
                        column="overall"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        종합판정
                      </SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedCompliance.map((group) => (
                      <Fragment key={group.shift}>
                        <tr className="border-b border-border bg-surface2/60">
                          <td colSpan={4} className="px-4 pb-1 pt-4 text-xs font-medium text-muted">
                            {group.label} ({group.rows.length}명)
                          </td>
                        </tr>
                        {group.rows.map((row) => (
                          <tr
                            key={row.worker_name}
                            className={`border-b border-border last:border-0 ${clickableRowClass}`}
                            onClick={() => setModalWorker(row.worker_name)}
                          >
                            <td className="px-4 py-3 font-medium text-text">
                              {displayMap.get(row.worker_name) || row.worker_name}
                            </td>
                            <td className="px-4 py-3">
                              <ShiftBadge shift={row.shift} shiftSource={row.shiftSource} />
                            </td>
                            <td className="px-4 py-3">
                              <TrafficLightDots stages={complianceStagesForDots(row)} />
                            </td>
                            <td className="px-4 py-3">
                              <OverallBadge row={row} />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    {compliance.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-xs text-muted">
                          기록된 작업자가 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            }
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-8">
          <PageTableShell
            variant="flow"
            stickyToolbar={false}
            toolbar={
              <FilterToolbar
                primary={<DateRangePicker value={galleryDateRange} onChange={setGalleryDateRange} />}
              >
                <select
                  className={selectClass}
                  value={galleryWorker}
                  onChange={(e) => setGalleryWorker(e.target.value)}
                  aria-label="작업자 필터"
                >
                  <option value="all">전체 작업자</option>
                  {galleryWorkers.map((name) => (
                    <option key={name} value={name}>
                      {displayMap.get(name) || name}
                    </option>
                  ))}
                </select>
                <select
                  className={desktopSortClass}
                  value={`${gallerySortKey}:${gallerySortDir}`}
                  onChange={(e) => handleGallerySort(e.target.value)}
                  aria-label="정렬 기준"
                >
                  {GALLERY_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExportGalleryExcel}
                  disabled={!canExportGallery}
                  className={exportBtnClass}
                >
                  엑셀 다운로드
                </button>
                <button
                  type="button"
                  onClick={() => selectAll(galleryFiltered)}
                  disabled={galleryFiltered.length === 0}
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
            }
            table={
              <>
                <MobileSortSelect
                  value={`${gallerySortKey}:${gallerySortDir}`}
                  options={GALLERY_SORT_OPTIONS}
                  onChange={handleGallerySort}
                />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                  {galleryFiltered.map((r) => {
                    const displayName =
                      (r.worker_name && (displayMap.get(r.worker_name) || r.worker_name)) ||
                      '작업자';
                    return (
                      <div
                        key={r.listKey}
                        className="group overflow-hidden rounded-xl bg-surface shadow-card"
                      >
                        <div
                          className="relative aspect-square cursor-pointer bg-surface2"
                          onClick={() => setSelectedPhoto(r)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedPhoto(r);
                            }
                          }}
                          aria-label={`${displayName} 자주검사 사진`}
                        >
                          <label
                            className="absolute left-2 top-2 z-30 flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/90"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected(r.listKey)}
                              onChange={() => toggle(r.listKey)}
                              className="h-3.5 w-3.5 accent-accent"
                              aria-label={`${displayName} 선택`}
                            />
                          </label>
                          {r.image_url ? (
                            <SignedImage
                              url={r.image_url}
                              alt={displayName}
                              {...(r.recordType === 'defect' ? { bucket: 'defect-images' } : {})}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
                              이미지 없음
                            </div>
                          )}
                          <div className="absolute bottom-2 left-2 right-2 z-20 flex flex-wrap gap-1">
                            <StageBadge stage={r.stage} />
                            <ResultBadge record={r} />
                          </div>
                        </div>
                        <div className="p-2.5 text-[11px] md:text-xs">
                          <div className="font-medium text-text">{displayName}</div>
                          <div className="mt-0.5 text-muted">
                            {r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {galleryFiltered.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-xs text-muted">
                      조건에 맞는 기록이 없습니다
                    </div>
                  ) : null}
                </div>
              </>
            }
          />
        </div>
      )}

      {modalWorker ? (
        <WorkerHistoryModal
          workerName={modalWorker}
          defects={defects}
          goods={goods}
          workerDirectory={workerDirectory}
          onClose={() => setModalWorker(null)}
        />
      ) : null}

      {selectedPhoto ? (
        <InspectionHistoryDetailModal
          key={selectedPhoto.listKey}
          record={selectedPhoto}
          workerDirectory={workerDirectory}
          onClose={() => setSelectedPhoto(null)}
        />
      ) : null}

      {viewTab === 'gallery' && selectedCount > 0 ? (
        <GalleryFloatingBar count={selectedCount}>
          <button
            type="button"
            onClick={handleDownloadSelected}
            disabled={downloadLoading}
            className={actionBtnClass}
          >
            {downloadLoading ? '다운로드 중...' : `선택 ${selectedCount}개 다운로드`}
          </button>
        </GalleryFloatingBar>
      ) : null}
    </div>
  );
}
