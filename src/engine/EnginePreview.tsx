/**
 * Engine preview: LibreOffice draws and edits the pages, React shows them.
 *
 * This is the first test of Lithora's planned architecture. The desktop backend
 * (src-tauri/src/engine) hosts LibreOffice through LibreOfficeKit; this view sends it
 * keys, clicks and commands and paints the page bitmaps it returns.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, Bold, FolderOpen, Italic, Save, Underline } from 'lucide-react';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DocState {
  pages: Rect[];
  cursor: Rect | null;
  selection: Rect[];
  lockedBy: string | null;
}

const TWIPS_PER_INCH = 1440;
const CSS_DPI = 96;

const OPEN_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'rtf', 'odt', 'xml', 'htm', 'html', 'mht', 'mhtml', 'txt', 'wps'];
const SAVE_FORMATS: Record<string, string> = { docx: 'docx', rtf: 'rtf', odt: 'odt', pdf: 'pdf', doc: 'doc', txt: 'txt' };

// Key codes from com/sun/star/awt/Key.idl
const SPECIAL_KEYS: Record<string, [number, number]> = {
  Enter: [13, 1280],
  Backspace: [8, 1283],
  Delete: [0, 1286],
  Tab: [9, 1282],
  Escape: [27, 1281],
  ArrowDown: [0, 1024],
  ArrowUp: [0, 1025],
  ArrowLeft: [0, 1026],
  ArrowRight: [0, 1027],
  Home: [0, 1028],
  End: [0, 1029],
  PageUp: [0, 1030],
  PageDown: [0, 1031],
};

const SHORTCUTS: Record<string, string> = { b: '.uno:Bold', i: '.uno:Italic', u: '.uno:Underline', z: '.uno:Undo', y: '.uno:Redo' };

async function renderPage(page: number, dpi: number): Promise<ImageData> {
  const buf = await invoke<ArrayBuffer>('engine_render_page', { page, dpi });
  const view = new DataView(buf);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  return new ImageData(new Uint8ClampedArray(buf, 8, width * height * 4), width, height);
}

export const EnginePreview: React.FC = () => {
  const [doc, setDoc] = useState<DocState | null>(null);
  const [fileName, setFileName] = useState('');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [timing, setTiming] = useState('');
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const surface = useRef<HTMLDivElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<DocState | null>(null);
  latest.current = doc;

  const pxPerTwip = (CSS_DPI * zoom) / TWIPS_PER_INCH;
  const renderDpi = CSS_DPI * zoom * (window.devicePixelRatio || 1);

  // Edits must reach LibreOffice in the order they were typed.
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const paint = useCallback(
    async (pages: number[]) => {
      for (const i of pages) {
        const image = await renderPage(i, renderDpi);
        const canvas = canvases.current[i];
        if (!canvas) continue;
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d')?.putImageData(image, 0, 0);
      }
    },
    [renderDpi],
  );

  // Repaint everything when a document opens or the zoom changes.
  useEffect(() => {
    if (!doc) return;
    enqueue(() => paint(doc.pages.map((_, i) => i))).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.pages.length, renderDpi]);

  const pageAt = (y: number, pages: Rect[]) => Math.max(0, pages.findIndex((p) => y >= p.y && y < p.y + p.height));

  const pending = useRef(0);

  const afterEdit = async (started: number, before: DocState | null, next: DocState) => {
    if (before && before.pages.length === next.pages.length) {
      // Repaint the page with the cursor; a change in page count repaints everything instead.
      const at = next.cursor ? pageAt(next.cursor.y, next.pages) : 0;
      await paint([at]);
    }
    setDoc(next);
    setTiming(`${Math.round(performance.now() - started)} ms from key to repainted page`);
  };

  const run = (action: () => Promise<DocState>) => {
    const started = performance.now();
    pending.current += 1;
    enqueue(async () => {
      const before = latest.current;
      const next = await action();
      pending.current -= 1;
      // When keys arrive faster than pages can be drawn, draw once after the last of them.
      if (pending.current > 0) {
        latest.current = next;
        return;
      }
      await afterEdit(started, before, next);
    }).catch((e) => {
      pending.current = Math.max(0, pending.current - 1);
      setError(String(e));
    });
  };

  const openPath = async (picked: string) => {
    const started = performance.now();
    try {
      const state = await enqueue(() => invoke<DocState>('engine_open', { path: picked }));
      canvases.current = [];
      setFileName(picked.split(/[\\/]/).pop() ?? picked);
      setDoc(state);
      setTiming(`Opened in ${Math.round(performance.now() - started)} ms`);
      surface.current?.focus();
    } catch (e) {
      setError(String(e));
    }
  };

  const openFile = async () => {
    setError('');
    const picked = await openDialog({ multiple: false, filters: [{ name: 'Documents', extensions: OPEN_EXTENSIONS }] });
    if (typeof picked === 'string') await openPath(picked);
  };

  // A document passed on the command line opens straight away.
  useEffect(() => {
    invoke<string | null>('startup_file')
      .then((path) => {
        if (path) return openPath(path);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveAs = async () => {
    if (!doc) return;
    const target = await saveDialog({
      filters: [
        { name: 'Word document', extensions: ['docx'] },
        { name: 'Rich Text Format', extensions: ['rtf'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'OpenDocument text', extensions: ['odt'] },
      ],
    });
    if (!target) return;
    const ext = target.split('.').pop()?.toLowerCase() ?? '';
    const format = SAVE_FORMATS[ext];
    if (!format) {
      setError(`Choose a file name ending in ${Object.keys(SAVE_FORMATS).map((e) => '.' + e).join(', ')}`);
      return;
    }
    enqueue(() => invoke('engine_save_as', { path: target, format }))
      .then(() => setTiming(`Saved ${target.split(/[\\/]/).pop()}`))
      .catch((e) => setError(String(e)));
  };

  const command = (name: string) => {
    run(() => invoke<DocState>('engine_command', { command: name }));
    surface.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!doc) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && SHORTCUTS[e.key.toLowerCase()]) {
      e.preventDefault();
      command(SHORTCUTS[e.key.toLowerCase()]);
      return;
    }
    let codes: [number, number] | undefined = SPECIAL_KEYS[e.key];
    if (!codes && e.key.length <= 2 && !mod && !e.altKey) {
      const cp = e.key.codePointAt(0);
      if (cp !== undefined && cp >= 32) codes = [cp, 0];
    }
    if (!codes) return;
    e.preventDefault();
    const [charCode, keyCode] = codes;
    run(() => invoke<DocState>('engine_key', { charCode, keyCode }));
  };

  const onPageClick = (e: React.MouseEvent<HTMLCanvasElement>, page: Rect) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.round(page.x + (e.clientX - box.left) / pxPerTwip);
    const y = Math.round(page.y + (e.clientY - box.top) / pxPerTwip);
    run(() => invoke<DocState>('engine_click', { x, y }));
    surface.current?.focus();
  };

  const toolButton =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-[#083B69] hover:bg-[#6C9FCB]/20 disabled:opacity-40';

  return (
    <div className="flex h-screen flex-col bg-[#FBF8F0] text-[#083B69]">
      <header className="flex items-center gap-2 border-b border-[#6C9FCB]/40 bg-white px-4 py-2">
        <a href="#" className={toolButton} title="Back to the editor">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <span className="mr-2 font-semibold">Engine preview</span>
        <button className={toolButton} onClick={openFile}>
          <FolderOpen className="h-4 w-4" /> Open
        </button>
        <button className={toolButton} onClick={saveAs} disabled={!doc}>
          <Save className="h-4 w-4" /> Save as
        </button>
        <span className="mx-1 h-5 w-px bg-[#6C9FCB]/40" />
        <button className={toolButton} onClick={() => command('.uno:Bold')} disabled={!doc} title="Bold (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </button>
        <button className={toolButton} onClick={() => command('.uno:Italic')} disabled={!doc} title="Italic (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </button>
        <button className={toolButton} onClick={() => command('.uno:Underline')} disabled={!doc} title="Underline (Ctrl+U)">
          <Underline className="h-4 w-4" />
        </button>
        <select
          className="ml-2 rounded-md border border-[#6C9FCB]/50 px-2 py-1 text-sm"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        >
          {[0.75, 1, 1.25, 1.5].map((z) => (
            <option key={z} value={z}>
              {Math.round(z * 100)}%
            </option>
          ))}
        </select>
        <span className="ml-auto truncate text-sm text-[#376FA3]">
          {fileName}
          {timing && ` · ${timing}`}
        </span>
      </header>

      {doc?.lockedBy && (
        <div className="border-b border-[#B9AEDC] bg-[#B9AEDC]/25 px-4 py-2 text-sm text-[#083B69]">
          This file is open in another program ({doc.lockedBy}), so it opened read-only. Close it there and open it again to edit.
        </div>
      )}

      {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

      <div
        ref={surface}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex-1 overflow-auto outline-none"
        aria-label="Document pages"
      >
        {!doc && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-md text-[#376FA3]">
              Open a Word, RTF or OpenDocument file. LibreOffice lays out and draws every page; Lithora shows them.
            </p>
            <button className="rounded-md bg-[#376FA3] px-4 py-2 font-medium text-white hover:bg-[#083B69]" onClick={openFile}>
              Open a document
            </button>
          </div>
        )}
        {doc && (
          <div className="flex flex-col items-center gap-6 py-6">
            {doc.pages.map((page, i) => {
              const cursorHere = doc.cursor && doc.cursor.y >= page.y && doc.cursor.y < page.y + page.height ? doc.cursor : null;
              return (
                <div
                  key={i}
                  className="relative bg-white shadow-[0_1px_4px_rgba(8,59,105,0.18)]"
                  style={{ width: page.width * pxPerTwip, height: page.height * pxPerTwip }}
                >
                  <canvas
                    ref={(el) => {
                      canvases.current[i] = el;
                    }}
                    onMouseDown={(e) => onPageClick(e, page)}
                    className="block h-full w-full cursor-text"
                  />
                  {doc.selection
                    .filter((r) => r.y >= page.y && r.y < page.y + page.height)
                    .map((r, j) => (
                      <div
                        key={j}
                        className="pointer-events-none absolute bg-[#6C9FCB]/35"
                        style={{
                          left: (r.x - page.x) * pxPerTwip,
                          top: (r.y - page.y) * pxPerTwip,
                          width: r.width * pxPerTwip,
                          height: r.height * pxPerTwip,
                        }}
                      />
                    ))}
                  {cursorHere && (
                    <div
                      className="pointer-events-none absolute w-[2px] animate-pulse bg-[#083B69]"
                      style={{
                        left: (cursorHere.x - page.x) * pxPerTwip,
                        top: (cursorHere.y - page.y) * pxPerTwip,
                        height: Math.max(cursorHere.height * pxPerTwip, 12),
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
