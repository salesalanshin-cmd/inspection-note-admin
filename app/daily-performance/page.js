'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, X } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import {
  buildDailyPerformance,
  buildFrequentInspectionCompliance,
  buildFrequentStageCompletionByShift,
  buildOverdueFrequentMisses,
  buildWorkerDisplayNameMap,
  complianceStagesForDots,
  getExcludedWorkerNames,
  getStageNonComplianceList,
  isSameCalendarDay,
} from '../../lib/analytics';
import { SHIFT_STAGES } from '../../lib/constants';
import { sortRows, toggleSortKey } from '../../lib/tableSort';
import PageHeader from '../../components/PageHeader';
import NotifyReviewModal from '../../components/NotifyReviewModal';
import WorkersSummarySection from '../../components/WorkersSummarySection';
import TrafficLightDots from '../../components/TrafficLightDots';
import StatusDot from '../../components/StatusDot';
import SortableTh from '../../components/SortableTh';
import MobileSortSelect, { parseSortValue } from '../../components/MobileSortSelect';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerDailyDetailModal from '../../components/WorkerDailyDetailModal';

const TABS = [
  { id: 'today', label: '오늘 현황' },
  { id: 'summary', label: '최근 7일 요약' },
];

const dayNavBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

const tabBtnClass =
  'min-h-[44px] flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors md:min-h-0 md:flex-none';

const DAILY_SORT_OPTIONS = [
  { value: '__default__:asc', label: '기본 (미준수 우선)' },
  { value: 'worker_name:asc', label: '작업자명순' },
  { value: 'frequentCheck:desc', label: '자주검사 (완료 많은순)' },
  { value: 'frequentCheck:asc', label: '자주검사 (완료 적은순)' },
  { value: 'fives:desc', label: '3정5S (완료 우선)' },
  { value: 'documents:desc', label: '문서스캔 (완료 우선)' },
  { value: 'defectCount:desc', label: '불량보고수 (많은순)' },
  { value: 'defectCount:asc', label: '불량보고수 (적은순)' },
  { value: 'overallStatus:asc', label: '종합상태 (미준수 우선)' },
];

function countMissedDuties(row) {
  let count = 0;
  if (row.frequentCheck.status === 'fail') count += 1;
  if (row.fives.status === 'fail') count += 1;
  if (row.documents.status === 'fail') count += 1;
  return count;
}

function defaultSortRank(shift, overallStatus) {
  if (shift === 'unknown') return 3;
  if (overallStatus === 'warning') return 1;
  return 2;
}

function defaultSortPerformance(rows, complianceByWorker) {
  return [...rows].sort((a, b) => {
    const shiftA = complianceByWorker.get(a.worker_name)?.shift ?? 'unknown';
    const shiftB = complianceByWorker.get(b.worker_name)?.shift ?? 'unknown';
    const rankA = defaultSortRank(shiftA, a.overallStatus);
    const rankB = defaultSortRank(shiftB, b.overallStatus);
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === 1) {
      const missDiff = countMissedDuties(b) - countMissedDuties(a);
      if (missDiff !== 0) return missDiff;
    }
    return a.worker_name.localeCompare(b.worker_name, 'ko');
  });
}

