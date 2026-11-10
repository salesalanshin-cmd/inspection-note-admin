'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PageHeader from '../../components/PageHeader';
import { attendanceCardPath } from '../../lib/attendance/card';
import { buildWorkerDisplayNameMap } from '../../lib/analytics';
import { judgmentLabel } from '../../lib/attendance/judge';
import {
  appendAttendanceCorrection,
  applyAttendanceExcelImport,
  collectExcelImportKeys,
  diffAttendanceFields,
  displayAttendanceValue,
  attendanceFieldLabel,
  summarizeAttendanceCorrections,
} from '../../lib/attendance/excelImport';
import {
  applyAttendanceDailyBatch,
  fetchAttendanceDaily,
  patchAttendanceDaily,
} from '../../lib/attendance/clientApi';
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
  ORGANIZATION_UNSET,
  matchesOrganizationFilter,
  organizationByWorkerName,
  organizationOptions,
} from '../../lib/workerBulk';
import {
  attendanceRangeDates,
  buildAttendanceRecomputeBody,
  formatRangeJobStatus,
  runAttendanceRangeRecompute,
} from '../../lib/attendance/rangeJob';
import { loadUnmatchedNameSummary } from '../../lib/attendance/loadUnmatchedNames';
import UnmatchedNamesNotice from '../../components/attendance/UnmatchedNamesNotice';
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
  const [unmatchedNames, setUnmatchedNames] = useState(null);
  const [rows, setRows] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const loadRequestRef = useRef(0);
  const [savingId, setSavingId] = useState(null);
  const [recomputing, setRecomputing] = useState(false);
  const [filter, setFilter] = useState('all'); // all | unconfirmed | present | unreviwed
  const [organizationFilter, setOrganizationFilter] = useState('');
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
  const [logWarning, setLogWarning] = useState('');
  const [excelPreview, setExcelPreview] = useState(null);
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
  // 조직은 attendance_daily에 저장하지 않는다. 현재 worker_directory 소속을 붙이므로
  // 소속이 바뀌면 과거 근무일에도 바뀐 뒤의 조직이 보인다.
  const organizationByWorker = useMemo(() => organizationByWorkerName(directory), [directory]);
  const organizationChoices = useMemo(() => organizationOptions(directory), [directory]);

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
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const companyId = await getCompanyId();
      const [attRes, dirRes] = await Promise.all([
        fetchAttendanceDaily({ workDate: date }),
        supabase
          .from('worker_directory')
          .select('worker_name, display_name, process, nationality, organization, removed, excluded')
          .eq('company_id', companyId),
      ]);
      if (requestId !== loadRequestRef.current) return;
      if (dirRes.error) throw new Error(dirRes.error.message);
      if (!Array.isArray(attRes?.rows)) {
        throw new Error('근태 데이터를 불러오지 못했습니다');
      }
      const sorted = [...attRes.rows].sort((a, b) =>
        String(a.worker_name || '').localeCompare(String(b.worker_name || ''), 'ko')
      );
      setRows(sorted);
      setDirectory(dirRes.data || []);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      // eslint-disable-next-line no-console
      console.warn('[attendance/load]', err?.message || err);
      setRows([]);
      setLoadError('근태 데이터를 불러오지 못했습니다');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companyId = await getCompanyId();
        const summary = await loadUnmatchedNameSummary(supabase, companyId);
        if (!cancelled) setUnmatchedNames(summary);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[attendance/unmatched]', err?.message || err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rangeCheck.ok) {
      setPatternRows([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { rows: fetched } = await fetchAttendanceDaily({
          from: rangeStart,
          to: rangeEnd,
          columns: 'id,worker_name,work_date,judgment_rationale',
        });
        if (cancelled) return;
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
      if (filter === 'unconfirmed' && r.judgment !== 'unconfirmed') return false;
      if (filter === 'present' && r.judgment !== 'present') return false;
      if (filter === 'unreviewed' && r.reviewed === true) return false;
      if (filter === 'needs_review' && !hasNeedsReviewFlag(r.flags)) return false;
      return matchesOrganizationFilter(organizationByWorker.get(r.worker_name), organizationFilter);
    });
  }, [rows, filter, hiddenNames, includeHidden, organizationByWorker, organizationFilter]);

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

  async function saveRow(row, patch, changes = []) {
    setSavingId(row.id);
    try {
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
      const result = await patchAttendanceDaily({
        id: row.id,
        patch: payload,
        changes,
        source: 'screen',
        originalRule: row.judgment_rationale?.rule || null,
        editedBy: payload.reviewed_by || 'admin',
      });
      if (result.logWarning) {
        setLogWarning(`수정은 저장됐지만 이력 기록에 실패했습니다. ${result.logWarning}`);
      }
      setPatternToken((token) => token + 1);
      await load();
    } catch (err) {
      setError(err?.message || '저장 실패');
    } finally {
      setSavingId(null);
    }
  }

  function handleExport() {
    const excelRows = attendanceRowsForExcel(filtered, displayMap, organizationByWorker);
    exportToExcel(
      excelRows,
      `근태_${formatDateRangeForFilename(date, date)}.xlsx`
    );
  }

  const importColumns =
    'id, worker_name, work_date, shift, judgment, estimated_clock_in, estimated_clock_out, is_ot, reviewed, judgment_rationale';

  async function loadImportDailyRows(_companyId, dates, ids) {
    const sorted = dates.slice().sort();
    const params = {
      columns: importColumns.replace(/\s+/g, ''),
    };
    if (sorted.length) {
      params.from = sorted[0];
      params.to = sorted.at(-1);
    }
    if (ids.length) params.ids = ids.join(',');
    if (!params.from && !params.ids) return [];
    if (!params.from && params.ids) {
      // ids only — API 가 from 없이 ids 만으로 조회
      const { rows } = await fetchAttendanceDaily(params);
      return rows;
    }
    const { rows } = await fetchAttendanceDaily(params);
    return rows;
  }

  async function handleExcelFile(file) {
    if (!file) return;
    setImporting(true);
    setImportNotice('');
    setLogWarning('');
    setExcelPreview(null);
    setError(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets['기록'] || workbook.Sheets['근태'];
      if (!sheet) throw new Error('기록 시트가 없습니다.');
      const excelRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      const keys = collectExcelImportKeys(excelRows);
      if (!keys.dates.length && !keys.ids.length) throw new Error('근무일 열과 행ID가 없습니다.');
      const companyId = await getCompanyId();
      const dailyRows = await loadImportDailyRows(companyId, keys.dates, keys.ids);
      const planned = applyAttendanceExcelImport({
        excelRows,
        dailyRows,
        directory,
      });
      setExcelPreview({ companyId, planned });
    } catch (err) {
      setError(err?.message || '엑셀 반영 실패');
    } finally {
      setImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  }

  async function applyExcelPreview() {
    if (!excelPreview) return;
    const { planned } = excelPreview;
    setImporting(true);
    setLogWarning('');
    setError(null);
    try {
      const result = await applyAttendanceDailyBatch({
        updates: planned.updates,
        confirms: planned.confirms,
        source: 'excel',
        editedBy: 'excel',
      });
      if (result.logWarning) {
        setLogWarning(`근태는 반영됐지만 이력 기록에 실패했습니다. ${result.logWarning}`);
      }
      const errorLines = planned.errors.slice(0, 8).map((item) => `${item.row}행: ${item.message}`);
      setImportNotice(
        `반영 ${planned.updates.length + planned.confirms.length}건, 건너뜀 ${planned.skipped}건, 오류 ${planned.errors.length}건.${
          errorLines.length ? ` ${errorLines.join(' / ')}` : ''
        }`
      );
      setExcelPreview(null);
      setPatternToken((token) => token + 1);
      await load();
    } catch (err) {
      setError(err?.message || '엑셀 반영 실패');
    } finally {
      setImporting(false);
    }
  }

  async function downloadRangeExcel() {
    const check = describeAttendanceExportRange({ start: rangeStart, end: rangeEnd });
    if (!check.ok) return false;
    setRangeExporting(true);
    try {
      const { rows: fetched } = await fetchAttendanceDaily({
        from: rangeStart,
        to: rangeEnd,
      });
      const stored = [...(fetched || [])].sort(
        (a, b) =>
          String(a.work_date).localeCompare(String(b.work_date))
          || String(a.worker_name || '').localeCompare(String(b.worker_name || ''), 'ko')
      );
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
          organizationByWorker,
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
        <UnmatchedNamesNotice summary={unmatchedNames} />
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
          <select
            value={organizationFilter}
            onChange={(e) => setOrganizationFilter(e.target.value)}
            className={selectClass}
            aria-label="조직"
          >
            <option value="">조직 전체</option>
            {organizationChoices.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            <option value={ORGANIZATION_UNSET}>조직 미설정</option>
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
          {logWarning ? <p className="mt-1 text-xs text-warn">{logWarning}</p> : null}
          {excelPreview ? (
            <ExcelImportPreview
              planned={excelPreview.planned}
              applying={importing}
              onApply={applyExcelPreview}
              onClose={() => setExcelPreview(null)}
            />
          ) : null}
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

        {loadError ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center">
            <p className="text-sm text-danger">{loadError}</p>
            <button type="button" className={`${btnClass} mt-3`} onClick={load}>
              다시 시도
            </button>
          </div>
        ) : loading ? (
          <div className="text-sm text-muted">불러오는 중…</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface2 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">작업자</th>
                  <th className="px-3 py-2">조직</th>
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
                    organization={organizationByWorker.get(r.worker_name) || ''}
                    month={date.slice(0, 7)}
                    saving={savingId === r.id}
                    onSave={saveRow}
                  />
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-xs text-muted">
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

function ExcelImportPreview({ planned, applying, onApply, onClose }) {
  const canApply = planned.updates.length > 0 || planned.confirms.length > 0;
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-text">엑셀 반영 미리보기</div>
        <div className="text-xs text-muted">
          변경 {planned.updates.length}건 · 확정 {planned.confirms.length}건 · 건너뜀 {planned.skipped}건 · 오류 {planned.errors.length}건
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">행</th>
              <th className="px-2 py-1 font-medium">작업자</th>
              <th className="px-2 py-1 font-medium">근무일</th>
              <th className="px-2 py-1 font-medium">이전 → 이후</th>
              <th className="px-2 py-1 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {planned.preview.map((item) => (
              <tr key={`${item.row}-${item.status}`} className="border-t border-border align-top">
                <td className="px-2 py-1.5">{item.row}</td>
                <td className="px-2 py-1.5">{item.workerName || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{item.workDate || '—'}</td>
                <td className="px-2 py-1.5">
                  {item.changes.length
                    ? item.changes.map((change) => (
                        <div key={change.field}>
                          {attendanceFieldLabel(change.field)} {displayAttendanceValue(change.field, change.from)} → {displayAttendanceValue(change.field, change.to)}
                        </div>
                      ))
                    : '—'}
                </td>
                <td className={`px-2 py-1.5 ${item.status === 'error' ? 'text-danger' : 'text-muted'}`}>
                  {item.status === 'update' ? '변경' : item.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnClass} onClick={onApply} disabled={!canApply || applying}>
          {applying ? '적용 중…' : '적용'}
        </button>
        <button type="button" className={btnClass} onClick={onClose} disabled={applying}>
          닫기
        </button>
      </div>
    </div>
  );
}

function AttendanceRow({ row, displayName, organization, month, saving, onSave }) {
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
      <td className="p-0 align-middle font-medium text-text whitespace-nowrap">
        <Link
          href={attendanceCardPath(row.worker_name, month)}
          className="relative z-10 block px-3 py-2 hover:text-accent hover:underline"
        >
          {displayName}
        </Link>
      </td>
      <td className="px-3 py-2 text-xs text-muted">{organization || '미설정'}</td>
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
            }, changes);
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
