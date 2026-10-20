/**
 * The pages of one document, laid out and drawn by Lithora's engine.
 *
 * The engine returns each page as a bitmap; this view shows them, draws the cursor and
 * selection on top, and sends typing, keys, clicks and clipboard actions back. A hidden text
 * box at the cursor takes the keyboard, so input methods, dead keys and paste work as they do
 * in any text field.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { DocState, engine } from './engine';

const POINTS_PER_INCH = 72;
const CSS_DPI = 96;

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
export function keyCombo(e: React.KeyboardEvent): string | null {
  const mod = e.ctrlKey || e.metaKey;
  // AltGr (Ctrl+Alt on Windows) types characters on many keyboard layouts.
  // A plain letter (the key's own Latin letter, or a Russian or Armenian one, which those
  // layouts never type with AltGr) means Ctrl+Alt was meant as a shortcut, such as Ctrl+Alt+M.
  const plainLetter =
    (/^Key[A-Z]$/.test(e.code) && e.key.toUpperCase() === e.code.slice(3)) || /^[\u0400-\u04FF\u0531-\u0587]$/.test(e.key);
  const altGr = e.ctrlKey && e.altKey && e.key.length === 1 && !plainLetter;
  let name = KEY_NAMES[e.key] ?? e.key;
  const named = NAMED_KEYS.has(name) || /^F([1-9]|1[0-9]|2[0-4])$/.test(name);
  if (!named) {
    if (!mod && !e.altKey) return null;
    if (altGr) return null;
    // With modifiers, use the physical key so Shift doesn't turn "1" into "!", and
    // shortcuts work the same with a Russian or Armenian keyboard layout.
    if (/^Key[A-Z]$/.test(e.code)) name = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) name = e.code.slice(5);
    else if (name.length === 1) name = name.toUpperCase();
    else return null;
  }
  if (name === 'Space' && !mod && !e.altKey) return null;
  return `${mod ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${name}`;
}

export interface PageViewHandle {
  /**
   * Run an engine command on this document; resolves to the command's own answer. The keyboard
   * goes back to the page afterwards unless `keepFocus` (a search box is typing, say).
   */
  command(name: string, params?: Record<string, unknown>, keepFocus?: boolean): Promise<unknown>;
  /** Run several commands as one batch, in order (each still its own undo step). */
  commands(list: [string, Record<string, unknown>?][]): Promise<void>;
  copy(): Promise<void>;
  cut(): Promise<void>;
  focus(): void;
}

interface PageViewProps {
  doc: DocState;
  zoom: number;
  /** Every change to the document or cursor. */
  onState(state: DocState): void;
  onError(message: string): void;
  /** App shortcuts such as Ctrl+S; return true when handled. */
  onShortcut(combo: string): boolean;
  onCurrentPage(page: number): void;
  /** A right click on a page, at a point in the window. */
  onContextMenu(x: number, y: number): void;
}

