/**
 * Draw a signature (mouse, pen or touch), keep it for next time, and put it into the document
 * as a transparent picture that can be moved over a signature line.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react';
import { engine, Signature } from './engine';
import type { Strings } from './strings';
import { Modal, PrimaryButton, SecondaryButton } from './Dialogs';

const INKS = ['#111111', '#083B69', '#1D4ED8'];
const PAD_W = 560;
const PAD_H = 200;
/** Drawn at twice the pad's size, so the picture stays sharp when printed. */
const SCALE = 2;

interface Point {
  x: number;
  y: number;
  w: number;
}

/** One line drawn without lifting the pen. */
interface Stroke {
  ink: string;
  pts: Point[];
}

/** Draw the part of a stroke that ends at point i: a dot for the first point, then smooth curves. */
function drawPart(c: CanvasRenderingContext2D, s: Stroke, i: number) {
  const pts = s.pts;
  const p = pts[i];
  if (i === 0) {
    c.fillStyle = s.ink;
    c.beginPath();
    c.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
    c.fill();
    return;
  }
  const last = pts[i - 1];
  // Smooth: each segment curves through the midpoint of the last two points.
  const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
  const prevMid = i > 1 ? { x: (pts[i - 2].x + last.x) / 2, y: (pts[i - 2].y + last.y) / 2 } : last;
  c.strokeStyle = s.ink;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = (last.w + p.w) / 2;
  c.beginPath();
  c.moveTo(prevMid.x, prevMid.y);
  c.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
  c.stroke();
}

/** The drawing's PNG cut to what was drawn (plus a little room), or null when nothing was. */
function trimmedPng(canvas: HTMLCanvasElement): { data: string; width: number; height: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = 8 * SCALE;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')?.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const url = out.toDataURL('image/png');
  return { data: url.slice(url.indexOf(',') + 1), width: out.width, height: out.height };
}

