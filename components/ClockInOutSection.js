'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  buildClockInOutStatus,
  buildClockInOutWeekSummary,
  buildWorkerDisplayNameMap,
  isSameCalendarDay,
} from '../lib/analytics';
import StatusDot from './StatusDot';
import MobileListCard, { MobileCardField } from './MobileListCard';

const TABS = [
  { id: 'today', label: '오늘 현황' },
  { id: 'summary', label: '최근 7일 요약' },
];

const COLLAPSED_COUNT = 5;

const dayNavBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

const tabBtnClass =
  'min-h-[44px] flex-1 rounded-xl px-4 py-2 text-sm font-medium transition-colors md:min-h-0 md:flex-none';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWorkDate(date) {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function clockBaselineLabel(row) {
  const base = `${row.clockInTime} / ${row.clockOutTime}`;
  return row.isPersonalized ? base : `${base}(기본값)`;
}

function formatRate(rate) {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function SelectionCheckbox({ checked, onChange, label }) {
  return (
    <label
      className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="h-5 w-5 accent-accent"
      />
    </label>
  );
}

function OverallBadge({ isWarning }) {
  if (isWarning) {
    return (
      <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
        미준수
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
      정상
    </span>
  );
}

function SelectionToolbar({
  performanceCount,
  warningCount,
  selectedCount,
  onSelectAll,
  onSelectWarning,
  onClear,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSelectAll}
        disabled={performanceCount === 0}
        className={actionBtnClass}
      >
        전체선택
      </button>
      <button
        type="button"
        onClick={onSelectWarning}
        disabled={warningCount === 0}
        className={actionBtnClass}
      >
        미준수자만 선택 ({warningCount})
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={selectedCount === 0}
        className={actionBtnClass}
      >
        선택 해제
      </button>
    </div>
  );
}

/** daily-performance StageMissPopover 와 동일 스타일 */
function MissListPopover({ section, displayMap, onClose }) {
  if (!section) return null;

  const displayNames = section.names.map((n) => displayMap?.get(n) || n);
  const title =
    displayNames.length === 0
      ? section.label
      : `${section.label} (${displayNames.length}명)`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-xs rounded-xl border border-border bg-surface p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="clock-miss-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-lg p-1 text-muted transition-colors hover:bg-surface2 hover:text-text"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 id="clock-miss-title" className="pr-6 text-sm font-medium text-text">
          {title}
        </h3>
        {displayNames.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-good">전원 완료</p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-text">{displayNames.join(', ')}</p>
        )}
      </div>
    </div>
  );
}

