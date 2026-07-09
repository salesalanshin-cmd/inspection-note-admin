'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useMemo } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildWorkerStats,
  buildTrend,
  buildDefectBreakdown,
  buildFrequentInspectionCompliance,
  buildOverallComplianceRate,
  filterByExcludedWorkers,
  getExcludedWorkerNames,
  summarizeTodayFrequentCompliance,
  summarizeTodayFives,
} from '../../lib/analytics';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';

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
  fontSize: 12,
  color: '#1B2334',
  boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.1)',
};

function WorkerPills({ names, tone = 'danger' }) {
  if (!names.length) return null;
  const pillClass =
    tone === 'warn'
      ? 'bg-warnSoft text-warn'
      : 'bg-dangerSoft text-danger';

  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass}`}
        >
          {name}
        </span>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const filteredDefects = useMemo(
    () => filterByExcludedWorkers(defects, excludedNames),
    [defects, excludedNames]
  );
  const filteredGoods = useMemo(
    () => filterByExcludedWorkers(goods, excludedNames),
    [goods, excludedNames]
  );
  const filteredFives = useMemo(
    () => filterByExcludedWorkers(fives, excludedNames),
    [fives, excludedNames]
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

  const todayCompliance = useMemo(
    () =>
      buildFrequentInspectionCompliance(
        filteredDefects,
        filteredGoods,
        filteredFives,
        new Date(),
        excludedNames,
        workerDirectory
      ),
    [filteredDefects, filteredGoods, filteredFives, excludedNames, workerDirectory]
  );

  const frequentToday = useMemo(
    () => summarizeTodayFrequentCompliance(todayCompliance, new Date()),
    [todayCompliance]
  );

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
        workerDirectory
      ),
    [filteredDefects, filteredGoods, filteredFives, workerDirectory]
  );

  if (loading) {
    return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-danger text-sm">
        데이터를 불러오지 못했습니다: {error}
        <div className="text-muted mt-2">
          .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 값을 확인하세요.
        </div>
      </div>
    );
  }

  const overdueCount = workerStats.filter((w) => w.needsAlert).length;
  const total = filteredDefects.length + filteredGoods.length;
  const fivesPct = (fivesToday.completionRate * 100).toFixed(0);

  return (
    <div>
      <PageHeader
        eyebrow="OVERVIEW"
        title="대시보드"
        description="전체 검사 현황과 최근 14일 추세"
      />

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="총 검사 건수" value={total} sub={`불량 ${filteredDefects.length} · 양품 ${filteredGoods.length}`} />
          <StatCard
            label="자주검사 이행률(최근 7일)"
            value={rateValue(overallCompliance.overallFrequentRate)}
            tone={rateTone(overallCompliance.overallFrequentRate)}
          />
          <StatCard
            label="3정5S 이행률(최근 7일)"
            value={rateValue(overallCompliance.overallFivesRate)}
            tone={rateTone(overallCompliance.overallFivesRate)}
          />
          <StatCard label="활동 작업자" value={workerStats.length} />
          <StatCard
            label="주기 미준수"
            value={overdueCount}
            sub="검사 또는 3정5S 지연"
            tone={overdueCount > 0 ? 'danger' : 'good'}
          />
        </div>

        <div className="space-y-4">
          <div className="text-xs font-medium text-muted">오늘 현황 요약</div>

          <div className="bg-surface rounded-xl shadow-card p-5 space-y-4">
            <div className="text-sm font-medium text-text">오늘 자주검사 수행 현황</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {frequentToday.stages.map((s) => (
                <StatCard
                  key={s.stage}
                  label={s.stage}
                  value={`${s.completed} / ${s.target}`}
                  sub="완료 / 대상"
                  tone={s.target > 0 && s.completed === s.target ? 'good' : 'default'}
                />
              ))}
            </div>
            <div>
              <div className="text-xs text-muted mb-2">미준수 작업자</div>
              {frequentToday.nonCompliantWorkers.length > 0 ? (
                <WorkerPills names={frequentToday.nonCompliantWorkers} tone="danger" />
              ) : (
                <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
                  전원 정상 수행중
                </span>
              )}
            </div>
          </div>

          <div className="bg-surface rounded-xl shadow-card p-5 space-y-4">
            <div className="text-sm font-medium text-text">오늘 3정5S 현황</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard
                label="오늘 기록"
                value={`${fivesToday.recordedCount} / ${fivesToday.totalWorkers}`}
                sub="기록 작업자 / 전체"
                tone={fivesToday.completionRate >= 0.9 ? 'good' : fivesToday.completionRate >= 0.7 ? 'default' : 'danger'}
              />
              <StatCard label="오늘 완료율" value={`${fivesPct}%`} />
            </div>
            <div>
              <div className="text-xs text-muted mb-2">오늘 미기록 작업자</div>
              {fivesToday.missingWorkers.length > 0 ? (
                <WorkerPills names={fivesToday.missingWorkers} tone="warn" />
              ) : (
                <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
                  전원 기록 완료
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-card p-5">
          <div className="text-xs font-medium text-muted mb-4">최근 14일 추세</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="defectGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E4483A" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#E4483A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="goodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1FAA59" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1FAA59" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="#8B94A7" fontSize={11} tickLine={false} />
              <YAxis stroke="#8B94A7" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="defect" stroke="#E4483A" fill="url(#defectGrad)" name="불량" strokeWidth={2} />
              <Area type="monotone" dataKey="good" stroke="#1FAA59" fill="url(#goodGrad)" name="양품" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface rounded-xl shadow-card p-5">
          <div className="text-xs font-medium text-muted mb-4">불량 유형 상위 항목</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={breakdown} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#8B94A7" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="#8B94A7" fontSize={12} width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#3D6EF5" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
