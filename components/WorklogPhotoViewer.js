'use client';

import { useEffect, useRef, useState } from 'react';

export default function WorklogPhotoViewer({ src, alt }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  useEffect(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  function onPointerDown(event) {
    if (event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + event.clientX - drag.current.x,
      y: drag.current.oy + event.clientY - drag.current.y,
    });
  }

  function endDrag() {
    drag.current = null;
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        <button type="button" className={toolClass} onClick={() => setScale((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}>
          축소
        </button>
        <button type="button" className={toolClass} onClick={() => setScale((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}>
          확대
        </button>
        <button type="button" className={toolClass} onClick={() => setRotation((value) => (value + 90) % 360)}>
          90도 회전
        </button>
        <button
          type="button"
          className={toolClass}
          onClick={() => {
            setScale(1);
            setRotation(0);
            setOffset({ x: 0, y: 0 });
          }}
        >
          맞춤
        </button>
        <span className="self-center text-xs text-muted">{Math.round(scale * 100)}%</span>
      </div>
      <div
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-surface2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {src ? (
          <img
            src={src}
            alt={alt || '작업일보 원본'}
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none"
            style={{
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale}) rotate(${rotation}deg)`,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">사진이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

const toolClass = 'rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-text';
