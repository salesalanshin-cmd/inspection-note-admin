'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCompanyId } from './company';
import { fetchListPages } from './listPages';
import { supabase } from './supabase';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

/**
 * defect_reports / good_reports / fives_reports / ocr_results를 한 번에 불러옵니다.
 * (soft-delete된 is_deleted=true 항목은 제외)
 *
 * 날짜는 화면마다 다르고, 같은 배열을 출퇴근·집계가 기간 없이 쓰므로
 * 서버에 날짜 조건을 넣지 않는다. created_at desc + id 로 1000행씩 모두 읽는다.
 */
export function useReports() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    truncated: false,
    defects: [],
    goods: [],
    fives: [],
    docs: [],
    workerDirectory: [],
  });

  const load = useCallback(async (isCancelled = () => false) => {
    let companyId;
    try {
      companyId = await getCompanyId();
    } catch (err) {
      if (!isCancelled()) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message || '회사 정보를 불러오지 못했습니다.',
        }));
      }
      return;
    }

    const [defectsRes, goodsRes, fivesRes, docsRes, directoryRes] = await Promise.all([
      fetchReportTable('defect_reports', companyId),
      fetchReportTable('good_reports', companyId),
      fetchReportTable('fives_reports', companyId),
      fetchReportTable('ocr_results', companyId),
      supabase
        .from('worker_directory')
        .select('*')
        .eq('company_id', companyId)
        .order('worker_name'),
    ]);

    if (isCancelled()) return;

    // eslint-disable-next-line no-console
    console.log(
      '전체 데이터:',
      defectsRes.rows?.length,
      goodsRes.rows?.length,
      fivesRes.rows?.length,
      docsRes.rows?.length,
      directoryRes.error
    );

    const firstError =
      defectsRes.error ||
      goodsRes.error ||
      fivesRes.error ||
      docsRes.error ||
      directoryRes.error;
    if (firstError) {
      setState((s) => ({ ...s, loading: false, error: firstError.message }));
      return;
    }

    setState({
      loading: false,
      error: null,
      truncated: Boolean(
        defectsRes.truncated || goodsRes.truncated || fivesRes.truncated || docsRes.truncated
      ),
      defects: defectsRes.rows || [],
      goods: goodsRes.rows || [],
      fives: fivesRes.rows || [],
      docs: docsRes.rows || [],
      workerDirectory: directoryRes.data || [],
    });
  }, []);

  const refetch = useCallback(() => load(), [load]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { ...state, refetch };
}

function fetchReportTable(table, companyId) {
  return fetchListPages(
    () =>
      supabase
        .from(table)
        .select('*')
        .eq('company_id', companyId)
        .or(NOT_DELETED),
    { timeColumn: 'created_at', label: table, ascending: false }
  );
}
