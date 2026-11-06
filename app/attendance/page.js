'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { buildWorkerDisplayNameMap } from '../../lib/analytics';
import { judgmentLabel } from '../../lib/attendance/judge';
import {
  appendAttendanceCorrection,
  applyAttendanceExcelImport,
  diffAttendanceFields,
  summarizeAttendanceCorrections,
} from '../../lib/attendance/excelImport';
import { fetchListPages } from '../../lib/listPages';
import * as XLSX from 'xlsx';
import {
  attendanceRecomputeNotice,
  attendanceRowsForExcel,
  describeAttendanceExportRange,
  filterAttendanceExportRows,
  missingAttendanceWorkDates,
  omitHiddenAttendanceRows,
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
import {
  attendanceRangeDates,
  buildAttendanceRecomputeBody,
  formatRangeJobStatus,
  runAttendanceRangeRecompute,
} from '../../lib/attendance/rangeJob';
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
  const [includeHidden, setIncludeHidden] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => getRecentDaysRange(1).end);
  const [rangeEnd, setRangeEnd] = useState(() => getRecentDaysRange(1).end);
  const [exportWorker, setExportWorker] = useState('');
  const [exportShift, setExportShift] = useState('');
  const [rangeExporting, setRangeExporting] = useState(false);
  const [rangeNotice, setRangeNotice] = useState('');
  const [rangeJob, setRangeJob] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [patternRows, setPatternRows] = useState([]);
  const [patternToken, setPatternToken] = useState(0);
  const rangeAbortRef = useRef(null);
  const excelInputRef = useRef(null);

  const rangeCheck = useMemo(
    () => describeAttendanceExportRange({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const correctionSummary = useMemo(
    () => summarizeAttendanceCorrections(patternRows),
    [patternRows]
  );

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(directory),
    [directory]
  );

  const hiddenNames = useMemo(() => {
    const names = new Set();
    for (const worker of directory) {
      if (!worker?.worker_name) continue;
      if (worker.removed === true || worker.excluded === true) {
        names.add(worker.worker_name);
      }
    }
    return names;
  }, [directory]);

  const exportWorkers = useMemo(() => {
    return [...directory]
      .filter((worker) => worker.worker_name)
      .filter((worker) => includeHidden || !hiddenNames.has(worker.worker_name))
      .sort((a, b) =>
        (displayMap.get(a.worker_name) || a.worker_name).localeCompare(
          displayMap.get(b.worker_name) || b.worker_name,
          'ko'
        )
      );
  }, [directory, displayMap, hiddenNames, includeHidden]);

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
          .select('worker_name, display_name, process, nationality, removed, excluded')
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
    if (!rangeCheck.ok) {
      setPatternRows([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const companyId = await getCompanyId();
        const { rows: fetched, error: fetchError } = await fetchListPages(
          () =>
            supabase
              .from('attendance_daily')
              .select('id, worker_name, work_date, judgment_rationale')
              .eq('company_id', companyId)
              .gte('work_date', rangeStart)
              .lte('work_date', rangeEnd),
          { timeColumn: 'work_date', label: 'attendance_corrections', ascending: true }
        );
        if (cancelled || fetchError) return;
        setPatternRows(fetched);
      } catch {
        if (!cancelled) setPatternRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeCheck.ok, rangeStart, rangeEnd, patternToken]);

  useEffect(() => {
    setRangeNotice('');
  }, [rangeStart, rangeEnd, exportWorker, exportShift]);

  useEffect(() => {
    return () => rangeAbortRef.current?.abort();
  }, []);

  const filtered = useMemo(() => {
    const visible = omitHiddenAttendanceRows(rows, hiddenNames, { includeHidden });
    return visible.filter((r) => {
      if (filter === 'unconfirmed') return r.judgment === 'unconfirmed';
      if (filter === 'present') return r.judgment === 'present';
      if (filter === 'unreviewed') return r.reviewed !== true;
      if (filter === 'needs_review') {
        return hasNeedsReviewFlag(r.flags);
      }
      return true;
    });
  }, [rows, filter, hiddenNames, includeHidden]);

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
      setPatternToken((token) => token + 1);
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

  async function handleExcelFile(file) {
    if (!file) return;
    setImporting(true);
    setImportNotice('');
    setError(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets['기록'] || workbook.Sheets['근태'];
      if (!sheet) throw new Error('기록 시트가 없습니다.');
      const excelRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const dates = [
        ...new Set(
          excelRows
            .map((row) => String(row.근무일 || '').trim().replace(/[./]/g, '-').slice(0, 10))
            .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
        ),
      ];
      if (!dates.length) throw new Error('근무일 열이 없습니다.');
      const companyId = await getCompanyId();
      const start = dates.slice().sort()[0];
      const end = dates.slice().sort().at(-1);
      const { rows: dailyRows, error: fetchError } = await fetchListPages(
        () =>
          supabase
            .from('attendance_daily')
            .select(
              'id, worker_name, work_date, shift, judgment, estimated_clock_in, estimated_clock_out, is_ot, reviewed, judgment_rationale'
            )
            .eq('company_id', companyId)
            .gte('work_date', start)
            .lte('work_date', end),
        { timeColumn: 'work_date', label: 'attendance_excel_import', ascending: true }
      );
      if (fetchError) throw new Error(fetchError.message);
      const planned = applyAttendanceExcelImport({
        excelRows,
        dailyRows,
        directory,
      });
      const errorLines = planned.errors.slice(0, 8).map((item) => `${item.row}행: ${item.message}`);
      if (!planned.updates.length && !planned.confirms.length) {
        setImportNotice(
          errorLines.length
            ? `반영할 수정이 없습니다. ${errorLines.join(' / ')}`
            : '바꾼 값이 없습니다.'
        );
        return;
      }
      const ok = window.confirm(
        `값 변경 ${planned.updates.length}건, 확정 ${planned.confirms.length}건을 반영합니다. 오류 ${planned.errors.length}건은 건너뜁니다.`
      );
      if (!ok) return;
      const reviewedAt = new Date().toISOString();
      for (const update of planned.updates) {
        const { error: upErr } = await supabase
          .from('attendance_daily')
          .update({
            ...update.patch,
            reviewed_at: reviewedAt,
            reviewed_by: 'excel',
            updated_at: reviewedAt,
          })
          .eq('id', update.id)
          .eq('company_id', companyId);
        if (upErr) throw new Error(upErr.message);
      }
      for (const confirm of planned.confirms) {
        const { error: upErr } = await supabase
          .from('attendance_daily')
          .update({
            reviewed: true,
            reviewed_at: reviewedAt,
            reviewed_by: 'excel',
            updated_at: reviewedAt,
          })
          .eq('id', confirm.id)
          .eq('company_id', companyId);
        if (upErr) throw new Error(upErr.message);
      }
      setImportNotice(
        `반영 ${planned.updates.length + planned.confirms.length}건, 건너뜀 ${planned.skipped}건, 오류 ${planned.errors.length}건.${
          errorLines.length ? ` ${errorLines.join(' / ')}` : ''
        }`
      );
      setPatternToken((token) => token + 1);
      await load();
    } catch (err) {
      setError(err?.message || '엑셀 반영 실패');
    } finally {
      setImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  }

  async function downloadRangeExcel() {
    const check = describeAttendanceExportRange({ start: rangeStart, end: rangeEnd });
    if (!check.ok) return false;
    setRangeExporting(true);
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
      const missingNotice = attendanceRecomputeNotice(missing);
      setRangeNotice(missingNotice);

      const exportRows = filterAttendanceExportRows(
        omitHiddenAttendanceRows(stored, hiddenNames, { includeHidden }),
        {
          workerName: exportWorker,
          shift: exportShift,
        }
      );
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
      return true;
    } catch (err) {
      setRangeNotice(err?.message || '다운로드 실패');
      return false;
    } finally {
      setRangeExporting(false);
    }
  }

  async function runRangeRecompute() {
    const plan = attendanceRangeDates(rangeStart, rangeEnd);
    if (!plan.ok) return null;
    rangeAbortRef.current?.abort();
    const controller = new AbortController();
    rangeAbortRef.current = controller;
    setRangeJob({
      phase: 'running',
      index: 1,
      total: plan.dates.length,
      workDate: plan.dates[0] || '',
      failed: [],
      processed: 0,
      cancelled: false,
    });
    const result = await runAttendanceRangeRecompute({
      dates: plan.dates,
      signal: controller.signal,
      onProgress: (progress) => {
        setRangeJob({
          ...progress,
          processed: Math.max(0, progress.index - 1),
          cancelled: false,
        });
      },
      recomputeDay: async (workDate, signal) => {
        const res = await fetch('/api/attendance/recompute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAttendanceRecomputeBody(workDate)),
          signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '재계산 실패');
      },
    });
    setRangeJob({
      phase: result.cancelled ? 'cancelled' : 'done',
      index: result.processed,
      total: result.total,
      workDate: '',
      failed: result.failed,
      processed: result.processed,
      cancelled: result.cancelled,
    });
    if (rangeStart <= date && date <= rangeEnd) await load();
    return result;
  }

  function cancelRangeRecompute() {
    rangeAbortRef.current?.abort();
  }

  async function handleRangeRecompute() {
    await runRangeRecompute();
  }

  async function handleRecomputeThenExport() {
    const result = await runRangeRecompute();
    if (!result || result.cancelled) return;
    await downloadRangeExcel();
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
          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-text md:min-h-0">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
            />
            숨김 작업자 포함
          </label>
          <button
            type="button"
            className={primaryBtn}
            onClick={handleRecompute}
            disabled={recomputing || Boolean(rangeJob?.phase === 'running')}
          >
            {recomputing ? '재계산 중…' : '재계산'}
          </button>
          <button type="button" className={btnClass} onClick={handleExport}>
            엑셀
          </button>
          <button
            type="button"
            className={btnClass}
            disabled={importing}
            onClick={() => excelInputRef.current?.click()}
          >
            {importing ? '반영 중…' : '엑셀 반영'}
          </button>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleExcelFile(e.target.files?.[0])}
          />
        </div>

        <div className="rounded-xl border border-border bg-surface px-3 py-3">
          <div className="mb-2 text-xs font-medium text-text">기간 재계산 · 엑셀</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              시작일
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                disabled={rangeJob?.phase === 'running'}
                className={selectClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              종료일
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                disabled={rangeJob?.phase === 'running'}
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
              onClick={handleRangeRecompute}
              disabled={!rangeCheck.ok || rangeJob?.phase === 'running' || rangeExporting}
            >
              기간 재계산
            </button>
            <button
              type="button"
              className={btnClass}
              onClick={downloadRangeExcel}
              disabled={!rangeCheck.ok || rangeJob?.phase === 'running' || rangeExporting}
            >
              {rangeExporting ? '만드는 중…' : '엑셀 다운로드'}
            </button>
            <button
              type="button"
              className={btnClass}
              onClick={handleRecomputeThenExport}
              disabled={!rangeCheck.ok || rangeJob?.phase === 'running' || rangeExporting}
            >
              재계산 후 엑셀 다운로드
            </button>
            {rangeJob?.phase === 'running' ? (
              <button type="button" className={btnClass} onClick={cancelRangeRecompute}>
                중단
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">
            최대 31일. 재계산은 날짜순으로 하루씩 호출하며, 확인 완료 행은 유지합니다. 엑셀 다운로드는 저장된 결과만 사용합니다.
          </p>
          {rangeCheck.message ? (
            <p className="mt-1 text-xs text-danger">{rangeCheck.message}</p>
          ) : null}
          {rangeJob ? (
            <p className="mt-1 text-xs text-text">{formatRangeJobStatus(rangeJob)}</p>
          ) : null}
          {rangeNotice ? (
            <p className="mt-1 text-xs text-text">{rangeNotice}</p>
          ) : null}
          {importNotice ? <p className="mt-1 text-xs text-text">{importNotice}</p> : null}
          <div className="mt-3 text-xs text-muted">
            <div className="font-medium text-text">오판 패턴</div>
            {correctionSummary.total ? (
              <ul className="mt-1 space-y-0.5">
                {correctionSummary.patterns.slice(0, 8).map((pattern) => (
                  <li key={pattern.label}>
                    {pattern.label} {pattern.count}건
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">이 기간의 수정 이력이 없습니다.</p>
            )}
          </div>
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
        {row.judgment_rationale?.autoComment ? (
          <div className="mt-0.5 text-[11px] text-muted">{row.judgment_rationale.autoComment}</div>
        ) : null}
        {Array.isArray(row.judgment_rationale?.flags) &&
        row.judgment_rationale.flags.includes('single_signal') ? (
          <span className="mt-0.5 inline-flex rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
            확인 필요
          </span>
        ) : null}
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
          onClick={() => {
            const next = {
              judgment,
              shift,
              estimated_clock_in: fromLocalInput(clockIn),
              estimated_clock_out: fromLocalInput(clockOut),
              is_ot: isOt,
            };
            const changes = diffAttendanceFields(row, next);
            const entry = changes.length
              ? { at: new Date().toISOString(), source: 'screen', changes }
              : null;
            onSave(row, {
              ...next,
              reviewed,
              judgment_rationale: {
                ...appendAttendanceCorrection(row.judgment_rationale, entry),
                shift,
                rule:
                  shift !== row.shift
                    ? 'manual_override'
                    : row.judgment_rationale?.rule || 'manual_override',
              },
            });
          }}
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
