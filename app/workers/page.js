'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useReports } from '../../lib/useReports';
import { FIVES_CYCLE_DAYS, INSPECTION_CYCLE_DAYS } from '../../lib/constants';
import PageHeader from '../../components/PageHeader';
import FilterToolbar from '../../components/FilterToolbar';
import WorkersSummarySection from '../../components/WorkersSummarySection';

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

export default function WorkersPage() {
  const { loading, error, defects, goods, fives, workerDirectory } = useReports();
  const [endDate, setEndDate] = useState(() => startOfDay(new Date()));

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
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        eyebrow="WORKERS"
        title="작업자 현황"
        description={`정기검사 기준 ${INSPECTION_CYCLE_DAYS}일 · 3정5S 기준 ${FIVES_CYCLE_DAYS}일. 기준일 초과 시 미준수로 표시됩니다.`}
      />

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-8 pt-4 md:px-8">
        <div className="mb-4 rounded-xl border border-accent/30 bg-accentSoft px-4 py-3 text-sm text-text">
          이 화면은{' '}
          <Link href="/daily-performance" className="font-medium text-accent underline-offset-2 hover:underline">
            일일 실적 관리 &gt; 최근 7일 요약
          </Link>
          으로 이동했습니다. 아래는 참고용입니다.
        </div>

        <div className="mb-4">
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
                  {formatWorkDate(endDate)}
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
          />
        </div>

        <WorkersSummarySection
          endDate={endDate}
          defects={defects}
          goods={goods}
          fives={fives}
          workerDirectory={workerDirectory}
        />
      </div>
    </div>
  );
}
