'use client';

import { useEffect, useState } from 'react';

/**
 * ImageZoom contentRef처럼 마운트 시점에 null일 수 있는 컨테이너 크기를
 * rAF 폴링 + ResizeObserver로 안정적으로 추적한다.
 */
export function useContainContainerSize(containerRef) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    let ro = null;
    let attachedEl = null;
    let rafId = 0;
    let tries = 0;

    const sync = (el) => {
      if (cancelled || !el) return;
      const rect = el.getBoundingClientRect();
      setContainerSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height }
      );
    };

    const onWindowResize = () => sync(attachedEl);

    const attach = (el) => {
      if (!el || el === attachedEl) {
        if (el) sync(el);
        return;
      }
      ro?.disconnect();
      attachedEl = el;
      sync(el);
      ro = new ResizeObserver(() => sync(el));
      ro.observe(el);
    };

    const tryAttach = () => {
      if (cancelled) return;
      const el = containerRef?.current;
      if (el) {
        attach(el);
        return;
      }
      // contentRef가 ImageZoom 마운트 이후에 붙는 레이스 방지
      if (tries++ < 90) {
        rafId = requestAnimationFrame(tryAttach);
      }
    };

    tryAttach();
    window.addEventListener('resize', onWindowResize);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [containerRef]);

  return containerSize;
}
