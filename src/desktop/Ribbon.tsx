/** The ribbon: Lithora's formatting and page commands, run by the engine. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  BookOpenCheck,
  Bold,
  CaseSensitive,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSignature,
  Hash,
  Link2,
  ListChecks,
  MessageSquarePlus,
  MessagesSquare,
  Omega,
  PanelBottom,
  PanelTop,
  Printer,
  Search,
  Trash2,
  X as XIcon,
  XCircle,
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
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  TableCellsMerge,
  TableCellsSplit,
} from 'lucide-react';
import type { DocState } from './engine';
import type { Strings } from './strings';

export type RibbonAction =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'exportPdf'
  | 'print'
  | 'paste'
  | 'copy'
  | 'cut'
  | 'picture'
  | 'signature'
  | 'link'
  | 'symbol'
  | 'comment'
  | 'wordCount'
  | 'spelling'
  | 'find'
  | 'replace'
  | 'history'
  | 'comments';

interface RibbonProps {
  t: Strings;
  doc: DocState | null;
  fonts: string[];
  recent: string[];
  onOpenRecent(path: string): void;
  onClearRecent(): void;
  onCommand(name: string, params?: Record<string, unknown>): void;
  onAction(action: RibbonAction): void;
  /** How often recovery copies are kept, as a phrase ("every 5 minutes"). */
  recoveryEvery: string;
}

type Tab = 'file' | 'home' | 'insert' | 'layout' | 'review' | 'table' | 'headerFooter';

/** The Change case choices: the engine's mode and the label's string key. */
export const CASES = [
  ['sentence', 'caseSentence'],
  ['lower', 'caseLower'],
  ['upper', 'caseUpper'],
  ['title', 'caseTitle'],
  ['toggle', 'caseToggle'],
] as const;

const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

const SHADES = ['FFFFFF', 'F2F2F2', 'D9D9D9', 'BFBFBF', 'DCE6F2', 'B9CDE5', '6C9FCB', 'E4DFEC', 'B9AEDC', 'FBF8F0', 'FFF2CC', 'E2EFDA', 'FCE4D6', 'FFC7CE'];

