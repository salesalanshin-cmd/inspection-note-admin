'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * 휴지통(is_deleted=true) 항목 조회
 */
export function useTrash() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    items: [],
  });

  const load = useCallback(async (isCancelled = () => false) => {
    const [defectsRes, fivesRes, docsRes] = await Promise.all([
      supabase
        .from('defect_reports')
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('fives_reports')
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('ocr_results')
        .select('*')
        .eq('is_deleted', true)
        .order('deleted_at', { ascending: false }),
    ]);

    if (isCancelled()) return;

    const firstError = defectsRes.error || fivesRes.error || docsRes.error;
    if (firstError) {
      setState({ loading: false, error: firstError.message, items: [] });
      return;
    }

    const items = [
      ...(defectsRes.data || []).map((row) => ({
        ...row,
        recordType: 'defect',
        typeLabel: '불량기록',
      })),
      ...(fivesRes.data || []).map((row) => ({
        ...row,
        recordType: 'fives',
        typeLabel: '3정5S',
      })),
      ...(docsRes.data || []).map((row) => ({
        ...row,
        recordType: 'doc',
        typeLabel: '문서스캔',
      })),
    ].sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));

    setState({ loading: false, error: null, items });
  }, []);

  const refetch = useCallback(() => load(), [load]);

  /** 낙관적 업데이트: 지정한 key 항목을 로컬 목록에서 즉시 제거 */
  const removeItems = useCallback((keys) => {
    const keySet = keys instanceof Set ? keys : new Set(keys);
    if (!keySet.size) return;
    setState((s) => ({
      ...s,
      items: s.items.filter((item) => !keySet.has(trashItemKey(item))),
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { ...state, refetch, removeItems };
}

export function trashItemKey(item) {
  return `${item.recordType}:${item.id}`;
}

export function parseTrashItemKey(key) {
  const [recordType, id] = key.split(':');
  return { recordType, id };
}
