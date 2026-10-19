/** The ribbon: Lithora's formatting and page commands, run by the engine. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  ClipboardPaste,
  Copy,
  FilePlus2,
  FileDown,
  FolderOpen,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  RectangleHorizontal,
  RectangleVertical,
  Redo2,
  RemoveFormatting,
  Save,
  SaveAll,
  Scissors,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from 'lucide-react';
import type { DocState } from './engine';
import type { Strings } from './strings';

export type RibbonAction = 'new' | 'open' | 'save' | 'saveAs' | 'exportPdf' | 'paste' | 'copy' | 'cut' | 'picture';

interface RibbonProps {
  t: Strings;
  doc: DocState | null;
  fonts: string[];
  onCommand(name: string, params?: Record<string, unknown>): void;
  onAction(action: RibbonAction): void;
}

type Tab = 'file' | 'home' | 'insert' | 'layout';

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

const TEXT_COLORS = [
  'auto', '000000', '404040', '7F7F7F', 'BFBFBF', 'FFFFFF',
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050',
  '00B0F0', '0070C0', '002060', '7030A0', '083B69', '376FA3',
];

const HIGHLIGHTS: [string, string][] = [
  ['yellow', '#FFFF00'], ['brightGreen', '#00FF00'], ['turquoise', '#00FFFF'], ['pink', '#FF00FF'],
  ['blue', '#0000FF'], ['red', '#FF0000'], ['darkBlue', '#000080'], ['teal', '#008080'],
  ['green', '#008000'], ['violet', '#800080'], ['darkRed', '#800000'], ['darkYellow', '#808000'],
  ['gray50', '#808080'], ['gray25', '#C0C0C0'], ['black', '#000000'],
];

function Btn({
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
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        wide ? 'px-2.5' : 'w-8'
      } ${active ? 'bg-[#376FA3]/15 text-[#083B69] ring-1 ring-[#376FA3]/40' : 'text-slate-700 hover:bg-[#6C9FCB]/15 hover:text-[#083B69]'}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1.5 h-6 w-px shrink-0 bg-slate-200" />;
}

/**
 * A floating panel under `anchor`, drawn on top of everything. It lives outside the ribbon
 * because the ribbon row scrolls sideways, which would clip anything hanging below it.
 */
