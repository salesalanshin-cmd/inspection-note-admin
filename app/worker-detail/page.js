'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReports } from '../../lib/useReports';
import {
  buildFrequentInspectionCompliance,
  buildWorkerDisplayNameMap,
  collectAllWorkerNames,
  formatClockMinutesAsHm,
  getDisplayName,
  getManualWorkerShift,
  getRemovedWorkerNames,
  getWorkDateForRecord,
  getWorkerClockPattern,
  isDocumentDutyEnabled,
  recordsForWorkerInWorkRange,
  resolveWorkerShiftInfo,
  tagInspectionStage,
} from '../../lib/analytics';
import { getKstDateParts, getKstHours, getKstMinutes, getKstSeconds } from '../../lib/kst';
import { PROCESS_FILTER_ALL, SHIFT_STAGES, defectLabel, docLabel, fivesLabel } from '../../lib/constants';
import {
  eachDateInRange,
  getRecentDaysRange,
  isDateRangeValid,
  isWeekend,
} from '../../lib/dateRange';
import PageHeader from '../../components/PageHeader';
import FilterToolbar from '../../components/FilterToolbar';
import DateRangePicker from '../../components/DateRangePicker';
import SignedImage from '../../components/SignedImage';
import StatCard from '../../components/StatCard';

const selectClass =
  'bg-surface border border-border text-sm text-text px-4 py-2 rounded-xl focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

const TYPE_TAG_CLASS = {
  frequent: 'bg-accentSoft text-accent',
  defect: 'bg-dangerSoft text-danger',
  fives: 'bg-goodSoft text-good',
  document: 'bg-warnSoft text-warn',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatMd(isoDate) {
  if (!isoDate) return '';
  const [, m, d] = isoDate.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function formatDateTimeSeconds(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const { year, month, day } = getKstDateParts(d);
  return `${year}-${pad(month + 1)}-${pad(day)} ${pad(getKstHours(d))}:${pad(getKstMinutes(d))}:${pad(getKstSeconds(d))}`;
}

function weekdayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('ko-KR', { weekday: 'short' });
}

function shiftLabel(shift) {
  if (shift === 'night') return '야간';
  if (shift === 'unknown') return '미정';
  return '주간';
}

function pct(done, expected) {
  if (!expected) return null;
  return Math.round((done / expected) * 100);
}

function workDateReason(createdAt, workDate) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const md = formatMd(workDate);
  const hh = pad(getKstHours(d));
  const mm = pad(getKstMinutes(d));
  const ss = pad(getKstSeconds(d));
  if (getKstHours(d) < 8) {
    return `KST 08:00 기준 근무일 ${md}에 귀속됨 (${hh}:${mm}:${ss}는 08:00 이전이므로 전날)`;
  }
  return `KST 08:00 기준 근무일 ${md}에 귀속됨`;
}

