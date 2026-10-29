'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { buildWorkerDisplayNameMap } from '../../lib/analytics';
import { judgmentLabel } from '../../lib/attendance/judge';
import {
  attendanceRecomputeNotice,
  attendanceRowsForExcel,
  describeAttendanceExportRange,
  filterAttendanceExportRows,
  missingAttendanceWorkDates,
  saveAttendanceRangeExcel,
} from '../../lib/attendance/excel';
import {
  formatSignalListLabel,
  signalRawMergedCounts,
} from '../../lib/attendance/signalUtils';
import {
  formatJudgmentRationaleSummary,
  hasNeedsReviewFlag,
  shiftLabel,
} from '../../lib/attendance/shift';
import { getCompanyId } from '../../lib/company';
import {
  exportToExcel,
  formatDateRangeForFilename,
  formatExportDateTime,
} from '../../lib/exportExcel';
import { formatISODate, getRecentDaysRange } from '../../lib/dateRange';
import { supabase } from '../../lib/supabase';

const selectClass =
  'bg-surface border border-border text-sm text-text px-3 py-2 rounded-xl focus:outline-none focus:border-accent';
const btnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';
const primaryBtn =
  'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 md:min-h-0';

function signalSummary(kinds) {
  const counts = signalRawMergedCounts(kinds);
  const list = formatSignalListLabel(kinds);
  const countLabel =
    counts.raw || counts.merged
      ? `신호 ${counts.raw}/${counts.merged}`
      : '';
  const mergeLabel = counts.hadMerge ? ' · 중복 촬영 병합' : '';
  if (!countLabel && list === '—') return '—';
  return `${countLabel}${mergeLabel}${list !== '—' ? ` · ${list}` : ''}`;
}