/** A row in a drop-down panel. */
function MenuRow({ children, onClick, active }: { children: React.ReactNode; onClick(): void; active?: boolean }) {
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
      className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-35 ${
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

/** Page numbers: top or bottom of the page, left, centre or right, "3" or "Page 3 of 10". */
function PageNumberMenu({
  t,
  disabled,
  current,
  onCommand,
}: {
  t: Strings;
  disabled?: boolean;
  /** In a header or footer: also offer "at the cursor". */
  current?: boolean;
  onCommand(name: string, params?: Record<string, unknown>): void;
}) {
  const [xOfY, setXOfY] = useState(false);
  return (
    <Popover
      title={t.pageNumber}
      disabled={disabled}
      label={
        <span className="flex items-center gap-1.5 px-1">
          <Hash className="h-4 w-4" /> {t.pageNumber}
        </span>
      }
    >
      {(close) => (
        <div className="flex w-60 flex-col">
          {(['top', 'bottom', ...(current ? ['current'] : [])] as const).map((position) => (
            <div key={position} className="mb-1">
              <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">
                {position === 'top' ? t.pageNumberTop : position === 'bottom' ? t.pageNumberBottom : t.insertBtn}
              </div>
              <div className="flex gap-1 px-1">
                {(position === 'current' ? (['left'] as const) : (['left', 'center', 'right'] as const)).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => {
                      onCommand('insert.pageNumber', { position, align, ...(xOfY ? { format: 'x of y' } : {}) });
                      close();
                    }}
                    className="flex-1 rounded border border-slate-200 px-2 py-1 text-[12px] text-slate-700 hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
                  >
                    {position === 'current' ? '#' : align === 'left' ? t.left : align === 'center' ? t.center : t.right}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="mt-1 flex items-center gap-2 px-2 py-1 text-[13px] text-slate-700">
            <input type="checkbox" checked={xOfY} onChange={(e) => setXOfY(e.target.checked)} className="accent-[#376FA3]" />
            {t.pageNumberXofY}
          </label>
        </div>
      )}
    </Popover>
  );
}

/** Redrawn only when what it shows changes, and after typing has gone on screen (see DesktopApp). */
export const Ribbon = React.memo(function Ribbon({ t, doc, fonts, recent, onOpenRecent, onClearRecent, onCommand, onAction, recoveryEvery }: RibbonProps) {
  const [tab, setTab] = useState<Tab>('home');
  const f = doc?.format ?? null;
  const none = !doc;
  const style = f?.style ?? '';
  const inHeaderFooter = doc?.story === 'header' || doc?.story === 'footer';
  const inTable = !!doc?.inTable;

  // The Table and Header & Footer tabs appear while the cursor is in one, as in Word.
  const tabs: [Tab, string, boolean?][] = [
    ['file', t.file],
    ['home', t.home],
    ['insert', t.insert],
    ['layout', t.layout],
    ['review', t.review],
    ...(inTable ? ([['table', t.tableTab, true]] as [Tab, string, boolean][]) : []),
    ...(inHeaderFooter ? ([['headerFooter', t.headerFooterTab, true]] as [Tab, string, boolean][]) : []),
  ];

  // Going into a header or table opens its tab; leaving it goes back to Home.
  const wasHeader = useRef(false);
  useEffect(() => {
    if (inHeaderFooter && !wasHeader.current) setTab('headerFooter');
    if (!inHeaderFooter && tab === 'headerFooter') setTab('home');
    wasHeader.current = inHeaderFooter;
  }, [inHeaderFooter, tab]);
  useEffect(() => {
    if (!inTable && tab === 'table') setTab('home');
  }, [inTable, tab]);

  const fontValue = f?.font ?? '';
  const fontOptions = fontValue && !fonts.includes(fontValue) ? [fontValue, ...fonts] : fonts;

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white select-none">
      <div className="flex items-end gap-1 border-b border-slate-200 bg-[#F7F8FB] px-3 pt-1.5">
        {tabs.map(([key, label, contextual]) => (
          <button
            key={key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(key)}
            className={`-mb-px rounded-t-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === key
                ? `border-x border-t border-slate-200 bg-white ${contextual ? 'text-[#5B4B9A]' : 'text-[#083B69]'}`
                : contextual
                  ? 'text-[#5B4B9A] hover:text-[#3F3270]'
                  : 'text-slate-600 hover:text-[#083B69]'
            } ${contextual ? 'bg-[#B9AEDC]/25' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="lithora-slim-scroll flex h-12 items-center gap-0.5 overflow-x-auto px-3"
        // On a narrow window the commands run past the edge: the mouse wheel scrolls them.
        onWheel={(e) => {
          if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
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
            <Popover
              title={t.recent}
              label={
                <span className="flex items-center gap-1.5 px-1">
                  <Clock className="h-4 w-4" /> {t.recent}
                </span>
              }
            >
              {(close) => (
                <div className="flex w-80 flex-col">
                  {recent.length === 0 && <div className="px-2 py-1.5 text-[13px] text-slate-500">{t.noRecent}</div>}
                  {recent.map((path) => (
                    <button
                      key={path}
                      type="button"
                      title={path}
                      onClick={() => {
                        onOpenRecent(path);
                        close();
                      }}
                      className="rounded px-2 py-1.5 text-left hover:bg-slate-100"
                    >
                      <span className="block truncate text-[13px] font-medium text-slate-800">{path.split(/[\\/]/).pop()}</span>
                      <span className="block truncate text-[11px] text-slate-500">{path}</span>
                    </button>
                  ))}
                  {recent.length > 0 && (
                    <>
                      <div className="my-1 h-px bg-slate-200" />
                      <MenuRow
                        onClick={() => {
                          onClearRecent();
                          close();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t.clearRecent}
                      </MenuRow>
                    </>
                  )}
                </div>
              )}
            </Popover>
            <Divider />
            <Btn wide title={`${t.print} (Ctrl+P)`} disabled={none} onClick={() => onAction('print')}>
              <Printer className="h-4 w-4" /> {t.print}
            </Btn>
            <Btn wide title={t.exportPdf} disabled={none} onClick={() => onAction('exportPdf')}>
              <FileDown className="h-4 w-4" /> {t.exportPdf}
            </Btn>
            <span className="ml-3 hidden text-[12px] text-slate-500 xl:inline">{t.autoRecoverNote.replace('{every}', recoveryEvery)}</span>
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
            <Popover title={`${t.changeCase} (Shift+F3)`} disabled={none} label={<CaseSensitive className="h-4 w-4" />}>
              {(close) => (
                <div className="w-52">
                  {CASES.map(([mode, key]) => (
                    <MenuRow
                      key={mode}
                      onClick={() => {
                        onCommand('format.changeCase', { mode });
                        close();
                      }}
                    >
                      {t[key]}
                    </MenuRow>
                  ))}
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
            <Popover title={t.lineSpacing} disabled={none} label={<ListChecks className="h-4 w-4" />}>
              {(close) => (
                <div className="flex w-64 flex-col">
                  {LINE_SPACINGS.map((v) => (
                    <MenuRow
                      key={v}
                      active={doc?.lineSpacing != null && Math.abs(doc.lineSpacing - v) < 0.01}
                      onClick={() => {
                        onCommand('para.lineSpacing', { value: v });
                        close();
                      }}
                    >
                      <span className="w-8 tabular-nums">{v.toFixed(v % 1 === 0 ? 1 : 2).replace(/0$/, v % 1 === 0 ? '0' : '')}</span>
                    </MenuRow>
                  ))}
                  <div className="my-1 h-px bg-slate-200" />
                  <MenuRow
                    onClick={() => {
                      onCommand('para.addSpaceBefore');
                      close();
                    }}
                  >
                    {t.addSpaceBefore}
                  </MenuRow>
                  <MenuRow
                    onClick={() => {
                      onCommand('para.removeSpaceAfter');
                      close();
                    }}
                  >
                    {t.removeSpaceAfter}
                  </MenuRow>
                </div>
              )}
            </Popover>
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
            <Popover title={t.moreStyles} disabled={none} label={<span className="px-0.5 text-[12px]">{t.moreStyles}</span>}>
              {(close) => (
                <div className="flex w-56 flex-col">
                  {(
                    [
                      ['Subtitle', t.subtitle, 'text-[14px] text-slate-500'],
                      ['Heading4', t.heading4, 'text-[13px] font-semibold italic text-[#376FA3]'],
                      ['Quote', t.quote, 'text-[13px] italic text-slate-600'],
                      ['IntenseQuote', t.intenseQuote, 'text-[13px] italic text-[#376FA3]'],
                      ['NoSpacing', t.noSpacing, 'text-[13px]'],
                      ['ListParagraph', t.listParagraph, 'text-[13px] pl-3'],
                    ] as const
                  ).map(([id, label, look]) => (
                    <MenuRow
                      key={id}
                      active={style === id}
                      onClick={() => {
                        onCommand('para.style', { style: id });
                        close();
                      }}
                    >
                      <span className={look}>{label}</span>
                    </MenuRow>
                  ))}
                </div>
              )}
            </Popover>
            <Divider />
            <Btn title={`${t.findReplace} (Ctrl+H)`} disabled={none} onClick={() => onAction('replace')}>
              <Search className="h-4 w-4" />
            </Btn>
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
            <Btn wide title={t.signature} disabled={none} onClick={() => onAction('signature')}>
              <FileSignature className="h-4 w-4" /> {t.signature}
            </Btn>
            <Btn wide title={t.pageBreak} disabled={none} onClick={() => onCommand('insert.pageBreak')}>
              <SeparatorHorizontal className="h-4 w-4" /> {t.pageBreak}
            </Btn>
            <Divider />
            <Btn wide title={`${t.link} (Ctrl+K)`} disabled={none} onClick={() => onAction('link')}>
              <Link2 className="h-4 w-4" /> {t.link}
            </Btn>
            <Btn wide title={t.symbol} disabled={none} onClick={() => onAction('symbol')}>
              <Omega className="h-4 w-4" /> {t.symbol}
            </Btn>
            <Btn wide title={t.newComment} disabled={none} onClick={() => onAction('comment')}>
              <MessageSquarePlus className="h-4 w-4" /> {t.newComment}
            </Btn>
            <Divider />
            <Btn wide title={t.headerHint} disabled={none} onClick={() => onCommand('insert.editHeader')}>
              <PanelTop className="h-4 w-4" /> {t.header}
            </Btn>
            <Btn wide title={t.headerHint} disabled={none} onClick={() => onCommand('insert.editFooter')}>
              <PanelBottom className="h-4 w-4" /> {t.footer}
            </Btn>
            <PageNumberMenu t={t} disabled={none} onCommand={onCommand} />
          </>
        )}

        {tab === 'review' && (
          <>
            <Btn wide title={t.wordCount} disabled={none} onClick={() => onAction('wordCount')}>
              <BookOpenCheck className="h-4 w-4" /> {t.wordCount}
            </Btn>
            <Divider />
            <Btn wide title={t.newComment} disabled={none} onClick={() => onAction('comment')}>
              <MessageSquarePlus className="h-4 w-4" /> {t.newComment}
            </Btn>
            <Btn title={t.previousComment} disabled={none} onClick={() => onCommand('review.previousComment')}>
              <ChevronLeft className="h-4 w-4" />
            </Btn>
            <Btn title={t.nextComment} disabled={none} onClick={() => onCommand('review.nextComment')}>
              <ChevronRight className="h-4 w-4" />
            </Btn>
            <Btn title={t.deleteComment} disabled={none} onClick={() => onCommand('review.deleteComment')}>
              <Trash2 className="h-4 w-4" />
            </Btn>
            <Btn wide title={t.comments} disabled={none} onClick={() => onAction('comments')}>
              <MessagesSquare className="h-4 w-4" /> {t.comments}
            </Btn>
            <Divider />
            <Btn wide title={`${t.trackChanges} (Ctrl+Shift+E)`} active={doc?.trackChanges} disabled={none} onClick={() => onCommand('review.trackChanges')}>
              <span className={`h-2 w-2 rounded-full ${doc?.trackChanges ? 'bg-red-600' : 'bg-slate-300'}`} /> {t.trackChanges}
            </Btn>
            <Btn title={t.previousChange} disabled={none} onClick={() => onCommand('review.previousChange')}>
              <ChevronLeft className="h-4 w-4" />
            </Btn>
            <Btn title={t.nextChange} disabled={none} onClick={() => onCommand('review.nextChange')}>
              <ChevronRight className="h-4 w-4" />
            </Btn>
            <Btn wide title={t.accept} disabled={none} onClick={() => onCommand('review.accept')}>
              <Check className="h-4 w-4" /> {t.accept}
            </Btn>
            <Btn wide title={t.reject} disabled={none} onClick={() => onCommand('review.reject')}>
              <XCircle className="h-4 w-4" /> {t.reject}
            </Btn>
            <Popover title={t.acceptAll} disabled={none} label={<CheckCheck className="h-4 w-4" />}>
              {(close) => (
                <div className="flex w-56 flex-col">
                  <MenuRow
                    onClick={() => {
                      onCommand('review.acceptAll');
                      close();
                    }}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> {t.acceptAll}
                  </MenuRow>
                  <MenuRow
                    onClick={() => {
                      onCommand('review.rejectAll');
                      close();
                    }}
                  >
                    <XIcon className="h-3.5 w-3.5" /> {t.rejectAll}
                  </MenuRow>
                </div>
              )}
            </Popover>
          </>
        )}

        {tab === 'table' && (
          <>
            <Btn wide title={t.rowAbove} onClick={() => onCommand('table.insertRowAbove')}>
              <BetweenHorizontalStart className="h-4 w-4" /> {t.rowAbove}
            </Btn>
            <Btn wide title={t.rowBelow} onClick={() => onCommand('table.insertRowBelow')}>
              <BetweenHorizontalEnd className="h-4 w-4" /> {t.rowBelow}
            </Btn>
            <Btn wide title={t.colLeft} onClick={() => onCommand('table.insertColumnLeft')}>
              <BetweenVerticalStart className="h-4 w-4" /> {t.colLeft}
            </Btn>
            <Btn wide title={t.colRight} onClick={() => onCommand('table.insertColumnRight')}>
              <BetweenVerticalEnd className="h-4 w-4" /> {t.colRight}
            </Btn>
            <Divider />
            <Popover title={t.deleteRow} label={<Trash2 className="h-4 w-4" />}>
              {(close) => (
                <div className="flex w-48 flex-col">
                  {(
                    [
                      ['table.deleteRow', t.deleteRow],
                      ['table.deleteColumn', t.deleteColumn],
                      ['table.deleteTable', t.deleteTable],
                    ] as const
                  ).map(([cmd, label]) => (
                    <MenuRow
                      key={cmd}
                      onClick={() => {
                        onCommand(cmd);
                        close();
                      }}
                    >
                      {label}
                    </MenuRow>
                  ))}
                </div>
              )}
            </Popover>
            <Btn wide title={t.mergeCells} onClick={() => onCommand('table.merge')}>
              <TableCellsMerge className="h-4 w-4" /> {t.mergeCells}
            </Btn>
            <Btn wide title={t.splitCells} onClick={() => onCommand('table.split', { columns: 2, rows: 1 })}>
              <TableCellsSplit className="h-4 w-4" /> {t.splitCells}
            </Btn>
            <Divider />
            <Popover title={t.borders} label={<span className="px-1">{t.borders}</span>}>
              {(close) => (
                <div className="flex w-48 flex-col">
                  {(
                    [
                      ['all', t.allBorders],
                      ['outside', t.outsideBorders],
                      ['inside', t.insideBorders],
                      ['none', t.noBorders],
                    ] as const
                  ).map(([kind, label]) => (
                    <MenuRow
                      key={kind}
                      onClick={() => {
                        onCommand('table.borders', { kind });
                        close();
                      }}
                    >
                      {label}
                    </MenuRow>
                  ))}
                </div>
              )}
            </Popover>
            <Popover title={t.shading} label={<span className="px-1">{t.shading}</span>}>
              {(close) => (
                <div className="w-48">
                  <div className="grid grid-cols-7 gap-1">
                    {SHADES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={`#${c}`}
                        onClick={() => {
                          onCommand('table.shading', { color: c });
                          close();
                        }}
                        className="h-5 w-5 rounded-sm border border-slate-300"
                        style={{ background: `#${c}` }}
                      />
                    ))}
                  </div>
                  <MenuRow
                    onClick={() => {
                      onCommand('table.shading', {});
                      close();
                    }}
                  >
                    {t.noShading}
                  </MenuRow>
                </div>
              )}
            </Popover>
            <Popover title={t.cellAlign} label={<span className="px-1">{t.cellAlign}</span>}>
              {(close) => (
                <div className="grid w-28 grid-cols-3 gap-1 p-1">
                  {['topLeft', 'topCenter', 'topRight', 'centerLeft', 'center', 'centerRight', 'bottomLeft', 'bottomCenter', 'bottomRight'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      title={v}
                      onClick={() => {
                        onCommand('table.cellAlign', { value: v });
                        close();
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 hover:bg-[#6C9FCB]/15"
                    >
                      <span
                        className="h-1 w-3 rounded bg-[#376FA3]"
                        style={{
                          alignSelf: v.startsWith('top') ? 'flex-start' : v.startsWith('bottom') ? 'flex-end' : 'center',
                          marginTop: v.startsWith('top') ? 4 : 0,
                          marginBottom: v.startsWith('bottom') ? 4 : 0,
                          justifySelf: 'center',
                          transform: v.endsWith('Left') ? 'translateX(-4px)' : v.endsWith('Right') ? 'translateX(4px)' : undefined,
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <Divider />
            <Popover title={t.autofitContents} label={<span className="px-1">{t.distributeColumns}</span>}>
              {(close) => (
                <div className="flex w-52 flex-col">
                  <MenuRow
                    onClick={() => {
                      onCommand('table.distributeColumns');
                      close();
                    }}
                  >
                    {t.distributeColumns}
                  </MenuRow>
                  <MenuRow
                    onClick={() => {
                      onCommand('table.autofit', { mode: 'contents' });
                      close();
                    }}
                  >
                    {t.autofitContents}
                  </MenuRow>
                  <MenuRow
                    onClick={() => {
                      onCommand('table.autofit', { mode: 'window' });
                      close();
                    }}
                  >
                    {t.autofitWindow}
                  </MenuRow>
                </div>
              )}
            </Popover>
            <Btn wide title={t.repeatHeader} onClick={() => onCommand('table.repeatHeader')}>
              {t.repeatHeader}
            </Btn>
          </>
        )}

        {tab === 'headerFooter' && (
          <>
            <Btn wide title={t.editHeader} onClick={() => onCommand('insert.editHeader')}>
              <PanelTop className="h-4 w-4" /> {t.header}
            </Btn>
            <Btn wide title={t.editFooter} onClick={() => onCommand('insert.editFooter')}>
              <PanelBottom className="h-4 w-4" /> {t.footer}
            </Btn>
            <PageNumberMenu t={t} onCommand={onCommand} current />
            <Divider />
            <Btn wide title={t.differentFirstPage} onClick={() => onCommand('layout.differentFirstPage')}>
              {t.differentFirstPage}
            </Btn>
            <Divider />
            <Btn wide title={doc?.story === 'header' ? t.removeHeader : t.removeFooter} onClick={() => onCommand(doc?.story === 'header' ? 'insert.removeHeader' : 'insert.removeFooter')}>
              <Trash2 className="h-4 w-4" /> {doc?.story === 'header' ? t.removeHeader : t.removeFooter}
            </Btn>
            <Btn wide title={t.closeHeader} onClick={() => onCommand('insert.closeHeader')}>
              <XIcon className="h-4 w-4" /> {t.closeHeader}
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
});