function FloatingPanel({
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
      className={`fixed z-[100] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl ${className}`}
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Where a panel of `width` goes under `anchor`, kept inside the window. */
function place(anchor: HTMLElement, width: number) {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const top = r.bottom + 4;
  return { left, top, maxHeight: Math.max(120, window.innerHeight - top - 8) };
}

/** A button that opens a small panel below it. */
function Popover({
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

/** Fonts most documents use, shown first. Missing ones are drawn with a matching free font. */
const COMMON_FONTS = [
  'Calibri',
  'Arial',
  'Times New Roman',
  'Cambria',
  'Aptos',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Segoe UI',
  'Courier New',
  'Garamond',
  'Book Antiqua',
];

/** CSS fallbacks so a font's preview still looks close when it isn't installed. */
const PREVIEW_FALLBACK: Record<string, string> = {
  Calibri: "'Carlito', sans-serif",
  Cambria: "'Caladea', serif",
  Arial: "'Liberation Sans', 'Arimo', sans-serif",
  'Times New Roman': "'Liberation Serif', 'Tinos', serif",
  'Courier New': "'Liberation Mono', 'Cousine', monospace",
  Georgia: "'Gelasio', serif",
  Garamond: "'EB Garamond', serif",
  'Book Antiqua': "'Palatino Linotype', 'TeX Gyre Pagella', serif",
};

const previewFamily = (name: string) => `'${name.replace(/'/g, "\\'")}', ${PREVIEW_FALLBACK[name] ?? 'sans-serif'}`;

/** The font box: each font in the list is shown in its own typeface, common ones first. */
function FontPicker({
  t,
  value,
  fonts,
  disabled,
  onPick,
}: {
  t: Strings;
  value: string;
  fonts: string[];
  disabled?: boolean;
  onPick(name: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  const q = query.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);
  const installed = new Set(fonts);
  const common = COMMON_FONTS.filter(match);
  const all = fonts.filter(match);
  const pick = (name: string) => {
    onPick(name);
    close();
  };
  const row = (name: string, key: string) => (
    <button
      key={key}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(name)}
      title={installed.has(name) ? name : `${name} (${t.fontSubstituted})`}
      className={`block w-full truncate rounded px-2 py-1 text-left text-[15px] leading-6 hover:bg-[#6C9FCB]/15 ${
        name === value ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-800'
      }`}
      style={{ fontFamily: previewFamily(name) }}
    >
      {name}
    </button>
  );
  return (
    <>
      <button
        ref={button}
        type="button"
        title={open ? undefined : t.font}
        aria-label={t.font}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex h-8 w-44 shrink-0 items-center justify-between gap-1 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 hover:border-[#6C9FCB] disabled:opacity-35"
      >
        <span className="truncate" style={value ? { fontFamily: previewFamily(value) } : undefined}>
          {value || '—'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && button.current && (
        <FloatingPanel anchor={button.current} onClose={close} className="w-72 p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = common[0] ?? all[0];
                if (first) pick(first);
              }
            }}
            placeholder={t.searchFonts}
            className="mb-1.5 h-8 w-full rounded-md border border-slate-300 px-2 text-[13px] focus:border-[#376FA3] focus:outline-none"
          />
          {common.length > 0 && (
            <>
              <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{t.commonFonts}</div>
              {common.map((name) => row(name, `c-${name}`))}
              <div className="my-1.5 h-px bg-slate-200" />
            </>
          )}
          <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{t.allFonts}</div>
          {all.map((name) => row(name, `a-${name}`))}
        </FloatingPanel>
      )}
    </>
  );
}

/** Page setups applied in one click: size, orientation, margins (points) and columns. */
interface LayoutPreset {
  id: keyof Strings;
  size: string;
  landscape: boolean;
  margins: { top: number; bottom: number; left: number; right: number };
  columns: number;
}

const mm = (v: number) => Math.round((v * 72 * 100) / 25.4) / 100;
const inch = (v: number) => v * 72;

const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: 'presetStandard', size: 'A4', landscape: false, margins: { top: inch(1), bottom: inch(1), left: inch(1), right: inch(1) }, columns: 1 },
  { id: 'presetLetter', size: 'Letter', landscape: false, margins: { top: inch(1), bottom: inch(1), left: inch(1), right: inch(1) }, columns: 1 },
  { id: 'presetOfficial', size: 'A4', landscape: false, margins: { top: mm(20), bottom: mm(20), left: mm(30), right: mm(15) }, columns: 1 },
  { id: 'presetNarrow', size: 'A4', landscape: false, margins: { top: inch(0.5), bottom: inch(0.5), left: inch(0.5), right: inch(0.5) }, columns: 1 },
  { id: 'presetWide', size: 'A4', landscape: false, margins: { top: inch(1), bottom: inch(1), left: inch(2), right: inch(2) }, columns: 1 },
  { id: 'presetLandscape', size: 'A4', landscape: true, margins: { top: inch(1), bottom: inch(1), left: inch(1), right: inch(1) }, columns: 1 },
  { id: 'presetTwoColumns', size: 'A4', landscape: false, margins: { top: inch(0.75), bottom: inch(0.75), left: inch(0.75), right: inch(0.75) }, columns: 2 },
  { id: 'presetBooklet', size: 'A5', landscape: false, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) }, columns: 1 },
];

