/**
 * Document view: Lithora's engine lays out and draws the pages, React shows them.
 *
 * The desktop backend (src-tauri/src/engine) runs the document engine, built on
 * WordCraft's Rust crates. This view sends it typing, keys, clicks and commands and
 * paints the page bitmaps it returns.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, Bold, FolderOpen, Italic, Save, Underline } from 'lucide-react';

interface PageSize {
  width: number;
  height: number;
}

/** A rectangle on one page, in points from the page's top-left corner. */
interface Mark {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DocState {
  pages: PageSize[];
  cursor: Mark | null;
  selection: Mark[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
}

const POINTS_PER_INCH = 72;
const CSS_DPI = 96;

const OPEN_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'rtf', 'odt', 'ott', 'xml', 'htm', 'html', 'md', 'txt'];
const SAVE_EXTENSIONS = ['docx', 'rtf', 'odt', 'pdf', 'html', 'md', 'txt'];

// Browser key names that differ from the engine's (see WordCraft's keymap).
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space',
};
const NAMED_KEYS = new Set(['Left', 'Right', 'Up', 'Down', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'Space', 'Insert']);

/** The engine's name for a key press, such as `Mod+B` or `Shift+Left`, or null for plain typing. */
function keyCombo(e: React.KeyboardEvent): string | null {
  const mod = e.ctrlKey || e.metaKey;
  // AltGr (Ctrl+Alt on Windows) types characters on many keyboard layouts.
  const altGr = e.ctrlKey && e.altKey && e.key.length === 1;
  let name = KEY_NAMES[e.key] ?? e.key;
  const named = NAMED_KEYS.has(name) || /^F([1-9]|1[0-9]|2[0-4])$/.test(name);
  if (!named) {
    if (!mod && !e.altKey) return null;
    if (altGr) return null;
    // With modifiers, use the physical key so Shift doesn't turn "1" into "!".
    if (/^Key[A-Z]$/.test(e.code)) name = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) name = e.code.slice(5);
    else if (name.length === 1) name = name.toUpperCase();
    else return null;
  }
  if (name === 'Space' && !mod && !e.altKey) return null;
  return `${mod ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${name}`;
}

