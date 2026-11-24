'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildWorkerStats,
  buildTrend,
  buildDefectBreakdown,
  buildOverallComplianceRate,
  buildTodayShiftSummary,
  buildWorkerDisplayNameMap,
  filterByExcludedWorkers,
  filterRecordsByProcess,
  getExcludedWorkerNames,
  summarizeTodayFives,
} from '../../lib/analytics';
import { DEFAULT_PROCESS_FILTER } from '../../lib/constants';
import PageHeader from '../../components/PageHeader';
import ListTruncationNotice from '../../components/ListTruncationNotice';
import StatCard from '../../components/StatCard';
import ProcessFilterSelect from '../../components/ProcessFilterSelect';

/** 이행률 → StatCard tone (90%↑ good, 70~89% warn, 70%↓ danger, null muted) */
function rateTone(rate) {
  if (rate == null) return 'muted';
  if (rate >= 0.9) return 'good';
  if (rate >= 0.7) return 'warn';
  return 'danger';
}

/** 이행률 → 표시 문자열 */
function rateValue(rate) {
  return rate == null ? '데이터 없음' : `${Math.round(rate * 100)}%`;
}

const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #E8EAF0',
  borderRadius: 12,
  fontSize: 15,
  color: '#1B2334',
  boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.1)',
};

const contentWidth = 'mx-auto w-full max-w-[100rem]';
const panel = 'min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6';
const panelTitle = 'text-lg font-bold leading-snug text-text lg:text-xl';
const sectionGrid = 'grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:gap-5';
const numberFormat = new Intl.NumberFormat('ko-KR');
const chartColors = { axis: '#475569', grid: '#dce3ee', defect: '#b63836', good: '#16734b' };

function WorkerPills({ names, displayMap, tone = 'danger' }) {
  const pillClass =
    tone === 'warn'
      ? 'bg-warnSoft text-warn'
      : 'bg-dangerSoft text-danger';

  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((name) => (
        <li
          key={name}
          className={`max-w-full break-keep rounded-md px-2.5 py-1 text-sm font-semibold leading-snug [overflow-wrap:anywhere] ${pillClass}`}
        >
          {displayMap.get(name) || name}
        </li>
      ))}
    </ul>
  );
}

function ShiftResult({ item }) {
  if (!item.started) {
    return <span className="text-sm font-medium text-muted" title="시간대 시작 전">예정</span>;
  }

  const incomplete =
    item.ended && item.targetCount > 0 && item.completedCount < item.targetCount;
  const allDone = item.targetCount > 0 && item.completedCount === item.targetCount;

  const color = incomplete ? 'text-danger' : allDone ? 'text-good' : 'text-text';
  return <span className={`font-bold tabular-nums ${color}`}>{item.completedCount} / {item.targetCount}</span>;
}

