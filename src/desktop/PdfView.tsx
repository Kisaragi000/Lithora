/**
 * The pages of an open PDF, drawn from the file itself (with the edits made so far), and the
 * tools for changing it in place: click a line of text to type in it, drag a picture or shape
 * to move or resize it, add text and signatures.
 *
 * What the page shows comes from the PDF editor in src-tauri/src/pdf, so it is what the saved
 * file will hold. This view draws the cursor, selection and frames on top, and keeps a hidden
 * text box under the cursor for the keyboard, so input methods, dead keys, copy and paste work
 * as in any text field.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { keyCombo } from './PageView';
import type { MenuItem } from './ContextMenu';
import type { Strings } from './strings';
import { letterCount, letterIndex, pdf, PdfEditReply, PdfInfo, PdfPageItems, PdfStyleChange, PdfText, Rect, utf16Index } from './pdf';

const CSS_DPI = 96;
const POINTS_PER_INCH = 72;
/** A drawn page is at most this many pixels across, however far it is zoomed in. */
const MAX_PIXELS = 4200;

export type PdfTool = 'edit' | 'text';

/** What is selected, for the toolbar. */
export type PdfSelection =
  | { kind: 'text'; page: number; item: PdfText; from: number; to: number }
  | { kind: 'graphic' | 'stamp'; page: number; id: number };

export interface PdfViewHandle {
  undo(): void;
  redo(): void;
  /** Restyle the selected letters (the whole line when none are selected). */
  style(change: PdfStyleChange): void;
  deleteSelected(): void;
  /** Put a signature (PNG, base64) on the page in view, `widthPt` wide. */
  placeSignature(png: string, widthPt: number): void;
  /** Draw every page again (another font was chosen). */
  redrawAll(): void;
  /** Finish typing: wait until every change has reached the file. */
  settle(): Promise<void>;
  focus(): void;
  viewport(): { width: number; height: number };
}

interface PdfViewProps {
  t: Strings;
  info: PdfInfo;
  zoom: number;
  tool: PdfTool;
  onTool(tool: PdfTool): void;
  onInfo(info: PdfInfo): void;
  onError(message: string): void;
  onNotice(message: string): void;
  /** App shortcuts such as Ctrl+S; return true when handled. */
  onShortcut(combo: string): boolean;
  onCurrentPage(page: number): void;
  onSelection(sel: PdfSelection | null): void;
  onMenu(x: number, y: number, items: MenuItem[]): void;
  onShowFonts(): void;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** A picture, shape, signature or line being dragged. */
interface Drag {
  page: number;
  kind: 'graphic' | 'stamp' | 'text';
  id: number | string;
  mode: 'move' | Handle;
  /** Where it was, in points. */
  rect: Rect;
  /** How far the pointer moved, in points. */
  dx: number;
  dy: number;
  keepAspect: boolean;
  /** The picture under the frame, to show where it goes. */
  ghost: string | null;
  moved: boolean;
}

interface Editing {
  page: number;
  key: string;
}

/** Where a selected object is. */
type Picked = { kind: 'graphic' | 'stamp'; page: number; id: number };

const union = (a: Rect, b: Rect): Rect => {
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0] + a[2], b[0] + b[2]);
  const y1 = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x0, y0, x1 - x0, y1 - y0];
};
const grow = (r: Rect, mx: number, my = mx): Rect => [r[0] - mx, r[1] - my, r[2] + 2 * mx, r[3] + 2 * my];
const rectOf = (o: { x: number; y: number; width: number; height: number }): Rect => [o.x, o.y, o.width, o.height];

