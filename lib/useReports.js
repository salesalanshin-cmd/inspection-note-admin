'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

/**
 * defect_reports / good_reports / fives_reports를 한 번에 불러옵니다.
 * (soft-delete된 is_deleted=true 항목은 제외)
 */
export function useReports() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    defects: [],
    goods: [],
    fives: [],
  });

  // useEffect 밖으로 뺀 fetch 로직 - refetch로도 재사용합니다.
  // cancelled 플래그를 받아 언마운트 후 setState를 막습니다.
  const load = useCallback(async (isCancelled = () => false) => {
    const [defectsRes, goodsRes, fivesRes] = await Promise.all([
      supabase
        .from('defect_reports')
        .select('*')
        .or(NOT_DELETED)
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
    ]);

    if (isCancelled()) return;

    const firstError = defectsRes.error || goodsRes.error || fivesRes.error;
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
