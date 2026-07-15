'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * marking_data 항목 삭제 + 3초 실행취소 토스트 상태
 * onChange는 setState처럼 (prev) => next 또는 배열을 받을 수 있음.
 */
export function useUndoableMarkerDelete(markers, onChange) {
  const [undo, setUndo] = useState(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  const dismissUndo = useCallback(() => {
    setUndo(null);
  }, []);

  const deleteAt = useCallback(
    (idx) => {
      const list = Array.isArray(markersRef.current) ? markersRef.current : [];
      if (idx < 0 || idx >= list.length) return;

      const removed = list[idx];
      const next = list.filter((_, i) => i !== idx);
      onChange(next);
      setUndo({ index: idx, marker: { ...removed } });
    },
    [onChange]
  );

  const undoDelete = useCallback(() => {
    if (!undo) return;
    const { index, marker } = undo;
    setUndo(null);
    onChange((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [...(markersRef.current || [])];
      const insertAt = Math.min(Math.max(0, index), list.length);
      list.splice(insertAt, 0, marker);
      return list;
    });
  }, [undo, onChange]);

  return {
    deleteAt,
    undoDelete,
    dismissUndo,
    undoOpen: Boolean(undo),
  };
}
