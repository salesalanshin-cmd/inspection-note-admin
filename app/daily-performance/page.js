'use client';

import { useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import { buildDailyPerformance } from '../../lib/analytics';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import FilterToolbar from '../../components/FilterToolbar';
import NotifyReviewModal from '../../components/NotifyReviewModal';

const dayNavBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0';

const actionBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

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

function StatusCell({ cell }) {
  if (!cell || cell.status === 'na') {
    return <span className="text-xs text-muted">해당없음</span>;
  }
  if (cell.status === 'ok') {
    return (
      <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
        완료
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
        미실시
      </span>
      {cell.detail ? <span className="text-[11px] text-muted">{cell.detail}</span> : null}
    </span>
  );
}

export default function DailyPerformancePage() {
  const { loading, error, defects, goods, fives, docs, workerDirectory } = useReports();
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);

  const performance = useMemo(
    () => buildDailyPerformance(defects, goods, fives, docs, workerDirectory, date),
    [defects, goods, fives, docs, workerDirectory, date]
  );

  const warningNames = useMemo(
    () => performance.filter((p) => p.overallStatus === 'warning').map((p) => p.worker_name),
    [performance]
  );

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
    setSelected(new Set());
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
    setSelected(new Set(performance.map((p) => p.worker_name)));
  }

  function selectWarningOnly() {
    setSelected(new Set(warningNames));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedRows = useMemo(
    () => performance.filter((p) => selected.has(p.worker_name)),
    [performance, selected]
  );

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="DAILY PERFORMANCE"
        title="일일 실적 관리"
        description="작업자별 담당 업무(자주검사·3정5S·문서스캔) 이행 현황을 하루 단위로 확인하고, 미준수자에게 안내 문구를 준비합니다."
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-4 md:px-8">
        <PageTableShell
          toolbar={
            <FilterToolbar
              primary={
                <div className="flex w-full items-center gap-2 md:w-auto">
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
              }
              aside={
                <>
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={performance.length === 0}
                    className={actionBtnClass}
                  >
                    전체선택
                  </button>
                  <button
                    type="button"
                    onClick={selectWarningOnly}
                    disabled={warningNames.length === 0}
                    className={actionBtnClass}
                  >
                    미준수자만 선택 ({warningNames.length})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={selected.size === 0}
                    className={actionBtnClass}
                  >
                    선택 해제
                  </button>
                </>
              }
            />
          }
          table={
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">작업자</th>
                  <th className="px-4 py-3">자주검사</th>
                  <th className="px-4 py-3">3정5S</th>
                  <th className="px-4 py-3">문서스캔</th>
                  <th className="px-4 py-3">불량보고수</th>
                  <th className="px-4 py-3">종합상태</th>
                </tr>
              </thead>
              <tbody>
                {performance.map((row) => {
                  const isWarning = row.overallStatus === 'warning';
                  const isSelected = selected.has(row.worker_name);
                  return (
                    <tr key={row.worker_name} className="border-b border-border last:border-0">
                      <td
                        className={`px-4 py-3 ${
                          isWarning ? 'border-l-2 border-danger' : 'border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(row.worker_name)}
                          aria-label={`${row.worker_name} 선택`}
                          className="h-4 w-4 accent-accent"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-text">{row.worker_name}</td>
                      <td className="px-4 py-3">
                        <StatusCell cell={row.frequentCheck} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusCell cell={row.fives} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusCell cell={row.documents} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${
                            row.defectCount > 0 ? 'text-danger' : 'text-muted'
                          }`}
                        >
                          {row.defectCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isWarning ? (
                          <span className="inline-block rounded-full bg-dangerSoft px-2.5 py-0.5 text-xs font-medium text-danger">
                            미준수
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-goodSoft px-2.5 py-0.5 text-xs font-medium text-good">
                            정상
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {performance.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted">
                      표시할 작업자가 없습니다. 작업자 관리에서 담당 업무를 설정하세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          }
          footer={
            <p className="text-xs text-muted">
              담당 업무는 작업자 관리에서 설정하며, 담당하지 않는 업무는 &quot;해당없음&quot;으로 표시됩니다.
              종합상태는 담당 업무 중 하나라도 미완료면 미준수로 판정합니다.
            </p>
          }
        />
      </div>

      {selected.size > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white shadow-card transition-opacity hover:opacity-90"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
            선택 {selected.size}명 알림 발송 검토
          </button>
        </div>
      ) : null}

      {reviewOpen ? (
        <NotifyReviewModal rows={selectedRows} onClose={() => setReviewOpen(false)} />
      ) : null}
    </div>
  );
}
