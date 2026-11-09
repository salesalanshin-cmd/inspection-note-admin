'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
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

const PROJECT_TITLE = '중소형 조선 기자재 생산공정 데이터 가시화 모델 구축 및 현장 실증';

const CHECKLIST = [
  { label: '태블릿/모바일 입력', href: '/dashboard' },
  { label: '입력 즉시 DB 저장', href: '/defects' },
  { label: '종이 일보 OCR 연계', href: '/worklog-review' },
  { label: '작업일보 자동 생성', href: '/reports/daily' },
  { label: '엑셀/PDF 출력', href: '/reports/daily' },
  { label: '생산·불량 대시보드', href: '/dashboard/inspection' },
  { label: '일·주·월 통계', href: '/dashboard/inspection' },
  { label: '불량유형 파레토', href: '/dashboard/inspection' },
  { label: '검토·수정 이력 관리', href: '/worklog-review' },
];

const controlClass = 'rounded-lg border border-border bg-white px-2 py-1 text-sm text-text';
const tooltipStyle = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 12, fontSize: 12 };

function formatQty(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function formatMinutes(ocr) {
  if (!ocr || ocr.status !== 'measured' || ocr.medianMinutes == null) return '측정 대기';
  const shown = Number.isInteger(ocr.medianMinutes) ? String(ocr.medianMinutes) : ocr.medianMinutes.toFixed(1);
  return `${shown}분 (${ocr.samples}건)`;
}

function basisLabel(basis) {
  if (basis === 'attendance') return '출근 기록';
  if (basis === 'weekday') return '월~토';
  return '달마다 다름';
}

function basisNote(basis) {
  if (basis === 'attendance') {
    return '기준 기간에 출근 기록(추정 출근 시각 또는 출근 판정)이 있어, 그 기록이 있는 날을 공장 가동 근무일로 썼습니다.';
  }
  if (basis === 'weekday') {
    return '기준 기간에 출근 기록이 없어, 공장 가동 근무일을 월~토로 대체했습니다. 일요일은 빠집니다.';
  }
  return '출근 기록이 있는 달은 그 날을 가동 근무일로 썼고, 기록이 없는 달은 월~토로 대체했습니다. 일요일은 빠집니다.';
}

export default function ProjectKpiPage() {
  const [fromA, setFromA] = useState('2026-06-01');
  const [toA, setToA] = useState('2026-07-31');
  const [fromB, setFromB] = useState('2026-09-01');
  const [toB, setToB] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deliveryMonth, setDeliveryMonth] = useState('2026-06');
  const [deliveryRate, setDeliveryRate] = useState('');
  const [deliveryRows, setDeliveryRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fromA, toA, fromB });
    if (toB) params.set('toB', toB);
    fetch(`/api/reports/kpi?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '성과지표를 불러오지 못했습니다.');
        return body;
      })
      .then((body) => {
        if (!cancelled) setData(body);
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
  }, [fromA, toA, fromB, toB]);

  const digital = data?.digital;
  const compare = data?.compare;
  const quality = data?.quality;
  const rateMax = Math.max(0.04, ...(data?.monthly || []).map((row) => row.defectRate || 0));

  function addDelivery() {
    const rate = Number(deliveryRate);
    if (!deliveryMonth || !Number.isFinite(rate)) return;
    setDeliveryRows((rows) => [...rows.filter((row) => row.month !== deliveryMonth), { month: deliveryMonth, rate }]
      .sort((a, b) => a.month.localeCompare(b.month)));
    setDeliveryRate('');
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-6 px-4 py-6 md:px-8 print:max-w-none print:px-0 print:py-0">
      <style>{'@media print { @page { size: A4 portrait; margin: 12mm; } }'}</style>
      <header>
        <p className="text-xs font-medium text-accent">과제 성과지표</p>
        <h1 className="mt-1 text-xl font-semibold leading-snug text-text">{PROJECT_TITLE}</h1>
        <p className="mt-2 text-sm text-text">
          기준 기간 {data?.projectFrom || '2026-06-01'} ~ {data?.projectTo || ''}
          {data?.companyName ? ` · ${data.companyName}` : ''}
        </p>
        <p className="text-xs text-muted">생성 {data?.generatedAt ? formatExportDateTime(data.generatedAt) : '—'}</p>
      </header>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-muted">불러오는 중...</p> : null}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">1. 핵심 공정 데이터 디지털 관리율</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 30% → 목표 95%</p>
        <p className="mt-3 text-3xl font-semibold tabular-nums text-text">{formatRate(digital?.rate)}</p>
        <p className="mt-1 text-sm text-muted">
          디지털 근무일 {formatQty(digital?.digitalDays)} / 가동 근무일 {formatQty(digital?.operatingDays)}
          {' · '}
          기준 {basisLabel(digital?.basis)}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                {['월', '기준', '가동 근무일', '디지털 근무일', '관리율'].map((label) => (
                  <th key={label} className="border-b border-border px-2 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(digital?.months || []).map((row) => (
                <tr key={row.month}>
                  <td className="border-b border-border px-2 py-2">{row.month}</td>
                  <td className="border-b border-border px-2 py-2">{basisLabel(row.basis)}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(row.operatingDays)}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(row.digitalDays)}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatRate(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          각주. {basisNote(digital?.basis)} 관리율은 가동 근무일 가운데 검사 데이터가 있는 날의 비율입니다. 공휴일 제외.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">2. 생산·품질 데이터 확인 소요시간</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 24시간 이상 → 목표 1시간 이내</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted">앱 입력</div>
            <div className="text-2xl font-semibold tabular-nums">0분</div>
            <p className="text-xs text-muted">입력 즉시 반영</p>
          </div>
          <div>
            <div className="text-xs text-muted">종이 일보 OCR</div>
            <div className="text-2xl font-semibold">{formatMinutes(data?.latency?.ocr)}</div>
            <p className="text-xs text-muted">2026-11-10 이후 촬영분의 중앙값. 그 전 일괄 소급 처리는 제외</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">3. 작업일보 자동 생성 및 데이터 가시화 구현 수준</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 50% → 목표 100%</p>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{CHECKLIST.length}/{CHECKLIST.length} · 100%</p>
        <ul className="mt-3 space-y-1 text-sm">
          {CHECKLIST.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-3 border-b border-border py-1.5">
              <span>완료 · {item.label}</span>
              <Link href={item.href} className="text-accent print:text-text">{item.href}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">4. 생산성</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 1,760 → 목표 2,000 EA/일. 계획서가 일평균인지 1인 1일인지 정해지지 않아 둘 다 표시합니다.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                {['월', '근무일', '일평균 검사수량', '검사자 1인 1일 평균'].map((label) => (
                  <th key={label} className="border-b border-border px-2 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.monthly || []).map((row) => (
                <tr key={row.month}>
                  <td className="border-b border-border px-2 py-2">{row.month}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(row.dayCount)}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(row.dailyAverage)}</td>
                  <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(row.perPersonDaily)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">5. 불량률</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 3.0% → 목표 2.6%</p>
        <div className="mt-3 h-[240px] print:h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data?.monthly || []}>
              <CartesianGrid stroke="#E8EAF0" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="#8B94A7" fontSize={11} tickLine={false} />
              <YAxis stroke="#8B94A7" fontSize={11} tickLine={false} domain={[0, rateMax]} tickFormatter={(value) => `${(value * 100).toFixed(1)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatRate(value)} />
              <Legend />
              <ReferenceLine y={0.03} stroke="#D89614" strokeDasharray="4 4" />
              <ReferenceLine y={0.026} stroke="#1FAA59" strokeDasharray="4 4" />
              <Line dataKey="defectRate" name="불량률" stroke="#E4483A" strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-xs text-muted">점선 기준 3.0% · 목표 2.6%</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-end gap-2 print:hidden">
          <span className="mr-auto text-sm font-medium text-text">전후 비교</span>
          <label className="text-xs text-muted">기간 A 시작<input className={`${controlClass} mt-1 block`} type="date" value={fromA} onChange={(event) => setFromA(event.target.value)} /></label>
          <label className="text-xs text-muted">기간 A 끝<input className={`${controlClass} mt-1 block`} type="date" value={toA} onChange={(event) => setToA(event.target.value)} /></label>
          <label className="text-xs text-muted">기간 B 시작<input className={`${controlClass} mt-1 block`} type="date" value={fromB} onChange={(event) => setFromB(event.target.value)} /></label>
          <label className="text-xs text-muted">기간 B 끝<input className={`${controlClass} mt-1 block`} type="date" value={toB || compare?.b?.to || ''} onChange={(event) => setToB(event.target.value)} /></label>
        </div>
        <table className="min-w-full border-collapse text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="border-b border-border px-2 py-2 font-medium">지표</th>
              <th className="border-b border-border px-2 py-2 font-medium">A 도입 초기<br />{compare?.a?.from} ~ {compare?.a?.to}</th>
              <th className="border-b border-border px-2 py-2 font-medium">B 최근<br />{compare?.b?.from} ~ {compare?.b?.to}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b border-border px-2 py-2">일평균 검사수량</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(compare?.a?.dailyAverage)}</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(compare?.b?.dailyAverage)}</td>
            </tr>
            <tr>
              <td className="border-b border-border px-2 py-2">검사자 1인 1일 평균</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(compare?.a?.perPersonDaily)}</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatQty(compare?.b?.perPersonDaily)}</td>
            </tr>
            <tr>
              <td className="border-b border-border px-2 py-2">불량률</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatRate(compare?.a?.defectRate)}</td>
              <td className="border-b border-border px-2 py-2 tabular-nums">{formatRate(compare?.b?.defectRate)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">6. 납기준수율</h2>
        <p className="mt-1 text-xs text-muted">현재 기준 92% → 목표 96%</p>
        <p className="mt-2 text-sm text-text">발주서 대비 거래명세서로 별도 증빙합니다. 이 시스템은 납기 원천을 갖고 있지 않습니다.</p>
        <p className="mt-1 text-xs text-muted">납기준수율을 저장하는 설정 테이블이 없어 아래 입력은 이 화면에만 남고 저장되지 않습니다.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
          <label className="text-xs text-muted">월<input className={`${controlClass} mt-1 block`} type="month" value={deliveryMonth} onChange={(event) => setDeliveryMonth(event.target.value)} /></label>
          <label className="text-xs text-muted">납기준수율(%)<input className={`${controlClass} mt-1 block w-28`} type="number" min="0" max="100" step="0.1" value={deliveryRate} onChange={(event) => setDeliveryRate(event.target.value)} /></label>
          <button type="button" className={controlClass} onClick={addDelivery}>추가</button>
        </div>
        <table className="mt-3 min-w-full border-collapse text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="border-b border-border px-2 py-2 font-medium">월</th>
              <th className="border-b border-border px-2 py-2 font-medium">납기준수율</th>
            </tr>
          </thead>
          <tbody>
            {deliveryRows.length ? deliveryRows.map((row) => (
              <tr key={row.month}>
                <td className="border-b border-border px-2 py-2">{row.month}</td>
                <td className="border-b border-border px-2 py-2 tabular-nums">{row.rate.toFixed(1)}%</td>
              </tr>
            )) : (
              <tr>
                <td className="border-b border-border px-2 py-2 text-muted" colSpan={2}>입력 없음</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text">7. 신규채용</h2>
        <p className="mt-1 text-xs text-muted">목표 1명</p>
        <p className="mt-2 text-sm text-text">4대보험 가입자 명부로 별도 증빙합니다.</p>
      </section>

      <footer className="text-xs leading-relaxed text-muted">
        <p>
          데이터 품질. 기준 기간 검사 행 {formatQty(quality?.rows)}
          {' · '}앱 {formatQty(quality?.appRows)}행
          {' · '}OCR {formatQty(quality?.ocrRows)}행
          {' · '}검토 완료율 {formatRate(quality?.reviewRate)}
          {' '}(검토 시각이 있는 행 {formatQty(quality?.reviewed)}/{formatQty(quality?.rows)})
        </p>
        <p>
          수량 정확도 {formatRate(quality?.qtyAccuracy)}
          {' · '}작업일보 검토와 같은 계산(검토한 행 {formatQty(quality?.reviewedRows)} 가운데 수량을 고치지 않은 비율)
        </p>
      </footer>
    </div>
  );
}
