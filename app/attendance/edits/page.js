'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../../components/PageHeader';
import { attendanceFieldLabel, displayAttendanceValue, summarizeAttendanceEdits } from '../../../lib/attendance/excelImport';
import { fetchAttendanceDaily, fetchAttendanceEditLogs } from '../../../lib/attendance/clientApi';
import { getRecentDaysRange, isDateRangeValid } from '../../../lib/dateRange';
import { LIST_TRUNCATION_MESSAGE } from '../../../lib/listPages';

const inputClass =
  'min-h-[44px] rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none md:min-h-0';

function formatRatio(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatEditedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}

export default function AttendanceEditsPage() {
  const initial = getRecentDaysRange(30);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [logs, setLogs] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!isDateRangeValid({ start, end })) {
      setLogs([]);
      setDailyRows([]);
      setLoading(false);
      setError('기간을 확인해 주세요.');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [logResult, dailyResult] = await Promise.all([
          fetchAttendanceEditLogs({ from: start, to: end }),
          fetchAttendanceDaily({
            from: start,
            to: end,
            columns: 'id,work_date,worker_name,judgment_rationale',
          }),
        ]);
        if (cancelled) return;
        setLogs(logResult.rows || []);
        setDailyRows(dailyResult.rows || []);
        setTruncated(Boolean(logResult.truncated || dailyResult.truncated));
      } catch (err) {
        if (!cancelled) {
          setLogs([]);
          setDailyRows([]);
          setError(err?.message || '수정 이력을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const summary = useMemo(() => summarizeAttendanceEdits(logs, dailyRows), [logs, dailyRows]);

  return (
    <div>
      <PageHeader
        eyebrow="ATTENDANCE"
        title="근태 수정 이력"
        description="화면 수정과 엑셀 반영이 어떤 규칙을 얼마나 바꿨는지 봅니다."
      />
      <div className="space-y-4 px-4 pb-8 pt-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} />
          <span className="text-sm text-muted">~</span>
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className={inputClass} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {truncated ? <p className="text-xs text-warn">{LIST_TRUNCATION_MESSAGE}</p> : null}
        {loading ? <p className="text-sm text-muted">불러오는 중…</p> : null}
        {!loading && !error ? (
          <>
            <div className="space-y-1 text-sm text-text">
              {summary.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <section className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface2 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">규칙</th>
                    <th className="px-3 py-2 font-medium">수정 행</th>
                    <th className="px-3 py-2 font-medium">판정 행</th>
                    <th className="px-3 py-2 font-medium">비율</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byRule.length ? (
                    summary.byRule.map((item) => (
                      <tr key={item.rule} className="border-t border-border">
                        <td className="px-3 py-2">{item.rule}</td>
                        <td className="px-3 py-2">{item.editedRows}</td>
                        <td className="px-3 py-2">{item.judgedRows}</td>
                        <td className="px-3 py-2">{formatRatio(item.ratio)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                        이 기간의 수정이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-border p-3">
                <h2 className="mb-2 text-sm font-medium text-text">필드별 건수</h2>
                <ul className="space-y-1 text-sm text-text">
                  {summary.byField.length ? (
                    summary.byField.map((item) => (
                      <li key={item.field} className="flex justify-between gap-3">
                        <span>{item.label}</span>
                        <span>{item.count}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-muted">없음</li>
                  )}
                </ul>
              </section>
              <section className="rounded-xl border border-border p-3">
                <h2 className="mb-2 text-sm font-medium text-text">작업자 상위 10</h2>
                <ul className="space-y-1 text-sm text-text">
                  {summary.topWorkers.length ? (
                    summary.topWorkers.map((item) => (
                      <li key={item.workerName} className="flex justify-between gap-3">
                        <span className="truncate">{item.workerName}</span>
                        <span>{item.count}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-muted">없음</li>
                  )}
                </ul>
              </section>
            </div>
            <section className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-surface2 text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">수정 시각</th>
                    <th className="px-3 py-2 font-medium">작업자</th>
                    <th className="px-3 py-2 font-medium">근무일</th>
                    <th className="px-3 py-2 font-medium">필드</th>
                    <th className="px-3 py-2 font-medium">이전 → 이후</th>
                    <th className="px-3 py-2 font-medium">규칙</th>
                    <th className="px-3 py-2 font-medium">출처</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent.slice(0, 30).map((log, index) => (
                    <tr key={`${log.batch_id || ''}-${log.attendance_id || ''}-${log.field || ''}-${index}`} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2">{formatEditedAt(log.edited_at)}</td>
                      <td className="px-3 py-2">{log.worker_name || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{log.work_date || '—'}</td>
                      <td className="px-3 py-2">{attendanceFieldLabel(log.field)}</td>
                      <td className="px-3 py-2">
                        {displayStored(log.field, log.old_value)} → {displayStored(log.field, log.new_value)}
                      </td>
                      <td className="px-3 py-2">{log.original_rule || '—'}</td>
                      <td className="px-3 py-2">{log.source === 'excel' ? '엑셀' : '화면'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function displayStored(field, value) {
  if (value == null || value === '') return '없음';
  if (field === 'is_ot') return value === 'true' ? 'Y' : 'N';
  if (field === 'shift' || field === 'judgment') return displayAttendanceValue(field, value);
  return String(value);
}