/** A frame's new rectangle when `handle` is dragged by (dx, dy) points. */
function resizedRect(r: Rect, handle: Handle, dx: number, dy: number, keepAspect: boolean): Rect {
  let [x0, y0] = [r[0], r[1]];
  let [x1, y1] = [r[0] + r[2], r[1] + r[3]];
  if (handle.includes('w')) x0 += dx;
  if (handle.includes('e')) x1 += dx;
  if (handle.includes('n')) y0 += dy;
  if (handle.includes('s')) y1 += dy;
  const min = 4;
  if (x1 - x0 < min) handle.includes('w') ? (x0 = x1 - min) : (x1 = x0 + min);
  if (y1 - y0 < min) handle.includes('n') ? (y0 = y1 - min) : (y1 = y0 + min);
  if (keepAspect && handle.length === 2) {
    // Follow whichever way the pointer moved most, keeping the proportions.
    const k = Math.max((x1 - x0) / r[2], (y1 - y0) / r[3]);
    const w = r[2] * k;
    const h = r[3] * k;
    if (handle.includes('w')) x0 = x1 - w;
    else x1 = x0 + w;
    if (handle.includes('n')) y0 = y1 - h;
    else y1 = y0 + h;
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

function dragRect(d: Drag): Rect {
  if (d.mode === 'move') return [d.rect[0] + d.dx, d.rect[1] + d.dy, d.rect[2], d.rect[3]];
  return resizedRect(d.rect, d.mode, d.dx, d.dy, d.keepAspect);
}

const HANDLES: [Handle, number, number, string][] = [
  ['nw', 0, 0, 'nwse-resize'],
  ['n', 0.5, 0, 'ns-resize'],
  ['ne', 1, 0, 'nesw-resize'],
  ['e', 1, 0.5, 'ew-resize'],
  ['se', 1, 1, 'nwse-resize'],
  ['s', 0.5, 1, 'ns-resize'],
  ['sw', 0, 1, 'nesw-resize'],
  ['w', 0, 0.5, 'ew-resize'],
];

/** The letter boundary nearest to x (points) in a line. */
function nearestEdge(item: PdfText, x: number): number {
  let best = 0;
  let dist = Infinity;
  item.edges.forEach((e, i) => {
    const d = Math.abs(e - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/** The word around letter i: [start, end). */
function wordAt(text: string, i: number): [number, number] {
  const letters = Array.from(text);
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_'’-]/u.test(c);
  let a = Math.min(i, letters.length);
  let b = a;
  if (!isWord(letters[a]) && isWord(letters[a - 1])) a -= 1;
  if (!isWord(letters[a])) return [i, Math.min(i + 1, letters.length)];
  while (a > 0 && isWord(letters[a - 1])) a -= 1;
  b = Math.max(b, a);
  while (b < letters.length && isWord(letters[b])) b += 1;
  return [a, b];
}

/** The page's position of a pointer event, in points. */
function pointIn(e: { clientX: number; clientY: number }, el: HTMLElement, pxPerPt: number) {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / pxPerPt, y: (e.clientY - r.top) / pxPerPt };
}

export const PdfView = forwardRef<PdfViewHandle, PdfViewProps>(function PdfView(
  { t, info, zoom, tool, onTool, onInfo, onError, onNotice, onShortcut, onCurrentPage, onSelection, onMenu, onShowFonts },
  ref,
) {
  const id = info.id;
  const pxPerPt = (CSS_DPI * zoom) / POINTS_PER_INCH;
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [items, setItems] = useState<Record<number, PdfPageItems>>({});
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  /** The selected letters of the line being edited, [from, to) (a caret when equal). */
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const composing = useRef(false);
  /** The next change to the text starts a new Undo step. */
  const undoStart = useRef(true);
  /** Set when an undo or redo may have changed the line being edited. */
  const syncing = useRef(false);
  const latest = useRef({ onInfo, onError, onNotice, onSelection, onCurrentPage, t, tool, pxPerPt });
  latest.current = { onInfo, onError, onNotice, onSelection, onCurrentPage, t, tool, pxPerPt };

  // ---- Changes go to the PDF editor one at a time, in order. ----
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch((e) => latest.current.onError(String(e)));
    return run;
  }, []);

  // ---- Drawing the pages. ----
  const renderScale = Math.min(pxPerPt * (window.devicePixelRatio || 1), ...info.pages.map((p) => MAX_PIXELS / Math.max(p.width, p.height, 1)));
  const scaleRef = useRef(renderScale);
  scaleRef.current = renderScale;
  /** The scale each canvas was drawn at. */
  const drawnAt = useRef(new Map<number, number>());
  /** What each page needs drawn again: all of it, or a rectangle (points). */
  const dirty = useRef(new Map<number, Rect | 'all'>());
  const visible = useRef(new Set<number>());
  const drawing = useRef(false);

  const draw = useCallback(async () => {
    if (drawing.current) return;
    drawing.current = true;
    try {
      for (;;) {
        const todo = [...dirty.current.keys()].filter((p) => visible.current.has(p));
        if (todo.length === 0) break;
        // The page being edited first, then the others in order.
        const now = editingRef.current?.page ?? pickedRef.current?.page;
        const page = todo.includes(now ?? -1) ? (now as number) : Math.min(...todo);
        const what = dirty.current.get(page);
        dirty.current.delete(page);
        const canvas = canvases.current[page];
        if (!canvas || what === undefined) continue;
        const scale = scaleRef.current;
        const whole = what === 'all' || drawnAt.current.get(page) !== scale;
        const img = await pdf.render(id, page, scale, whole ? undefined : (what as Rect));
        if (scale !== scaleRef.current || canvases.current[page] !== canvas) {
          dirty.current.set(page, 'all');
          continue;
        }
        if (whole) {
          canvas.width = img.width;
          canvas.height = img.height;
          drawnAt.current.set(page, scale);
        }
        canvas.getContext('2d')?.putImageData(img.image, img.x, img.y);
      }
    } catch (e) {
      latest.current.onError(String(e));
    } finally {
      drawing.current = false;
    }
  }, [id]);

  const invalidate = useCallback(
    (page: number, rect?: Rect) => {
      const now = dirty.current.get(page);
      if (!rect || now === 'all') dirty.current.set(page, 'all');
      else dirty.current.set(page, now ? union(now, rect) : rect);
      void draw();
    },
    [draw],
  );

  const loadItems = useCallback(
    (page: number) => {
      pdf
        .items(id, page)
        .then((it) => setItems((all) => ({ ...all, [page]: it })))
        .catch((e) => latest.current.onError(String(e)));
    },
    [id],
  );

  // Pages near the window are drawn (and their text read); far ones give their memory back.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const near = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) {
            visible.current.add(page);
            if (drawnAt.current.get(page) !== scaleRef.current) dirty.current.set(page, 'all');
            if (!itemsRef.current[page]) loadItems(page);
          } else visible.current.delete(page);
        }
        void draw();
      },
      { root, rootMargin: '800px 0px' },
    );
    const far = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          const canvas = canvases.current[page];
          if (canvas && drawnAt.current.has(page)) {
            canvas.width = 0;
            canvas.height = 0;
            drawnAt.current.delete(page);
          }
        }
      },
      { root, rootMargin: '4000px 0px' },
    );
    for (const el of pageEls.current) {
      if (el) {
        near.observe(el);
        far.observe(el);
      }
    }
    return () => {
      near.disconnect();
      far.disconnect();
    };
  }, [draw, loadItems, info.pages.length]);

  // A new zoom: every page is drawn again at the new size (the old drawing stretches meanwhile).
  useEffect(() => {
    for (const p of visible.current) dirty.current.set(p, 'all');
    void draw();
  }, [renderScale, draw]);

  // ---- Replies from the editor. ----
  const textBox = (page: number, key: string, list?: PdfPageItems) => (list ?? itemsRef.current[page])?.texts.find((x) => x.key === key) ?? null;

  /** Take an edit's reply: the new items, the state, and the part of the page to draw again. */
  const apply = useCallback(
    (r: PdfEditReply, page: number, before: Rect | null, after?: (items: PdfPageItems) => Rect | null) => {
      setItems((all) => ({ ...all, [page]: r.items }));
      itemsRef.current = { ...itemsRef.current, [page]: r.items };
      latest.current.onInfo(r.info);
      const now = after?.(r.items) ?? null;
      const area = before && now ? union(before, now) : (before ?? now);
      invalidate(page, area ? grow(area, Math.max(6, area[3] * 0.4), Math.max(3, area[3] * 0.35)) : undefined);
    },
    [invalidate],
  );

  const textArea = (page: number, key: string, list?: PdfPageItems): Rect | null => {
    const it = textBox(page, key, list);
    // An emptied line still had its letters drawn until now: its old box covers them.
    return it ? rectOf(it) : null;
  };

  // ---- Editing a line. ----
  const pendingText = useRef<{ page: number; key: string; value: string } | null>(null);
  const sendText = useCallback(
    (page: number, key: string, value: string) => {
      const had = pendingText.current !== null;
      pendingText.current = { page, key, value };
      if (had) return;
      void enqueue(async () => {
        const job = pendingText.current;
        pendingText.current = null;
        if (!job) return;
        const before = textArea(job.page, job.key);
        const undoable = undoStart.current;
        undoStart.current = false;
        const r = await pdf.setText(id, job.page, job.key, job.value, undoable);
        apply(r, job.page, before, (list) => textArea(job.page, job.key, list));
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, enqueue, id],
  );

  const syncSel = useCallback(() => {
    const ta = input.current;
    const ed = editingRef.current;
    if (!ta || !ed) return;
    const a = letterIndex(ta.value, ta.selectionStart ?? 0);
    const b = letterIndex(ta.value, ta.selectionEnd ?? 0);
    setSel((s) => (s[0] === a && s[1] === b ? s : [a, b]));
  }, []);

  const focusInput = useCallback(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  /** Stop typing in the line being edited. An empty new text box goes away. */
  const finishEditing = useCallback(() => {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null);
    editingRef.current = null;
    const it = textBox(ed.page, ed.key);
    if (ed.key.startsWith('n') && it && it.text === '' && !pendingText.current) {
      void enqueue(async () => {
        const before = textArea(ed.page, ed.key);
        apply(await pdf.deleteText(id, ed.page, ed.key), ed.page, before);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, enqueue, id]);

  const startEditing = useCallback(
    (page: number, key: string, from: number, to = from) => {
      const it = textBox(page, key);
      if (!it) return;
      if (!it.editable) {
        latest.current.onNotice(itemsRef.current[page]?.locked ? latest.current.t.pdfRotatedLocked : latest.current.t.pdfUnsupported);
        return;
      }
      const ed = editingRef.current;
      const fresh = !ed || ed.page !== page || ed.key !== key;
      if (fresh) {
        finishEditing();
        undoStart.current = true;
        const next = { page, key };
        editingRef.current = next;
        setEditing(next);
      }
      setPicked(null);
      const ta = input.current;
      if (ta) {
        // Typing in the same line goes on from what was typed (the editor may still be catching up).
        if (fresh) ta.value = it.text;
        const [a, b] = from <= to ? [from, to] : [to, from];
        ta.setSelectionRange(utf16Index(ta.value, a), utf16Index(ta.value, b), from <= to ? 'forward' : 'backward');
        focusInput();
      }
      setSel([from, to]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finishEditing, focusInput],
  );

  /** Select a picture, shape or signature (the keyboard then moves or deletes it). */
  const pick = useCallback(
    (p: Picked | null) => {
      finishEditing();
      setPicked(p);
      const ta = input.current;
      if (ta && p) {
        ta.value = '';
        focusInput();
      }
    },
    [finishEditing, focusInput],
  );

  // The toolbar follows the selection.
  const editItem = editing ? textBox(editing.page, editing.key) : null;
  useEffect(() => {
    if (editing && editItem) latest.current.onSelection({ kind: 'text', page: editing.page, item: editItem, from: sel[0], to: sel[1] });
    else if (picked) latest.current.onSelection(picked);
    else latest.current.onSelection(null);
  }, [editing, editItem, picked, sel]);

  // A line that disappears (undone) stops being edited; one whose text changed underneath
  // (undone, redone) shows its new text.
  useEffect(() => {
    if (!editing) return;
    const it = textBox(editing.page, editing.key);
    if (!it) {
      setEditing(null);
      return;
    }
    const ta = input.current;
    if (ta && !pendingText.current && !composing.current && ta.value !== it.text && syncing.current) {
      syncing.current = false;
      const at = Math.min(letterIndex(ta.value, ta.selectionStart ?? 0), letterCount(it.text));
      ta.value = it.text;
      ta.setSelectionRange(utf16Index(it.text, at), utf16Index(it.text, at));
      setSel([at, at]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, editing]);
  // ---- Undo, redo, styles, deleting. ----
  const undoRedo = useCallback(
    (redo: boolean) => {
      void enqueue(async () => {
        const r = redo ? await pdf.redo(id) : await pdf.undo(id);
        latest.current.onInfo(r.info);
        undoStart.current = true;
        syncing.current = true;
        for (const p of r.pages) {
          const list = await pdf.items(id, p);
          setItems((all) => ({ ...all, [p]: list }));
          itemsRef.current = { ...itemsRef.current, [p]: list };
          invalidate(p);
        }
      });
    },
    [enqueue, id, invalidate],
  );

  const style = useCallback(
    (change: PdfStyleChange) => {
      const ed = editingRef.current;
      if (!ed) return;
      const [a, b] = sel[0] <= sel[1] ? sel : [sel[1], sel[0]];
      const whole = a === b;
      void enqueue(async () => {
        const before = textArea(ed.page, ed.key);
        const r = await pdf.styleText(id, ed.page, ed.key, whole ? 0 : a, whole ? 0 : b, change);
        undoStart.current = true;
        apply(r, ed.page, before, (list) => textArea(ed.page, ed.key, list));
      });
      focusInput();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, enqueue, focusInput, id, sel],
  );

  const placeObject = useCallback(
    (p: Picked, rect: Rect | null) => {
      void enqueue(async () => {
        const list = itemsRef.current[p.page];
        const old = p.kind === 'graphic' ? list?.graphics.find((g) => g.id === p.id) : list?.stamps.find((s) => s.id === p.id);
        const before = old ? grow(rectOf(old), 6) : null;
        const r = p.kind === 'graphic' ? await pdf.placeGraphic(id, p.page, p.id, rect) : await pdf.placeStamp(id, p.page, p.id, rect);
        apply(r, p.page, before, () => (rect ? grow(rect, 6) : null));
        if (!rect) setPicked(null);
      });
    },
    [apply, enqueue, id],
  );

  const deleteText = useCallback(
    (page: number, key: string) => {
      if (editingRef.current?.key === key && editingRef.current.page === page) {
        setEditing(null);
        editingRef.current = null;
      }
      void enqueue(async () => {
        const before = textArea(page, key);
        apply(await pdf.deleteText(id, page, key), page, before);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, enqueue, id],
  );

  const deleteSelected = useCallback(() => {
    const p = pickedRef.current;
    if (p) return placeObject(p, null);
    const ed = editingRef.current;
    if (ed) deleteText(ed.page, ed.key);
  }, [deleteText, placeObject]);

  /** The page most in view, and the middle of the part of it in view (points). */
  const pageInView = useCallback(() => {
    const root = scroller.current?.getBoundingClientRect();
    let best = 0;
    let most = -1;
    pageEls.current.forEach((el, i) => {
      if (!el || !root) return;
      const r = el.getBoundingClientRect();
      const shown = Math.min(r.bottom, root.bottom) - Math.max(r.top, root.top);
      if (shown > most) {
        most = shown;
        best = i;
      }
    });
    const el = pageEls.current[best];
    const r = el?.getBoundingClientRect();
    const px = latest.current.pxPerPt;
    if (!r || !root) return { page: best, x: 100, y: 100 };
    const top = Math.max(r.top, root.top);
    const bottom = Math.min(r.bottom, root.bottom);
    return { page: best, x: (Math.max(r.left, root.left) + Math.min(r.right, root.right) - 2 * r.left) / 2 / px, y: ((top + bottom) / 2 - r.top) / px };
  }, []);

  const placeSignature = useCallback(
    (png: string, widthPt: number) => {
      const img = new Image();
      img.onload = () => {
        const at = pageInView();
        const page = info.pages[at.page];
        const w = Math.min(widthPt, page.width * 0.45);
        const h = (w * img.naturalHeight) / Math.max(1, img.naturalWidth);
        const rect: Rect = [Math.max(0, at.x - w / 2), Math.max(0, at.y - h / 2), w, h];
        void enqueue(async () => {
          finishEditing();
          const [sid, r] = await pdf.addStamp(id, at.page, png, rect);
          apply(r, at.page, null, () => grow(rect, 4));
          setPicked({ kind: 'stamp', page: at.page, id: sid });
          focusInput();
        });
      };
      img.src = `data:image/png;base64,${png}`;
    },
    [apply, enqueue, finishEditing, focusInput, id, info.pages, pageInView],
  );

  useImperativeHandle(
    ref,
    () => ({
      undo: () => undoRedo(false),
      redo: () => undoRedo(true),
      style,
      deleteSelected,
      placeSignature,
      redrawAll: () => {
        for (let p = 0; p < info.pages.length; p++) dirty.current.set(p, 'all');
        drawnAt.current.clear();
        for (const p of Object.keys(itemsRef.current)) loadItems(Number(p));
        void draw();
      },
      settle: async () => {
        await enqueue(async () => undefined);
      },
      focus: focusInput,
      viewport: () => ({ width: scroller.current?.clientWidth ?? 800, height: scroller.current?.clientHeight ?? 600 }),
    }),
    [deleteSelected, draw, enqueue, focusInput, info.pages.length, loadItems, placeSignature, style, undoRedo],
  );

  // ---- The keyboard. ----
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing.current || e.nativeEvent.isComposing) return;
    const combo = keyCombo(e);
    const ed = editingRef.current;
    const p = pickedRef.current;
    switch (combo) {
      case 'Mod+Z':
        e.preventDefault();
        return undoRedo(false);
      case 'Mod+Y':
      case 'Mod+Shift+Z':
        e.preventDefault();
        return undoRedo(true);
      case 'Mod+B':
      case 'Mod+I':
      case 'Mod+U': {
        e.preventDefault();
        const it = ed && textBox(ed.page, ed.key);
        if (!it) return;
        if (combo === 'Mod+B') style({ bold: !it.bold });
        else if (combo === 'Mod+I') style({ italic: !it.italic });
        else style({ underline: !it.underline });
        return;
      }
      case 'Escape':
        e.preventDefault();
        if (ed) finishEditing();
        else if (p) setPicked(null);
        else if (latest.current.tool !== 'edit') onTool('edit');
        return;
      case 'Enter':
        if (ed) {
          e.preventDefault();
          finishEditing();
        }
        return;
    }
    if (p) {
      // A selected object: arrows nudge it, Delete removes it.
      if (combo === 'Delete' || combo === 'Backspace') {
        e.preventDefault();
        return placeObject(p, null);
      }
      const nudge = /^(Shift\+)?(Left|Right|Up|Down)$/.exec(combo ?? '');
      if (nudge) {
        e.preventDefault();
        const step = nudge[1] ? 10 : 1;
        const list = itemsRef.current[p.page];
        const o = p.kind === 'graphic' ? list?.graphics.find((g) => g.id === p.id) : list?.stamps.find((s) => s.id === p.id);
        if (!o) return;
        const dx = nudge[2] === 'Left' ? -step : nudge[2] === 'Right' ? step : 0;
        const dy = nudge[2] === 'Up' ? -step : nudge[2] === 'Down' ? step : 0;
        return placeObject(p, [o.x + dx, o.y + dy, o.width, o.height]);
      }
      if (combo && onShortcut(combo)) e.preventDefault();
      else if (!combo) e.preventDefault();
      return;
    }
    if (ed && (combo === 'Up' || combo === 'Down' || combo === 'Tab' || combo === 'Shift+Tab')) {
      // To the line above or below, at about the same place across.
      const list = itemsRef.current[ed.page];
      const it = textBox(ed.page, ed.key);
      if (!list || !it) return;
      e.preventDefault();
      const x = it.edges[Math.min(sel[1], it.edges.length - 1)] ?? it.x;
      const others = list.texts.filter((o) => o.key !== it.key && o.editable && o.text !== '');
      let next: PdfText | undefined;
      if (combo === 'Tab' || combo === 'Shift+Tab') {
        const i = list.texts.findIndex((o) => o.key === it.key);
        const step = combo === 'Tab' ? 1 : -1;
        for (let j = i + step; j >= 0 && j < list.texts.length; j += step) {
          if (list.texts[j].editable && list.texts[j].text !== '') {
            next = list.texts[j];
            break;
          }
        }
        if (next) return startEditing(ed.page, next.key, step > 0 ? 0 : letterCount(next.text));
        return;
      }
      const down = combo === 'Down';
      const score = (o: PdfText) => {
        const gap = down ? o.baseline - it.baseline : it.baseline - o.baseline;
        if (gap <= it.height * 0.3) return Infinity;
        const across = x < o.x ? o.x - x : x > o.x + o.width ? x - o.x - o.width : 0;
        return gap + across * 3;
      };
      next = others.reduce<PdfText | undefined>((best, o) => (score(o) < (best ? score(best) : Infinity) ? o : best), undefined);
      if (next && score(next) < Infinity) {
        const i = nearestEdge(next, x);
        startEditing(ed.page, next.key, i);
      }
      return;
    }
    if (combo && /^Mod\+/.test(combo) && !/^Mod\+(Shift\+)?(A|C|X|V|Left|Right|Home|End|Backspace|Delete)$/.test(combo)) {
      if (onShortcut(combo)) e.preventDefault();
      return;
    }
    if (combo && /^F\d+$/.test(combo) && onShortcut(combo)) {
      e.preventDefault();
      return;
    }
    if (!ed) {
      if (combo === 'Delete' || combo === 'Backspace' || !combo) e.preventDefault();
      return;
    }
    requestAnimationFrame(syncSel);
  };

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const ed = editingRef.current;
    if (!ed) {
      ta.value = '';
      return;
    }
    if (composing.current) return;
    // A line holds one line: pasted line breaks become spaces.
    if (/[\r\n\t]/.test(ta.value)) {
      const at = ta.selectionStart ?? 0;
      ta.value = ta.value.replace(/\r\n/g, ' ').replace(/[\r\n\t]/g, ' ');
      ta.setSelectionRange(at, at);
    }
    sendText(ed.page, ed.key, ta.value);
    syncSel();
  };

  // ---- The mouse. ----
  /** A press on a line of text: start typing there; drag to select; double-click for a word. */
  const onTextDown = (e: React.MouseEvent, page: number, it: PdfText) => {
    if (e.button !== 0) return;
    if (latest.current.tool !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();
    const el = pageEls.current[page];
    if (!el) return;
    const at = nearestEdge(it, pointIn(e, el, pxPerPt).x);
    if (e.detail === 2) {
      const [a, b] = wordAt(it.text, at);
      return startEditing(page, it.key, a, b);
    }
    if (e.detail >= 3) return startEditing(page, it.key, 0, letterCount(it.text));
    const ed = editingRef.current;
    const anchor = e.shiftKey && ed?.key === it.key && ed.page === page ? sel[0] : at;
    startEditing(page, it.key, anchor, at);
    const move = (m: MouseEvent) => {
      const cur = textBox(page, it.key);
      if (!cur) return;
      const to = nearestEdge(cur, pointIn(m, el, latest.current.pxPerPt).x);
      const ta = input.current;
      if (!ta) return;
      const [a, b] = anchor <= to ? [anchor, to] : [to, anchor];
      ta.setSelectionRange(utf16Index(ta.value, a), utf16Index(ta.value, b), anchor <= to ? 'forward' : 'backward');
      setSel([anchor, to]);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      focusInput();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /** A press on a picture, shape, signature (or a frame's handle): select it, drag to move or resize. */
  const onObjectDown = (e: React.MouseEvent, p: Picked | { kind: 'text'; page: number; id: string }, rect: Rect, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    if (latest.current.tool !== 'edit' && p.kind !== 'text') return;
    e.preventDefault();
    e.stopPropagation();
    if (p.kind !== 'text') pick(p);
    const canvas = canvases.current[p.page];
    const start = { x: e.clientX, y: e.clientY };
    const keepAspect = mode.length === 2 && mode !== 'move' && (p.kind === 'stamp' || (p.kind === 'graphic' && !e.shiftKey));
    let ghost: string | null = null;
    const d: Drag = { page: p.page, kind: p.kind, id: p.id, mode, rect, dx: 0, dy: 0, keepAspect, ghost: null, moved: false };
    const move = (m: MouseEvent) => {
      const px = latest.current.pxPerPt;
      const dx = (m.clientX - start.x) / px;
      const dy = (m.clientY - start.y) / px;
      if (!d.moved && Math.hypot(m.clientX - start.x, m.clientY - start.y) < 3) return;
      if (!d.moved && canvas && drawnAt.current.has(p.page)) {
        // A copy of what is under the frame, to drag along.
        const s = drawnAt.current.get(p.page) ?? 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(rect[2] * s));
        c.height = Math.max(1, Math.round(rect[3] * s));
        c.getContext('2d')?.drawImage(canvas, rect[0] * s, rect[1] * s, rect[2] * s, rect[3] * s, 0, 0, c.width, c.height);
        try {
          ghost = c.toDataURL();
        } catch {
          ghost = null;
        }
      }
      d.moved = true;
      setDrag({ ...d, dx, dy, ghost, keepAspect: mode.length === 2 && mode !== 'move' && (p.kind === 'stamp' || !m.shiftKey), moved: true });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const last = dragRef.current;
      setDrag(null);
      if (!last || !last.moved) {
        if (p.kind !== 'text') focusInput();
        return;
      }
      const r = dragRect(last);
      if (p.kind === 'text') {
        const ed = editingRef.current;
        void enqueue(async () => {
          const before = textArea(p.page, p.id);
          const reply = await pdf.moveText(id, p.page, p.id, r[0] - rect[0], r[1] - rect[1]);
          undoStart.current = true;
          apply(reply, p.page, before, (list) => textArea(p.page, p.id, list));
        });
        if (ed) focusInput();
      } else {
        placeObject(p, r);
        focusInput();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /** A press on the page itself: add text there (Add text tool), or let go of the selection. */
  const onPageDown = (e: React.MouseEvent, page: number) => {
    if (e.button !== 0) return;
    const el = pageEls.current[page];
    if (!el) return;
    if (latest.current.tool === 'text') {
      e.preventDefault();
      const at = pointIn(e, el, pxPerPt);
      addTextAt(page, at.x, at.y);
      return;
    }
    e.preventDefault();
    finishEditing();
    setPicked(null);
    focusInput();
  };

  const addTextAt = (page: number, x: number, y: number) => {
    finishEditing();
    setPicked(null);
    onTool('edit');
    void enqueue(async () => {
      // The click is where the top of the letters goes; the editor takes the baseline.
      const [key, r] = await pdf.addText(id, page, x, y + 10, '');
      apply(r, page, null, (list) => textArea(page, key, list));
      undoStart.current = false;
      requestAnimationFrame(() => startEditing(page, key, 0));
    });
  };

  const menuAt = (e: React.MouseEvent, page: number, target: { text?: PdfText; object?: Picked }) => {
    e.preventDefault();
    e.stopPropagation();
    const el = pageEls.current[page];
    if (!el) return;
    const at = pointIn(e, el, pxPerPt);
    const list: MenuItem[] = [];
    if (target.text) {
      const it = target.text;
      if (it.editable) {
        list.push({ label: t.pdfEditText, onClick: () => startEditing(page, it.key, nearestEdge(it, at.x)) });
        list.push({ label: t.pdfDeleteText, onClick: () => deleteText(page, it.key) });
      }
    } else if (target.object) {
      const o = target.object;
      pick(o);
      list.push({ label: t.pdfDelete, onClick: () => placeObject(o, null) });
    } else {
      list.push({ label: t.pdfAddTextHere, onClick: () => addTextAt(page, at.x, at.y) });
    }
    list.push({ separator: true }, { label: t.undo, disabled: !info.canUndo, onClick: () => undoRedo(false) }, { label: t.redo, disabled: !info.canRedo, onClick: () => undoRedo(true) });
    onMenu(e.clientX, e.clientY, list);
  };

  // The page shown most is the current one.
  const reportPage = () => latest.current.onCurrentPage(pageInView().page);
  useEffect(() => {
    latest.current.onCurrentPage(0);
    input.current?.focus({ preventScroll: true });
  }, []);

  // The keyboard box sits at the cursor, so an input method's window opens there.
  const caret = (() => {
    if (!editing || !editItem) return null;
    const edges = editItem.edges;
    const at = Math.min(Math.max(sel[1], 0), edges.length - 1);
    return { page: editing.page, x: edges[at] ?? editItem.x, y: editItem.y, height: editItem.height };
  })();
  useLayoutEffect(() => {
    const ta = input.current;
    const el = caret ? pageEls.current[caret.page] : null;
    if (!ta || !el || !caret) return;
    ta.style.left = `${el.offsetLeft + caret.x * pxPerPt}px`;
    ta.style.top = `${el.offsetTop + caret.y * pxPerPt}px`;
  });

  // Keep the edited line in view while typing makes it longer.
  useEffect(() => {
    if (!caret) return;
    const el = pageEls.current[caret.page];
    const root = scroller.current;
    if (!el || !root) return;
    const r = root.getBoundingClientRect();
    const cx = el.getBoundingClientRect().left + caret.x * pxPerPt;
    if (cx > r.right - 24) root.scrollLeft += cx - r.right + 48;
    else if (cx < r.left + 8) root.scrollLeft -= r.left + 48 - cx;
  }, [caret?.x, caret?.page, pxPerPt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing tool lets go of the selection.
  useEffect(() => {
    if (tool !== 'edit') {
      finishEditing();
      setPicked(null);
    }
  }, [tool, finishEditing]);

  const frame = (page: number, r: Rect, handles: boolean, onDown: (e: React.MouseEvent, mode: Drag['mode']) => void) => (
    <div
      className="absolute z-30 outline outline-2 outline-[#376FA3]"
      style={{ left: r[0] * pxPerPt, top: r[1] * pxPerPt, width: r[2] * pxPerPt, height: r[3] * pxPerPt, cursor: 'move' }}
      onMouseDown={(e) => onDown(e, 'move')}
      onContextMenu={(e) => e.preventDefault()}
      data-page-frame={page}
    >
      {handles &&
        HANDLES.map(([h, fx, fy, cursor]) => (
          <div
            key={h}
            onMouseDown={(e) => onDown(e, h)}
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-white bg-[#376FA3] shadow"
            style={{ left: `calc(${fx * 100}% - 5px)`, top: `calc(${fy * 100}% - 5px)`, cursor }}
          />
        ))}
    </div>
  );

  return (
    <div
      ref={scroller}
      onScroll={reportPage}
      className="relative flex-1 overflow-auto bg-[#E9EEF5] outline-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          finishEditing();
          setPicked(null);
        }
      }}
    >
      <div className="relative flex min-w-fit flex-col items-center gap-6 px-6 py-6">
        {info.pages.map((size, i) => {
          const list = items[i];
          const sizePx = { width: size.width * pxPerPt, height: size.height * pxPerPt };
          return (
            <div
              key={i}
              ref={(el) => {
                pageEls.current[i] = el;
              }}
              data-page={i}
              className="relative shrink-0 bg-white shadow-[0_1px_3px_rgba(8,59,105,0.18),0_4px_14px_rgba(8,59,105,0.08)]"
              style={{ ...sizePx, cursor: tool === 'text' ? 'crosshair' : 'default' }}
              onMouseDown={(e) => onPageDown(e, i)}
              onContextMenu={(e) => menuAt(e, i, {})}
            >
              <canvas
                ref={(el) => {
                  if (canvases.current[i] !== el) drawnAt.current.delete(i);
                  canvases.current[i] = el;
                }}
                className="pointer-events-none absolute inset-0 block h-full w-full"
              />
              {list?.graphics.map((g) => {
                const p: Picked = { kind: 'graphic', page: i, id: g.id };
                const isPicked = picked?.kind === 'graphic' && picked.page === i && picked.id === g.id;
                if (isPicked) return null;
                return (
                  <div
                    key={`g${g.id}`}
                    title={g.kind === 'image' ? t.pdfPicture : t.pdfShape}
                    className={`absolute z-10 ${tool === 'edit' ? 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#376FA3]' : ''}`}
                    style={{ left: g.x * pxPerPt, top: g.y * pxPerPt, width: g.width * pxPerPt, height: g.height * pxPerPt, cursor: tool === 'edit' ? 'move' : undefined }}
                    onMouseDown={(e) => onObjectDown(e, p, rectOf(g), 'move')}
                    onContextMenu={(e) => menuAt(e, i, { object: p })}
                  />
                );
              })}
              {list?.stamps.map((s) => {
                const p: Picked = { kind: 'stamp', page: i, id: s.id };
                if (picked?.kind === 'stamp' && picked.page === i && picked.id === s.id) return null;
                return (
                  <div
                    key={`s${s.id}`}
                    title={t.pdfSignature}
                    className="absolute z-[25] hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#376FA3]"
                    style={{ left: s.x * pxPerPt, top: s.y * pxPerPt, width: s.width * pxPerPt, height: s.height * pxPerPt, cursor: 'move' }}
                    onMouseDown={(e) => onObjectDown(e, p, rectOf(s), 'move')}
                    onContextMenu={(e) => menuAt(e, i, { object: p })}
                  />
                );
              })}
              {list?.texts.map((it) => {
                const isEditing = editing?.page === i && editing.key === it.key;
                if (it.text === '' && !isEditing) return null;
                return (
                  <div
                    key={it.key}
                    data-text-key={it.key}
                    className={`absolute z-20 ${
                      isEditing
                        ? 'outline outline-1 outline-[#376FA3]'
                        : tool === 'edit' && it.editable
                          ? 'hover:bg-[#6C9FCB]/10 hover:outline hover:outline-1 hover:outline-[#6C9FCB]'
                          : ''
                    }`}
                    style={{
                      left: it.x * pxPerPt - 1,
                      top: it.y * pxPerPt,
                      width: Math.max(it.width * pxPerPt + 2, 4),
                      height: it.height * pxPerPt,
                      cursor: tool === 'edit' ? (it.editable ? 'text' : 'not-allowed') : undefined,
                    }}
                    onMouseDown={(e) => (tool === 'edit' ? onTextDown(e, i, it) : undefined)}
                    onContextMenu={(e) => menuAt(e, i, { text: it })}
                  >
                    {isEditing && !drag && (
                      // Drag the line somewhere else by this handle.
                      <div
                        title={t.pdfEditHint}
                        className="absolute -left-5 top-1/2 flex h-5 w-4 -translate-y-1/2 cursor-move items-center justify-center rounded-sm bg-[#376FA3] text-white shadow"
                        onMouseDown={(e) => onObjectDown(e, { kind: 'text', page: i, id: it.key }, rectOf(it), 'move')}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                );
              })}
              {editing?.page === i && editItem && sel[0] !== sel[1] && (
                <div
                  className="pointer-events-none absolute z-20 bg-[#6C9FCB]/35"
                  style={(() => {
                    const [a, b] = sel[0] < sel[1] ? sel : [sel[1], sel[0]];
                    const e = editItem.edges;
                    const x0 = e[Math.min(a, e.length - 1)] ?? editItem.x;
                    const x1 = e[Math.min(b, e.length - 1)] ?? editItem.x;
                    return { left: x0 * pxPerPt, top: editItem.y * pxPerPt, width: Math.max(1, (x1 - x0) * pxPerPt), height: editItem.height * pxPerPt };
                  })()}
                />
              )}
              {caret?.page === i && sel[0] === sel[1] && (
                <div
                  className="lithora-caret pointer-events-none absolute z-30 w-[2px] bg-[#083B69]"
                  style={{ left: caret.x * pxPerPt - 1, top: caret.y * pxPerPt, height: Math.max(caret.height * pxPerPt, 10) }}
                />
              )}
              {editing?.page === i && editItem && editItem.substituted.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={onShowFonts}
                  className="absolute z-30 max-w-[320px] rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-left text-[11px] leading-snug text-amber-900 shadow-sm hover:bg-amber-100"
                  style={{ left: editItem.x * pxPerPt, top: (editItem.y + editItem.height) * pxPerPt + 4 }}
                >
                  {t.pdfSubstituted.replace('{fonts}', editItem.substituted.join(', '))}
                </button>
              )}
              {picked?.page === i &&
                (() => {
                  const o =
                    picked.kind === 'graphic' ? list?.graphics.find((g) => g.id === picked.id) : list?.stamps.find((s) => s.id === picked.id);
                  if (!o) return null;
                  const r = drag && drag.page === i && drag.kind === picked.kind && drag.id === picked.id ? dragRect(drag) : rectOf(o);
                  return (
                    <>
                      {drag?.ghost && drag.page === i && drag.kind !== 'text' && (
                        <img
                          alt=""
                          src={drag.ghost}
                          className="pointer-events-none absolute z-30 opacity-80"
                          style={{ left: r[0] * pxPerPt, top: r[1] * pxPerPt, width: r[2] * pxPerPt, height: r[3] * pxPerPt }}
                        />
                      )}
                      {frame(i, r, true, (e, mode) => onObjectDown(e, picked, rectOf(o), mode))}
                    </>
                  );
                })()}
              {drag?.kind === 'text' && drag.page === i && (
                <>
                  {drag.ghost && (
                    <img
                      alt=""
                      src={drag.ghost}
                      className="pointer-events-none absolute z-30 opacity-80"
                      style={{ left: dragRect(drag)[0] * pxPerPt, top: dragRect(drag)[1] * pxPerPt, width: drag.rect[2] * pxPerPt, height: drag.rect[3] * pxPerPt }}
                    />
                  )}
                  <div
                    className="pointer-events-none absolute z-30 outline outline-1 outline-dashed outline-[#376FA3]"
                    style={{ left: dragRect(drag)[0] * pxPerPt, top: dragRect(drag)[1] * pxPerPt, width: drag.rect[2] * pxPerPt, height: drag.rect[3] * pxPerPt }}
                  />
                </>
              )}
            </div>
          );
        })}
        <textarea
          ref={input}
          aria-label="PDF text"
          // One line, unwrapped: Home and End go to the ends of the whole line.
          wrap="off"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="pointer-events-none absolute left-0 top-0 h-4 w-px resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 opacity-0 outline-none"
          onKeyDown={onKeyDown}
          onKeyUp={syncSel}
          onSelect={syncSel}
          onInput={onInput}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false;
            const ed = editingRef.current;
            if (ed) sendText(ed.page, ed.key, e.currentTarget.value);
            syncSel();
          }}
        />
      </div>
    </div>
  );
});
