'use client';

import { notifyAction } from '../lib/actionFeedback';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCompanyCode } from '../lib/company';

export function useWorkerMesSync() {
  const enabled = getCompanyCode() === 'dkmetal';
  const [pending, setPending] = useState([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!enabled);
  const request = useRef(0);

  const refresh = useCallback(async (announce = false) => {
    if (!enabled) return;
    const sequence = ++request.current;
    try {
      const response = await fetch('/api/workers/mes-sync', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.pending)) throw new Error(result.error || 'MES 연동 상태를 확인할 수 없습니다.');
      if (sequence !== request.current) return;
      setReady(true);
      setPending(result.pending);
      setCount(result.count);
      setError('');
      if (announce) notifyAction(`MES 연동 대기 ${result.count}건을 조회했습니다.`);
    } catch (e) {
      if (sequence === request.current) {
        setReady(false);
        if (announce) notifyAction('MES 연동 상태를 조회하지 못했습니다.', 'error');
        setError(e.message || 'MES 연동 대기 목록을 확인할 수 없습니다.');
      }
    }
  }, [enabled]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function sync(names, retryEnvironment) {
    if (!enabled || !names.length) return;
    let failure = '';
    let stillPending = false;
    for (const name of new Set(names)) {
      try {
        const response = await fetch('/api/workers/mes-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerName: name, retryEnvironment }),
        });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'MES 연동 응답을 확인할 수 없습니다.');
        if (retryEnvironment) stillPending ||= result.pending.some(row => row.environment === retryEnvironment);
      } catch (e) {
        failure = e.message || 'MES 연동 응답을 확인할 수 없습니다.';
      }
    }
    await refresh();
    if (failure) setError(failure);
    if (retryEnvironment) {
      if (failure) notifyAction('MES 작업자 연동에 실패했습니다.', 'error');
      else if (stillPending) notifyAction('MES 작업자 연동이 대기 중입니다.', 'warning');
      else notifyAction('MES 작업자 연동을 완료했습니다.');
    }
  }
  return { ready, refresh, pending, count, error, sync };
}
