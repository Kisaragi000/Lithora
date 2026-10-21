/**
 * Minimize, maximize and close, drawn in Lithora's header. On Windows the system title bar is
 * turned off (it repeated the logo and the name above the header), so the header carries these.
 */
import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { Strings } from './strings';

/** True where Lithora draws its own title bar. */
export const OWN_TITLE_BAR = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');

export function WindowControls({ t }: { t: Strings }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let live = true;
    const check = () => void win.isMaximized().then((m) => live && setMaximized(m)).catch(() => undefined);
    check();
    const off = win.onResized(check);
    return () => {
      live = false;
      void off.then((f) => f());
    };
  }, []);

  const button = 'inline-flex h-12 w-11 items-center justify-center text-slate-600 transition-colors';
  return (
    <div className="ml-2 flex self-stretch">
      <button type="button" title={t.minimize} aria-label={t.minimize} className={`${button} hover:bg-slate-100`} onClick={() => void getCurrentWindow().minimize()}>
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        title={maximized ? t.restore : t.maximize}
        aria-label={maximized ? t.restore : t.maximize}
        className={`${button} hover:bg-slate-100`}
        onClick={() => void getCurrentWindow().toggleMaximize()}
      >
        {maximized ? <Copy className="h-3.5 w-3.5 -scale-x-100" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title={t.closeWindow}
        aria-label={t.closeWindow}
        className={`${button} hover:bg-[#C42B1C] hover:text-white`}
        onClick={() => void getCurrentWindow().close()}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
