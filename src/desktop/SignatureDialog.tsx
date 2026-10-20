/**
 * Draw a signature (mouse, pen or touch), keep it for next time, and put it into the document
 * as a transparent picture that can be moved over a signature line.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Trash2 } from 'lucide-react';
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
  const stroke = useRef<Point[] | null>(null);
  const [ink, setInk] = useState(INKS[1]);
  const [drawn, setDrawn] = useState(false);
  const [saved, setSaved] = useState<Signature[]>([]);
  const [hint, setHint] = useState('');

  const reload = useCallback(() => {
    engine
      .signatures()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, []);
  useEffect(reload, [reload]);

  const ctx = () => canvas.current?.getContext('2d') ?? null;

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    // A pen's pressure makes the line thicker; mouse and touch report 0.5.
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return { x: ((e.clientX - r.left) / r.width) * PAD_W * SCALE, y: ((e.clientY - r.top) / r.height) * PAD_H * SCALE, w: (1.2 + pressure * 2.6) * SCALE };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    stroke.current = [p];
    const c = ctx();
    if (c) {
      c.fillStyle = ink;
      c.beginPath();
      c.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
      c.fill();
    }
    setDrawn(true);
    setHint('');
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pts = stroke.current;
    const c = ctx();
    if (!pts || !c) return;
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [e.nativeEvent];
    for (const ev of list) {
      const r = e.currentTarget.getBoundingClientRect();
      const pressure = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5;
      const p = { x: ((ev.clientX - r.left) / r.width) * PAD_W * SCALE, y: ((ev.clientY - r.top) / r.height) * PAD_H * SCALE, w: (1.2 + pressure * 2.6) * SCALE };
      const last = pts[pts.length - 1];
      // Smooth: each segment curves through the midpoint of the last two points.
      const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      const prevMid = pts.length > 1 ? { x: (pts[pts.length - 2].x + last.x) / 2, y: (pts[pts.length - 2].y + last.y) / 2 } : last;
      c.strokeStyle = ink;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = (last.w + p.w) / 2;
      c.beginPath();
      c.moveTo(prevMid.x, prevMid.y);
      c.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
      c.stroke();
      pts.push(p);
    }
  };

  const up = () => {
    stroke.current = null;
  };

  const clear = () => {
    const c = ctx();
    if (c && canvas.current) c.clearRect(0, 0, canvas.current.width, canvas.current.height);
    setDrawn(false);
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
