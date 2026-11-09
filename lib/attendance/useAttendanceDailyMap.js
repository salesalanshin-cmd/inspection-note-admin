'use client';

import { useEffect, useState } from 'react';
import { addKstDays, formatKstISODate } from '../kst';
import { fetchAttendanceDaily } from './clientApi';
import { indexAttendanceByWorker } from './resolveRecordShift';

const EMPTY = new Map();

/**
 * 화면에 필요한 근무일 범위의 attendance_daily를 한 번만 읽는다.
 * 전날 야간 귀속을 위해 시작일 하루 전을 포함한다.
 * @param {string} start YYYY-MM-DD
 * @param {string} end YYYY-MM-DD
 */
export function useAttendanceDailyMap(start, end, { enabled = true } = {}) {
  const [map, setMap] = useState(EMPTY);

  useEffect(() => {
    if (!enabled || !start || !end) {
      setMap(EMPTY);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const from = formatKstISODate(addKstDays(`${start}T12:00:00+09:00`, -1));
        const { rows } = await fetchAttendanceDaily({
          from,
          to: end,
          columns:
            'id,worker_name,work_date,shift,reviewed,first_signal_at,last_signal_at,signal_kinds,company_id',
        });
        if (cancelled) return;
        setMap(indexAttendanceByWorker(rows));
      } catch {
        if (!cancelled) setMap(EMPTY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end, enabled]);

  return map;
}