/** Which corner of a picture's frame is being dragged. */
type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface ObjectDrag {
  kind: 'move' | Corner;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

export const PageView = forwardRef<PageViewHandle, PageViewProps>(function PageView(
  { doc, zoom, onState, onError, onShortcut, onCurrentPage, onContextMenu },
  ref,
) {
  const id = doc.id;
  const pxPerPt = (CSS_DPI * zoom) / POINTS_PER_INCH;
  const renderScale = pxPerPt * (window.devicePixelRatio || 1);

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const cursorEl = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const latest = useRef(doc);
  latest.current = doc;
  const dragging = useRef(false);
  const composing = useRef(false);
  const followCursor = useRef(false);

  // Which pages are on screen, and which bitmaps are out of date.
  const visible = useRef(new Set<number>());
  const stale = useRef(new Set<number>());
  const painting = useRef(false);
  const scaleRef = useRef(renderScale);
  scaleRef.current = renderScale;
  const [, setPaintTick] = useState(0);

  // Edits reach the engine one at a time, in the order they were made.
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Draw the visible pages that are out of date, the cursor's page first. */
  const paintVisible = useCallback(() => {
    if (painting.current) return;
    painting.current = true;
    const loop = async () => {
      try {
        for (;;) {
          // Typing is ahead of drawing: wait for the last key, then draw once.
          if (pending.current > 0) break;
          const cursorPage = latest.current.cursor?.page ?? -1;
          const todo = [...stale.current].filter((p) => visible.current.has(p));
          if (todo.length === 0) break;
          todo.sort((a, b) => (a === cursorPage ? -1 : b === cursorPage ? 1 : a - b));
          const page = todo[0];
          stale.current.delete(page);
          const image = await enqueue(() => engine.renderPage(id, page, scaleRef.current));
          const canvas = canvases.current[page];
          if (!canvas) continue;
          canvas.width = image.width;
          canvas.height = image.height;
          canvas.getContext('2d')?.putImageData(image, 0, 0);
        }
      } catch (e) {
        onError(String(e));
      } finally {
        painting.current = false;
      }
    };
    void loop();
  }, [enqueue, id, onError]);

  const markAllStale = useCallback(() => {
    stale.current = new Set(latest.current.pages.map((_, i) => i));
    paintVisible();
  }, [paintVisible]);

  // Watch which pages are on screen (with a margin, so scrolling finds them drawn).
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) visible.current.add(page);
          else visible.current.delete(page);
        }
        paintVisible();
      },
      { root, rootMargin: '600px 0px' },
    );
    root.querySelectorAll('[data-page]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc.pages.length, paintVisible, zoom]);

  // Redraw everything when the zoom changes or another document is shown.
  useEffect(() => {
    markAllStale();
  }, [renderScale, id, markAllStale]);

  /** Send one edit; every edit can reflow any page, so all pages are redrawn as they come into view. */
  const run = useCallback(
    (action: () => Promise<DocState | null>, follow = true) => {
      pending.current += 1;
      return enqueue(async () => {
        try {
          const next = await action();
          if (next) {
            latest.current = next;
            followCursor.current = follow;
            onState(next);
          }
        } finally {
          pending.current -= 1;
        }
        if (pending.current === 0) markAllStale();
      }).catch((e) => onError(String(e)));
    },
    [enqueue, markAllStale, onError, onState],
  );

  // Keep the cursor on screen after typing and moving with the keyboard.
  useEffect(() => {
    if (followCursor.current) {
      cursorEl.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      followCursor.current = false;
    }
    setPaintTick((t) => t + 1);
  }, [doc]);

  // Move the hidden text box to the cursor.
  useLayoutEffect(() => {
    const at = doc.cursor ?? doc.selection[doc.selection.length - 1];
    const box = input.current;
    const pageEl = at && (column.current?.querySelector(`[data-page="${at.page}"]`) as HTMLElement | null);
    if (!box || !pageEl || !at) return;
    box.style.left = `${pageEl.offsetLeft + at.x * pxPerPt}px`;
    box.style.top = `${pageEl.offsetTop + at.y * pxPerPt}px`;
  }, [doc, pxPerPt]);

  const focus = useCallback(() => input.current?.focus({ preventScroll: true }), []);

  const command = useCallback(
    async (name: string, params?: Record<string, unknown>, keepFocus?: boolean) => {
      let answer: unknown = null;
      let failed: unknown = null;
      await run(async () => {
        try {
          const reply = await engine.command(id, name, params);
          answer = reply.result;
          return reply.state;
        } catch (e) {
          failed = e;
          return null;
        }
      });
      if (!keepFocus) focus();
      if (failed) throw failed;
      return answer;
    },
    [focus, id, run],
  );

  const commands = useCallback(
    async (list: [string, Record<string, unknown>?][]) => {
      await run(async () => {
        let last: DocState | null = null;
        for (const [name, params] of list) {
          last = (await engine.command(id, name, params)).state;
        }
        return last;
      });
      focus();
    },
    [focus, id, run],
  );

  const copy = useCallback(async () => {
    const answer = (await command('edit.copy')) as { text?: string; html?: string } | null;
    if (answer?.html) await writeHtml(answer.html, answer.text ?? '');
    else if (answer?.text) await writeText(answer.text);
  }, [command]);

  const cut = useCallback(async () => {
    const answer = (await command('edit.cut')) as { text?: string; html?: string } | null;
    if (answer?.html) await writeHtml(answer.html, answer.text ?? '');
    else if (answer?.text) await writeText(answer.text);
  }, [command]);

  useImperativeHandle(ref, () => ({ command, commands, copy, cut, focus }), [command, commands, copy, cut, focus]);

  // Start typing straight away in a newly shown document.
  useEffect(() => {
    focus();
  }, [id, focus]);

  const typeText = (text: string) => {
    if (text) run(() => engine.type(id, text));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || composing.current) return;
    const combo = keyCombo(e);
    if (!combo) return; // plain typing arrives as input
    if (onShortcut(combo)) {
      e.preventDefault();
      return;
    }
    if (combo === 'Mod+C' || combo === 'Mod+Insert') {
      e.preventDefault();
      void copy();
      return;
    }
    if (combo === 'Mod+X' || combo === 'Shift+Delete') {
      e.preventDefault();
      void cut();
      return;
    }
    // Paste arrives as a paste event, with the copied formatting.
    if (combo === 'Mod+V' || combo === 'Shift+Insert') return;
    // Leave Alt+F4 and other plain Alt keys to the system.
    if (/^Alt\+F\d+$/.test(combo)) return;
    e.preventDefault();
    run(async () => (await engine.key(id, combo)) ?? null);
  };

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    if (composing.current) return;
    const box = e.currentTarget;
    const text = box.value;
    box.value = '';
    typeText(text);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const data = e.clipboardData;
    const params: Record<string, string> = {};
    const text = data.getData('text/plain');
    const html = data.getData('text/html');
    const rtf = data.getData('text/rtf');
    if (text) params.text = text;
    if (html) params.html = html;
    if (rtf) params.rtf = rtf;
    if (Object.keys(params).length === 0) return;
    run(async () => (await engine.command(id, 'edit.paste', params)).state);
  };

  const pointOnPage = (e: React.MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / pxPerPt, y: (e.clientY - box.top) / pxPerPt };
  };

  const onPageMouseDown = (e: React.MouseEvent<HTMLElement>, page: number) => {
    if (e.button === 2) {
      // Right click: the cursor moves there first, unless it is on the selection.
      e.preventDefault();
      focus();
      const { x, y } = pointOnPage(e);
      const inSelection = latest.current.selection.some(
        (r) => r.page === page && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
      );
      const o = latest.current.object;
      const onObject = o && o.page === page && x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height;
      if (!inSelection && !onObject) run(() => engine.click(id, page, x, y, false), false);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    focus();
    const { x, y } = pointOnPage(e);
    if (e.detail === 2) {
      // Double click: the word, or into (and out of) the header and footer.
      run(() => engine.doubleClick(id, page, x, y), false);
      return;
    }
    if (e.detail === 3) {
      run(async () => {
        await engine.click(id, page, x, y, false);
        return (await engine.command(id, 'select.paragraph')).state;
      }, false);
      return;
    }
    dragging.current = true;
    run(() => engine.click(id, page, x, y, e.shiftKey), false);
  };

  const onPageMouseMove = (e: React.MouseEvent<HTMLElement>, page: number) => {
    // Drag to select; skip moves while the engine is still busy with the last one.
    if (!dragging.current || (e.buttons & 1) === 0 || pending.current > 0) return;
    const { x, y } = pointOnPage(e);
    run(() => engine.click(id, page, x, y, true), false);
  };

  useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const cursor = doc.cursor;

  // Dragging a selected picture to move it, or a corner to resize it.
  const [objectDrag, setObjectDrag] = useState<ObjectDrag | null>(null);
  const objectDragRef = useRef<ObjectDrag | null>(null);
  objectDragRef.current = objectDrag;

  const startObjectDrag = (e: React.MouseEvent, kind: ObjectDrag['kind']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    focus();
    setObjectDrag({ kind, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
  };

  useEffect(() => {
    if (!objectDrag) return;
    const move = (e: MouseEvent) => {
      const d = objectDragRef.current;
      if (d) setObjectDrag({ ...d, dx: e.clientX - d.startX, dy: e.clientY - d.startY });
    };
    const up = (e: MouseEvent) => {
      const d = objectDragRef.current;
      setObjectDrag(null);
      const o = latest.current.object;
      if (!d || !o) return;
      const dx = (e.clientX - d.startX) / pxPerPt;
      const dy = (e.clientY - d.startY) / pxPerPt;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (d.kind === 'move') {
        // Dropped on another page: it moves there.
        let page = o.page;
        let x = o.x + dx;
        let y = o.y + dy;
        const target = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.page !== undefined) as HTMLElement | undefined;
        if (target && Number(target.dataset.page) !== o.page) {
          const r = target.getBoundingClientRect();
          page = Number(target.dataset.page);
          const grabX = (d.startX - (column.current?.querySelector(`[data-page="${o.page}"]`)?.getBoundingClientRect().left ?? 0)) / pxPerPt - o.x;
          const grabY = (d.startY - (column.current?.querySelector(`[data-page="${o.page}"]`)?.getBoundingClientRect().top ?? 0)) / pxPerPt - o.y;
          x = (e.clientX - r.left) / pxPerPt - grabX;
          y = (e.clientY - r.top) / pxPerPt - grabY;
        }
        run(async () => (await engine.command(id, 'arrange.bounds', { page, x, y })).state);
      } else {
        const { width, height } = resized(o.width, o.height, d.kind, dx, dy);
        run(async () => (await engine.command(id, 'arrange.bounds', { width, height })).state);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectDrag !== null, id, pxPerPt, run]);

  const object = doc.object;

  // The page in the top third of the window is the current one, for the status bar.
  const reportPage = useCallback(() => {
    const root = scroller.current;
    if (!root) return;
    const line = root.scrollTop + root.clientHeight / 3;
    const pages = root.querySelectorAll<HTMLElement>('[data-page]');
    let current = 0;
    pages.forEach((el, i) => {
      if (el.offsetTop <= line) current = i;
    });
    onCurrentPage(current);
  }, [onCurrentPage]);

  useEffect(() => {
    reportPage();
  }, [doc.pages.length, zoom, reportPage]);

  return (
    <div
      ref={scroller}
      onScroll={reportPage}
      className="relative flex-1 overflow-auto bg-[#E9EEF5] outline-none"
      onMouseDown={(e) => {
        // Clicking the grey area keeps the keyboard in the document.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          focus();
        }
      }}
    >
      <div ref={column} className="relative flex min-w-fit flex-col items-center gap-6 px-6 py-6">
        {doc.pages.map((page, i) => (
          <div
            key={i}
            data-page={i}
            className="relative shrink-0 bg-white shadow-[0_1px_3px_rgba(8,59,105,0.18),0_4px_14px_rgba(8,59,105,0.08)]"
            style={{ width: page.width * pxPerPt, height: page.height * pxPerPt }}
            onMouseDown={(e) => onPageMouseDown(e, i)}
            onMouseMove={(e) => onPageMouseMove(e, i)}
            onContextMenu={(e) => {
              e.preventDefault();
              // Wait for the click to reach the engine, so the menu sees the new cursor.
              const { clientX, clientY } = e;
              void enqueue(async () => undefined).then(() => onContextMenu(clientX, clientY));
            }}
          >
            <canvas
              ref={(el) => {
                canvases.current[i] = el;
              }}
              className="pointer-events-none block h-full w-full"
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
            {object?.page === i && (
              <ObjectFrame
                o={object}
                pxPerPt={pxPerPt}
                drag={objectDrag}
                onStart={startObjectDrag}
              />
            )}
            {cursor?.page === i && (
              <div
                ref={cursorEl}
                className="lithora-caret pointer-events-none absolute w-[2px] bg-[#083B69]"
                style={{
                  left: cursor.x * pxPerPt,
                  top: cursor.y * pxPerPt,
                  height: Math.max(cursor.height * pxPerPt, 12),
                }}
              />
            )}
          </div>
        ))}
        {/* The keyboard goes into this text box, kept at the cursor so input method windows open there. */}
        <textarea
          ref={input}
          aria-label="Document text"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="pointer-events-none absolute left-0 top-0 h-4 w-px resize-none overflow-hidden border-0 bg-transparent p-0 opacity-0 outline-none"
          onKeyDown={onKeyDown}
          onInput={onInput}
          onPaste={onPaste}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false;
            e.currentTarget.value = '';
            typeText(e.data);
          }}
        />
      </div>
    </div>
  );
});

