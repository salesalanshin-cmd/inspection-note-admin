'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatExportDateTime } from '../../../lib/exportExcel';

const tooltipStyle = {
  background: '#fff',
  border: '1px solid #E8EAF0',
  borderRadius: 12,
  fontSize: 12,
};

const controlClass = 'rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text';

function formatQty(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDelta(current, previous, { points = false } = {}) {
  if (current == null || previous == null) return '직전 기간 자료 없음';
  const diff = current - previous;
  if (points) {
    const point = diff * 100;
    const sign = point > 0 ? '+' : '';
    return `직전 ${formatRate(previous)} · ${sign}${point.toFixed(1)}%p`;
  }
  if (!previous) return diff ? '직전 0' : '직전 대비 0';
  const ratio = (diff / previous) * 100;
  const sign = ratio > 0 ? '+' : '';
  return `직전 ${formatQty(previous)} · ${sign}${ratio.toFixed(1)}%`;
}

function sourceLabel(source) {
  if (source === 'app') return '앱';
  if (source === 'ocr') return 'OCR';
  return source || '—';
}

export default function InspectionDashboardPage() {
  const [preset, setPreset] = useState('project');
  const [bucket, setBucket] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (preset === 'custom' && (!from || !to)) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ preset, bucket });
    if (preset === 'custom') {
      params.set('from', from);
      params.set('to', to);
    }
    fetch(`/api/dashboard/inspection?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '대시보드를 불러오지 못했습니다.');
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setFrom(body.from || '');
        setTo(body.to || '');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset, bucket, preset === 'custom' ? from : '', preset === 'custom' ? to : '']);

  const kpi = data?.kpi;
  const previous = data?.previous;
  const quality = data?.quality;
  const rateDomainMax = Math.max(
    0.04,
    ...(data?.monthly || []).map((row) => row.defectRate || 0),
    data?.planRate || 0,
    data?.targetRate || 0
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">검사공정 생산·불량 현황</h1>
          <p className="mt-1 text-sm text-muted">일·주·월 단위 검사수량과 불량률</p>
        </div>
        <div className="text-xs text-muted">
          마지막 갱신 {data?.generatedAt ? formatExportDateTime(data.generatedAt) : '—'}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {[
          ['30', '최근 30일'],
          ['project', '과제기간'],
          ['custom', '직접 지정'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${controlClass} ${preset === id ? 'border-accent bg-accentSoft text-accent' : ''}`}
            onClick={() => setPreset(id)}
          >
            {label}
          </button>
        ))}
        <label className="text-xs text-muted">
          시작
          <input
            className={`${controlClass} mt-1 block`}
            type="date"
            value={from}
            onChange={(event) => {
              setPreset('custom');
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="text-xs text-muted">
          끝
          <input
            className={`${controlClass} mt-1 block`}
            type="date"
            value={to}
            onChange={(event) => {
              setPreset('custom');
              setTo(event.target.value);
            }}
          />
        </label>
        <div className="ml-auto flex gap-1">
          {[
            ['day', '일'],
            ['week', '주'],
            ['month', '월'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${controlClass} ${bucket === id ? 'border-accent bg-accentSoft text-accent' : ''}`}
              onClick={() => setBucket(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {data?.previous ? (
        <p className="text-xs text-muted">
          {data.from} ~ {data.to}
          {' · '}
          직전 동일 기간 {data.previous.from} ~ {data.previous.to}
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-muted">불러오는 중...</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="총 검사수량" value={formatQty(kpi?.inspectedQty)} sub={formatDelta(kpi?.inspectedQty, previous?.inspectedQty)} />
        <Kpi label="불량률" value={formatRate(kpi?.defectRate)} sub={formatDelta(kpi?.defectRate, previous?.defectRate, { points: true })} />
        <Kpi label="일평균 검사수량" value={formatQty(kpi?.dailyAverage)} sub={`근무일 ${formatQty(kpi?.dayCount || 0)}일 · ${formatDelta(kpi?.dailyAverage, previous?.dailyAverage)}`} />
        <Kpi label="검사자 1인 1일 평균" value={formatQty(kpi?.perPersonDaily)} sub={`검사자·일 ${formatQty(kpi?.personDays || 0)} · ${formatDelta(kpi?.perPersonDaily, previous?.perPersonDaily)}`} />
      </div>
      {quality ? (
        <p className="text-xs text-muted">
          미검토 {quality.unreviewedRatio == null ? '—' : formatRate(quality.unreviewedRatio)}
          {' '}
          ({formatQty(quality.unreviewed)}/{formatQty(quality.rows)}행)
          {' · '}
          앱 {formatQty(quality.appRows)}행
          {' · '}
          OCR {formatQty(quality.ocrRows)}행
        </p>
      ) : null}

      <section className="rounded-xl bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-sm font-medium text-text">기간별 검사수량 · 불량률</h2>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data?.series || []}>
              <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#8B94A7" fontSize={11} tickLine={false} />
              <YAxis yAxisId="qty" stroke="#8B94A7" fontSize={11} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" stroke="#E4483A" fontSize={11} tickLine={false} tickFormatter={(value) => `${(value * 100).toFixed(1)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [name === '불량률' ? formatRate(value) : formatQty(value), name]} />
              <Legend />
              <Bar yAxisId="qty" dataKey="inspectedQty" name="검사수량" fill="#3D6EF5" radius={[4, 4, 0, 0]} />
              <Line yAxisId="rate" dataKey="defectRate" name="불량률" stroke="#E4483A" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-medium text-text">불량유형 파레토</h2>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                layout="vertical"
                data={(data?.pareto || []).map((row) => ({
                  ...row,
                  label: row.name && row.name !== row.code ? `${row.code} ${row.name}` : row.code,
                }))}
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" horizontal={false} />
                <XAxis xAxisId="qty" type="number" stroke="#8B94A7" fontSize={11} tickLine={false} allowDecimals={false} />
                <XAxis xAxisId="ratio" type="number" orientation="top" stroke="#D89614" fontSize={11} tickLine={false} domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <YAxis type="category" dataKey="label" stroke="#8B94A7" fontSize={11} width={148} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [name === '누적비율' ? formatRate(value) : formatQty(value), name]} />
                <Legend />
                <Bar xAxisId="qty" dataKey="qty" name="수량" fill="#3D6EF5" radius={[0, 4, 4, 0]} barSize={14} />
                <Line xAxisId="ratio" dataKey="cumRatio" name="누적비율" stroke="#D89614" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-sm font-medium text-text">월별 불량률</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.monthly || []}>
                <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#8B94A7" fontSize={11} tickLine={false} />
                <YAxis stroke="#8B94A7" fontSize={11} tickLine={false} domain={[0, rateDomainMax]} tickFormatter={(value) => `${(value * 100).toFixed(1)}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatRate(value), name]} />
                <Legend />
                <ReferenceLine y={data?.planRate ?? 0.03} stroke="#D89614" strokeDasharray="4 4" />
                <ReferenceLine y={data?.targetRate ?? 0.026} stroke="#1FAA59" strokeDasharray="4 4" />
                <Line dataKey="defectRate" name="불량률" stroke="#E4483A" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted">점선 계획 3.0% · 목표 2.6%</p>
        </section>
      </div>

      <section className="rounded-xl bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-sm font-medium text-text">최근 입력 10건</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                {['근무일', '검사자', '품번', '양품', '불량', '출처'].map((label) => (
                  <th key={label} className="border-b border-border px-3 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.recent || []).map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-border px-3 py-2 whitespace-nowrap">{row.workday}</td>
                  <td className="border-b border-border px-3 py-2 whitespace-nowrap">{row.workerName || '—'}</td>
                  <td className="border-b border-border px-3 py-2 whitespace-nowrap">{row.itemCode || '—'}</td>
                  <td className="border-b border-border px-3 py-2 text-right tabular-nums">{row.qtyGood == null ? '' : formatQty(row.qtyGood)}</td>
                  <td className="border-b border-border px-3 py-2 text-right tabular-nums">{row.qtyDefect == null ? '' : formatQty(row.qtyDefect)}</td>
                  <td className="border-b border-border px-3 py-2">{sourceLabel(row.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !(data?.recent || []).length ? <p className="py-4 text-sm text-muted">이 기간의 검사 실적이 없습니다.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-text">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
