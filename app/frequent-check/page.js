'use client';

import { Fragment, useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildFrequentInspectionCompliance,
  countNonCompliantStages,
  getExcludedWorkerNames,
  groupComplianceByShift,
  sortComplianceByShift,
} from '../../lib/analytics';
import { SHIFT_STAGES } from '../../lib/constants';
import { sortRows, toggleSortKey } from '../../lib/tableSort';
import { exportToExcel, formatDateRangeForFilename, formatExportDateTime } from '../../lib/exportExcel';
import {
  countDaysInRange,
  eachDateInRange,
  getRecentDaysRange,
  isDateRangeValid,
} from '../../lib/dateRange';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import SortableTh from '../../components/SortableTh';
import DateRangePicker from '../../components/DateRangePicker';
import TrafficLightDots from '../../components/TrafficLightDots';

const exportBtnClass =
  'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0';

const MAX_EXPORT_DAYS = 90;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function complianceToExportRows(dateStr, rows) {
  return rows.map((row) => {
    const exportRow = {
      날짜: dateStr,
      작업자: row.worker_name,
      조: shiftLabel(row.shift),
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

function complianceStagesForDots(row) {
  return SHIFT_STAGES.map((stage) => ({
    label: stage,
    done: row.noData ? false : row[stage]?.done === true,
  }));
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

export default function FrequentCheckPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [exportDateRange, setExportDateRange] = useState(() => getRecentDaysRange(7));
  const [sortKey, setSortKey] = useState('nonCompliant');
  const [sortDir, setSortDir] = useState('desc');

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
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
        workerDirectory
      ),
    [defects, goods, fives, date, excludedNames, workerDirectory]
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
        workerDirectory
      );
      const sorted = sortComplianceByShift(dayCompliance);
      rows.push(...complianceToExportRows(dateStr, sorted));
    }

    exportToExcel(
      rows,
      `자주검사현황_${formatDateRangeForFilename(exportDateRange.start, exportDateRange.end)}.xlsx`
    );
  }

  function handleSort(column) {
    const next = toggleSortKey(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div className="flex h-[calc(100vh)] flex-col overflow-hidden">
      <PageHeader
        eyebrow="FREQUENT CHECK"
        title="자주검사 현황"
        description="근무조는 작업자 관리 설정(고정) 또는 당일 기록(자동)으로 결정되며, 초품·중품·종품 검사 준수 여부를 확인합니다."
      />

      <div className="flex min-h-0 flex-1 flex-col px-8 pb-8 pt-4">
        <PageTableShell
          toolbar={
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftDay(-1)}
                    className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
                    aria-label="이전 날"
                  >
                    ◀ 이전날
                  </button>
                  <span className="min-w-[10rem] text-center text-sm font-medium text-text">
                    {formatWorkDate(date)}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftDay(1)}
                    className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
                    aria-label="다음 날"
                  >
                    다음날 ▶
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={!canExport}
                    className={exportBtnClass}
                  >
                    엑셀 다운로드
                  </button>
                  <DateRangePicker value={exportDateRange} onChange={setExportDateRange} />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-muted">
                    근무조가 고정(🔒)된 작업자는 설정값을 우선 적용합니다. 미정인 작업자는 당일 기록
                    시간대로 자동 판단하며, 기록이 없으면 데이터 없음으로 표시됩니다.
                  </p>
                  {exportRangeTooLong ? (
                    <p className="text-xs text-warn">
                      엑셀 다운로드는 최대 {MAX_EXPORT_DAYS}일까지 선택할 수 있습니다. (현재 {exportDayCount}일)
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          }
          table={
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                  <SortableTh column="worker_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    작업자
                  </SortableTh>
                  <SortableTh column="shift" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    조
                  </SortableTh>
                  <SortableTh column="nonCompliant" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                    자주검사
                  </SortableTh>
                  <SortableTh column="overall" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
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
                      <tr key={row.worker_name} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-text">{row.worker_name}</td>
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
          }
        />
      </div>
    </div>
  );
}