export function SignatureDialog({
  t,
  onClose,
  onInsert,
  onError,
}: {
  t: Strings;
  onClose(): void;
  /** A PNG (base64) and the width in points it should have on the page. */
  onInsert(png: string, widthPt: number): void;
  onError(message: string): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const [ink, setInk] = useState(INKS[1]);
  // What is on the pad, plus earlier and undone versions of it, for Undo and Redo.
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const past = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);
  const [, setHistoryTick] = useState(0);
  const [saved, setSaved] = useState<Signature[]>([]);
  const [hint, setHint] = useState('');
  const drawn = strokes.length > 0;

  const reload = useCallback(() => {
    engine
      .signatures()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);
  useEffect(reload, [reload]);

  const ctx = () => canvas.current?.getContext('2d') ?? null;

  /** Redraw the pad from the list of strokes. */
  const paint = useCallback((list: Stroke[]) => {
    const c = canvas.current?.getContext('2d');
    if (!c || !canvas.current) return;
    c.clearRect(0, 0, canvas.current.width, canvas.current.height);
    for (const s of list) for (let i = 0; i < s.pts.length; i++) drawPart(c, s, i);
  }, []);

  /** Make a change that Undo can take back. */
  const change = useCallback(
    (next: Stroke[]) => {
      past.current.push(strokes);
      if (past.current.length > 200) past.current.shift();
      future.current = [];
      setStrokes(next);
      setHistoryTick((n) => n + 1);
    },
    [strokes],
  );

  const undo = useCallback(() => {
    if (stroke.current) return;
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(strokes);
    setStrokes(prev);
    paint(prev);
    setHistoryTick((n) => n + 1);
  }, [strokes, paint]);

  const redo = useCallback(() => {
    if (stroke.current) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(strokes);
    setStrokes(next);
    paint(next);
    setHistoryTick((n) => n + 1);
  }, [strokes, paint]);

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) work on the drawing while this window is open,
  // and never reach the document behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key.toUpperCase();
      if (key === 'Z' && !e.shiftKey) undo();
      else if (key === 'Y' || (key === 'Z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    // A pen's pressure makes the line thicker; mouse and touch report 0.5.
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return { x: ((e.clientX - r.left) / r.width) * PAD_W * SCALE, y: ((e.clientY - r.top) / r.height) * PAD_H * SCALE, w: (1.2 + pressure * 2.6) * SCALE };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const s: Stroke = { ink, pts: [at(e)] };
    stroke.current = s;
    const c = ctx();
    if (c) drawPart(c, s, 0);
    setHint('');
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    const c = ctx();
    if (!s || !c) return;
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    for (const ev of list) {
      const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5;
      s.pts.push({ x: ((ev.clientX - r.left) / r.width) * PAD_W * SCALE, y: ((ev.clientY - r.top) / r.height) * PAD_H * SCALE, w: (1.2 + pressure * 2.6) * SCALE });
      drawPart(c, s, s.pts.length - 1);
    }
  };

  const up = () => {
    const s = stroke.current;
    stroke.current = null;
    if (s) change([...strokes, s]);
  };

  const clear = () => {
    if (!drawn) return;
    paint([]);
    change([]);
  };

  /** Width on the page: about 1.8 inches for a typical signature, never taller than 0.9 inch. */
  const pageWidth = (w: number, h: number) => {
    const width = 130;
    const height = (width * h) / w;
    return height > 65 ? (65 * w) / h : width;
  };

  const saveAndInsert = async () => {
    const png = canvas.current && trimmedPng(canvas.current);
    if (!png) {
      setHint(t.signatureEmpty);
      return;
    }
    try {
      await engine.addSignature(png.data);
    } catch (e) {
      onError(String(e));
    }
    onInsert(png.data, pageWidth(png.width, png.height));
    onClose();
  };

  const insertSaved = (sig: Signature) => {
    const img = new Image();
    img.onload = () => {
      onInsert(sig.data, pageWidth(img.naturalWidth, img.naturalHeight));
      onClose();
    };
    img.src = `data:image/png;base64,${sig.data}`;
  };

  return (
    <Modal
      title={t.signatureTitle}
      onClose={onClose}
      width="w-[620px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>{t.cancel}</SecondaryButton>
          <PrimaryButton onClick={() => void saveAndInsert()} disabled={!drawn}>
            <PenLine className="h-4 w-4" /> {t.signatureSave}
          </PrimaryButton>
        </>
      }
    >
      <p className="mb-2 text-slate-600">{t.signatureDraw}</p>
      <div className="relative rounded-lg border border-slate-300 bg-white">
        <canvas
          ref={canvas}
          width={PAD_W * SCALE}
          height={PAD_H * SCALE}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block w-full cursor-crosshair touch-none"
          style={{ aspectRatio: `${PAD_W} / ${PAD_H}` }}
          aria-label={t.signatureDraw}
        />
        <div className="pointer-events-none absolute bottom-10 left-8 right-8 border-b border-dashed border-slate-300" />
        <span className="pointer-events-none absolute bottom-[42px] left-3 text-[18px] text-slate-300">✕</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-slate-600">{t.signatureColor}</span>
        {INKS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => setInk(c)}
            className={`h-6 w-6 rounded-full border-2 ${ink === c ? 'border-[#6C9FCB] ring-2 ring-[#6C9FCB]/40' : 'border-white ring-1 ring-slate-300'}`}
            style={{ background: c }}
          />
        ))}
        <span className="flex-1 text-[12px] text-red-700">{hint}</span>
        <SecondaryButton onClick={undo} disabled={past.current.length === 0} title={t.undo}>
          <Undo2 className="h-4 w-4" />
        </SecondaryButton>
        <SecondaryButton onClick={redo} disabled={future.current.length === 0} title={t.redo}>
          <Redo2 className="h-4 w-4" />
        </SecondaryButton>
        <SecondaryButton onClick={clear}>
          <Eraser className="h-4 w-4" /> {t.signatureClear}
        </SecondaryButton>
      </div>
      <h3 className="mb-1.5 mt-4 font-medium text-slate-800">{t.signatureSaved}</h3>
      {saved.length === 0 ? (
        <p className="text-slate-500">{t.signatureNone}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {saved.map((sig) => (
            <div key={sig.id} className="group relative rounded-md border border-slate-200 bg-white p-1.5 hover:border-[#6C9FCB]">
              <button type="button" title={t.signatureInsert} onClick={() => insertSaved(sig)} className="block h-16 w-full">
                <img src={`data:image/png;base64,${sig.data}`} alt={t.signature} className="mx-auto h-full object-contain" />
              </button>
              <button
                type="button"
                title={t.signatureDelete}
                aria-label={t.signatureDelete}
                onClick={() => void engine.deleteSignature(sig.id).then(reload)}
                className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-slate-500 hover:text-red-700 group-hover:block"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
