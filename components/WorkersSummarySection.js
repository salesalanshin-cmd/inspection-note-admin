'use client';

import { useMemo, useState } from 'react';
import {
  buildWorkerStats,
  buildWorkerFrequentSummary,
  buildWorkerFivesSummary,
  buildWorkerLastActivityMap,
  buildWorkerDailyStatusMap,
  buildWorkerDisplayNameMap,
  getComplianceStatusLabel,
  getExcludedWorkerNames,
} from '../lib/analytics';
import { FIVES_CYCLE_DAYS, INSPECTION_CYCLE_DAYS, SHIFT_STAGES } from '../lib/constants';
import { sortRows, toggleSortKey } from '../lib/tableSort';
import PageTableShell from './PageTableShell';
import SortableTh from './SortableTh';
import FilterToolbar from './FilterToolbar';
import TrafficLightDots from './TrafficLightDots';
import StatusDot from './StatusDot';
import MobileSortSelect, { parseSortValue } from './MobileSortSelect';
import MobileListCard, { MobileCardField } from './MobileListCard';

export const WORKER_SUMMARY_DAYS = 7;

const WORKER_SORT_OPTIONS = [
  { value: 'completionRate:asc', label: '자주검사 완료율 낮은순' },
  { value: 'fivesCompletionRate:asc', label: '3정5S 완료율 낮은순' },
  { value: 'worker_name:asc', label: '작업자명순' },
  { value: 'lastActivity:asc', label: '최근활동 오래된순' },
  { value: 'defectCount:desc', label: '불량 보고수 많은순' },
];

const DEFAULT_DAILY_STATUS = {
  frequentStages: SHIFT_STAGES.map((stage) => ({ label: stage, done: false })),
  fivesDone: false,
};

const STATUS_PILL_CLASS = {
  good: 'bg-goodSoft text-good',
  warn: 'bg-warnSoft text-warn',
  danger: 'bg-dangerSoft text-danger',
};

