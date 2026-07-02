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
import { useReports } from '../../lib/useReports';
import { buildWorkerStats, buildTrend, buildDefectBreakdown } from '../../lib/analytics';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';

const tooltipStyle = {
  background: '#1C232B',
  border: '1px solid #2C3640',
  borderRadius: 2,
  fontSize: 12,
  color: '#E7ECF0',
};

export default function DashboardPage() {
  const { loading, error, defects, goods, fives } = useReports();

  if (loading) {
    return (
      <div className="p-8 text-muted font-mono text-sm">데이터 불러오는 중...</div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-danger font-mono text-sm">
        데이터를 불러오지 못했습니다: {error}
        <div className="text-muted mt-2">
          .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 값을 확인하세요.
        </div>
      </div>
    );
  }

  const workerStats = buildWorkerStats(defects, goods, fives);
  const trend = buildTrend(defects, goods);
  const breakdown = buildDefectBreakdown(defects).slice(0, 6);
  const overdueCount = workerStats.filter((w) => w.needsAlert).length;
  const total = defects.length + goods.length;
  const defectRate = total > 0 ? ((defects.length / total) * 100).toFixed(1) : '0.0';

  return (
    <div>
      <PageHeader
        eyebrow="OVERVIEW"
        title="대시보드"
        description="전체 검사 현황과 최근 14일 추세"
      />

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="총 검사 건수" value={total} sub={`불량 ${defects.length} · 양품 ${goods.length}`} />
          <StatCard label="불량률" value={`${defectRate}%`} tone={Number(defectRate) > 5 ? 'danger' : 'default'} />
          <StatCard label="3정5S 기록" value={fives.length} tone="accent" />
          <StatCard label="활동 작업자" value={workerStats.length} />
          <StatCard
            label="주기 미준수"
            value={overdueCount}
            sub="검사 또는 3정5S 지연"
            tone={overdueCount > 0 ? 'danger' : 'good'}
          />
        </div>

        <div className="bg-surface border border-border rounded-sm p-5">
          <div className="text-[11px] tracking-[0.2em] text-muted font-mono uppercase mb-4">
            최근 14일 추세
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="defectGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E2543A" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#E2543A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="goodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4FA97C" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#4FA97C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2C3640" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="#8A97A3" fontSize={11} tickLine={false} />
              <YAxis stroke="#8A97A3" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="defect" stroke="#E2543A" fill="url(#defectGrad)" name="불량" strokeWidth={2} />
              <Area type="monotone" dataKey="good" stroke="#4FA97C" fill="url(#goodGrad)" name="양품" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-border rounded-sm p-5">
          <div className="text-[11px] tracking-[0.2em] text-muted font-mono uppercase mb-4">
            불량 유형 상위 항목
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={breakdown} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#2C3640" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#8A97A3" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="#8A97A3" fontSize={12} width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#F2A93B" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
