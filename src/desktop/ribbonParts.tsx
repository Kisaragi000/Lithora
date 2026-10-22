/** The ribbon's building blocks: buttons, drop-down panels and menu rows. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export const SHADES = ['FFFFFF', 'F2F2F2', 'D9D9D9', 'BFBFBF', 'DCE6F2', 'B9CDE5', '6C9FCB', 'E4DFEC', 'B9AEDC', 'FBF8F0', 'FFF2CC', 'E2EFDA', 'FCE4D6', 'FFC7CE'];

export const TEXT_COLORS = [
  'auto', '000000', '404040', '7F7F7F', 'BFBFBF', 'FFFFFF',
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050',
  '00B0F0', '0070C0', '002060', '7030A0', '083B69', '376FA3',
];

/** A row in a drop-down panel. */
export function MenuRow({ children, onClick, active }: { children: React.ReactNode; onClick(): void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-slate-100 ${active ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-700'}`}
    >
      {children}
    </button>
  );
}

export function Btn({
  title,
  onClick,
  active,
  disabled,
  children,
  wide,
}: {
  title: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the keyboard in the document while clicking the ribbon.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        wide ? 'px-2.5' : 'w-8'
      } ${active ? 'bg-[#376FA3]/15 text-[#083B69] ring-1 ring-[#376FA3]/40' : 'text-slate-700 hover:bg-[#6C9FCB]/15 hover:text-[#083B69]'}`}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <span className="mx-1.5 h-6 w-px shrink-0 bg-slate-200" />;
}

/**
 * A floating panel under `anchor`, drawn on top of everything. It lives outside the ribbon
 * because the ribbon row scrolls sideways, which would clip anything hanging below it.
 */
export function FloatingPanel({
  anchor,
  onClose,
  children,
  className = '',
}: {
  anchor: HTMLElement;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number }>(() => place(anchor, 0));
  useLayoutEffect(() => {
    const update = () => setPos(place(anchor, panel.current?.offsetWidth ?? 0));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchor]);
  // The wheel scrolls this list itself. Done by hand: in the desktop web view the wheel over a
  // floating list went to the ribbon behind it instead.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const line = e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollTop += e.deltaY * line;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      className={`fixed z-[100] overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-2 shadow-xl ${className}`}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
      // React passes events from a portal up to the component that opened it: keep the wheel
      // from reaching the ribbon row's own wheel handler.
      onWheel={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Where a panel of `width` goes under `anchor`, kept inside the window. */
export function place(anchor: HTMLElement, width: number) {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const top = r.bottom + 4;
  return { left, top, maxHeight: Math.max(120, window.innerHeight - top - 8) };
}

/** A button that opens a small panel below it. */
export function Popover({
  title,
  label,
  disabled,
  children,
}: {
  title: string;
  label: React.ReactNode;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={button}
        type="button"
        title={open ? undefined : title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-[13px] text-slate-700 hover:bg-[#6C9FCB]/15 hover:text-[#083B69] disabled:pointer-events-none disabled:opacity-35 ${
          open ? 'bg-[#6C9FCB]/15 text-[#083B69]' : ''
        }`}
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && button.current && (
        <FloatingPanel anchor={button.current} onClose={close}>
          <div onMouseDown={(e) => e.preventDefault()}>{children(close)}</div>
        </FloatingPanel>
      )}
    </>
  );
}
