/** The right-click menu on the pages. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type MenuItem =
  | { separator: true }
  | { label: string; onClick(): void; disabled?: boolean; strong?: boolean; icon?: React.ReactNode; muted?: boolean; hint?: string };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose(): void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const left = Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4));
    setPos({ left, top });
  }, [x, y]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', away, true);
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={menu}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[150] min-w-[220px] max-w-[320px] rounded-lg border border-slate-200 bg-white py-1 text-[13px] shadow-xl"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="my-1 h-px bg-slate-200" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#6C9FCB]/15 disabled:pointer-events-none disabled:opacity-40 ${
              item.strong ? 'font-semibold text-[#083B69]' : item.muted ? 'text-slate-500' : 'text-slate-700'
            }`}
          >
            <span className="flex w-4 shrink-0 justify-center text-[#376FA3]">{item.icon}</span>
            <span className="truncate">{item.label}</span>
            {item.hint && <span className="ml-auto pl-4 text-[11px] text-slate-400">{item.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
