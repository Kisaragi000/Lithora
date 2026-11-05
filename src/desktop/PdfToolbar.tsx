/**
 * The toolbar of a PDF tab: undo, the Edit / Add text / Sign tools, the selected text's font,
 * size, style and colour, and the Fonts panel, Print and Save As.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Bold, CaseSensitive, Italic, MousePointer2, Printer, Redo2, Save, Signature, Trash2, TriangleAlert, Type, Underline, Undo2 } from 'lucide-react';
import type { Strings } from './strings';
import type { PdfInfo, PdfStyleChange } from './pdf';
import type { PdfSelection, PdfTool } from './PdfView';

interface Props {
  t: Strings;
  info: PdfInfo;
  sel: PdfSelection | null;
  tool: PdfTool;
  fonts: string[];
  onTool(tool: PdfTool): void;
  onUndo(): void;
  onRedo(): void;
  onStyle(change: PdfStyleChange): void;
  onDelete(): void;
  onSign(): void;
  onFonts(): void;
  onPrint(): void;
  onSaveAs(): void;
}

/** A toolbar button that leaves the keyboard where it was (in the line being edited). */
function Tool({
  title,
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium disabled:opacity-35 ${
        active ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
      {label && <span>{label}</span>}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" />;

export function PdfToolbar({ t, info, sel, tool, fonts, onTool, onUndo, onRedo, onStyle, onDelete, onSign, onFonts, onPrint, onSaveAs }: Props) {
  const text = sel?.kind === 'text' ? sel.item : null;
  const [size, setSize] = useState('');
  const [color, setColor] = useState('#000000');
  useEffect(() => {
    setSize(text ? String(Math.round(text.size * 10) / 10) : '');
    setColor(text?.color ?? '#000000');
  }, [text?.size, text?.color, text?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const families = (() => {
    const list = [...new Set(fonts)].sort((a, b) => a.localeCompare(b));
    if (text && !list.some((f) => f.toLowerCase() === text.family.toLowerCase())) list.unshift(text.family);
    return list;
  })();
  const applySize = () => {
    const v = Number(size.replace(',', '.'));
    if (text && v > 0 && Math.abs(v - text.size) > 0.05) onStyle({ size: Math.min(400, Math.max(1, v)) });
  };
  const field = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] focus:border-[#376FA3] focus:outline-none disabled:opacity-40';

  return (
    <div className="lithora-slim-scroll flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 select-none">
      <Tool title={t.undo} disabled={!info.canUndo} onClick={onUndo}>
        <Undo2 className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <Tool title={t.redo} disabled={!info.canRedo} onClick={onRedo}>
        <Redo2 className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <Divider />
      <Tool title={t.pdfEditHint} label={t.pdfEdit} active={tool === 'edit'} onClick={() => onTool('edit')}>
        <MousePointer2 className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <Tool title={t.pdfAddTextHint} label={t.pdfAddText} active={tool === 'text'} onClick={() => onTool(tool === 'text' ? 'edit' : 'text')}>
        <Type className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <Tool title={t.pdfSignHint} label={t.pdfSign} onClick={onSign}>
        <Signature className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <Divider />
      <select
        aria-label={t.font}
        title={t.font}
        disabled={!text}
        value={text?.family ?? ''}
        onChange={(e) => onStyle({ family: e.target.value })}
        className={`${field} w-44`}
        style={text ? { fontFamily: `"${text.family}", sans-serif` } : undefined}
      >
        {!text && <option value="">{t.font}</option>}
        {families.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <input
        aria-label={t.fontSize}
        title={t.fontSize}
        disabled={!text}
        value={size}
        inputMode="decimal"
        onChange={(e) => setSize(e.target.value)}
        onBlur={applySize}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applySize();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = (Number(size) || text?.size || 12) + (e.key === 'ArrowUp' ? 1 : -1);
            setSize(String(v));
            if (text) onStyle({ size: Math.max(1, v) });
          }
        }}
        className={`${field} w-16 text-right tabular-nums`}
      />
      <Tool title={t.bold} active={!!text?.bold} disabled={!text} onClick={() => onStyle({ bold: !text?.bold })}>
        <Bold className="h-4 w-4" />
      </Tool>
      <Tool title={t.italic} active={!!text?.italic} disabled={!text} onClick={() => onStyle({ italic: !text?.italic })}>
        <Italic className="h-4 w-4" />
      </Tool>
      <Tool title={t.underline} active={!!text?.underline} disabled={!text} onClick={() => onStyle({ underline: !text?.underline })}>
        <Underline className="h-4 w-4" />
      </Tool>
      <label
        title={t.textColor}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 ${text ? 'cursor-pointer' : 'opacity-35'}`}
      >
        <span className="text-[15px] font-bold leading-none text-slate-700" style={{ borderBottom: `3px solid ${color}` }}>
          A
        </span>
        <input
          type="color"
          aria-label={t.textColor}
          disabled={!text}
          value={color}
          onChange={(e) => {
            const v = e.target.value;
            setColor(v);
            if (colorTimer.current) clearTimeout(colorTimer.current);
            colorTimer.current = setTimeout(() => onStyle({ color: v }), 180);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Divider />
      <Tool title={t.pdfDelete} disabled={!sel} onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-[#376FA3]" />
      </Tool>
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <Tool title={t.pdfFontsTitle} label={t.pdfFonts} onClick={onFonts}>
          {info.missingFonts > 0 ? <TriangleAlert className="h-4 w-4 text-amber-600" /> : <CaseSensitive className="h-4 w-4 text-[#376FA3]" />}
          {info.missingFonts > 0 && (
            <span className="rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800">{t.pdfMissingCount.replace('{n}', String(info.missingFonts))}</span>
          )}
        </Tool>
        <Tool title={t.print} label={t.print} onClick={onPrint}>
          <Printer className="h-4 w-4 text-[#376FA3]" />
        </Tool>
        <Tool title={t.saveAs} label={t.saveAs} onClick={onSaveAs}>
          <Save className="h-4 w-4 text-[#376FA3]" />
        </Tool>
      </div>
    </div>
  );
}
