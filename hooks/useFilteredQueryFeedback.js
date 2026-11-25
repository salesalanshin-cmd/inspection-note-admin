'use client';

import { useEffect, useMemo, useRef } from 'react';
import { notifyAction } from '../lib/actionFeedback';

// Call mark() when a user changes a query, then begin() when its request starts.
// Automatic loads run through the same loader without announcing their results.
export default function useFilteredQueryFeedback(label) {
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => () => {
    generation.current += 1;
    pending.current = false;
  }, []);

  return useMemo(() => ({
    mark() {
      pending.current = true;
      generation.current += 1;
    },
    begin() {
      const announce = pending.current;
      pending.current = false;
      const request = ++generation.current;
      return (success = true) => {
        if (!announce || request !== generation.current) return;
        generation.current += 1;
        notifyAction(`${label} 조회 ${success ? '완료' : '실패'}`, success ? 'success' : 'error');
      };
    },
  }), [label]);
}
