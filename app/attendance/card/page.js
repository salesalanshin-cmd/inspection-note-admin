'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AttendanceCalendar from '../../../components/attendance-card/AttendanceCalendar';
import AttendanceCardHeader from '../../../components/attendance-card/AttendanceCardHeader';
import AttendanceIssues from '../../../components/attendance-card/AttendanceIssues';
import AttendanceKpis from '../../../components/attendance-card/AttendanceKpis';
import DefectSummary from '../../../components/attendance-card/DefectSummary';
import InspectionCompliance from '../../../components/attendance-card/InspectionCompliance';
import SignOffFooter from '../../../components/attendance-card/SignOffFooter';
import { attendanceCardPath } from '../../../lib/attendance/card';
import { getCompanyId } from '../../../lib/company';
import { formatKstISODate } from '../../../lib/kst';
import { supabase } from '../../../lib/supabase';
import {
  ORGANIZATION_UNSET,
  matchesOrganizationFilter,
  organizationOptions,
} from '../../../lib/workerBulk';

const MONTH = /^\d{4}-\d{2}$/;

const controlClass =
  'min-h-[44px] rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

function currentMonth() {
  return formatKstISODate(new Date()).slice(0, 7);
}

function shiftMonth(month, delta) {
  const [year, mon] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function workerLabel(worker) {
  return String(worker?.display_name || '').trim() || worker?.worker_name || '';
}

function AttendanceCardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const name = searchParams.get('name')?.trim() || '';
  const monthParam = searchParams.get('month')?.trim() || '';
  const month = MONTH.test(monthParam) ? monthParam : currentMonth();

  const [directory, setDirectory] = useState([]);
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companyId = await getCompanyId();
        const { data, error: dirError } = await supabase
          .from('worker_directory')
          .select('worker_name, display_name, organization, removed, excluded')
          .eq('company_id', companyId)
          .order('worker_name');
        if (dirError) throw new Error(dirError.message);
        if (!cancelled) setDirectory(data || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || '작업자 목록을 불러오지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!name || !MONTH.test(month)) {
      setCard(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ name, month });
    fetch(`/api/attendance/card?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || '근태 카드를 불러오지 못했습니다.');
        return body;
      })
      .then((body) => {
        if (!cancelled) setCard(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setCard(null);
          setError(err?.message || '근태 카드를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, month]);

  const organizationChoices = useMemo(() => organizationOptions(directory), [directory]);

  const workers = useMemo(() => {
    const list = directory
      .filter((worker) => worker.worker_name)
      .filter((worker) => includeHidden || worker.removed !== true)
      .filter((worker) => matchesOrganizationFilter(worker.organization, organizationFilter))
      .sort((a, b) => workerLabel(a).localeCompare(workerLabel(b), 'ko'));
    if (name && !list.some((worker) => worker.worker_name === name)) {
      const current = directory.find((worker) => worker.worker_name === name);
      list.unshift(current || { worker_name: name, display_name: '' });
    }
    return list;
  }, [directory, includeHidden, organizationFilter, name]);

  function openCard(nextName, nextMonth) {
    router.push(attendanceCardPath(nextName, nextMonth));
  }

  return (
    <div className="min-h-full bg-cardBg text-cardInk">
      <div className="print:hidden border-b border-border bg-surface px-6 py-4 font-body">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-2">
          <button
            type="button"
            className={controlClass}
            aria-label="이전 달"
            onClick={() => openCard(name, shiftMonth(month, -1))}
          >
            이전 달
          </button>
          <div className="min-w-[7rem] text-center text-sm font-semibold text-text tabular-nums">
            {month}
          </div>
          <button
            type="button"
            className={controlClass}
            aria-label="다음 달"
            onClick={() => openCard(name, shiftMonth(month, 1))}
          >
            다음 달
          </button>
          <select
            className={controlClass}
            aria-label="조직"
            value={organizationFilter}
            onChange={(event) => setOrganizationFilter(event.target.value)}
          >
            <option value="">조직 전체</option>
            <option value={ORGANIZATION_UNSET}>미설정</option>
            {organizationChoices.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className={`${controlClass} min-w-[10rem]`}
            aria-label="작업자"
            value={name}
            onChange={(event) => openCard(event.target.value, month)}
          >
            <option value="">작업자 선택</option>
            {workers.map((worker) => (
              <option key={worker.worker_name} value={worker.worker_name}>
                {workerLabel(worker)}
              </option>
            ))}
          </select>
          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(event) => setIncludeHidden(event.target.checked)}
            />
            숨김 작업자 포함
          </label>
          <button
            type="button"
            className={`${controlClass} ml-auto`}
            onClick={() => window.print()}
          >
            인쇄/PDF
          </button>
        </div>
      </div>

      <main className="attendance-card-sheet mx-auto flex max-w-[960px] flex-col gap-5 px-6 py-12 font-pretendard print:max-w-none print:gap-3 print:px-0 print:py-0">
        {error ? <p className="text-sm text-cardAmberInk">{error}</p> : null}
        {loading ? <p className="text-sm text-cardSub">불러오는 중…</p> : null}
        {!name && !loading ? (
          <p className="text-sm text-cardSub">작업자를 선택하면 월간 근태 기록 카드가 열립니다.</p>
        ) : null}
        {card && !loading ? (
          <>
            <AttendanceCardHeader card={card} />
            <AttendanceKpis summary={card.summary} inspection={card.inspection} />
            <AttendanceCalendar days={card.days} />
            <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
              <InspectionCompliance inspection={card.inspection} />
              <AttendanceIssues issues={card.issues} summary={card.summary} />
            </section>
            <DefectSummary defects={card.defects} />
            <SignOffFooter />
          </>
        ) : null}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="bg-cardBg p-8 text-sm text-cardSub">불러오는 중…</div>}>
      <AttendanceCardPage />
    </Suspense>
  );
}