function collectActiveWorkerNames(defects, goods, fives, docs, workerDirectory) {
  const names = new Set(collectAllWorkerNames(defects, goods, fives, workerDirectory));
  for (const row of docs || []) {
    if (row.worker_name) names.add(row.worker_name);
  }
  const removed = getRemovedWorkerNames(workerDirectory);
  return [...names]
    .filter((name) => !removed.has(name))
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

function resolveNameFromQuery(raw, names, displayMap) {
  if (!raw) return '';
  if (names.includes(raw)) return raw;
  const byDisplay = names.find((name) => (displayMap.get(name) || name) === raw);
  return byDisplay || raw;
}

function extraLabel(item) {
  if (item.kind === 'frequent') return item.record.product_name || '양품';
  if (item.kind === 'defect') return defectLabel(item.record);
  if (item.kind === 'fives') return fivesLabel(item.record);
  if (item.kind === 'document') return docLabel(item.record);
  return '';
}

function TypeTag({ kind, label }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_TAG_CLASS[kind] || 'bg-surface2 text-muted'}`}
    >
      {label}
    </span>
  );
}

function WorkerPicker({ names, displayMap, value, onChange }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = !q
      ? names
      : names.filter((name) => {
          const display = (displayMap.get(name) || name).toLowerCase();
          return name.toLowerCase().includes(q) || display.includes(q);
        });
    if (value && !matched.includes(value)) return [value, ...matched];
    return matched;
  }, [names, displayMap, query, value]);

  return (
    <div className="flex min-w-[240px] flex-col gap-1.5">
      <label className="text-xs text-muted">작업자 검색/선택</label>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름·별칭 검색"
        className={inputClass}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">작업자 선택</option>
        {filtered.map((name) => {
          const display = displayMap.get(name) || name;
          return (
            <option key={name} value={name}>
              {display === name ? name : `${display} (${name})`}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function TimelineThumb({ item }) {
  if (!item.record.image_url) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface2 text-[10px] text-muted">
        없음
      </div>
    );
  }

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface2">
      <SignedImage
        url={item.record.image_url}
        alt={item.typeLabel}
        bucket={item.kind === 'defect' ? 'defect-images' : undefined}
        sizes="56px"
      />
    </div>
  );
}

function WorkerDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, error, defects, goods, fives, docs, workerDirectory } = useReports();
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(7));
  const [selectedName, setSelectedName] = useState(() => searchParams.get('name') || '');

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const workerNames = useMemo(
    () => collectActiveWorkerNames(defects, goods, fives, docs, workerDirectory),
    [defects, goods, fives, docs, workerDirectory]
  );

  useEffect(() => {
    const raw = searchParams.get('name') || '';
    setSelectedName(resolveNameFromQuery(raw, workerNames, displayMap));
  }, [searchParams, workerNames, displayMap]);

  function handleSelectWorker(name) {
    setSelectedName(name);
    const params = new URLSearchParams(searchParams.toString());
    if (name) params.set('name', name);
    else params.delete('name');
    const qs = params.toString();
    router.replace(qs ? `/worker-detail?${qs}` : '/worker-detail');
  }

  const directoryRow = useMemo(
    () => (workerDirectory || []).find((row) => row.worker_name === selectedName) || null,
    [workerDirectory, selectedName]
  );

  const workerRecords = useMemo(() => {
    if (!selectedName) {
      return { defects: [], goods: [], fives: [], docs: [], all: [] };
    }
    const workerDefects = (defects || []).filter((r) => r.worker_name === selectedName);
    const workerGoods = (goods || []).filter((r) => r.worker_name === selectedName);
    const workerFives = (fives || []).filter((r) => r.worker_name === selectedName);
    const workerDocs = (docs || []).filter((r) => r.worker_name === selectedName);
    return {
      defects: workerDefects,
      goods: workerGoods,
      fives: workerFives,
      docs: workerDocs,
      all: [...workerDefects, ...workerGoods, ...workerFives, ...workerDocs],
    };
  }, [selectedName, defects, goods, fives, docs]);

  const timeline = useMemo(() => {
    if (!selectedName || !isDateRangeValid(dateRange)) return [];

    const items = [];
    const pushItem = (record, kind, typeLabel) => {
      if (!record?.created_at) return;
      const workDate = getWorkDateForRecord(record.created_at);
      if (workDate < dateRange.start || workDate > dateRange.end) return;
      items.push({
        id: `${kind}-${record.id}`,
        kind,
        typeLabel,
        record,
        workDate,
        createdAt: record.created_at,
      });
    };

    for (const record of workerRecords.goods) {
      const { stage } = tagInspectionStage(record, workerDirectory, workerRecords.all);
      const stagePart = SHIFT_STAGES.includes(stage) ? stage.replace('품', '') : stage;
      pushItem(record, 'frequent', `자주검사-${stagePart}`);
    }
    for (const record of workerRecords.defects) {
      const { stage } = tagInspectionStage(record, workerDirectory, workerRecords.all);
      const suffix = SHIFT_STAGES.includes(stage) ? `-${stage.replace('품', '')}` : '';
      pushItem(record, 'defect', `불량기록${suffix}`);
    }
    for (const record of workerRecords.fives) {
      pushItem(record, 'fives', '3정5S');
    }
    for (const record of workerRecords.docs) {
      pushItem(record, 'document', '문서스캔');
    }

    const shiftCache = new Map();
    for (const item of items) {
      if (!shiftCache.has(item.workDate)) {
        shiftCache.set(
          item.workDate,
          resolveWorkerShiftInfo(
            selectedName,
            workerDirectory,
            workerRecords.all,
            new Date(`${item.workDate}T00:00:00`)
          )
        );
      }
      item.shiftInfo = shiftCache.get(item.workDate);
      item.reason = workDateReason(item.createdAt, item.workDate);
      item.extra = extraLabel(item);
    }

    items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return items;
  }, [selectedName, dateRange, workerRecords, workerDirectory]);

  const groupedTimeline = useMemo(() => {
    const groups = [];
    const byDate = new Map();
    for (const item of timeline) {
      if (!byDate.has(item.workDate)) {
        const group = { workDate: item.workDate, shiftInfo: item.shiftInfo, items: [] };
        byDate.set(item.workDate, group);
        groups.push(group);
      }
      byDate.get(item.workDate).items.push(item);
    }
    return groups.sort((a, b) => b.workDate.localeCompare(a.workDate));
  }, [timeline]);

  const summary = useMemo(() => {
    if (!selectedName || !isDateRangeValid(dateRange)) return null;

    const weekdayDates = eachDateInRange(dateRange).filter(
      (dateStr) => !isWeekend(new Date(`${dateStr}T00:00:00`))
    );

    const handlesFrequent = directoryRow?.handles_frequent_check ?? true;
    const handlesFives = directoryRow?.handles_fives ?? true;
    const handlesDocuments = isDocumentDutyEnabled(directoryRow);

    let frequentDone = 0;
    const frequentExpected = handlesFrequent ? weekdayDates.length * SHIFT_STAGES.length : 0;
    let fivesDone = 0;
    const fivesExpected = handlesFives ? weekdayDates.length : 0;
    let docsDone = 0;
    const docsExpected = handlesDocuments ? weekdayDates.length : 0;

    const shiftCounts = { day: 0, night: 0, unknown: 0 };
    const activityDates = new Set(timeline.map((item) => item.workDate));

    for (const dateStr of weekdayDates) {
      const workDate = new Date(`${dateStr}T00:00:00`);

      if (handlesFrequent) {
        const compliance = buildFrequentInspectionCompliance(
          defects,
          goods,
          fives,
          workDate,
          new Set(),
          workerDirectory,
          PROCESS_FILTER_ALL
        );
        const row = compliance.find((r) => r.worker_name === selectedName);
        if (row && !row.noData) {
          for (const stage of SHIFT_STAGES) {
            if (row[stage]?.done === true) frequentDone += 1;
          }
        }
      }

      if (handlesFives && recordsForWorkerInWorkRange(fives, selectedName, workDate).length > 0) {
        fivesDone += 1;
      }
      if (handlesDocuments && recordsForWorkerInWorkRange(docs, selectedName, workDate).length > 0) {
        docsDone += 1;
      }
    }

    for (const dateStr of activityDates) {
      const info = resolveWorkerShiftInfo(
        selectedName,
        workerDirectory,
        workerRecords.all,
        new Date(`${dateStr}T00:00:00`)
      );
      shiftCounts[info.shift] = (shiftCounts[info.shift] || 0) + 1;
    }

    const manualShift = getManualWorkerShift(workerDirectory, selectedName);
    const clockPattern = getWorkerClockPattern(
      fives,
      selectedName,
      new Date(`${dateRange.end}T00:00:00`),
      30,
      workerDirectory
    );

    const typeCounts = { frequent: 0, defect: 0, fives: 0, document: 0 };
    for (const item of timeline) typeCounts[item.kind] += 1;

    return {
      weekdayCount: weekdayDates.length,
      handlesFrequent,
      handlesFives,
      handlesDocuments,
      frequentDone,
      frequentExpected,
      fivesDone,
      fivesExpected,
      docsDone,
      docsExpected,
      shiftCounts,
      activityDayCount: activityDates.size,
      manualShift,
      clockPattern,
      typeCounts,
    };
  }, [
    selectedName,
    dateRange,
    directoryRow,
    defects,
    goods,
    fives,
    docs,
    workerDirectory,
    workerRecords,
    timeline,
  ]);

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;

  const displayName = selectedName ? getDisplayName(selectedName, workerDirectory) : '';
  const clock = summary?.clockPattern;

  return (
    <div>
      <PageHeader
        eyebrow="SETTINGS"
        title="작업자 상세 조회"
        description="근무일 귀속·근무조 판정·출퇴근 기준시각을 기록 단위로 확인합니다. 집계 화면의 이상값을 추적할 때 사용하세요."
      />

      <div className="space-y-5 p-4 md:p-8">
        <FilterToolbar
          primary={
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <WorkerPicker
                names={workerNames}
                displayMap={displayMap}
                value={selectedName}
                onChange={handleSelectWorker}
              />
              <div>
                <div className="mb-1.5 text-xs text-muted">기간 (근무일 기준)</div>
                <DateRangePicker value={dateRange} onChange={setDateRange} />
              </div>
            </div>
          }
        />

        {!selectedName ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
            작업자를 선택하면 해당 기간의 활동 타임라인이 표시됩니다.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold text-text">{displayName}</h2>
              {displayName !== selectedName ? (
                <span className="text-xs text-muted">원본 {selectedName}</span>
              ) : null}
              <span className="text-xs text-muted">
                {dateRange.start} ~ {dateRange.end} · 기록 {timeline.length}건 · 활동 근무일{' '}
                {summary?.activityDayCount ?? 0}일
              </span>
            </div>

            {summary ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="근무조 판정"
                  value={
                    summary.manualShift
                      ? `수동 ${shiftLabel(summary.manualShift)}`
                      : '자동판단'
                  }
                  sub={
                    summary.manualShift
                      ? `디렉터리 고정값. 활동일 주간 ${summary.shiftCounts.day} · 야간 ${summary.shiftCounts.night} · 미정 ${summary.shiftCounts.unknown}`
                      : `활동 근무일 기준 주간 ${summary.shiftCounts.day} · 야간 ${summary.shiftCounts.night} · 미정 ${summary.shiftCounts.unknown}`
                  }
                  tone={summary.manualShift ? 'accent' : 'default'}
                />
                <StatCard
                  label="출퇴근 패턴"
                  value={
                    !clock || clock.noData
                      ? '데이터없음'
                      : `${formatClockMinutesAsHm(clock.clockInMinutes)} / ${clock.shift === 'night' ? '익일 ' : ''}${formatClockMinutesAsHm(clock.clockOutMinutes)}`
                  }
                  sub={
                    !clock || clock.noData
                      ? '근무조가 미정이면 개인 기준시각을 학습하지 않습니다'
                      : `${shiftLabel(clock.shift)} · ${clock.isPersonalized ? '개인화' : '기본값'} · 3정5S 표본 ${clock.sampleSize}일 (종료일 기준 30일)`
                  }
                  tone={clock?.isPersonalized ? 'good' : 'muted'}
                />
                <StatCard
                  label="자주검사 완료율"
                  value={
                    summary.handlesFrequent
                      ? `${pct(summary.frequentDone, summary.frequentExpected) ?? 0}%`
                      : '해당없음'
                  }
                  sub={
                    summary.handlesFrequent
                      ? `평일 ${summary.weekdayCount}일 × 초·중·종 ${summary.frequentDone}/${summary.frequentExpected}`
                      : '자주검사 비담당'
                  }
                  tone={
                    !summary.handlesFrequent
                      ? 'muted'
                      : (pct(summary.frequentDone, summary.frequentExpected) ?? 0) >= 80
                        ? 'good'
                        : 'warn'
                  }
                />
                <StatCard
                  label="3정5S / 문서스캔"
                  value={
                    `${summary.handlesFives ? `${pct(summary.fivesDone, summary.fivesExpected) ?? 0}%` : '—'} / ${
                      summary.handlesDocuments ? `${pct(summary.docsDone, summary.docsExpected) ?? 0}%` : '—'
                    }`
                  }
                  sub={`3정5S ${summary.handlesFives ? `${summary.fivesDone}/${summary.fivesExpected}` : '비담당'} · 문서 ${summary.handlesDocuments ? `${summary.docsDone}/${summary.docsExpected}` : '비담당'} · 기록 자주${summary.typeCounts.frequent} 불량${summary.typeCounts.defect} 5S${summary.typeCounts.fives} 문서${summary.typeCounts.document}`}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 text-[11px] text-muted">
              <span className={`rounded-full px-2 py-0.5 ${TYPE_TAG_CLASS.frequent}`}>자주검사</span>
              <span className={`rounded-full px-2 py-0.5 ${TYPE_TAG_CLASS.defect}`}>불량기록</span>
              <span className={`rounded-full px-2 py-0.5 ${TYPE_TAG_CLASS.fives}`}>3정5S</span>
              <span className={`rounded-full px-2 py-0.5 ${TYPE_TAG_CLASS.document}`}>문서스캔</span>
              <span>근무일 그룹은 최신일 위, 그룹 안은 시간순(오래된 기록부터)입니다.</span>
            </div>

            {groupedTimeline.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
                선택한 기간에 기록이 없습니다. 근무일(08:00 경계) 기준으로 필터합니다.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedTimeline.map((group) => (
                  <section key={group.workDate} className="overflow-hidden rounded-xl border border-border bg-surface">
                    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface2 px-3 py-2">
                      <span className="text-sm font-semibold text-text">
                        {formatMd(group.workDate)} ({weekdayLabel(group.workDate)}) 근무일
                      </span>
                      <span className="text-xs text-muted">{group.workDate}</span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text">
                        {shiftLabel(group.shiftInfo?.shift)}
                        {group.shiftInfo?.shiftSource === 'manual' ? ' · 수동지정' : ' · 자동판단'}
                      </span>
                      <span className="text-[11px] text-muted">{group.items.length}건</span>
                    </header>
                    <ul className="divide-y divide-border">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                          <TimelineThumb item={item} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <TypeTag kind={item.kind} label={item.typeLabel} />
                              <span className="font-mono text-xs text-text">
                                {formatDateTimeSeconds(item.createdAt)}
                              </span>
                              {item.extra ? (
                                <span className="truncate text-[11px] text-muted">{item.extra}</span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-[11px] leading-relaxed text-muted">
                              소속 근무일 {formatMd(item.workDate)} · 그날 근무조 {shiftLabel(item.shiftInfo?.shift)}
                              {item.shiftInfo?.shiftSource === 'manual' ? '(수동)' : '(자동)'}
                              <span className="mx-1.5 text-border">·</span>
                              {item.reason}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function WorkerDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>}>
      <WorkerDetailContent />
    </Suspense>
  );
}
