'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;
const DEFAULT_Z = 10050;

/**
 * overflow/줌 컨테이너 밖에서 fixed로 뜨는 팝오버.
 * anchor = { x, y } 뷰포트 client 좌표.
 */
export default function FloatingPortalPopover({
  anchor,
  children,
  className = '',
  zIndex = DEFAULT_Z,
  widthClass = 'w-64',
  role,
  'aria-label': ariaLabel,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(() => ({
    left: anchor?.x ?? 0,
    top: anchor?.y ?? 0,
  }));
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!anchor || typeof document === 'undefined') return undefined;

    const el = ref.current;
    if (!el) return undefined;

    setReady(false);

    const place = () => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = anchor.x + MARGIN;
      let top = anchor.y;

      // 우측 넘침 → 앵커 왼쪽으로
      if (left + rect.width > vw - MARGIN) {
        left = anchor.x - rect.width - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;

      // 하단 넘침 → 위로 당김
      if (top + rect.height > vh - MARGIN) {
        top = vh - rect.height - MARGIN;
      }
      if (top < MARGIN) top = MARGIN;

      setPos({ left, top });
      setReady(true);
    };

    place();

    const ro = new ResizeObserver(() => place());
    ro.observe(el);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor?.x, anchor?.y]);

  if (!anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role={role || 'presentation'}
      aria-label={ariaLabel}
      className={`fixed flex max-h-[min(420px,calc(100vh-16px))] flex-col ${widthClass} ${className}`.trim()}
      style={{
        left: pos.left,
        top: pos.top,
        zIndex,
        visibility: ready ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