function ComplianceStatusPill({ rate }) {
  const { label, tone } = getComplianceStatusLabel(rate);
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

function FrequentCountCell({ completedCount, expectedCount }) {
  if (!expectedCount) {
    return <span className="text-muted">데이터 없음</span>;
  }
  return (
    <span className="text-text">
      {completedCount}/{expectedCount}
    </span>
  );
}

function CompletionRateCell({ rate }) {
  const pct = rate == null ? 0 : rate * 100;
  const toneClass = pct >= 90 ? 'text-good' : pct >= 70 ? 'text-warn' : 'text-danger';

  return (
    <div className="inline-flex items-center gap-2">
      <span className={toneClass}>{rate == null ? '-' : `${pct.toFixed(0)}%`}</span>
      <ComplianceStatusPill rate={rate} />
    </div>
  );
}

function RecentActivityCell({ lastFrequentCheckAt, lastFivesAt }) {
  const pad = (n) => String(n).padStart(2, '0');

  function fmtLine(label, iso) {
    if (!iso) {
      return (
        <div className="text-[11px]">
          <span className="text-muted">{label} · </span>
          <span className="text-muted">기록 없음</span>
        </div>
      );
    }
    const d = new Date(iso);
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return (
      <div className="text-[11px]">
        <span className="text-muted">{label} · </span>
        <span className="text-text">
          {md} {hm}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {fmtLine('자주검사', lastFrequentCheckAt)}
      {fmtLine('3정5S', lastFivesAt)}
    </div>
  );
}

function getWorkerSortValue(worker, key) {
  switch (key) {
    case 'worker_name':
      return worker.worker_name;
    case 'todayFrequentDone':
      return worker.todayFrequentStages.filter((stage) => stage.done).length;
    case 'todayFivesDone':
      return worker.todayFivesDone;
    case 'defectCount':
      return worker.defectCount;
    case 'completedCount':
      return worker.completedCount;
    case 'completionRate':
      return worker.completionRate ?? 0;
    case 'fivesCompletionRate':
      return worker.fivesCompletionRate ?? 0;
    case 'lastActivity': {
      const times = [worker.lastFrequentCheckAt, worker.lastFivesAt]
        .filter(Boolean)
        .map((iso) => new Date(iso).getTime());
      return times.length ? Math.max(...times) : 0;
    }
    default:
      return worker.worker_name;
  }
}

/**
 * 작업자 현황의 "최근 7일 요약" 표. 일일 실적 관리·작업자 현황 페이지에서 공통 사용.
 * @param {Object} props
 * @param {Date} props.endDate - 기준 근무일 (최근 7일 집계 종료일)
 * @param {Array} props.defects
 * @param {Array} props.goods
 * @param {Array} props.fives
 * @param {Array} props.workerDirectory
 */
export default function WorkersSummarySection({
  endDate,
  defects,
  goods,
  fives,
  workerDirectory,
  stickyTop = 0,
  layoutVariant = 'fill',
}) {
  const [sortKey, setSortKey] = useState('completionRate');
  const [sortDir, setSortDir] = useState('asc');

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const workerRows = useMemo(() => {
    const stats = buildWorkerStats(defects, goods, fives, excludedNames);
    const frequentMap = buildWorkerFrequentSummary(
      defects,
      goods,
      fives,
      workerDirectory,
      endDate,
      WORKER_SUMMARY_DAYS,
      excludedNames
    );
    const fivesMap = buildWorkerFivesSummary(
      fives,
      workerDirectory,
      endDate,
      WORKER_SUMMARY_DAYS,
      excludedNames
    );
    const activityMap = buildWorkerLastActivityMap(defects, goods, fives);
    const dailyMap = buildWorkerDailyStatusMap(
      defects,
      goods,
      fives,
      workerDirectory,
      endDate,
      excludedNames
    );

    return stats.map((w) => {
      const frequent = frequentMap.get(w.worker_name) ?? {
        completedCount: 0,
        expectedCount: 0,
        completionRate: null,
      };
      const fivesSummary = fivesMap.get(w.worker_name) ?? {
        completedDays: 0,
        totalDays: WORKER_SUMMARY_DAYS,
        completionRate: 0,
      };
      const activity = activityMap.get(w.worker_name) ?? {
        lastFrequentCheckAt: w.lastInspectionAt,
        lastFivesAt: w.lastFivesAt,
      };
      const daily = dailyMap.get(w.worker_name) ?? DEFAULT_DAILY_STATUS;
      return {
        ...w,
        ...frequent,
        fivesCompletedDays: fivesSummary.completedDays,
        fivesTotalDays: fivesSummary.totalDays,
        fivesCompletionRate: fivesSummary.completionRate,
        lastFrequentCheckAt: activity.lastFrequentCheckAt,
        lastFivesAt: activity.lastFivesAt,
        todayFrequentStages: daily.frequentStages,
        todayFivesDone: daily.fivesDone,
      };
    });
  }, [defects, goods, fives, workerDirectory, excludedNames, endDate]);

  const workers = useMemo(() => {
    const sorted = sortRows(workerRows, sortKey, sortDir, getWorkerSortValue);
    if (sortKey === 'completionRate' && sortDir === 'asc') {
      return [...sorted].sort((a, b) => {
        const freqDiff = (a.completionRate ?? 0) - (b.completionRate ?? 0);
        if (freqDiff !== 0) return freqDiff;
        return (a.fivesCompletionRate ?? 0) - (b.fivesCompletionRate ?? 0);
      });
    }
    return sorted;
  }, [workerRows, sortKey, sortDir]);

  const alertTargets = useMemo(() => workers.filter((w) => w.needsAlert), [workers]);

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

  function workerStatusBadge(worker) {
    if (worker.needsAlert) {
      return (
        <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
          미준수
        </span>
      );
    }
    const rate = Math.min(worker.completionRate ?? 1, worker.fivesCompletionRate ?? 1);
    return <ComplianceStatusPill rate={rate} />;
  }

  return (
    <PageTableShell
      variant={layoutVariant}
      stickyToolbar={layoutVariant === 'fill'}
      stickyTop={stickyTop}
      toolbar={
        <FilterToolbar>
          {alertTargets.length > 0 && (
            <div className="rounded-xl bg-dangerSoft p-4">
              <div className="mb-1 text-sm font-medium text-danger">
                알림 발송 대상 {alertTargets.length}명
              </div>
              <div className="text-xs text-muted">
                {alertTargets
                  .map((w) => displayMap.get(w.worker_name) || w.worker_name)
                  .join(' · ')}
              </div>
            </div>
          )}
          <p className="text-xs text-muted">
            자주검사/3정5S 완료율은 선택한 날짜 기준 최근 {WORKER_SUMMARY_DAYS}일(평일 기준) 집계입니다.
            정기검사 기준 {INSPECTION_CYCLE_DAYS}일 · 3정5S 기준 {FIVES_CYCLE_DAYS}일 초과 시 미준수로 표시됩니다.
          </p>
        </FilterToolbar>
      }
      table={
        <>
          <MobileSortSelect
            value={`${sortKey}:${sortDir}`}
            options={WORKER_SORT_OPTIONS}
            onChange={handleMobileSort}
          />
          <div className="md:hidden">
            {workers.map((w) => (
              <MobileListCard
                key={w.worker_name}
                header={displayMap.get(w.worker_name) || w.worker_name}
                badge={workerStatusBadge(w)}
              >
                <MobileCardField label="자주검사(오늘)">
                  <TrafficLightDots stages={w.todayFrequentStages} />
                </MobileCardField>
                <MobileCardField label="3정5S(오늘)">
                  <StatusDot done={w.todayFivesDone} />
                </MobileCardField>
                <MobileCardField label="불량 보고수">
                  <span className="text-danger">{w.defectCount}</span>
                </MobileCardField>
                <MobileCardField label="자주검사 횟수(N/15)">
                  <FrequentCountCell
                    completedCount={w.completedCount}
                    expectedCount={w.expectedCount}
                  />
                </MobileCardField>
                <MobileCardField label="자주검사 완료율(최근7일)" className="col-span-2">
                  <CompletionRateCell rate={w.completionRate} />
                </MobileCardField>
                <MobileCardField label="3정5S 완료율(최근7일)" className="col-span-2">
                  <CompletionRateCell rate={w.fivesCompletionRate} />
                </MobileCardField>
                <MobileCardField label="최근 수행 활동" className="col-span-2">
                  <RecentActivityCell
                    lastFrequentCheckAt={w.lastFrequentCheckAt}
                    lastFivesAt={w.lastFivesAt}
                  />
                </MobileCardField>
              </MobileListCard>
            ))}
            {workers.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">기록된 작업자가 없습니다</div>
            ) : null}
          </div>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr
                className="sticky z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted"
                style={{ top: stickyTop }}
              >
                <SortableTh column="worker_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  작업자
                </SortableTh>
                <SortableTh
                  column="todayFrequentDone"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  자주검사(오늘)
                </SortableTh>
                <SortableTh
                  column="todayFivesDone"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  3정5S(오늘)
                </SortableTh>
                <SortableTh column="defectCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  불량 보고수
                </SortableTh>
                <SortableTh
                  column="completedCount"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  자주검사 횟수(N/15)
                </SortableTh>
                <SortableTh
                  column="completionRate"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  자주검사 완료율(최근7일)
                </SortableTh>
                <SortableTh
                  column="fivesCompletionRate"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                >
                  3정5S 완료율(최근7일)
                </SortableTh>
                <SortableTh column="lastActivity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  최근 수행 활동
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.worker_name} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text">
                    {displayMap.get(w.worker_name) || w.worker_name}
                  </td>
                  <td className="px-4 py-3">
                    <TrafficLightDots stages={w.todayFrequentStages} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot done={w.todayFivesDone} />
                  </td>
                  <td className="px-4 py-3 text-danger">{w.defectCount}</td>
                  <td className="px-4 py-3">
                    <FrequentCountCell
                      completedCount={w.completedCount}
                      expectedCount={w.expectedCount}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CompletionRateCell rate={w.completionRate} />
                  </td>
                  <td className="px-4 py-3">
                    <CompletionRateCell rate={w.fivesCompletionRate} />
                  </td>
                  <td className="px-4 py-3">
                    <RecentActivityCell
                      lastFrequentCheckAt={w.lastFrequentCheckAt}
                      lastFivesAt={w.lastFivesAt}
                    />
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-muted">
                    기록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      }
      footer={
        <p className="text-xs text-muted">
          ※ 작업자 마스터에 등록되지 않았거나 제외(관리자)로 표시된 작업자는 나타나지 않습니다.
        </p>
      }
    />
  );
}