export default function AttendancePage() {
  const [date, setDate] = useState(() => getRecentDaysRange(1).end);
  const [rows, setRows] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [filter, setFilter] = useState('all'); // all | unconfirmed | present | unreviwed
  const [rangeStart, setRangeStart] = useState(() => getRecentDaysRange(1).end);
  const [rangeEnd, setRangeEnd] = useState(() => getRecentDaysRange(1).end);
  const [exportWorker, setExportWorker] = useState('');
  const [exportShift, setExportShift] = useState('');
  const [rangeExporting, setRangeExporting] = useState(false);
  const [rangeNotice, setRangeNotice] = useState('');

  const rangeCheck = useMemo(
    () => describeAttendanceExportRange({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(directory),
    [directory]
  );

  const exportWorkers = useMemo(() => {
    return [...directory]
      .filter((worker) => worker.worker_name)
      .sort((a, b) =>
        (displayMap.get(a.worker_name) || a.worker_name).localeCompare(
          displayMap.get(b.worker_name) || b.worker_name,
          'ko'
        )
      );
  }, [directory, displayMap]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = await getCompanyId();
      const [attRes, dirRes] = await Promise.all([
        supabase
          .from('attendance_daily')
          .select('*')
          .eq('company_id', companyId)
          .eq('work_date', date)
          .order('worker_name'),
        supabase
          .from('worker_directory')
          .select('worker_name, display_name, process, nationality')
          .eq('company_id', companyId),
      ]);
      if (attRes.error) throw new Error(attRes.error.message);
      if (dirRes.error) throw new Error(dirRes.error.message);
      setRows(attRes.data || []);
      setDirectory(dirRes.data || []);
    } catch (err) {
      setError(err?.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setRangeNotice('');
  }, [rangeStart, rangeEnd, exportWorker, exportShift]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'unconfirmed') return r.judgment === 'unconfirmed';
      if (filter === 'present') return r.judgment === 'present';
      if (filter === 'unreviewed') return r.reviewed !== true;
      if (filter === 'needs_review') {
        return hasNeedsReviewFlag(r.flags);
      }
      return true;
    });
  }, [rows, filter]);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const res = await fetch('/api/attendance/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDate: date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '재계산 실패');
      await load();
    } catch (err) {
      setError(err?.message || '재계산 실패');
    } finally {
      setRecomputing(false);
    }
  }

  async function saveRow(row, patch) {
    setSavingId(row.id);
    try {
      const companyId = await getCompanyId();
      const payload = {
        ...patch,
        updated_at: new Date().toISOString(),
      };
      if (patch.reviewed === true) {
        payload.reviewed_at = new Date().toISOString();
        payload.reviewed_by = payload.reviewed_by || 'admin';
      }
      if (patch.reviewed === false) {
        payload.reviewed_at = null;
        payload.reviewed_by = null;
      }
      const { error: upErr } = await supabase
        .from('attendance_daily')
        .update(payload)
        .eq('id', row.id)
        .eq('company_id', companyId);
      if (upErr) throw new Error(upErr.message);
      await load();
    } catch (err) {
      setError(err?.message || '저장 실패');
    } finally {
      setSavingId(null);
    }
  }

  function handleExport() {
    const excelRows = attendanceRowsForExcel(filtered, displayMap);
    exportToExcel(
      excelRows,
      `근태_${formatDateRangeForFilename(date, date)}.xlsx`
    );
  }

  async function handleRangeExport() {
    const check = describeAttendanceExportRange({ start: rangeStart, end: rangeEnd });
    if (!check.ok) return;
    setRangeExporting(true);
    setRangeNotice('');
    try {
      const companyId = await getCompanyId();
      const { data, error: fetchError } = await supabase
        .from('attendance_daily')
        .select('*')
        .eq('company_id', companyId)
        .gte('work_date', rangeStart)
        .lte('work_date', rangeEnd)
        .order('work_date', { ascending: true })
        .order('worker_name', { ascending: true });
      if (fetchError) throw new Error(fetchError.message);

      const stored = data || [];
      const missing = missingAttendanceWorkDates(stored, {
        start: rangeStart,
        end: rangeEnd,
      });
      setRangeNotice(attendanceRecomputeNotice(missing));

      const exportRows = filterAttendanceExportRows(stored, {
        workerName: exportWorker,
        shift: exportShift,
      });
      const workerLabel = exportWorker
        ? displayMap.get(exportWorker) || exportWorker
        : '전체';
      const shiftText =
        exportShift === 'day' || exportShift === 'night'
          ? shiftLabel(exportShift)
          : '전체';
      saveAttendanceRangeExcel(
        exportRows,
        displayMap,
        {
          start: rangeStart,
          end: rangeEnd,
          dayCount: check.dayCount,
          workerLabel,
          shiftLabel: shiftText,
          missingDates: missing,
        },
        `근태_${formatDateRangeForFilename(rangeStart, rangeEnd)}.xlsx`
      );
    } catch (err) {
      setRangeNotice(err?.message || '다운로드 실패');
    } finally {
      setRangeExporting(false);
    }
  }

  function shiftDate(delta) {
    const d = new Date(`${date}T12:00:00+09:00`);
    d.setDate(d.getDate() + delta);
    setDate(formatISODate(d));
  }

  return (
    <div>
      <PageHeader
        eyebrow="ATTENDANCE"
        title="근태"
        description="신호 합집합 기반 출근·교대 판정 · 관리자 검수"
      />

      <div className="space-y-4 px-4 pb-8 pt-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnClass} onClick={() => shiftDate(-1)}>
            이전
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={selectClass}
          />
          <button type="button" className={btnClass} onClick={() => shiftDate(1)}>
            다음
          </button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">전체</option>
            <option value="present">출근</option>
            <option value="unconfirmed">미확인</option>
            <option value="unreviewed">미검수</option>
            <option value="needs_review">확인 필요</option>
          </select>
          <button
            type="button"
            className={primaryBtn}
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? '재계산 중…' : '재계산'}
          </button>
          <button type="button" className={btnClass} onClick={handleExport}>
            엑셀
          </button>
        </div>

        <div className="rounded-xl border border-border bg-surface px-3 py-3">
          <div className="mb-2 text-xs font-medium text-text">기간 엑셀</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              시작일
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              종료일
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              작업자
              <select
                value={exportWorker}
                onChange={(e) => setExportWorker(e.target.value)}
                className={selectClass}
              >
                <option value="">전체</option>
                {exportWorkers.map((worker) => (
                  <option key={worker.worker_name} value={worker.worker_name}>
                    {displayMap.get(worker.worker_name) || worker.worker_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              조
              <select
                value={exportShift}
                onChange={(e) => setExportShift(e.target.value)}
                className={selectClass}
              >
                <option value="">전체</option>
                <option value="day">{shiftLabel('day')}</option>
                <option value="night">{shiftLabel('night')}</option>
              </select>
            </label>
            <button
              type="button"
              className={primaryBtn}
              onClick={handleRangeExport}
              disabled={!rangeCheck.ok || rangeExporting}
            >
              {rangeExporting ? '만드는 중…' : '다운로드'}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            최대 31일. 저장된 판정만 받으며, 비어 있는 날은 자동으로 재계산하지 않습니다.
          </p>
          {rangeCheck.message ? (
            <p className="mt-1 text-xs text-danger">{rangeCheck.message}</p>
          ) : null}
          {rangeNotice ? (
            <p className="mt-1 text-xs text-text">{rangeNotice}</p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-sm text-muted">불러오는 중…</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">작업자</th>
                  <th className="px-3 py-2">조</th>
                  <th className="px-3 py-2">판정</th>
                  <th className="px-3 py-2">추정 출근</th>
                  <th className="px-3 py-2">추정 퇴근</th>
                  <th className="px-3 py-2">OT</th>
                  <th className="px-3 py-2">신호(원본/병합)·근거</th>
                  <th className="px-3 py-2">검수</th>
                  <th className="px-3 py-2">저장</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <AttendanceRow
                    key={r.id}
                    row={r}
                    displayName={displayMap.get(r.worker_name) || r.worker_name}
                    saving={savingId === r.id}
                    onSave={saveRow}
                  />
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted">
                      데이터 없음 — 재계산을 실행하세요
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceRow({ row, displayName, saving, onSave }) {
  const [judgment, setJudgment] = useState(row.judgment);
  const [shift, setShift] = useState(row.shift || 'day');
  const [clockIn, setClockIn] = useState(toLocalInput(row.estimated_clock_in));
  const [clockOut, setClockOut] = useState(toLocalInput(row.estimated_clock_out));
  const [isOt, setIsOt] = useState(Boolean(row.is_ot));
  const [reviewed, setReviewed] = useState(Boolean(row.reviewed));

  useEffect(() => {
    setJudgment(row.judgment);
    setShift(row.shift || 'day');
    setClockIn(toLocalInput(row.estimated_clock_in));
    setClockOut(toLocalInput(row.estimated_clock_out));
    setIsOt(Boolean(row.is_ot));
    setReviewed(Boolean(row.reviewed));
  }, [row]);

  const flags = Array.isArray(row.flags) ? row.flags : [];

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 font-medium text-text">{displayName}</td>
      <td className="px-3 py-2">
        <select
          value={shift}
          onChange={(e) => {
            setShift(e.target.value);
            setReviewed(true);
          }}
          className={selectClass}
        >
          <option value="day">{shiftLabel('day')}</option>
          <option value="night">{shiftLabel('night')}</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={judgment}
          onChange={(e) => setJudgment(e.target.value)}
          className={selectClass}
        >
          <option value="present">{judgmentLabel('present')}</option>
          <option value="unconfirmed">{judgmentLabel('unconfirmed')}</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="datetime-local"
          value={clockIn}
          onChange={(e) => setClockIn(e.target.value)}
          className={selectClass}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="datetime-local"
          value={clockOut}
          onChange={(e) => setClockOut(e.target.value)}
          className={selectClass}
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={isOt}
          onChange={(e) => setIsOt(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2 text-xs text-muted">
        <div>{signalSummary(row.signal_kinds)}</div>
        <div className="mt-0.5">
          {row.first_signal_at
            ? formatExportDateTime(row.first_signal_at)
            : '—'}
          {' ~ '}
          {row.last_signal_at ? formatExportDateTime(row.last_signal_at) : '—'}
        </div>
        <div className="mt-0.5 text-text">
          {formatJudgmentRationaleSummary(row.judgment_rationale)}
        </div>
        {flags.length ? (
          <div className="mt-0.5 text-danger">{flags.join(' · ')}</div>
        ) : null}
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          className={btnClass}
          disabled={saving}
          onClick={() =>
            onSave(row, {
              judgment,
              shift,
              estimated_clock_in: fromLocalInput(clockIn),
              estimated_clock_out: fromLocalInput(clockOut),
              is_ot: isOt,
              reviewed,
              judgment_rationale: {
                ...(row.judgment_rationale || {}),
                shift,
                rule:
                  shift !== row.shift
                    ? 'manual_override'
                    : row.judgment_rationale?.rule || 'manual_override',
              },
            })
          }
        >
          {saving ? '…' : '저장'}
        </button>
      </td>
    </tr>
  );
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local) {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