async function renderPage(page: number, scale: number): Promise<ImageData> {
  const buf = await invoke<ArrayBuffer>('engine_render_page', { page, scale });
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

  const pxPerPt = (CSS_DPI * zoom) / POINTS_PER_INCH;
  const renderScale = pxPerPt * (window.devicePixelRatio || 1);
  const dragging = useRef(false);

  // Edits must reach the engine in the order they were typed.
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const paint = useCallback(
    async (pages: number[]) => {
      for (const i of pages) {
        const image = await renderPage(i, renderScale);
        const canvas = canvases.current[i];
        if (!canvas) continue;
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d')?.putImageData(image, 0, 0);
      }
    },
    [renderScale],
  );

  // Repaint everything when a document opens or the zoom changes.
  useEffect(() => {
    if (!doc) return;
    enqueue(() => paint(doc.pages.map((_, i) => i))).catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.pages.length, renderScale]);

  const pending = useRef(0);

  const afterEdit = async (started: number, before: DocState | null, next: DocState) => {
    if (before && before.pages.length === next.pages.length) {
      // Repaint the pages an edit can touch: the cursor's page and the one after it (text can
      // flow onto it), plus any selected pages. A change in page count repaints everything.
      const touched = new Set<number>();
      const at = next.cursor?.page ?? next.selection[0]?.page ?? 0;
      touched.add(at);
      if (at + 1 < next.pages.length) touched.add(at + 1);
      for (const r of next.selection) touched.add(r.page);
      await paint([...touched]);
    }
    setDoc(next);
    setTiming(`${Math.round(performance.now() - started)} ms to update the page`);
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
    if (!SAVE_EXTENSIONS.includes(ext)) {
      setError(`Choose a file name ending in ${SAVE_EXTENSIONS.map((e) => '.' + e).join(', ')}`);
      return;
    }
    enqueue(() => invoke<DocState>('engine_save_as', { path: target }))
      .then((state) => {
        setDoc(state);
        setTiming(`Saved ${target.split(/[\\/]/).pop()}`);
      })
      .catch((e) => setError(String(e)));
  };

  const command = (name: string) => {
    run(() => invoke<DocState>('engine_command', { command: name }));
    surface.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!doc || e.nativeEvent.isComposing) return;
    const combo = keyCombo(e);
    if (combo) {
      e.preventDefault();
      run(async () => (await invoke<DocState | null>('engine_key', { key: combo })) ?? latest.current!);
      return;
    }
    if (e.key.length > 0 && [...e.key].length === 1) {
      e.preventDefault();
      const text = e.key;
      run(() => invoke<DocState>('engine_type', { text }));
    }
  };

  const pointOnPage = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / pxPerPt, y: (e.clientY - box.top) / pxPerPt };
  };

  const onPageMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    e.preventDefault();
    surface.current?.focus();
    const { x, y } = pointOnPage(e);
    if (e.detail === 2) {
      run(async () => {
        await invoke<DocState>('engine_click', { page, x, y, extend: false });
        return invoke<DocState>('engine_command', { command: 'select.word' });
      });
      return;
    }
    dragging.current = true;
    run(() => invoke<DocState>('engine_click', { page, x, y, extend: e.shiftKey }));
  };

  const onPageMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, page: number) => {
    // Drag to select; skip moves while the engine is still busy with the last one.
    if (!dragging.current || (e.buttons & 1) === 0 || pending.current > 0) return;
    const { x, y } = pointOnPage(e);
    run(() => invoke<DocState>('engine_click', { page, x, y, extend: true }));
  };

  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const toolButton =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-[#083B69] hover:bg-[#6C9FCB]/20 disabled:opacity-40';

  return (
    <div className="flex h-screen flex-col bg-[#FBF8F0] text-[#083B69]">
      <header className="flex items-center gap-2 border-b border-[#6C9FCB]/40 bg-white px-4 py-2">
        <a href="#" className={toolButton} title="Back to the editor">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <span className="mr-2 font-semibold">Document view</span>
        <button className={toolButton} onClick={openFile}>
          <FolderOpen className="h-4 w-4" /> Open
        </button>
        <button className={toolButton} onClick={saveAs} disabled={!doc}>
          <Save className="h-4 w-4" /> Save as
        </button>
        <span className="mx-1 h-5 w-px bg-[#6C9FCB]/40" />
        <button className={toolButton} onClick={() => command('format.bold')} disabled={!doc} title="Bold (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </button>
        <button className={toolButton} onClick={() => command('format.italic')} disabled={!doc} title="Italic (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </button>
        <button className={toolButton} onClick={() => command('format.underline')} disabled={!doc} title="Underline (Ctrl+U)">
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
              Open a Word, RTF or OpenDocument file. Lithora lays out and draws every page itself.
            </p>
            <button className="rounded-md bg-[#376FA3] px-4 py-2 font-medium text-white hover:bg-[#083B69]" onClick={openFile}>
              Open a document
            </button>
          </div>
        )}
        {doc && (
          <div className="flex flex-col items-center gap-6 py-6">
            {doc.pages.map((page, i) => {
              const cursorHere = doc.cursor?.page === i ? doc.cursor : null;
              return (
                <div
                  key={i}
                  className="relative bg-white shadow-[0_1px_4px_rgba(8,59,105,0.18)]"
                  style={{ width: page.width * pxPerPt, height: page.height * pxPerPt }}
                >
                  <canvas
                    ref={(el) => {
                      canvases.current[i] = el;
                    }}
                    onMouseDown={(e) => onPageMouseDown(e, i)}
                    onMouseMove={(e) => onPageMouseMove(e, i)}
                    className="block h-full w-full cursor-text"
                  />
                  {doc.selection
                    .filter((r) => r.page === i)
                    .map((r, j) => (
                      <div
                        key={j}
                        className="pointer-events-none absolute bg-[#6C9FCB]/35"
                        style={{ left: r.x * pxPerPt, top: r.y * pxPerPt, width: r.width * pxPerPt, height: r.height * pxPerPt }}
                      />
                    ))}
                  {cursorHere && (
                    <div
                      className="pointer-events-none absolute w-[2px] animate-pulse bg-[#083B69]"
                      style={{
                        left: cursorHere.x * pxPerPt,
                        top: cursorHere.y * pxPerPt,
                        height: Math.max(cursorHere.height * pxPerPt, 12),
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
