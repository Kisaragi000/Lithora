/** The ribbon: Lithora's formatting and page commands, run by the engine. */
import React, { useEffect, useRef, useState } from 'react';
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
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-[13px] text-slate-700 hover:bg-[#6C9FCB]/15 hover:text-[#083B69] disabled:pointer-events-none disabled:opacity-35"
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          {children(() => setOpen(false))}
        </div>
      )}
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
            <select
              title={t.font}
              aria-label={t.font}
              disabled={none}
              value={fontValue}
              onChange={(e) => onCommand('format.font', { name: e.target.value })}
              className="h-8 w-44 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:border-[#376FA3] focus:outline-none"
              style={{ fontFamily: fontValue || undefined }}
            >
              {!fontValue && <option value="" />}
              {fontOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              title={t.fontSize}
              aria-label={t.fontSize}
              disabled={none}
              value={f?.size ?? ''}
              onChange={(e) => onCommand('format.size', { size: Number(e.target.value) })}
              className="ml-1 h-8 w-16 rounded-md border border-slate-300 bg-white px-1.5 text-[13px] text-slate-800 focus:border-[#376FA3] focus:outline-none"
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
            <Popover title={t.margins} disabled={none} label={<span className="px-1">{t.margins}</span>}>
              {(close) => (
                <div className="flex w-36 flex-col">
                  {(
                    [
                      ['normal', t.marginsNormal],
                      ['narrow', t.marginsNarrow],
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
