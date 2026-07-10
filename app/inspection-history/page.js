'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useReports } from '../../lib/useReports';
import {
  buildFrequentInspectionCompliance,
  complianceStagesForDots,
  getExcludedWorkerNames,
  groupComplianceByShift,
} from '../../lib/analytics';
import PageHeader from '../../components/PageHeader';
import PageTableShell from '../../components/PageTableShell';
import TrafficLightDots from '../../components/TrafficLightDots';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerHistoryModal from '../../components/WorkerHistoryModal';

const dayNavBtnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text md:min-h-0';

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

function ShiftBadge({ shift, shiftSource }) {
  if (shift === 'unknown') {
    return (
      <span className="inline-block rounded-full bg-warnSoft px-2.5 py-0.5 text-xs font-medium text-warn">
        미정
      </span>
    );
  }

  const isDay = shift === 'day';
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
          isDay ? 'bg-accentSoft text-accent' : 'bg-surface2 text-text'
        }`}
      >
        {isDay ? '주간' : '야간'}
      </span>
      {shiftSource === 'manual' ? (
        <span className="text-[11px] text-muted" title="작업자 관리에서 고정 설정됨">
          🔒
        </span>
      ) : null}
    </span>
  );
}

function OverallBadge({ row }) {
  if (row.noData) {
    return (
      <span className="inline-block rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium text-muted">
        데이터 없음
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        row.allOk ? 'bg-goodSoft text-good' : 'bg-dangerSoft text-danger'
      }`}
    >
      {row.allOk ? '정상' : '미준수'}
    </span>
  );
}

export default function InspectionHistoryPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [modalWorker, setModalWorker] = useState(null);

  const excludedNames = useMemo(
    () => getExcludedWorkerNames(workerDirectory),
    [workerDirectory]
  );

  const compliance = useMemo(
    () =>
      buildFrequentInspectionCompliance(
        defects,
        goods,
        fives,
        date,
        excludedNames,
        workerDirectory
      ),
    [defects, goods, fives, date, excludedNames, workerDirectory]
  );

  const groupedCompliance = useMemo(() => groupComplianceByShift(compliance), [compliance]);

  function shiftDay(delta) {
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return startOfDay(next);
    });
  }

  const clickableRowClass =
    'cursor-pointer transition-colors hover:bg-surface2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30';

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="INSPECTION HISTORY"
        title="자주검사 이력조회"
        description="오늘 자주검사 현황을 한눈에 확인하고, 작업자를 클릭하면 개별 촬영 이력을 볼 수 있습니다"
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-4 md:px-8">
        <div className="mb-4 rounded-xl border border-accent/30 bg-accentSoft px-4 py-3 text-sm text-text">
          이 화면은{' '}
          <Link href="/frequent-check" className="font-medium text-accent underline-offset-2 hover:underline">
            자주검사 현황
          </Link>
          에 통합되었습니다. 작업자를 클릭하면 동일한 촬영 이력 팝업이 열립니다. 아래는 참고용입니다.
        </div>

        <PageTableShell
          toolbar={
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
          table={
            <>
              <div className="md:hidden">
                {groupedCompliance.map((group) => (
                  <Fragment key={group.shift}>
                    <div className="mb-2 mt-1 px-1 text-xs font-medium text-muted">
                      {group.label} ({group.rows.length}명)
                    </div>
                    {group.rows.map((row) => (
                      <MobileListCard
                        key={row.worker_name}
                        header={row.worker_name}
                        badge={<OverallBadge row={row} />}
                        className={clickableRowClass}
                        onClick={() => setModalWorker(row.worker_name)}
                      >
                        <MobileCardField label="조">
                          <ShiftBadge shift={row.shift} shiftSource={row.shiftSource} />
                        </MobileCardField>
                        <MobileCardField label="자주검사" className="col-span-2">
                          <TrafficLightDots stages={complianceStagesForDots(row)} />
                        </MobileCardField>
                      </MobileListCard>
                    ))}
                  </Fragment>
                ))}
                {compliance.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted">기록된 작업자가 없습니다</div>
                ) : null}
              </div>

              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="sticky top-0 z-[1] border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">작업자</th>
                    <th className="px-4 py-3">조</th>
                    <th className="px-4 py-3">자주검사</th>
                    <th className="px-4 py-3">종합판정</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedCompliance.map((group) => (
                    <Fragment key={group.shift}>
                      <tr className="border-b border-border bg-surface2/60">
                        <td colSpan={4} className="px-4 pb-1 pt-4 text-xs font-medium text-muted">
                          {group.label} ({group.rows.length}명)
                        </td>
                      </tr>
                      {group.rows.map((row) => (
                        <tr
                          key={row.worker_name}
                          className={`border-b border-border last:border-0 ${clickableRowClass}`}
                          onClick={() => setModalWorker(row.worker_name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setModalWorker(row.worker_name);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                        >
                          <td className="px-4 py-3 font-medium text-text">{row.worker_name}</td>
                          <td className="px-4 py-3">
                            <ShiftBadge shift={row.shift} shiftSource={row.shiftSource} />
                          </td>
                          <td className="px-4 py-3">
                            <TrafficLightDots stages={complianceStagesForDots(row)} />
                          </td>
                          <td className="px-4 py-3">
                            <OverallBadge row={row} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {compliance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-xs text-muted">
                        기록된 작업자가 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          }
        />
      </div>

      {modalWorker ? (
        <WorkerHistoryModal
          workerName={modalWorker}
          defects={defects}
          goods={goods}
          workerDirectory={workerDirectory}
          onClose={() => setModalWorker(null)}
        />
      ) : null}
    </div>
  );
}
