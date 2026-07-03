'use client';

import { useCallback, useState } from 'react';

export function useGalleryBatchSelect(getItemId = (item) => item.id) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (items) => {
      setSelectedIds(new Set(items.map(getItemId)));
    },
    [getItemId]
  );

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    selectAll,
    clearAll,
    isSelected,
  };
}