function getPerformanceSortValue(row, key, complianceByWorker) {
  const complianceRow = complianceByWorker.get(row.worker_name);
  switch (key) {
    case 'worker_name':
      return row.worker_name;
    case 'frequentCheck':
      if (row.frequentCheck.status === 'na') return -1;
      if (!complianceRow || complianceRow.noData) return 0;
      return SHIFT_STAGES.filter((stage) => complianceRow[stage]?.done).length;
    case 'fives':
      if (row.fives.status === 'na') return -1;
      return row.fives.status === 'ok' ? 1 : 0;
    case 'documents':
      if (row.documents.status === 'na') return -1;
      return row.documents.status === 'ok' ? 1 : 0;
    case 'defectCount':
      return row.defectCount;
    case 'overallStatus':
      return row.overallStatus === 'warning' ? 0 : 1;
    default:
      return row.worker_name;
  }
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWorkDate(date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function WorkerNameButton({ name, displayName, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left font-medium text-text underline-offset-2 transition-colors hover:text-accent hover:underline"
    >
      {displayName || name}
    </button>
  );
}

function SelectionCheckbox({ checked, onChange, label }) {
  return (
    <label
      className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="h-5 w-5 accent-accent"
      />
    </label>
  );
}

function DutyStatusDot({ cell }) {
  if (!cell || cell.status === 'na') {
    return <span className="text-xs text-muted">해당없음</span>;
  }
  return <StatusDot done={cell.status === 'ok'} />;
}

function FrequentCheckDots({ complianceRow }) {
  if (!complianceRow) {
    return <span className="text-xs text-muted">-</span>;
  }
  return <TrafficLightDots stages={complianceStagesForDots(complianceRow)} />;
}

function OverallBadge({ isWarning }) {
  if (isWarning) {
    return (
      <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
        미준수
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
      정상
    </span>
  );
}

function SelectionToolbar({ performanceCount, warningCount, selectedCount, onSelectAll, onSelectWarning, onClear }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSelectAll}
        disabled={performanceCount === 0}
        className={actionBtnClass}
      >
        전체선택
      </button>
      <button
        type="button"
        onClick={onSelectWarning}
        disabled={warningCount === 0}
        className={actionBtnClass}
      >
        미준수자만 선택 ({warningCount})
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={selectedCount === 0}
        className={actionBtnClass}
      >
        선택 해제
      </button>
    </div>
  );
}

function FrequentShiftStageSummaryBar({ data, compliance, eligibleNames, onOpenMissList }) {
  const eligibleSet = useMemo(() => new Set(eligibleNames), [eligibleNames]);
  const hasData = data.some((group) => group.stages.some((row) => row.target > 0));

  if (!hasData) {
    return (
      <div className="mb-2 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs text-muted">
        표시할 자주검사 담당자가 없습니다
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-border bg-surface px-2 py-1.5">
      <p className="mb-1.5 text-center text-[10px] font-medium text-muted sm:text-left">
        자주검사 완료 현황 (담당자 기준)
      </p>
      {data.map((group) => (
        <div key={group.shift} className="mb-1.5 flex items-stretch gap-1.5 last:mb-0">
          <span className="flex w-7 shrink-0 items-center justify-center text-[10px] font-semibold text-muted">
            {group.shiftLabel}
          </span>
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {group.stages.map((row) => {
              const pct = row.target > 0 ? Math.round((row.completed / row.target) * 100) : 0;
              return (
                <button
                  key={`${group.shift}-${row.stage}`}
                  type="button"
                  onClick={() =>
                    onOpenMissList({
                      shift: group.shift,
                      stage: row.stage,
                      shiftLabel: group.shiftLabel,
                      names: getStageNonComplianceList(compliance, group.shift, row.stage).filter(
                        (name) => eligibleSet.has(name)
                      ),
                    })
                  }
                  className="cursor-pointer rounded-lg border border-border bg-surface2/50 px-2 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-surface2"
                >
                  <div className="flex items-baseline justify-between gap-0.5">
                    <span className="text-[11px] font-medium text-text">{row.stage}</span>
                    <span className="whitespace-nowrap text-[9px] text-muted">
                      완료 {row.completed} / 대상 {row.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-goodSoft">
                    <div
                      className="h-full rounded-full bg-good transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StageMissPopover({ section, displayMap, onClose }) {
  if (!section) return null;

  const displayNames = section.names.map((n) => displayMap?.get(n) || n);
  const title =
    displayNames.length === 0
      ? `${section.shiftLabel} ${section.stage}`
      : `${section.shiftLabel} ${section.stage} 미실시자 (${displayNames.length}명)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xs rounded-xl border border-border bg-surface p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="stage-miss-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-lg p-1 text-muted transition-colors hover:bg-surface2 hover:text-text"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="stage-miss-title" className="pr-6 text-sm font-medium text-text">
          {title}
        </h3>
        {displayNames.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-good">전원 완료</p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-text">{displayNames.join(', ')}</p>
        )}
      </div>
    </div>
  );
}

function PriorityMissSection({ workers, displayMap, onSelectWorker, onRefresh }) {
  return (
    <div className="mb-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-text">
            지금 확인이 필요한 사람 ({workers.length}명)
          </h2>
          <p className="text-[11px] text-muted">
            시간대가 끝났는데 아직 기록이 없는 담당자 (초품 미실시 우선)
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface2 hover:text-text"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          새로고침
        </button>
      </div>

      {workers.length === 0 ? (
        <p className="text-sm font-medium text-good">현재 미준수자가 없습니다</p>
      ) : (
        <ul className="space-y-2">
          {workers.map((worker) => (
            <li key={worker.worker_name}>
              <button
                type="button"
                onClick={() => onSelectWorker(worker.worker_name)}
                className="flex w-full flex-col items-start gap-2 rounded-xl border border-border bg-surface2/40 px-3 py-2.5 text-left transition-colors hover:bg-surface2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-text">
                  {displayMap?.get(worker.worker_name) || worker.worker_name}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {worker.labels.map((label) => (
                    <span
                      key={label}
                      className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DailyPerformancePage() {
  const { loading, error, defects, goods, fives, docs, workerDirectory } = useReports();
  const [activeTab, setActiveTab] = useState('today');
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [highlightedWorker, setHighlightedWorker] = useState(null);
  const [stageMissSection, setStageMissSection] = useState(null);
  const [detailWorker, setDetailWorker] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [dayNavHeight, setDayNavHeight] = useState(56);
  const rowRefs = useRef({});
  const dayNavRef = useRef(null);

  const isToday = isSameCalendarDay(date, now);

  useLayoutEffect(() => {
    const el = dayNavRef.current;
    if (!el) return undefined;

    const sync = () => {
      setDayNavHeight(Math.ceil(el.getBoundingClientRect().height));
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [activeTab]);

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const performance = useMemo(
    () => buildDailyPerformance(defects, goods, fives, docs, workerDirectory, date),
    [defects, goods, fives, docs, workerDirectory, date]
  );

  const frequentEligibleNames = useMemo(
    () =>
      performance
        .filter((row) => row.frequentCheck.status !== 'na')
        .map((row) => row.worker_name),
    [performance]
  );

  const compliance = useMemo(
    () =>
      buildFrequentInspectionCompliance(
        defects,
        goods,
        fives,
        date,
        excludedNames,
        workerDirectory
      ),
    [defects, goods, fives, date, excludedNames, workerDirectory]
  );

  const complianceByWorker = useMemo(
    () => new Map(compliance.map((row) => [row.worker_name, row])),
    [compliance]
  );

  const shiftStageSummaryData = useMemo(
    () => buildFrequentStageCompletionByShift(compliance, frequentEligibleNames),
    [compliance, frequentEligibleNames]
  );

  const sortedPerformance = useMemo(() => {
    if (!sortKey) {
      return defaultSortPerformance(performance, complianceByWorker);
    }
    return sortRows(performance, sortKey, sortDir, (row, key) =>
      getPerformanceSortValue(row, key, complianceByWorker)
    );
  }, [performance, complianceByWorker, sortKey, sortDir]);

  const priorityMisses = useMemo(() => {
    if (!isToday) return [];
    return buildOverdueFrequentMisses(compliance, date, now, frequentEligibleNames);
  }, [compliance, date, now, frequentEligibleNames, isToday]);

  const warningNames = useMemo(
    () => performance.filter((p) => p.overallStatus === 'warning').map((p) => p.worker_name),
    [performance]
  );

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
    setSelected(new Set());
  }

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(performance.map((p) => p.worker_name)));
  }

  function selectWarningOnly() {
    setSelected(new Set(warningNames));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleSort(column) {
    const next = toggleSortKey(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function handleMobileSort(combined) {
    const { key, dir } = parseSortValue(combined);
    setSortKey(key === '__default__' ? null : key);
    setSortDir(dir);
  }

  function scrollToWorker(name) {
    const el = rowRefs.current[name];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedWorker(name);
    window.setTimeout(() => setHighlightedWorker(null), 2000);
  }

  const selectedRows = useMemo(
    () => performance.filter((p) => selected.has(p.worker_name)),
    [performance, selected]
  );

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  const dateNav = (
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
  );

  const tabBar = (
    <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 md:inline-flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`${tabBtnClass} ${
            activeTab === tab.id
              ? 'bg-accentSoft text-accent'
              : 'text-muted hover:bg-surface2 hover:text-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="DAILY PERFORMANCE"
        title="일일 실적 관리"
        description={
          activeTab === 'today'
            ? '작업자별 담당 업무(자주검사·3정5S·문서스캔) 이행 현황을 하루 단위로 확인하고, 미준수자에게 안내 문구를 준비합니다.'
            : '작업자별 자주검사·3정5S 완료율과 최근 활동을 최근 7일 기준으로 요약합니다.'
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-8">
        {/* 날짜 네비만 sticky — 요약/우선순위 목록은 문서 흐름으로 스크롤 */}
        <div
          ref={dayNavRef}
          className="sticky top-0 z-10 -mx-4 border-b border-border bg-bg px-4 py-3 md:-mx-8 md:px-8"
        >
          {dateNav}
        </div>

        <div className="mb-4 mt-4">{tabBar}</div>

        {activeTab === 'today' ? (
          <>
            <FrequentShiftStageSummaryBar
              data={shiftStageSummaryData}
              compliance={compliance}
              eligibleNames={frequentEligibleNames}
              onOpenMissList={setStageMissSection}
            />

            {isToday ? (
              <PriorityMissSection
                workers={priorityMisses}
                displayMap={displayMap}
                onSelectWorker={scrollToWorker}
                onRefresh={() => setNow(new Date())}
              />
            ) : null}

            <div className="mb-3">
              <SelectionToolbar
                performanceCount={performance.length}
                warningCount={warningNames.length}
                selectedCount={selected.size}
                onSelectAll={selectAll}
                onSelectWarning={selectWarningOnly}
                onClear={clearSelection}
              />
            </div>

            <div
              className={`rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none ${
                selected.size > 0 ? 'max-md:pb-24' : ''
              }`}
            >
              <div className="md:hidden max-md:px-0 max-md:py-1">
                <MobileSortSelect
                  value={sortKey ? `${sortKey}:${sortDir}` : '__default__:asc'}
                  options={DAILY_SORT_OPTIONS}
                  onChange={handleMobileSort}
                />
                {sortedPerformance.map((row) => {
                  const isWarning = row.overallStatus === 'warning';
                  const isSelected = selected.has(row.worker_name);
                  const isHighlighted = highlightedWorker === row.worker_name;
                  const complianceRow = complianceByWorker.get(row.worker_name);

                  return (
                    <div
                      key={row.worker_name}
                      ref={(el) => {
                        rowRefs.current[row.worker_name] = el;
                      }}
                    >
                      <MobileListCard
                        header={
                          <WorkerNameButton
                            name={row.worker_name}
                            displayName={displayMap.get(row.worker_name)}
                            onClick={() => setDetailWorker(row.worker_name)}
                          />
                        }
                        badge={<OverallBadge isWarning={isWarning} />}
                        leading={
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggle(row.worker_name)}
                            label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                          />
                        }
                        className={`${isWarning ? 'border-l-2 border-l-danger' : ''} ${
                          isHighlighted ? 'bg-dangerSoft/30' : ''
                        }`}
                      >
                        <MobileCardField label="자주검사" className="col-span-2">
                          <FrequentCheckDots complianceRow={complianceRow} />
                        </MobileCardField>
                        <MobileCardField label="3정5S">
                          <DutyStatusDot cell={row.fives} />
                        </MobileCardField>
                        <MobileCardField label="문서스캔">
                          <DutyStatusDot cell={row.documents} />
                        </MobileCardField>
                        <MobileCardField label="불량보고수">
                          <span
                            className={`text-sm font-medium ${
                              row.defectCount > 0 ? 'text-danger' : 'text-muted'
                            }`}
                          >
                            {row.defectCount}
                          </span>
                        </MobileCardField>
                      </MobileListCard>
                    </div>
                  );
                })}
                {performance.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted">
                    표시할 작업자가 없습니다. 작업자 관리에서 담당 업무를 설정하세요.
                  </div>
                ) : null}
              </div>

              <table className="hidden w-full border-separate border-spacing-0 text-sm md:table">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted">
                    <th
                      className="sticky z-[1] w-10 border-b border-border bg-surface2 px-4 py-3"
                      style={{ top: dayNavHeight }}
                    />
                    <SortableTh
                      column="worker_name"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      작업자
                    </SortableTh>
                    <SortableTh
                      column="frequentCheck"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      자주검사
                    </SortableTh>
                    <SortableTh
                      column="fives"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      3정5S
                    </SortableTh>
                    <SortableTh
                      column="documents"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      문서스캔
                    </SortableTh>
                    <SortableTh
                      column="defectCount"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      불량보고수
                    </SortableTh>
                    <SortableTh
                      column="overallStatus"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="sticky z-[1] border-b border-border bg-surface2"
                      style={{ top: dayNavHeight }}
                    >
                      종합상태
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedPerformance.map((row) => {
                    const isWarning = row.overallStatus === 'warning';
                    const isSelected = selected.has(row.worker_name);
                    const isHighlighted = highlightedWorker === row.worker_name;
                    return (
                      <tr
                        key={row.worker_name}
                        ref={(el) => {
                          rowRefs.current[row.worker_name] = el;
                        }}
                        className={`border-b border-border transition-colors last:border-0 ${
                          isHighlighted ? 'bg-dangerSoft/30' : ''
                        }`}
                      >
                        <td
                          className={`px-4 py-3 ${
                            isWarning
                              ? 'border-l-2 border-danger'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggle(row.worker_name)}
                            label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <WorkerNameButton
                            name={row.worker_name}
                            displayName={displayMap.get(row.worker_name)}
                            onClick={() => setDetailWorker(row.worker_name)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <FrequentCheckDots
                            complianceRow={complianceByWorker.get(row.worker_name)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <DutyStatusDot cell={row.fives} />
                        </td>
                        <td className="px-4 py-3">
                          <DutyStatusDot cell={row.documents} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-medium ${
                              row.defectCount > 0 ? 'text-danger' : 'text-muted'
                            }`}
                          >
                            {row.defectCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isWarning ? (
                            <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
                              미준수
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
                              정상
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {performance.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted">
                        표시할 작업자가 없습니다. 작업자 관리에서 담당 업무를 설정하세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-muted">
              담당 업무는 작업자 관리에서 설정하며, 담당하지 않는 업무는 &quot;해당없음&quot;으로
              표시됩니다. 종합상태는 담당 업무 중 하나라도 미완료면 미준수로 판정합니다.
            </p>
          </>
        ) : (
          <WorkersSummarySection
            endDate={date}
            defects={defects}
            goods={goods}
            fives={fives}
            workerDirectory={workerDirectory}
            stickyTop={dayNavHeight}
            layoutVariant="flow"
          />
        )}
      </div>

      {activeTab === 'today' && selected.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 p-4 backdrop-blur-sm pb-[max(1rem,env(safe-area-inset-bottom))] md:bottom-6 md:left-1/2 md:right-auto md:w-auto md:-translate-x-1/2 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90 md:w-auto"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
            선택 {selected.size}명 알림 발송 검토
          </button>
        </div>
      ) : null}

      {reviewOpen ? (
        <NotifyReviewModal
          rows={selectedRows}
          workerDirectory={workerDirectory}
          date={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}

      <StageMissPopover
        section={stageMissSection}
        displayMap={displayMap}
        onClose={() => setStageMissSection(null)}
      />

      {detailWorker ? (
        <WorkerDailyDetailModal
          workerName={detailWorker}
          defects={defects}
          goods={goods}
          fives={fives}
          workerDirectory={workerDirectory}
          date={date}
          onClose={() => setDetailWorker(null)}
        />
      ) : null}
    </div>
  );
}