/** A picture's new size when a corner is dragged by (dx, dy) points, keeping its proportions. */
function resized(w: number, h: number, corner: Corner, dx: number, dy: number) {
  const sx = corner === 'ne' || corner === 'se' ? dx : -dx;
  const sy = corner === 'sw' || corner === 'se' ? dy : -dy;
  // Follow whichever way the pointer moved most, keeping the aspect ratio.
  const k = Math.abs(sx / w) > Math.abs(sy / h) ? (w + sx) / w : (h + sy) / h;
  const scale = Math.max(k, 8 / Math.min(w, h));
  return { width: Math.round(w * scale * 10) / 10, height: Math.round(h * scale * 10) / 10 };
}

/** The frame and corner handles around a selected picture, and its outline while dragged. */
function ObjectFrame({
  o,
  pxPerPt,
  drag,
  onStart,
}: {
  o: { x: number; y: number; width: number; height: number };
  pxPerPt: number;
  drag: ObjectDrag | null;
  onStart(e: React.MouseEvent, kind: ObjectDrag['kind']): void;
}) {
  let { x, y, width, height } = o;
  if (drag) {
    if (drag.kind === 'move') {
      x += drag.dx / pxPerPt;
      y += drag.dy / pxPerPt;
    } else {
      const r = resized(width, height, drag.kind, drag.dx / pxPerPt, drag.dy / pxPerPt);
      if (drag.kind === 'nw' || drag.kind === 'sw') x += width - r.width;
      if (drag.kind === 'nw' || drag.kind === 'ne') y += height - r.height;
      width = r.width;
      height = r.height;
    }
  }
  const handle = (corner: Corner, style: React.CSSProperties) => (
    <div
      onMouseDown={(e) => onStart(e, corner)}
      className="absolute h-2.5 w-2.5 rounded-full border border-white bg-[#376FA3] shadow"
      style={{ ...style, cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
    />
  );
  return (
    <div
      className="absolute z-10 cursor-move border border-[#376FA3] outline outline-1 outline-white/70"
      style={{ left: x * pxPerPt, top: y * pxPerPt, width: width * pxPerPt, height: height * pxPerPt, background: drag ? 'rgba(108,159,203,0.12)' : undefined }}
      onMouseDown={(e) => onStart(e, 'move')}
    >
      {handle('nw', { left: -5, top: -5 })}
      {handle('ne', { right: -5, top: -5 })}
      {handle('sw', { left: -5, bottom: -5 })}
      {handle('se', { right: -5, bottom: -5 })}
    </div>
  );
}
