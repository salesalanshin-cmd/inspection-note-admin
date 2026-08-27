'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { getCompanyId } from '../../../lib/company';
import PageHeader from '../../../components/PageHeader';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

const btnSecondary =
  'min-h-[44px] rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

export default function MasterMappingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [defectProducts, setDefectProducts] = useState([]);
  const [registeredNames, setRegisteredNames] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const companyId = await getCompanyId();
        const [defectRes, moldRes] = await Promise.all([
          supabase
            .from('defect_reports')
            .select('product_name')
            .eq('company_id', companyId)
            .or(NOT_DELETED),
          supabase
            .from('product_mold')
            .select('product_name')
            .eq('company_id', companyId),
        ]);
        if (defectRes.error) throw new Error(defectRes.error.message);
        if (moldRes.error) throw new Error(moldRes.error.message);

        /** @type {Map<string, number>} */
        const counts = new Map();
        for (const row of defectRes.data ?? []) {
          const name = (row.product_name ?? '').trim();
          if (!name) continue;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        const products = [...counts.entries()]
          .map(([product_name, count]) => ({ product_name, count }))
          .sort((a, b) => b.count - a.count || a.product_name.localeCompare(b.product_name, 'ko'));

        const registered = new Set(
          (moldRes.data ?? [])
            .map((r) => (r.product_name ?? '').trim())
            .filter(Boolean)
        );

        if (!cancelled) {
          setDefectProducts(products);
          setRegisteredNames(registered);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { matched, unmatched, matchRate } = useMemo(() => {
    const matchedList = [];
    const unmatchedList = [];
    for (const item of defectProducts) {
      if (registeredNames.has(item.product_name)) {
        matchedList.push(item);
      } else {
        unmatchedList.push(item);
      }
    }
    const total = defectProducts.length;
    const rate = total ? Math.round((matchedList.length / total) * 100) : 0;
    return { matched: matchedList, unmatched: unmatchedList, matchRate: rate };
  }, [defectProducts, registeredNames]);

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="MASTER"
        title="제품 매칭 확인"
        description="불량 기록의 제품명과 product_mold 기준정보를 대조합니다. 불량이 많은 제품부터 등록하면 됩니다."
      />

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/master" className="text-sm text-accent hover:underline">
            ← MES 기준정보
          </Link>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-xs font-medium text-muted">매칭률</p>
          <p className="mt-1 text-3xl font-semibold text-text">
            {matchRate}
            <span className="text-lg text-muted">%</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            불량 기록 제품 {defectProducts.length}종 중 {matched.length}종이 product_mold에
            등록됨
          </p>
          <p className="mt-1 text-xs text-muted">
            전수 등록이 필요하지 않습니다. 아래 미등록 목록에서 불량 건수가 많은 제품부터
            추가하세요.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text">
            미등록 ({unmatched.length})
          </h2>
          {unmatched.length === 0 ? (
            <p className="text-sm text-muted">미등록 제품이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">제품명</th>
                    <th className="px-4 py-3 text-right">불량 건수</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((item) => (
                    <tr key={item.product_name} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-text">{item.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-danger">
                        {item.count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/master?tab=product_mold&product_name=${encodeURIComponent(item.product_name)}`}
                          className={btnSecondary}
                        >
                          product_mold에 추가
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text">
            매칭됨 ({matched.length})
          </h2>
          {matched.length === 0 ? (
            <p className="text-sm text-muted">매칭된 제품이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                    <th className="px-4 py-3">제품명</th>
                    <th className="px-4 py-3 text-right">불량 건수</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((item) => (
                    <tr key={item.product_name} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text">{item.product_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {item.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
