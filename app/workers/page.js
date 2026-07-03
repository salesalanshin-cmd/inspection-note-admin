'use client';

import { useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildWorkerStats,
  buildWorkerFrequentSummary,
  buildWorkerFivesSummary,
  buildWorkerLastActivityMap,
  getExcludedWorkerNames,
} from '../../lib/analytics';
import { INSPECTION_CYCLE_DAYS, FIVES_CYCLE_DAYS } from '../../lib/constants';
import PageHeader from '../../components/PageHeader';

const SUMMARY_DAYS = 7;

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

function Badge({ ok, okLabel, badLabel }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
        ok ? 'bg-goodSoft text-good' : 'bg-dangerSoft text-danger'
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

function FrequentCountCell({ completedCount, expectedCount }) {
  if (!expectedCount) {
    return <span className="text-muted">데이터 없음</span>;
  }
  return (
    <span className="text-text">
      {completedCount}/{expectedCount}
    </span>
  );
}

function CompletionRateCell({ rate }) {
  if (rate == null) {
    return <span className="text-muted">-</span>;
  }

  const pct = rate * 100;
  const toneClass =
    pct >= 90 ? 'text-good' : pct >= 70 ? 'text-warn' : 'text-danger';

  return <span className={toneClass}>{pct.toFixed(0)}%</span>;
}

function RecentActivityCell({ lastFrequentCheckAt, lastFivesAt }) {
  const pad = (n) => String(n).padStart(2, '0');

  function fmtLine(label, iso) {
    if (!iso) {
      return (
        <div className="text-[11px]">
          <span className="text-muted">{label} · </span>
          <span className="text-muted">기록 없음</span>
        </div>
      );
    }
    const d = new Date(iso);
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return (
      <div className="text-[11px]">
        <span className="text-muted">{label} · </span>
        <span className="text-text">
          {md} {hm}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {fmtLine('자주검사', lastFrequentCheckAt)}
      {fmtLine('3정5S', lastFivesAt)}
    </div>
  );
}

export default function WorkersPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();
  const [endDate, setEndDate] = useState(() => startOfDay(new Date()));

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const workers = useMemo(() => {
    const stats = buildWorkerStats(defects, goods, fives, excludedNames);
    const frequentMap = buildWorkerFrequentSummary(
      defects,
      goods,
      fives,
      workerDirectory,
      endDate,
      SUMMARY_DAYS,
      excludedNames
    );
    const fivesMap = buildWorkerFivesSummary(
      fives,
      workerDirectory,
      endDate,
      SUMMARY_DAYS,
      excludedNames
    );
    const activityMap = buildWorkerLastActivityMap(defects, goods, fives);

    return stats.map((w) => {
      const frequent = frequentMap.get(w.worker_name) ?? {
        completedCount: 0,
        expectedCount: 0,
        completionRate: null,
      };
      const fivesSummary = fivesMap.get(w.worker_name) ?? {
        completedDays: 0,
        totalDays: SUMMARY_DAYS,
        completionRate: 0,
      };
      const activity = activityMap.get(w.worker_name) ?? {
        lastFrequentCheckAt: w.lastInspectionAt,
        lastFivesAt: w.lastFivesAt,
      };
      return {
        ...w,
        ...frequent,
        fivesCompletedDays: fivesSummary.completedDays,
        fivesTotalDays: fivesSummary.totalDays,
        fivesCompletionRate: fivesSummary.completionRate,
        lastFrequentCheckAt: activity.lastFrequentCheckAt,
        lastFivesAt: activity.lastFivesAt,
      };
    });
  }, [defects, goods, fives, workerDirectory, excludedNames, endDate]);

  const alertTargets = useMemo(
    () => workers.filter((w) => w.needsAlert),
    [workers]
  );

  function shiftDay(delta) {
    setEndDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="WORKERS"
        title="작업자 현황"
        description={`정기검사 기준 ${INSPECTION_CYCLE_DAYS}일 · 3정5S 기준 ${FIVES_CYCLE_DAYS}일. 기준일 초과 시 미준수로 표시됩니다.`}
      />

      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
            aria-label="이전 날"
          >
            ◀ 이전날
          </button>
          <span className="text-sm font-medium text-text min-w-[10rem] text-center">
            {formatWorkDate(endDate)}
          </span>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
            aria-label="다음 날"
          >
            다음날 ▶
          </button>
        </div>

        {alertTargets.length > 0 && (
          <div className="bg-dangerSoft rounded-xl p-4">
            <div className="text-sm text-danger font-medium mb-1">
              알림 발송 대상 {alertTargets.length}명
            </div>
            <div className="text-xs text-muted">
              {alertTargets.map((w) => w.worker_name).join(' · ')}
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          자주검사/3정5S 완료율은 선택한 날짜 기준 최근 {SUMMARY_DAYS}일(조 미정인 날 제외) 집계입니다.
        </p>

        <div className="bg-surface rounded-xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted bg-surface2">
                <th className="px-4 py-3">작업자</th>
                <th className="px-4 py-3">불량 보고수</th>
                <th className="px-4 py-3">자주검사 횟수(N/21)</th>
                <th className="px-4 py-3">자주검사 완료율(%)</th>
                <th className="px-4 py-3">3정5S 완료율(%)</th>
                <th className="px-4 py-3">최근 수행 활동</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.worker_name} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-text font-medium">{w.worker_name}</td>
                  <td className="px-4 py-3 text-danger">{w.defectCount}</td>
                  <td className="px-4 py-3">
                    <FrequentCountCell
                      completedCount={w.completedCount}
                      expectedCount={w.expectedCount}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <CompletionRateCell rate={w.completionRate} />
                  </td>
                  <td className="px-4 py-3">
                    <CompletionRateCell rate={w.fivesCompletionRate} />
                  </td>
                  <td className="px-4 py-3">
                    <RecentActivityCell
                      lastFrequentCheckAt={w.lastFrequentCheckAt}
                      lastFivesAt={w.lastFivesAt}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Badge ok={!w.inspectionOverdue} okLabel="검사 정상" badLabel="검사 지연" />
                      <Badge ok={!w.fivesOverdue} okLabel="5S 정상" badLabel="5S 지연" />
                    </div>
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted text-xs">
                    기록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          ※ 작업자 마스터에 등록되지 않았거나 제외(관리자)로 표시된 작업자는 나타나지 않습니다.
        </p>
      </div>
    </div>
  );
}