function ClockProgressSummaryBar({ cards, onOpenMissList }) {
  if (cards.every((c) => c.target === 0)) {
    return (
      <div className="mb-2 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs text-muted">
        표시할 출퇴근 대상자가 없습니다
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-border bg-surface px-2 py-1.5">
      <p className="mb-1.5 text-center text-[10px] font-medium text-muted sm:text-left">
        출퇴근 완료 현황
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {cards.map((card) => {
          const pct =
            card.target > 0 ? Math.round((card.completed / card.target) * 100) : 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() =>
                onOpenMissList({
                  label: card.missLabel,
                  names: card.missNames,
                })
              }
              className="cursor-pointer rounded-lg border border-border bg-surface2/50 px-2 py-1.5 text-left transition-colors hover:border-accent/40 hover:bg-surface2"
            >
              <div className="flex items-baseline justify-between gap-0.5">
                <span className="text-[11px] font-medium text-text">{card.title}</span>
                <span className="whitespace-nowrap text-[9px] text-muted">
                  완료 {card.completed} / 대상 {card.target}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-goodSoft">
                <div
                  className="h-full rounded-full bg-good transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpandToggle({ expanded, total, onToggle }) {
  if (total <= COLLAPSED_COUNT) return null;
  return (
    <div className="border-t border-border px-4 py-3">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        aria-expanded={expanded}
        className="inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        {expanded ? (
          <>
            접기
            <ChevronUp className="h-4 w-4" strokeWidth={2} />
          </>
        ) : (
          <>
            펼치기 (전체 {total}명)
            <ChevronDown className="h-4 w-4" strokeWidth={2} />
          </>
        )}
      </button>
    </div>
  );
}

/**
 * 3정5S 페이지용 출퇴근 현황 섹션
 * (일일 실적 관리: 날짜 네비 → 탭 → 진행률 카드 → 표)
 */
export default function ClockInOutSection({ fives, workerDirectory }) {
  const [activeTab, setActiveTab] = useState('today');
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(new Set());
  const [listExpanded, setListExpanded] = useState(false);
  const [missSection, setMissSection] = useState(null);

  const displayMap = useMemo(
    () => buildWorkerDisplayNameMap(workerDirectory),
    [workerDirectory]
  );

  const isToday = isSameCalendarDay(date, now);

  const todayRows = useMemo(
    () => buildClockInOutStatus(fives, workerDirectory, date, now),
    [fives, workerDirectory, date, now]
  );

  const weekSummary = useMemo(
    () => buildClockInOutWeekSummary(fives, workerDirectory, date, 7),
    [fives, workerDirectory, date]
  );

  const sortedToday = useMemo(() => {
    return [...todayRows].sort((a, b) => {
      if (a.overallStatus !== b.overallStatus) {
        return a.overallStatus === 'warning' ? -1 : 1;
      }
      return a.worker_name.localeCompare(b.worker_name, 'ko');
    });
  }, [todayRows]);

  const sortedWeek = useMemo(() => weekSummary.workers, [weekSummary.workers]);

  const todayProgressCards = useMemo(() => {
    let inDone = 0;
    let inTarget = 0;
    let outDone = 0;
    let outTarget = 0;
    const inMiss = [];
    const outMiss = [];
    for (const row of todayRows) {
      if (row.clockIn.status !== 'pending') {
        inTarget += 1;
        if (row.clockIn.status === 'done') inDone += 1;
        else inMiss.push(row.worker_name);
      }
      if (row.clockOut.status !== 'pending') {
        outTarget += 1;
        if (row.clockOut.status === 'done') outDone += 1;
        else outMiss.push(row.worker_name);
      }
    }
    return [
      {
        key: 'in',
        title: '출근 완료 현황',
        completed: inDone,
        target: inTarget,
        missLabel: '출근 미체크자',
        missNames: inMiss,
      },
      {
        key: 'out',
        title: '퇴근 완료 현황',
        completed: outDone,
        target: outTarget,
        missLabel: '퇴근 미체크자',
        missNames: outMiss,
      },
    ];
  }, [todayRows]);

  const weekProgressCards = useMemo(() => {
    const inMiss = weekSummary.workers
      .filter((w) => w.clockInExpected > 0 && w.clockInDone < w.clockInExpected)
      .map((w) => w.worker_name);
    const outMiss = weekSummary.workers
      .filter((w) => w.clockOutExpected > 0 && w.clockOutDone < w.clockOutExpected)
      .map((w) => w.worker_name);
    return [
      {
        key: 'in',
        title: '출근 완료 현황',
        completed: weekSummary.clockIn.completed,
        target: weekSummary.clockIn.target,
        missLabel: '출근 미준수자 (최근 7일)',
        missNames: inMiss,
      },
      {
        key: 'out',
        title: '퇴근 완료 현황',
        completed: weekSummary.clockOut.completed,
        target: weekSummary.clockOut.target,
        missLabel: '퇴근 미준수자 (최근 7일)',
        missNames: outMiss,
      },
    ];
  }, [weekSummary]);

  const warningNames = useMemo(() => {
    if (activeTab === 'today') {
      return todayRows
        .filter((r) => r.overallStatus === 'warning')
        .map((r) => r.worker_name);
    }
    return weekSummary.workers
      .filter((r) => r.overallStatus === 'warning')
      .map((r) => r.worker_name);
  }, [activeTab, todayRows, weekSummary.workers]);

  const fullList = activeTab === 'today' ? sortedToday : sortedWeek;

  function handleToggleListExpanded() {
    setListExpanded((prev) => !prev);
  }

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
    setSelected(new Set());
    setListExpanded(false);
    setNow(new Date());
  }

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(fullList.map((r) => r.worker_name)));
  }

  function selectWarningOnly() {
    setSelected(new Set(warningNames));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const dateNav = (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        onClick={() => shiftDay(-1)}
        className={`${dayNavBtnClass} flex-1 md:flex-none`}
        aria-label="이전 날"
      >
        ◀ 이전날
      </button>
      <span className="min-w-0 flex-1 text-center text-sm font-medium text-text md:min-w-[10rem]">
        {formatWorkDate(date)}
        {isToday ? (
          <span className="ml-1 text-xs font-normal text-muted">(오늘)</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => shiftDay(1)}
        className={`${dayNavBtnClass} flex-1 md:flex-none`}
        aria-label="다음 날"
      >
        다음날 ▶
      </button>
    </div>
  );

  const tabBar = (
    <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 md:inline-flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => {
            setActiveTab(tab.id);
            setSelected(new Set());
            setListExpanded(false);
          }}
          className={`${tabBtnClass} ${
            activeTab === tab.id
              ? 'bg-accentSoft text-accent'
              : 'text-muted hover:bg-surface2 hover:text-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <section>
      {/* daily-performance 와 동일: 날짜 네비(상단) → 탭 → 본문 */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-bg px-4 py-3 md:-mx-8 md:px-8">
        {dateNav}
      </div>

      <div className="mb-3 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium text-text">출퇴근 현황</h2>
        {tabBar}
      </div>

      {activeTab === 'today' ? (
        <>
          <ClockProgressSummaryBar
            cards={todayProgressCards}
            onOpenMissList={setMissSection}
          />

          <div className="mb-3">
            <SelectionToolbar
              performanceCount={fullList.length}
              warningCount={warningNames.length}
              selectedCount={selected.size}
              onSelectAll={selectAll}
              onSelectWarning={selectWarningOnly}
              onClear={clearSelection}
            />
          </div>

          <div className="rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
            <div className="md:hidden">
              {fullList.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted">
                  표시할 작업자가 없습니다.
                </div>
              ) : (
                fullList.map((row, index) => {
                  if (!listExpanded && index >= COLLAPSED_COUNT) return null;
                  const isWarning = row.overallStatus === 'warning';
                  const isSelected = selected.has(row.worker_name);
                  return (
                    <MobileListCard
                      key={row.worker_name}
                      header={displayMap.get(row.worker_name) || row.worker_name}
                      badge={<OverallBadge isWarning={isWarning} />}
                      leading={
                        <SelectionCheckbox
                          checked={isSelected}
                          onChange={() => toggle(row.worker_name)}
                          label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                        />
                      }
                      className={isWarning ? 'border-l-2 border-l-danger' : ''}
                    >
                      <MobileCardField label="출근">
                        <StatusDot status={row.clockIn.status} />
                      </MobileCardField>
                      <MobileCardField label="퇴근">
                        <StatusDot status={row.clockOut.status} />
                      </MobileCardField>
                      <MobileCardField label="개인 기준시각" className="col-span-2">
                        <span className="text-xs text-muted">{clockBaselineLabel(row)}</span>
                      </MobileCardField>
                    </MobileListCard>
                  );
                })
              )}
            </div>

            <table className="hidden w-full border-separate border-spacing-0 text-sm md:table">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="w-10 border-b border-border bg-surface2 px-4 py-3" />
                  <th className="border-b border-border bg-surface2 px-4 py-3">작업자</th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">출근</th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">퇴근</th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">
                    개인 기준시각
                  </th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">종합상태</th>
                </tr>
              </thead>
              <tbody>
                {fullList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted">
                      표시할 작업자가 없습니다.
                    </td>
                  </tr>
                ) : (
                  fullList.map((row, index) => {
                    const isWarning = row.overallStatus === 'warning';
                    const isSelected = selected.has(row.worker_name);
                    const collapsedAway = !listExpanded && index >= COLLAPSED_COUNT;
                    return (
                      <tr
                        key={row.worker_name}
                        className={`border-b border-border transition-colors last:border-0 ${
                          collapsedAway ? 'hidden' : 'table-row'
                        }`}
                      >
                        <td
                          className={`px-4 py-3 ${
                            isWarning
                              ? 'border-l-2 border-danger'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggle(row.worker_name)}
                            label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-text">
                          {displayMap.get(row.worker_name) || row.worker_name}
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot status={row.clockIn.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot status={row.clockOut.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {clockBaselineLabel(row)}
                        </td>
                        <td className="px-4 py-3">
                          <OverallBadge isWarning={isWarning} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <ExpandToggle
              expanded={listExpanded}
              total={fullList.length}
              onToggle={handleToggleListExpanded}
            />
          </div>
        </>
      ) : (
        <>
          <ClockProgressSummaryBar
            cards={weekProgressCards}
            onOpenMissList={setMissSection}
          />

          <div className="mb-3">
            <SelectionToolbar
              performanceCount={fullList.length}
              warningCount={warningNames.length}
              selectedCount={selected.size}
              onSelectAll={selectAll}
              onSelectWarning={selectWarningOnly}
              onClear={clearSelection}
            />
          </div>

          <div className="rounded-xl bg-surface shadow-card max-md:rounded-none max-md:bg-transparent max-md:shadow-none">
            <div className="md:hidden">
              {fullList.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted">
                  표시할 작업자가 없습니다.
                </div>
              ) : (
                fullList.map((row, index) => {
                  if (!listExpanded && index >= COLLAPSED_COUNT) return null;
                  const isWarning = row.overallStatus === 'warning';
                  const isSelected = selected.has(row.worker_name);
                  return (
                    <MobileListCard
                      key={row.worker_name}
                      header={displayMap.get(row.worker_name) || row.worker_name}
                      badge={<OverallBadge isWarning={isWarning} />}
                      leading={
                        <SelectionCheckbox
                          checked={isSelected}
                          onChange={() => toggle(row.worker_name)}
                          label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                        />
                      }
                      className={isWarning ? 'border-l-2 border-l-danger' : ''}
                    >
                      <MobileCardField label="출근 준수율">
                        <span className="text-sm text-text">
                          {formatRate(row.clockInRate)}
                          <span className="ml-1 text-xs text-muted">
                            ({row.clockInDone}/{row.clockInExpected})
                          </span>
                        </span>
                      </MobileCardField>
                      <MobileCardField label="퇴근 준수율">
                        <span className="text-sm text-text">
                          {formatRate(row.clockOutRate)}
                          <span className="ml-1 text-xs text-muted">
                            ({row.clockOutDone}/{row.clockOutExpected})
                          </span>
                        </span>
                      </MobileCardField>
                      <MobileCardField label="개인 기준시각" className="col-span-2">
                        <span className="text-xs text-muted">{clockBaselineLabel(row)}</span>
                      </MobileCardField>
                    </MobileListCard>
                  );
                })
              )}
            </div>

            <table className="hidden w-full border-separate border-spacing-0 text-sm md:table">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="w-10 border-b border-border bg-surface2 px-4 py-3" />
                  <th className="border-b border-border bg-surface2 px-4 py-3">작업자</th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">
                    출근 준수율
                  </th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">
                    퇴근 준수율
                  </th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">
                    개인 기준시각
                  </th>
                  <th className="border-b border-border bg-surface2 px-4 py-3">종합상태</th>
                </tr>
              </thead>
              <tbody>
                {fullList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted">
                      표시할 작업자가 없습니다.
                    </td>
                  </tr>
                ) : (
                  fullList.map((row, index) => {
                    const isWarning = row.overallStatus === 'warning';
                    const isSelected = selected.has(row.worker_name);
                    const collapsedAway = !listExpanded && index >= COLLAPSED_COUNT;
                    return (
                      <tr
                        key={row.worker_name}
                        className={`border-b border-border transition-colors last:border-0 ${
                          collapsedAway ? 'hidden' : 'table-row'
                        }`}
                      >
                        <td
                          className={`px-4 py-3 ${
                            isWarning
                              ? 'border-l-2 border-danger'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggle(row.worker_name)}
                            label={`${displayMap.get(row.worker_name) || row.worker_name} 선택`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-text">
                          {displayMap.get(row.worker_name) || row.worker_name}
                        </td>
                        <td className="px-4 py-3 text-text">
                          {formatRate(row.clockInRate)}
                          <span className="ml-1 text-xs text-muted">
                            ({row.clockInDone}/{row.clockInExpected})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text">
                          {formatRate(row.clockOutRate)}
                          <span className="ml-1 text-xs text-muted">
                            ({row.clockOutDone}/{row.clockOutExpected})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {clockBaselineLabel(row)}
                        </td>
                        <td className="px-4 py-3">
                          <OverallBadge isWarning={isWarning} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <ExpandToggle
              expanded={listExpanded}
              total={fullList.length}
              onToggle={handleToggleListExpanded}
            />
          </div>
        </>
      )}

      <MissListPopover
        section={missSection}
        displayMap={displayMap}
        onClose={() => setMissSection(null)}
      />
    </section>
  );
}
