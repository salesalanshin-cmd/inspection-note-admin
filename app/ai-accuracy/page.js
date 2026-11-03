'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';
import {
  ACCURACY_TREND_WEEKS,
  addKstWeeks,
  formatAccuracyPercent,
  formatKstWeekRange,
  startOfKstWeek,
  summarizeWeekAccuracy,
  topCorrectionCombos,
  weeklyAccuracyTrend,
} from '../../lib/aiAccuracy';

const buttonClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';

export default function AiAccuracyPage() {
  const [weekStart, setWeekStart] = useState(() => startOfKstWeek(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentWeekStart = startOfKstWeek(new Date());
  const atCurrentWeek = weekStart.getTime() >= currentWeekStart.getTime();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const companyId = await getCompanyId();
        const from = addKstWeeks(weekStart, -(ACCURACY_TREND_WEEKS - 1)).toISOString();
        const to = addKstWeeks(weekStart, 1).toISOString();
        const data = await fetchAccuracyRows(companyId, from, to);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err?.message || '오진율을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const byType = useMemo(() => summarizeWeekAccuracy(rows, weekStart), [rows, weekStart]);
  const trend = useMemo(
    () => weeklyAccuracyTrend(rows, weekStart, ACCURACY_TREND_WEEKS),
    [rows, weekStart]
  );
  const combos = useMemo(() => topCorrectionCombos(rows, weekStart, 5), [rows, weekStart]);
  const weekTotals = trend[trend.length - 1];

  return (
    <div>
      <PageHeader
        eyebrow="QUALITY"
        title="주간 AI 오진율"
        description={weekTotals ? `이번 주 판정 ${weekTotals.judged}건` : '이번 주 판정 0건'}
      />

      <div className="space-y-6 px-4 py-4 md:px-8 md:py-6">
        <p className="rounded-xl bg-warnSoft px-3 py-2 text-xs leading-relaxed text-warn">
          AI 진단을 실행했지만 저장하지 않은 건은 집계되지 않습니다.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => setWeekStart((current) => addKstWeeks(current, -1))}
            >
              이전 주
            </button>
            <p className="min-w-[12rem] text-sm font-medium text-text">
              {formatKstWeekRange(weekStart)}
            </p>
            <button
              type="button"
              className={buttonClass}
              disabled={atCurrentWeek}
              onClick={() => setWeekStart((current) => addKstWeeks(current, 1))}
            >
              다음 주
            </button>
          </div>
        </div>

        {loading ? <p className="text-sm text-muted">데이터 불러오는 중...</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {!loading && !error ? (
          <>
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-text">최근 8주 오진율</h2>
              <div className="mt-3 space-y-2">
                {trend.map((point) => (
                  <div
                    key={point.startIso}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"
                  >
                    <span className="text-muted">{point.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-surface2">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${point.rate == null ? 0 : Math.min(100, point.rate * 100)}%` }}
                      />
                    </div>
                    <span className="text-right text-text">{formatAccuracyPercent(point.rate)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-text">불량 유형별</h2>
              {byType.length === 0 ? (
                <p className="text-sm text-muted">이번 주 집계할 판정이 없습니다.</p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {byType.map((row) => (
                      <TypeCard key={row.code || 'none'} row={row} />
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                    <table className="min-w-[640px] w-full text-left text-sm">
                      <thead className="bg-surface2 text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">불량 유형</th>
                          <th className="px-3 py-2 font-medium">AI 판정 건수</th>
                          <th className="px-3 py-2 font-medium">수락</th>
                          <th className="px-3 py-2 font-medium">정정</th>
                          <th className="px-3 py-2 font-medium">오진율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byType.map((row) => (
                          <tr key={row.code || 'none'} className="border-t border-border">
                            <td className="px-3 py-2">
                              <TypeName row={row} />
                            </td>
                            <td className="px-3 py-2">{row.judged}</td>
                            <td className="px-3 py-2">{row.accepted}</td>
                            <td className="px-3 py-2">{row.corrected}</td>
                            <td className="px-3 py-2">
                              <RateCell row={row} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium text-text">이번 주 많이 정정된 조합</h2>
              {combos.length === 0 ? (
                <p className="text-sm text-muted">이번 주 정정된 조합이 없습니다.</p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {combos.map((row) => (
                      <div
                        key={`${row.aiCode}-${row.finalCode}`}
                        className="rounded-xl border border-border bg-surface p-3 text-sm"
                      >
                        <p className="break-words font-medium text-text">
                          {row.aiLabel} → {row.finalLabel}
                        </p>
                        <p className="mt-1 text-muted">{row.count}건</p>
                        <p className="mt-1 break-words text-muted">
                          {row.topProduct ? `제품 ${row.topProduct}` : '제품명 없음'}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                    <table className="min-w-[640px] w-full text-left text-sm">
                      <thead className="bg-surface2 text-xs text-muted">
                        <tr>
                          <th className="px-3 py-2 font-medium">AI 코드 → 정정 코드</th>
                          <th className="px-3 py-2 font-medium">건수</th>
                          <th className="px-3 py-2 font-medium">상위 제품</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combos.map((row) => (
                          <tr key={`${row.aiCode}-${row.finalCode}`} className="border-t border-border">
                            <td className="px-3 py-2">
                              {row.aiLabel} → {row.finalLabel}
                            </td>
                            <td className="px-3 py-2">{row.count}</td>
                            <td className="px-3 py-2">{row.topProduct || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TypeName({ row }) {
  return (
    <div>
      <p className="break-words font-medium text-text">{row.label}</p>
      {row.code ? <p className="text-xs text-muted">{row.code}</p> : null}
    </div>
  );
}

function RateCell({ row }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{formatAccuracyPercent(row.rate)}</span>
      {row.lowSample ? (
        <span className="rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
          표본 적음
        </span>
      ) : null}
    </div>
  );
}

function TypeCard({ row }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-sm">
      <TypeName row={row} />
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted">AI 판정</div>
        <div className="text-text">{row.judged}건</div>
        <div className="text-muted">수락</div>
        <div className="text-text">{row.accepted}</div>
        <div className="text-muted">정정</div>
        <div className="text-text">{row.corrected}</div>
        <div className="text-muted">오진율</div>
        <div>
          <RateCell row={row} />
        </div>
      </dl>
    </div>
  );
}

async function fetchAccuracyRows(companyId, fromIso, toIso) {
  const pageSize = 1000;
  const rows = [];
  for (let page = 0; page < 20; page += 1) {
    const start = page * pageSize;
    const { data, error } = await supabase
      .from('ai_correction_log')
      .select('ai_suggested_code, final_code, was_ai_accepted, product_name, created_at, code_set')
      .eq('company_id', companyId)
      .eq('code_set', 'defect')
      .not('was_ai_accepted', 'is', null)
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  return rows;
}
