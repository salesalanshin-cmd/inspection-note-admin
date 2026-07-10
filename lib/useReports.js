'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

/**
 * defect_reports / good_reports / fives_reports / ocr_results를 한 번에 불러옵니다.
 * (soft-delete된 is_deleted=true 항목은 제외)
 */
export function useReports() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    defects: [],
    goods: [],
    fives: [],
    docs: [],
    workerDirectory: [],
  });

  const load = useCallback(async (isCancelled = () => false) => {
    const [defectsRes, goodsRes, fivesRes, docsRes, directoryRes] = await Promise.all([
      supabase
        .from('defect_reports')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('good_reports')
        .select('*')
        .or(NOT_DELETED)
        .order('created_at', { ascending: false }),
      supabase
        .from('fives_reports')
        .select('*')
        .or(NOT_DELETED)
        .order('created_at', { ascending: false }),
      supabase
        .from('ocr_results')
        .select('*')
        .or(NOT_DELETED)
        .order('created_at', { ascending: false }),
      supabase.from('worker_directory').select('*').order('worker_name'),
    ]);

    if (isCancelled()) return;

    // eslint-disable-next-line no-console
    console.log('불량 목록:', defectsRes.data, defectsRes.error);

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
      defects: defectsRes.data || [],
      goods: goodsRes.data || [],
      fives: fivesRes.data || [],
      docs: docsRes.data || [],
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
