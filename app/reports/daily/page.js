'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import {
  exportToExcel,
  exportWorkbook,
  formatDateRangeForFilename,
  formatExportDateTime,
} from '../../../lib/exportExcel';

const controlClass = 'rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text';

function formatQty(value) {
  if (value == null || value === '') return '';
  return Number(value).toLocaleString('ko-KR');
}

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

function defectText(parts) {
  return (parts || []).map((part) => {
    const label = part.name && part.name !== part.code ? `${part.code} ${part.name}` : part.code;
    return `${label} ${formatQty(part.qty)}`;
  }).join(', ');
}

function remark(line) {
  const bits = [];
  if (line.reviewed === false) bits.push('미검토');
  if (line.taskNote) bits.push(line.taskNote);
  return bits.join(' · ');
}

function lineToExcel(line) {
  return {
    검사자: line.workerName || '',
    품번: line.itemCode || '',
    LOT: line.lotNo || '',
    시작: line.startLabel || '',
    종료: line.endLabel || '',
    양품수량: line.memoOnly ? '' : line.qtyGood,
    불량수량: line.memoOnly ? '' : line.qtyDefect,
    불량유형별: defectText(line.defectBreakdown),
    비고: remark(line),
    출처: line.source,
  };
}

export default function DailyWorkReportPage() {
  const [ready, setReady] = useState(false);
  const [workday, setWorkday] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('2026-06-01');
  const [to, setTo] = useState('2026-11-30');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('workday') || '';
    setWorkday(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (workday) params.set('workday', workday);
    fetch(`/api/reports/daily?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || '작업일보를 불러오지 못했습니다.');
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        if (body.workday && body.workday !== workday) setWorkday(body.workday);
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
  }, [ready, workday]);

  const report = data?.report;
  const lines = report?.lines || [];

  function downloadDay() {
    if (!data?.workday) return;
    const stamp = data.workday.replace(/-/g, '');
    exportToExcel(
      lines.length ? lines.map(lineToExcel) : [{ 검사자: '', 품번: '', LOT: '', 시작: '', 종료: '', 양품수량: '', 불량수량: '', 불량유형별: '', 비고: '', 출처: '' }],
      `검사공정_작업일보_${stamp}.xlsx`
    );
  }

  async function downloadRange() {
    setExporting(true);
    setExportError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/reports/daily?${params.toString()}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '기간 일보를 만들지 못했습니다.');
      const summary = (body.days || []).map((day) => ({
        근무일: day.workday,
        검사수량: day.inspectedQty,
        양품: day.qtyGood,
        불량: day.defectQty,
        불량률: formatRate(day.defectRate),
      }));
      const sheets = [
        {
          name: '일자별요약',
          rows: summary.length ? summary : [{ 근무일: '', 검사수량: '', 양품: '', 불량: '', 불량률: '' }],
        },
        ...(body.days || []).map((day) => ({
          name: day.workday,
          rows: day.lines.length
            ? day.lines.map(lineToExcel)
            : [{ 검사자: '', 품번: '', LOT: '', 시작: '', 종료: '', 양품수량: '', 불량수량: '', 불량유형별: '', 비고: '', 출처: '' }],
        })),
      ];
      exportWorkbook(sheets, `검사공정_작업일보_${formatDateRangeForFilename(from, to)}.xlsx`);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 print:max-w-none print:px-0 print:py-0">
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <button
          type="button"
          className={controlClass}
          aria-label="이전 근무일"
          disabled={!data?.prev || loading}
          onClick={() => setWorkday(data.prev)}
        >
          이전 근무일
        </button>
        <label className="text-xs text-muted">
          근무일
          <input
            className={`${controlClass} mt-1 block`}
            type="date"
            value={data?.workday || workday}
            onChange={(event) => setWorkday(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={controlClass}
          aria-label="다음 근무일"
          disabled={!data?.next || loading}
          onClick={() => setWorkday(data.next)}
        >
          다음 근무일
        </button>
        <button type="button" className={controlClass} disabled={!data?.workday || loading} onClick={downloadDay}>
          엑셀
        </button>
        <button type="button" className={controlClass} disabled={!data?.workday || loading} onClick={() => window.print()}>
          PDF
        </button>
        <label className="text-xs text-muted">
          기간 시작
          <input className={`${controlClass} mt-1 block`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-xs text-muted">
          기간 끝
          <input className={`${controlClass} mt-1 block`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className={controlClass} disabled={exporting || !from || !to} onClick={downloadRange}>
          {exporting ? '만드는 중...' : '기간 일괄 엑셀'}
        </button>
      </div>
      {exportError ? <p className="mb-3 text-sm text-danger print:hidden">{exportError}</p> : null}
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-text">검사공정 작업일보</h1>
        <p className="mt-1 text-sm text-text">{data?.companyName || ''}</p>
        <p className="text-sm text-text">{data?.workday || ''}</p>
        <p className="text-xs text-muted">
          검사노트 입력 데이터로 자동 생성됨
          {data?.generatedAt ? ` · ${formatExportDateTime(data.generatedAt)}` : ''}
        </p>
      </header>

      {loading && !report ? <p className="text-sm text-muted">불러오는 중...</p> : null}
      {!loading && data && !lines.length ? (
        <p className="mb-4 text-sm text-muted">이 근무일의 검사 실적이 없습니다.</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-surface2 text-left text-xs text-muted">
            <tr>
              {['검사자', '품번', 'LOT', '시작~종료', '양품수량', '불량수량', '불량유형별', '비고'].map((label) => (
                <th key={label} className="border-b border-border px-3 py-2 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className={line.reviewed === false ? 'bg-warnSoft' : ''}>
                <td className="border-b border-border px-3 py-2 whitespace-nowrap">{line.workerName || '—'}</td>
                <td className="border-b border-border px-3 py-2 whitespace-nowrap">{line.itemCode || '—'}</td>
                <td className="border-b border-border px-3 py-2 whitespace-nowrap">{line.lotNo || '—'}</td>
                <td className="border-b border-border px-3 py-2 whitespace-nowrap tabular-nums">
                  {line.startLabel || line.endLabel ? `${line.startLabel || '—'}~${line.endLabel || '—'}` : '—'}
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums">{line.memoOnly ? '' : formatQty(line.qtyGood)}</td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums">{line.memoOnly ? '' : formatQty(line.qtyDefect)}</td>
                <td className="border-b border-border px-3 py-2">{defectText(line.defectBreakdown) || ''}</td>
                <td className="border-b border-border px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {line.source === 'ocr' && line.ocrResultId ? (
                      <Link
                        href={`/worklog-review?photo=${line.ocrResultId}`}
                        title="원본 사진"
                        aria-label="원본 사진"
                        className="text-accent print:hidden"
                      >
                        <ImageIcon size={16} />
                      </Link>
                    ) : null}
                    <span>{remark(line)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer id="report-totals" className="mt-4 grid gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm sm:grid-cols-3">
        <div>총 검사수량 <span className="font-semibold tabular-nums">{formatQty(report?.inspectedQty || 0)}</span></div>
        <div>총 양품 <span className="font-semibold tabular-nums">{formatQty(report?.qtyGood || 0)}</span></div>
        <div>총 불량 <span className="font-semibold tabular-nums">{formatQty(report?.defectQty || 0)}</span></div>
        <div>불량률 <span className="font-semibold tabular-nums">{formatRate(report?.defectRate)}</span></div>
        <div>검사자 수 <span className="font-semibold tabular-nums">{formatQty(report?.workerCount || 0)}</span></div>
        <div>
          불량유형 상위 3개{' '}
          <span className="font-semibold">
            {(report?.topDefects || []).length
              ? report.topDefects.map((part) => `${part.name} ${formatQty(part.qty)}`).join(', ')
              : '—'}
          </span>
        </div>
      </footer>
    </div>
  );
}