/** A small drawing of a preset's page: its shape, margins and columns. */
function PresetThumb({ p }: { p: LayoutPreset }) {
  const [w, h] = p.size === 'Letter' ? [612, 792] : p.size === 'A5' ? [420, 595] : [595, 842];
  const [pw, ph] = p.landscape ? [h, w] : [w, h];
  const scale = 40 / Math.max(pw, ph);
  const m = p.margins;
  const cols = Array.from({ length: p.columns });
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center">
      <div className="relative border border-slate-400 bg-white" style={{ width: pw * scale, height: ph * scale }}>
        <div
          className="absolute flex gap-[2px]"
          style={{ left: m.left * scale, right: m.right * scale, top: m.top * scale, bottom: m.bottom * scale }}
        >
          {cols.map((_, i) => (
            <div key={i} className="flex-1 bg-[repeating-linear-gradient(#6C9FCB_0_1px,transparent_1px_3px)] opacity-70" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TablePicker({ t, onPick }: { t: Strings; onPick(rows: number, cols: number): void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-slate-600">
        {hover[0] > 0 ? `${hover[1]} × ${hover[0]}` : t.tableSize}
      </div>
      <div className="grid grid-cols-10 gap-0.5" onMouseLeave={() => setHover([0, 0])}>
        {Array.from({ length: 80 }, (_, i) => {
          const r = Math.floor(i / 10) + 1;
          const c = (i % 10) + 1;
          const on = r <= hover[0] && c <= hover[1];
          return (
            <button
              key={i}
              type="button"
              aria-label={`${c} × ${r}`}
              onMouseEnter={() => setHover([r, c])}
              onClick={() => onPick(r, c)}
              className={`h-4 w-4 rounded-[2px] border ${on ? 'border-[#376FA3] bg-[#6C9FCB]/40' : 'border-slate-300 bg-white'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export const Ribbon: React.FC<RibbonProps> = ({ t, doc, fonts, onCommand, onAction }) => {
  const [tab, setTab] = useState<Tab>('home');
  const f = doc?.format ?? null;
  const none = !doc;
  const style = f?.style ?? '';

  const tabs: [Tab, string][] = [
    ['file', t.file],
    ['home', t.home],
    ['insert', t.insert],
    ['layout', t.layout],
  ];

  const fontValue = f?.font ?? '';
  const fontOptions = fontValue && !fonts.includes(fontValue) ? [fontValue, ...fonts] : fonts;

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white select-none">
      <div className="flex items-end gap-1 border-b border-slate-200 bg-[#F7F8FB] px-3 pt-1.5">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(key)}
            className={`-mb-px rounded-t-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === key
                ? 'border-x border-t border-slate-200 bg-white text-[#083B69]'
                : 'text-slate-600 hover:text-[#083B69]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex h-12 items-center gap-0.5 overflow-x-auto px-3">
        {tab === 'file' && (
          <>
            <Btn wide title={t.newDocument} onClick={() => onAction('new')}>
              <FilePlus2 className="h-4 w-4" /> {t.newDocument}
            </Btn>
            <Btn wide title={t.open} onClick={() => onAction('open')}>
              <FolderOpen className="h-4 w-4" /> {t.open}
            </Btn>
            <Btn wide title={t.save} disabled={none} onClick={() => onAction('save')}>
              <Save className="h-4 w-4" /> {t.save}
            </Btn>
            <Btn wide title={t.saveAs} disabled={none} onClick={() => onAction('saveAs')}>
              <SaveAll className="h-4 w-4" /> {t.saveAs}
            </Btn>
            <Btn wide title={t.exportPdf} disabled={none} onClick={() => onAction('exportPdf')}>
              <FileDown className="h-4 w-4" /> {t.exportPdf}
            </Btn>
          </>
        )}

        {tab === 'home' && (
          <>
            <Btn title={t.undo} disabled={!doc?.canUndo} onClick={() => onCommand('edit.undo')}>
              <Undo2 className="h-4 w-4" />
            </Btn>
            <Btn title={t.redo} disabled={!doc?.canRedo} onClick={() => onCommand('edit.redo')}>
              <Redo2 className="h-4 w-4" />
            </Btn>
            <Divider />
            <Btn title={t.paste} disabled={none} onClick={() => onAction('paste')}>
              <ClipboardPaste className="h-4 w-4" />
            </Btn>
            <Btn title={t.cut} disabled={none} onClick={() => onAction('cut')}>
              <Scissors className="h-4 w-4" />
            </Btn>
            <Btn title={t.copy} disabled={none} onClick={() => onAction('copy')}>
              <Copy className="h-4 w-4" />
            </Btn>
            <Divider />
            <FontPicker t={t} value={fontValue} fonts={fontOptions} disabled={none} onPick={(name) => onCommand('format.font', { name })} />
            <select
              title={t.fontSize}
              aria-label={t.fontSize}
              disabled={none}
              value={f?.size ?? ''}
              onChange={(e) => onCommand('format.size', { size: Number(e.target.value) })}
              className="ml-1 h-8 w-16 shrink-0 rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800 focus:border-[#376FA3] focus:outline-none"
            >
              {f?.size == null && <option value="" />}
              {(f?.size != null && !SIZES.includes(f.size) ? [f.size, ...SIZES] : SIZES).map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <Divider />
            <Btn title={t.bold} active={f?.bold} disabled={none} onClick={() => onCommand('format.bold')}>
              <Bold className="h-4 w-4" />
            </Btn>
            <Btn title={t.italic} active={f?.italic} disabled={none} onClick={() => onCommand('format.italic')}>
              <Italic className="h-4 w-4" />
            </Btn>
            <Btn title={t.underline} active={f?.underline} disabled={none} onClick={() => onCommand('format.underline')}>
              <Underline className="h-4 w-4" />
            </Btn>
            <Btn title={t.strike} active={f?.strike} disabled={none} onClick={() => onCommand('format.strikethrough')}>
              <Strikethrough className="h-4 w-4" />
            </Btn>
            <Btn title={t.subscript} active={f?.subscript} disabled={none} onClick={() => onCommand('format.subscript')}>
              <Subscript className="h-4 w-4" />
            </Btn>
            <Btn title={t.superscript} active={f?.superscript} disabled={none} onClick={() => onCommand('format.superscript')}>
              <Superscript className="h-4 w-4" />
            </Btn>
            <Popover
              title={t.textColor}
              disabled={none}
              label={
                <span className="flex flex-col items-center">
                  <Baseline className="h-4 w-4" />
                  <span
                    className="-mt-0.5 h-1 w-4 rounded-sm"
                    style={{ background: f?.color && f.color !== 'auto' ? `#${f.color}` : '#000' }}
                  />
                </span>
              }
            >
              {(close) => (
                <div className="grid w-[156px] grid-cols-6 gap-1">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c === 'auto' ? 'Automatic' : `#${c}`}
                      onClick={() => {
                        onCommand('format.color', { color: c });
                        close();
                      }}
                      className="h-5 w-5 rounded border border-slate-300"
                      style={{ background: c === 'auto' ? 'linear-gradient(135deg,#000 50%,#fff 50%)' : `#${c}` }}
                    />
                  ))}
                </div>
              )}
            </Popover>
            <Popover title={t.highlight} disabled={none} label={<Highlighter className="h-4 w-4" />}>
              {(close) => (
                <div className="w-[132px]">
                  <div className="grid grid-cols-5 gap-1">
                    {HIGHLIGHTS.map(([name, hex]) => (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        onClick={() => {
                          onCommand('format.highlight', { color: name });
                          close();
                        }}
                        className="h-5 w-5 rounded border border-slate-300"
                        style={{ background: hex }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onCommand('format.highlight', { color: 'none' });
                      close();
                    }}
                    className="mt-2 w-full rounded px-1 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {t.noHighlight}
                  </button>
                </div>
              )}
            </Popover>
            <Btn title={t.clearFormat} disabled={none} onClick={() => onCommand('format.clear')}>
              <RemoveFormatting className="h-4 w-4" />
            </Btn>
            <Divider />
            <Btn title={t.alignLeft} active={doc?.align === 'left'} disabled={none} onClick={() => onCommand('para.alignLeft')}>
              <AlignLeft className="h-4 w-4" />
            </Btn>
            <Btn title={t.alignCenter} active={doc?.align === 'center'} disabled={none} onClick={() => onCommand('para.alignCenter')}>
              <AlignCenter className="h-4 w-4" />
            </Btn>
            <Btn title={t.alignRight} active={doc?.align === 'right'} disabled={none} onClick={() => onCommand('para.alignRight')}>
              <AlignRight className="h-4 w-4" />
            </Btn>
            <Btn title={t.justify} active={doc?.align === 'justify'} disabled={none} onClick={() => onCommand('para.justify')}>
              <AlignJustify className="h-4 w-4" />
            </Btn>
            <Divider />
            <Btn title={t.bullets} disabled={none} onClick={() => onCommand('para.bullets')}>
              <List className="h-4 w-4" />
            </Btn>
            <Btn title={t.numbering} disabled={none} onClick={() => onCommand('para.numbering')}>
              <ListOrdered className="h-4 w-4" />
            </Btn>
            <Btn title={t.outdent} disabled={none} onClick={() => onCommand('para.outdent')}>
              <IndentDecrease className="h-4 w-4" />
            </Btn>
            <Btn title={t.indent} disabled={none} onClick={() => onCommand('para.indent')}>
              <IndentIncrease className="h-4 w-4" />
            </Btn>
            <Divider />
            {(
              [
                ['Normal', t.normal, 'text-[13px]'],
                ['Title', t.titleStyle, 'text-[15px] font-light'],
                ['Heading1', t.heading1, 'text-[14px] font-semibold text-[#083B69]'],
                ['Heading2', t.heading2, 'text-[13px] font-semibold text-[#376FA3]'],
                ['Heading3', t.heading3, 'text-[12px] font-semibold text-[#376FA3]'],
              ] as const
            ).map(([id, label, look]) => (
              <Btn wide key={id} title={label} active={style === id} disabled={none} onClick={() => onCommand('para.style', { style: id })}>
                <span className={`whitespace-nowrap ${look}`}>{label}</span>
              </Btn>
            ))}
          </>
        )}

        {tab === 'insert' && (
          <>
            <Popover
              title={t.table}
              disabled={none}
              label={
                <span className="flex items-center gap-1.5">
                  <Table className="h-4 w-4" /> {t.table}
                </span>
              }
            >
              {(close) => (
                <TablePicker
                  t={t}
                  onPick={(rows, cols) => {
                    onCommand('insert.table', { rows, cols });
                    close();
                  }}
                />
              )}
            </Popover>
            <Btn wide title={t.picture} disabled={none} onClick={() => onAction('picture')}>
              <ImagePlus className="h-4 w-4" /> {t.picture}
            </Btn>
            <Btn wide title={t.pageBreak} disabled={none} onClick={() => onCommand('insert.pageBreak')}>
              <SeparatorHorizontal className="h-4 w-4" /> {t.pageBreak}
            </Btn>
          </>
        )}

        {tab === 'layout' && (
          <>
            <Popover title={t.presets} disabled={none} label={<span className="px-1 font-medium text-[#083B69]">{t.presets}</span>}>
              {(close) => (
                <div className="grid w-[420px] grid-cols-2 gap-1">
                  {LAYOUT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onCommand('layout.size', { name: p.size });
                        onCommand('layout.orientation', { value: p.landscape ? 'landscape' : 'portrait' });
                        onCommand('layout.margins', p.margins);
                        onCommand('layout.columns', { count: p.columns, apply: 'document' });
                        close();
                      }}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#6C9FCB]/15"
                    >
                      <PresetThumb p={p} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-slate-800">{t[p.id]}</span>
                        <span className="block text-[11px] text-slate-500">{t[`${p.id}Hint` as keyof Strings]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Divider />
            <Popover title={t.margins} disabled={none} label={<span className="px-1">{t.margins}</span>}>
              {(close) => (
                <div className="flex w-36 flex-col">
                  {(
                    [
                      ['normal', t.marginsNormal],
                      ['narrow', t.marginsNarrow],
                      ['moderate', t.marginsModerate],
                      ['wide', t.marginsWide],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        onCommand('layout.margins', { preset });
                        close();
                      }}
                      className="rounded px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Divider />
            <Btn wide title={t.portrait} disabled={none} onClick={() => onCommand('layout.orientation', { value: 'portrait' })}>
              <RectangleVertical className="h-4 w-4" /> {t.portrait}
            </Btn>
            <Btn wide title={t.landscape} disabled={none} onClick={() => onCommand('layout.orientation', { value: 'landscape' })}>
              <RectangleHorizontal className="h-4 w-4" /> {t.landscape}
            </Btn>
            <Divider />
            <Popover title={t.size} disabled={none} label={<span className="px-1">{t.size}</span>}>
              {(close) => (
                <div className="flex w-32 flex-col">
                  {['A4', 'A5', 'Letter', 'Legal'].map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        onCommand('layout.size', { name });
                        close();
                      }}
                      className="rounded px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Popover title={t.columns} disabled={none} label={<span className="px-1">{t.columns}</span>}>
              {(close) => (
                <div className="flex w-24 flex-col">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        onCommand('layout.columns', { count });
                        close();
                      }}
                      className="rounded px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
                    >
                      {count}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          </>
        )}
      </div>
    </div>
  );
};