export default function DashboardPage() {
  const { loading, error, truncated, defects, goods, fives, workerDirectory } = useReports();
  const [processFilter, setProcessFilter] = useState(DEFAULT_PROCESS_FILTER);

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const filteredDefects = useMemo(
    () =>
      filterRecordsByProcess(
        filterByExcludedWorkers(defects, excludedNames),
        workerDirectory,
        processFilter
      ),
    [defects, excludedNames, workerDirectory, processFilter]
  );
  const filteredGoods = useMemo(
    () =>
      filterRecordsByProcess(
        filterByExcludedWorkers(goods, excludedNames),
        workerDirectory,
        processFilter
      ),
    [goods, excludedNames, workerDirectory, processFilter]
  );
  const filteredFives = useMemo(
    () =>
      filterRecordsByProcess(
        filterByExcludedWorkers(fives, excludedNames),
        workerDirectory,
        processFilter
      ),
    [fives, excludedNames, workerDirectory, processFilter]
  );

  const workerStats = useMemo(
    () => buildWorkerStats(filteredDefects, filteredGoods, filteredFives, excludedNames),
    [filteredDefects, filteredGoods, filteredFives, excludedNames]
  );

  const trend = useMemo(
    () => buildTrend(filteredDefects, filteredGoods),
    [filteredDefects, filteredGoods]
  );

  const breakdown = useMemo(
    () => buildDefectBreakdown(filteredDefects).slice(0, 6),
    [filteredDefects]
  );

  const shiftSummary = useMemo(
    () =>
      buildTodayShiftSummary(
        filteredDefects,
        filteredGoods,
        workerDirectory,
        new Date(),
        filteredFives,
        processFilter
      ),
    [filteredDefects, filteredGoods, filteredFives, workerDirectory, processFilter]
  );

  const overdueMissingWorkers = useMemo(() => {
    const names = new Set();
    for (const item of shiftSummary) {
      if (!item.started || !item.ended) continue;
      for (const name of item.missingWorkers) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [shiftSummary]);

  const fivesToday = useMemo(
    () => summarizeTodayFives(filteredFives, filteredDefects, filteredGoods, excludedNames),
    [filteredFives, filteredDefects, filteredGoods, excludedNames]
  );

  const overallCompliance = useMemo(
    () =>
      buildOverallComplianceRate(
        filteredDefects,
        filteredGoods,
        filteredFives,
        workerDirectory,
        new Date(),
        processFilter
      ),
    [filteredDefects, filteredGoods, filteredFives, workerDirectory, processFilter]
  );

  const overdueCount = workerStats.filter((w) => w.needsAlert).length;
  const total = filteredDefects.length + filteredGoods.length;
  const fivesPct = Math.round(fivesToday.completionRate * 100);
  const shifts = ['day', 'night'].map((shift) => shiftSummary.filter((s) => s.shift === shift));
  const hasRecentInspections = trend.some(({ good, defect }) => good > 0 || defect > 0);

  return (
    <div className="min-w-0 break-keep">
      <PageHeader
        contentClassName={contentWidth}
        title="대시보드"
        description="선택한 공정의 검사 현황과 최근 14일간의 평일 추세"
        actions={<ProcessFilterSelect value={processFilter} onChange={setProcessFilter} />}
      />

      <div className={`${contentWidth} space-y-6 px-4 py-5 sm:space-y-8 sm:px-6 sm:py-7 lg:px-8`}>
        {loading ? (
          <p role="status" className={`${panel} text-base font-medium text-muted`}>데이터를 불러오는 중입니다.</p>
        ) : error ? (
          <div role="alert" className={`${panel} space-y-2 [overflow-wrap:anywhere]`}>
            <p className="text-lg font-bold text-danger">데이터를 불러오지 못했습니다.</p>
            <p className="text-sm text-text">{error}</p>
            <p className="text-sm text-muted">
              .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 값을 확인하세요.
            </p>
          </div>
        ) : (
          <>
            {truncated && <ListTruncationNotice show />}
            <section aria-label="공정 주요 지표" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4 [&>:first-child]:col-span-2 xl:[&>:first-child]:col-span-1">
              <StatCard
                label="총 검사 건수"
                value={numberFormat.format(total)}
                sub={`불량 ${numberFormat.format(filteredDefects.length)} · 양품 ${numberFormat.format(filteredGoods.length)}`}
                tone="accent"
              />
              <StatCard label="자주검사 이행률" value={rateValue(overallCompliance.overallFrequentRate)} sub="최근 7일" tone={rateTone(overallCompliance.overallFrequentRate)} />
              <StatCard label="3정5S 이행률" value={rateValue(overallCompliance.overallFivesRate)} sub="최근 7일" tone={rateTone(overallCompliance.overallFivesRate)} />
              <StatCard label="활동 작업자" value={`${numberFormat.format(workerStats.length)}명`} />
              <StatCard label="주기 미준수" value={`${numberFormat.format(overdueCount)}명`} sub="검사 또는 3정5S 지연" tone={overdueCount > 0 ? 'danger' : 'good'} />
            </section>

            <section aria-labelledby="today-title">
              <h2 id="today-title" className="mb-3 text-xl font-bold text-text lg:text-2xl">오늘 현황 요약</h2>
              <div className={sectionGrid}>
                <section className={panel} aria-labelledby="shift-title">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 id="shift-title" className={panelTitle}>오늘 자주검사 수행 현황</h3>
                    <span id="shift-units" className="text-sm font-medium text-muted">완료 / 대상</span>
                  </div>
                  <table aria-labelledby="shift-title" aria-describedby="shift-units" className="w-full table-fixed text-center text-base">
                    <thead className="border-y border-border bg-surface2 text-sm text-muted">
                      <tr>
                        <th scope="col" className="py-2">근무조</th>
                        {shifts[0].map((item) => <th scope="col" key={item.stage}>{item.stage}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border border-b border-border">
                      {shifts.map((items) => (
                        <tr key={items[0].shift}>
                          <th scope="row" className="py-3 font-semibold text-text">{items[0].shiftLabel}</th>
                          {items.map((item) => <td className="px-0.5 py-3 leading-tight" key={item.stage}><ShiftResult item={item} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-text">미준수 작업자 <span className="font-normal text-muted">(시간대 종료 후 미실시)</span></p>
                    {overdueMissingWorkers.length ? (
                      <WorkerPills names={overdueMissingWorkers} displayMap={displayMap} />
                    ) : (
                      <p className="text-sm font-semibold text-good">미준수 작업자 없음</p>
                    )}
                  </div>
                </section>

                <section className={panel} aria-labelledby="fives-title">
                  <h3 id="fives-title" className={panelTitle}>오늘 3정5S 현황</h3>
                  <dl className="my-4 grid grid-cols-2 gap-2 rounded-xl bg-surface2 p-3 sm:gap-4 sm:p-4">
                    <div className="min-w-0">
                      <dt className="text-sm font-semibold text-muted">오늘 기록</dt>
                      <dd className={`mt-1 text-xl font-bold tabular-nums lg:text-2xl ${fivesToday.completionRate >= 0.9 ? 'text-good' : fivesToday.completionRate >= 0.7 ? 'text-text' : 'text-danger'}`}>
                        {fivesToday.recordedCount} / {fivesToday.totalWorkers}
                      </dd>
                      <dd className="mt-1 text-sm text-muted">기록 작업자 / 전체</dd>
                    </div>
                    <div className="min-w-0 border-l border-border pl-3 sm:pl-4">
                      <dt className="text-sm font-semibold text-muted">오늘 완료율</dt>
                      <dd className="mt-1 text-xl font-bold tabular-nums text-text lg:text-2xl">{fivesPct}%</dd>
                    </div>
                  </dl>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-text">오늘 미기록 작업자</p>
                    {fivesToday.missingWorkers.length ? (
                      <WorkerPills names={fivesToday.missingWorkers} displayMap={displayMap} tone="warn" />
                    ) : (
                      <p className="text-sm font-semibold text-muted">{fivesToday.totalWorkers ? '전원 기록 완료' : '오늘 집계된 작업자가 없습니다.'}</p>
                    )}
                  </div>
                </section>
              </div>
            </section>

            <div className={sectionGrid}>
              <section className={panel} aria-labelledby="trend-title">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="trend-title" className={panelTitle}>최근 14일 추세 <span className="text-sm font-medium text-muted">(월~금)</span></h2>
                  <ul className="flex gap-3 text-sm font-semibold text-text" aria-label="그래프 범례">
                    <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-5 border-t-2 border-dashed" style={{ borderColor: chartColors.defect }} />불량</li>
                    <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-5 border-t-2" style={{ borderColor: chartColors.good }} />양품</li>
                  </ul>
                </div>
                {hasRecentInspections ? (
                  <ResponsiveContainer width="100%" height={240} minWidth={0}>
                    <AreaChart data={trend} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="defectGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColors.defect} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={chartColors.defect} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="goodGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColors.good} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={chartColors.good} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" stroke={chartColors.axis} fontSize={13} tickLine={false} minTickGap={16} />
                      <YAxis stroke={chartColors.axis} fontSize={13} tickLine={false} width={40} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="good" stroke={chartColors.good} fill="url(#goodGrad)" name="양품" strokeWidth={2.5} />
                      <Area type="monotone" dataKey="defect" stroke={chartColors.defect} strokeDasharray="6 3" fill="url(#defectGrad)" name="불량" strokeWidth={2.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-base text-muted">최근 14일간 평일 검사 기록이 없습니다.</p>
                )}
              </section>
              <section className={panel} aria-labelledby="defects-title">
                <h2 id="defects-title" className={panelTitle}>불량 유형 상위 항목</h2>
                {breakdown.length ? (
                  <ol className="mt-4 space-y-3.5">
                    {breakdown.map(({ name, count }) => (
                      <li key={name}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm font-semibold text-text">
                          <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
                          <span className="shrink-0 tabular-nums">{numberFormat.format(count)}건</span>
                        </div>
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface2">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(count / breakdown[0].count) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-base text-muted">이 공정에 등록된 불량이 없습니다.</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
