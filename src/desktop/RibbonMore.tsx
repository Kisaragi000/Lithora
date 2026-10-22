/**
 * Word's everyday tools on the ribbon: the View, References and Design tabs, and the extra
 * menus on Home, Insert, Layout, Review and File (Format Painter, lists, borders, shapes,
 * equations, breaks, watermarks and more). Each runs engine commands or opens a dialog.
 */
import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CalendarClock,
  Captions,
  Circle,
  ClipboardPaste,
  Diamond,
  Droplets,
  Eye,
  FileSearch,
  Frame,
  GitCompare,
  Heart,
  Info,
  Languages,
  LayoutTemplate,
  Link2,
  ListTree,
  Lock,
  Minus,
  Paintbrush,
  PanelLeft,
  Pilcrow,
  RefreshCw,
  Sigma,
  Square,
  SquareRoundCorner,
  Star,
  Stamp,
  TableOfContents,
  Triangle,
  Type,
  WrapText,
  ZoomIn,
} from 'lucide-react';
import type { DocState } from './engine';
import type { Strings } from './strings';
import { Btn, Divider, MenuRow, Popover, SHADES } from './ribbonParts';

type Run = (name: string, params?: Record<string, unknown>) => void;

/** Dialogs and other things the ribbon asks the window to do. */
export type MoreAction =
  | 'fontDialog'
  | 'paragraphDialog'
  | 'pageSetup'
  | 'customWatermark'
  | 'caption'
  | 'crossReference'
  | 'bookmark'
  | 'dateTime'
  | 'password'
  | 'properties'
  | 'template'
  | 'compare'
  | 'thesaurus'
  | 'printPreview'
  | 'navPane'
  | 'readMode'
  | 'pasteKeep'
  | 'pasteMerge'
  | 'pasteText'
  | 'pastePicture';

export type Zoom = number | 'pageWidth' | 'onePage';

interface Props {
  t: Strings;
  doc: DocState | null;
  onCommand: Run;
  onMore(action: MoreAction): void;
}

/** A small heading inside a drop-down panel. */
function Heading({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{children}</div>;
}

function Sep() {
  return <div className="my-1 h-px bg-slate-200" />;
}

/** A row of colour swatches, each running `pick` with its colour. */
function Swatches({ colors, onPick }: { colors: string[]; onPick(color: string): void }) {
  return (
    <div className="grid grid-cols-7 gap-1 p-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          title={`#${c}`}
          onClick={() => onPick(c)}
          className="h-5 w-5 rounded-sm border border-slate-300 hover:ring-2 hover:ring-[#6C9FCB]"
          style={{ background: `#${c}` }}
        />
      ))}
    </div>
  );
}

const label = (icon: React.ReactNode, text: string) => (
  <span className="flex items-center gap-1.5 px-0.5">
    {icon} {text}
  </span>
);

// ───────────────────────────── Home ─────────────────────────────

/** Paste with a choice of how: keep the copied formatting, match the text around, text only, a picture. */
export function PasteMenu({ t, doc, onMore }: Props) {
  return (
    <Popover title={t.pasteOptions} disabled={!doc} label={<ClipboardPaste className="h-4 w-4" />}>
      {(close) => (
        <div className="flex w-60 flex-col">
          {(
            [
              ['pasteKeep', t.pasteKeep],
              ['pasteMerge', t.pasteMerge],
              ['pasteText', t.pasteText],
              ['pastePicture', t.pastePicture],
            ] as const
          ).map(([action, text]) => (
            <MenuRow
              key={action}
              onClick={() => {
                onMore(action);
                close();
              }}
            >
              {text}
            </MenuRow>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Format Painter: click to paint once, double-click to keep painting until clicked again. */
export function FormatPainterButton({ t, doc, onCommand }: Props) {
  return (
    <button
      type="button"
      title={t.formatPainterHint}
      aria-label={t.formatPainter}
      aria-pressed={doc?.painter}
      disabled={!doc}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        // The first click of a double click turned it on; the second keeps it on for more.
        if (e.detail === 2) {
          onCommand('edit.formatPainter');
          onCommand('edit.formatPainter', { sticky: true });
        } else onCommand('edit.formatPainter');
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-35 ${
        doc?.painter ? 'bg-[#376FA3]/15 text-[#083B69] ring-1 ring-[#376FA3]/40' : 'text-slate-700 hover:bg-[#6C9FCB]/15 hover:text-[#083B69]'
      }`}
    >
      <Paintbrush className="h-4 w-4" />
    </button>
  );
}

const BULLETS = ['•', '○', '■', '◆', '➢', '✓', '–'];

/** Bullet characters, numbering styles and multilevel lists. */
export function ListMenus({ t, doc, onCommand }: Props) {
  const none = !doc;
  return (
    <>
      <Popover title={t.bulletLibrary} disabled={none} label={<span className="text-[15px] leading-none">•</span>}>
        {(close) => (
          <div className="w-48">
            <Heading>{t.bulletLibrary}</Heading>
            <div className="grid grid-cols-4 gap-1 p-1">
              {BULLETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    onCommand('para.bullets', { kind: b });
                    close();
                  }}
                  className="flex h-9 items-center justify-center rounded border border-slate-200 text-[18px] hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
                >
                  {b}
                </button>
              ))}
            </div>
            <MenuRow
              onClick={() => {
                onCommand('para.bullets', { off: true });
                close();
              }}
            >
              {t.listNone}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Popover title={t.numberingLibrary} disabled={none} label={<span className="text-[12px] font-medium leading-none">1.</span>}>
        {(close) => (
          <div className="w-52">
            <Heading>{t.numberingLibrary}</Heading>
            <div className="grid grid-cols-3 gap-1 p-1">
              {(
                [
                  ['numbered', '1.\n2.\n3.'],
                  ['numberedParen', '1)\n2)\n3)'],
                  ['upperLetter', 'A.\nB.\nC.'],
                  ['lowerLetter', 'a)\nb)\nc)'],
                  ['lowerRoman', 'i.\nii.\niii.'],
                  ['outline', '1.\n1.1.\n1.1.1.'],
                ] as const
              ).map(([kind, sample]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    onCommand('para.numbering', { kind });
                    close();
                  }}
                  className="whitespace-pre rounded border border-slate-200 px-2 py-1 text-left text-[11px] leading-4 text-slate-700 hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
                >
                  {sample}
                </button>
              ))}
            </div>
            <MenuRow
              onClick={() => {
                onCommand('para.numbering', { off: true });
                close();
              }}
            >
              {t.listNone}
            </MenuRow>
            <MenuRow
              onClick={() => {
                onCommand('para.restartNumbering');
                close();
              }}
            >
              {t.restartNumbering}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Popover title={t.multilevelList} disabled={none} label={<ListTree className="h-4 w-4" />}>
        {(close) => (
          <div className="flex w-64 flex-col">
            <Heading>{t.multilevelList}</Heading>
            {(
              [
                ['preset', 'headings', t.mlHeadings],
                ['preset', 'outlineHeadings', t.mlOutlineHeadings],
                ['preset', 'article', t.mlArticle],
                ['preset', 'chapter', t.mlChapter],
                ['kind', 'legal', t.mlLegal],
                ['kind', 'outline', t.mlOutline],
              ] as const
            ).map(([how, value, text]) => (
              <MenuRow
                key={value + how}
                onClick={() => {
                  if (how === 'preset') onCommand('list.multilevelPreset', { preset: value });
                  else onCommand('para.multilevel', { kind: value });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}

/** Borders around and between paragraphs, and their shading. */
export function ParagraphBordersMenu({ t, doc, onCommand }: Props) {
  return (
    <Popover title={t.paraBorders} disabled={!doc} label={<Frame className="h-4 w-4" />}>
      {(close) => (
        <div className="flex w-56 flex-col">
          {(
            [
              ['bottom', t.borderBottom],
              ['top', t.borderTop],
              ['left', t.borderLeft],
              ['right', t.borderRight],
              ['outside', t.outsideBorders],
              ['all', t.allBorders],
              ['inside', t.insideBorders],
              ['horizontalLine', t.horizontalLine],
              ['none', t.noBorders],
            ] as const
          ).map(([kind, text]) => (
            <MenuRow
              key={kind}
              onClick={() => {
                onCommand('para.borders', { kind });
                close();
              }}
            >
              {text}
            </MenuRow>
          ))}
          <Sep />
          <Heading>{t.shading}</Heading>
          <Swatches
            colors={SHADES}
            onPick={(color) => {
              onCommand('para.shading', { color });
              close();
            }}
          />
          <MenuRow
            onClick={() => {
              onCommand('para.shading', { color: null });
              close();
            }}
          >
            {t.noShading}
          </MenuRow>
        </div>
      )}
    </Popover>
  );
}

/** The small "more settings" button at the end of a group, as in Word. */
export function DialogLauncher({ title, onClick, disabled }: { title: string; onClick(): void; disabled?: boolean }) {
  return (
    <Btn title={title} disabled={disabled} onClick={onClick}>
      <span className="text-[13px] font-semibold leading-none text-slate-500">⋯</span>
    </Btn>
  );
}

// ───────────────────────────── Insert ─────────────────────────────

const SHAPES: [string, React.ReactNode, keyof Strings][] = [
  ['rectangle', <Square className="h-4 w-4" />, 'shapeRectangle'],
  ['roundedRectangle', <SquareRoundCorner className="h-4 w-4" />, 'shapeRounded'],
  ['ellipse', <Circle className="h-4 w-4" />, 'shapeEllipse'],
  ['triangle', <Triangle className="h-4 w-4" />, 'shapeTriangle'],
  ['diamond', <Diamond className="h-4 w-4" />, 'shapeDiamond'],
  ['star', <Star className="h-4 w-4" />, 'shapeStar'],
  ['heart', <Heart className="h-4 w-4" />, 'shapeHeart'],
  ['line', <Minus className="h-4 w-4" />, 'shapeLine'],
  ['arrow', <ArrowRight className="h-4 w-4" />, 'shapeArrow'],
];

const EQUATIONS: [string, React.ReactNode][] = [
  ['quadratic', 'x = (−b ± √(b²−4ac)) / 2a'],
  ['pythagoras', 'a² + b² = c²'],
  ['area', 'A = πr²'],
  ['binomial', '(x + a)ⁿ = Σ (n k) xᵏ aⁿ⁻ᵏ'],
  [
    'euler',
    <>
      e<sup>iπ</sup> + 1 = 0
    </>,
  ],
  ['derivative', "f′(x) = lim (f(x+h) − f(x)) / h"],
  ['taylor', 'eˣ = 1 + x/1! + x²/2! + …'],
  ['trig1', 'sin²α + cos²α = 1'],
];

export function InsertMore({ t, doc, onCommand, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Popover title={t.shapes} disabled={none} label={label(<Square className="h-4 w-4" />, t.shapes)}>
        {(close) => (
          <div className="w-56">
            <Heading>{t.shapes}</Heading>
            <div className="grid grid-cols-5 gap-1 p-1">
              {SHAPES.map(([kind, icon, name]) => (
                <button
                  key={kind}
                  type="button"
                  title={t[name]}
                  aria-label={t[name]}
                  onClick={() => {
                    onCommand('insert.shape', { kind, ...(kind === 'line' || kind === 'arrow' ? { width: 144, height: 0 } : { width: 108, height: 72 }) });
                    close();
                  }}
                  className="flex h-9 items-center justify-center rounded border border-slate-200 text-[#083B69] hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>
      <Btn wide title={t.textBox} disabled={none} onClick={() => onCommand('insert.textBox', { width: 180, height: 72 })}>
        <Type className="h-4 w-4" /> {t.textBox}
      </Btn>
      <Popover title={t.equation} disabled={none} label={label(<Sigma className="h-4 w-4" />, t.equation)}>
        {(close) => (
          <div className="flex w-72 flex-col">
            <MenuRow
              onClick={() => {
                onCommand('insert.equation', {});
                close();
              }}
            >
              <Sigma className="h-3.5 w-3.5" /> {t.newEquation}
            </MenuRow>
            <Sep />
            <Heading>{t.builtInEquations}</Heading>
            {EQUATIONS.map(([builtin, text]) => (
              <MenuRow
                key={builtin}
                onClick={() => {
                  onCommand('insert.equation', { builtin, ownLine: true, edit: false });
                  close();
                }}
              >
                <span className="font-serif italic">{text}</span>
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
      <Divider />
      <Btn wide title={t.dateTime} disabled={none} onClick={() => onMore('dateTime')}>
        <CalendarClock className="h-4 w-4" /> {t.dateTime}
      </Btn>
      <Btn wide title={t.bookmark} disabled={none} onClick={() => onMore('bookmark')}>
        <Bookmark className="h-4 w-4" /> {t.bookmark}
      </Btn>
      <Btn wide title={t.crossReference} disabled={none} onClick={() => onMore('crossReference')}>
        <Link2 className="h-4 w-4" /> {t.crossReference}
      </Btn>
    </>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function LayoutMore({ t, doc, onCommand, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Popover title={t.breaks} disabled={none} label={<span className="px-1">{t.breaks}</span>}>
        {(close) => (
          <div className="flex w-72 flex-col">
            <Heading>{t.pageBreaks}</Heading>
            {(
              [
                ['page', t.breakPage, t.breakPageHint],
                ['column', t.breakColumn, t.breakColumnHint],
                ['textWrapping', t.breakWrapping, t.breakWrappingHint],
              ] as const
            ).map(([kind, text, hint]) => (
              <MenuRow
                key={kind}
                onClick={() => {
                  onCommand('layout.break', { kind });
                  close();
                }}
              >
                <span>
                  <span className="block font-medium">{text}</span>
                  <span className="block text-[11px] text-slate-500">{hint}</span>
                </span>
              </MenuRow>
            ))}
            <Heading>{t.sectionBreaks}</Heading>
            {(
              [
                ['nextPage', t.breakNextPage],
                ['continuous', t.breakContinuous],
                ['evenPage', t.breakEvenPage],
                ['oddPage', t.breakOddPage],
              ] as const
            ).map(([kind, text]) => (
              <MenuRow
                key={kind}
                onClick={() => {
                  onCommand('layout.break', { kind });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
      <Popover title={t.lineNumbers} disabled={none} label={<span className="px-1">{t.lineNumbers}</span>}>
        {(close) => (
          <div className="flex w-60 flex-col">
            {(
              [
                ['none', t.lnNone],
                ['continuous', t.lnContinuous],
                ['restartPage', t.lnRestartPage],
                ['restartSection', t.lnRestartSection],
              ] as const
            ).map(([value, text]) => (
              <MenuRow
                key={value}
                onClick={() => {
                  onCommand('layout.lineNumbers', { value });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
      <Popover title={t.hyphenation} disabled={none} label={<span className="px-1">{t.hyphenation}</span>}>
        {(close) => (
          <div className="flex w-48 flex-col">
            <MenuRow
              onClick={() => {
                onCommand('layout.hyphenation', { value: true });
                close();
              }}
            >
              {t.hyphenAuto}
            </MenuRow>
            <MenuRow
              onClick={() => {
                onCommand('layout.hyphenation', { value: false });
                close();
              }}
            >
              {t.hyphenNone}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Divider />
      <Btn wide title={t.pageSetup} disabled={none} onClick={() => onMore('pageSetup')}>
        {t.pageSetup}
      </Btn>
      <Btn wide title={t.paragraphSettings} disabled={none} onClick={() => onMore('paragraphDialog')}>
        <WrapText className="h-4 w-4" /> {t.paragraphSettings}
      </Btn>
    </>
  );
}

// ───────────────────────────── View ─────────────────────────────

export function ViewTab({
  t,
  doc,
  onCommand,
  onMore,
  zoom,
  onZoom,
  navOpen,
}: Props & { zoom: number; onZoom(z: Zoom): void; navOpen: boolean }) {
  const none = !doc;
  return (
    <>
      <Btn wide title={`${t.readMode} (Esc ${t.toExit})`} disabled={none} onClick={() => onMore('readMode')}>
        <BookOpen className="h-4 w-4" /> {t.readMode}
      </Btn>
      <Btn wide title={t.printPreview} disabled={none} onClick={() => onMore('printPreview')}>
        <Eye className="h-4 w-4" /> {t.printPreview}
      </Btn>
      <Divider />
      <Btn wide title={t.navigationPane} active={navOpen} disabled={none} onClick={() => onMore('navPane')}>
        <PanelLeft className="h-4 w-4" /> {t.navigationPane}
      </Btn>
      <Btn wide title={`${t.showMarks} (Ctrl+Shift+8)`} active={doc?.marks} disabled={none} onClick={() => onCommand('view.marks')}>
        <Pilcrow className="h-4 w-4" /> {t.showMarks}
      </Btn>
      <Divider />
      <Popover title={t.zoom} disabled={none} label={label(<ZoomIn className="h-4 w-4" />, `${Math.round(zoom * 100)}%`)}>
        {(close) => (
          <div className="flex w-44 flex-col">
            {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((z) => (
              <MenuRow
                key={z}
                active={Math.abs(zoom - z) < 0.001}
                onClick={() => {
                  onZoom(z);
                  close();
                }}
              >
                {Math.round(z * 100)}%
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
      <Btn wide title="100%" disabled={none} onClick={() => onZoom(1)}>
        100%
      </Btn>
      <Btn wide title={t.pageWidth} disabled={none} onClick={() => onZoom('pageWidth')}>
        {t.pageWidth}
      </Btn>
      <Btn wide title={t.onePage} disabled={none} onClick={() => onZoom('onePage')}>
        {t.onePage}
      </Btn>
    </>
  );
}

// ───────────────────────────── References ─────────────────────────────

export function ReferencesTab({ t, doc, onCommand, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Popover title={t.tableOfContents} disabled={none} label={label(<TableOfContents className="h-4 w-4" />, t.tableOfContents)}>
        {(close) => (
          <div className="flex w-72 flex-col">
            {(
              [
                [t.tocAutomatic, { levels: 3, title: t.tocTitle, pageNumbers: true, rightAlign: true, tabLeader: 'dot', hyperlinks: true }],
                [t.tocAutomaticNoTitle, { levels: 3, pageNumbers: true, rightAlign: true, tabLeader: 'dot', hyperlinks: true }],
                [t.tocNoPageNumbers, { levels: 3, title: t.tocTitle, pageNumbers: false, hyperlinks: true }],
                [t.tocTwoLevels, { levels: 2, title: t.tocTitle, pageNumbers: true, rightAlign: true, tabLeader: 'dot', hyperlinks: true }],
              ] as const
            ).map(([text, params]) => (
              <MenuRow
                key={text}
                onClick={() => {
                  onCommand('references.toc', params);
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
            <Sep />
            <MenuRow
              onClick={() => {
                onCommand('references.removeToc');
                close();
              }}
            >
              {t.tocRemove}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Btn wide title={t.tocUpdate} disabled={none} onClick={() => onCommand('references.updateToc')}>
        <RefreshCw className="h-4 w-4" /> {t.tocUpdate}
      </Btn>
      <Divider />
      <Btn wide title={`${t.insertFootnote} (Ctrl+Alt+F)`} disabled={none} onClick={() => onCommand('references.footnote', {})}>
        <span className="text-[12px] font-semibold">
          ab<sup>1</sup>
        </span>{' '}
        {t.insertFootnote}
      </Btn>
      <Btn wide title={t.insertEndnote} disabled={none} onClick={() => onCommand('references.endnote', {})}>
        <span className="text-[12px] font-semibold">
          ab<sup>i</sup>
        </span>{' '}
        {t.insertEndnote}
      </Btn>
      <Btn wide title={t.nextFootnote} disabled={none} onClick={() => onCommand('references.nextFootnote')}>
        {t.nextFootnote}
      </Btn>
      <Divider />
      <Btn wide title={t.insertCaption} disabled={none} onClick={() => onMore('caption')}>
        <Captions className="h-4 w-4" /> {t.insertCaption}
      </Btn>
      <Btn wide title={t.crossReference} disabled={none} onClick={() => onMore('crossReference')}>
        <Link2 className="h-4 w-4" /> {t.crossReference}
      </Btn>
      <Btn wide title={t.bookmark} disabled={none} onClick={() => onMore('bookmark')}>
        <Bookmark className="h-4 w-4" /> {t.bookmark}
      </Btn>
      <Divider />
      <Btn wide title={`${t.updateFields} (F9)`} disabled={none} onClick={() => onCommand('references.updateFields', { all: true })}>
        <RefreshCw className="h-4 w-4" /> {t.updateFields}
      </Btn>
    </>
  );
}

// ───────────────────────────── Design ─────────────────────────────

const PAGE_COLORS = ['FFFFFF', 'FBF8F0', 'F4EED8', 'FFF2CC', 'E2EFDA', 'DCE6F2', 'E4DFEC', 'F2F2F2', 'FCE4D6', 'DDEBF7', 'B9CDE5', 'B9AEDC', '6C9FCB', '083B69'];

export function DesignTab({ t, doc, onCommand, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Popover title={t.watermark} disabled={none} label={label(<Stamp className="h-4 w-4" />, t.watermark)}>
        {(close) => (
          <div className="flex w-64 flex-col">
            {[t.wmConfidential, t.wmDraft, t.wmDoNotCopy, t.wmSample, t.wmUrgent].map((text) => (
              <div key={text} className="flex gap-1">
                {([true, false] as const).map((diagonal) => (
                  <button
                    key={String(diagonal)}
                    type="button"
                    title={diagonal ? t.wmDiagonal : t.wmHorizontal}
                    onClick={() => {
                      onCommand('design.watermark', { text, diagonal, color: 'C0C0C0' });
                      close();
                    }}
                    className="mb-1 flex h-12 flex-1 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/10"
                  >
                    <span className={`whitespace-nowrap text-[11px] font-semibold tracking-wide text-slate-400 ${diagonal ? '-rotate-[35deg]' : ''}`}>{text}</span>
                  </button>
                ))}
              </div>
            ))}
            <Sep />
            <MenuRow
              onClick={() => {
                onMore('customWatermark');
                close();
              }}
            >
              {t.wmCustom}
            </MenuRow>
            <MenuRow
              onClick={() => {
                onCommand('design.watermark', { remove: true });
                close();
              }}
            >
              {t.wmRemove}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Popover title={t.pageColor} disabled={none} label={label(<Droplets className="h-4 w-4" />, t.pageColor)}>
        {(close) => (
          <div className="w-52">
            <Swatches
              colors={PAGE_COLORS}
              onPick={(color) => {
                onCommand('design.pageColor', { color });
                close();
              }}
            />
            <MenuRow
              onClick={() => {
                onCommand('design.pageColor', { color: null });
                close();
              }}
            >
              {t.noColor}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Popover title={t.pageBorders} disabled={none} label={label(<Frame className="h-4 w-4" />, t.pageBorders)}>
        {(close) => (
          <div className="flex w-56 flex-col">
            {(
              [
                ['single', 1, t.pbSingle],
                ['double', 1.5, t.pbDouble],
                ['thick', 3, t.pbThick],
                ['dotted', 1, t.pbDotted],
                ['dashed', 1, t.pbDashed],
                ['wave', 1, t.pbWave],
              ] as const
            ).map(([style, width, text]) => (
              <MenuRow
                key={style}
                onClick={() => {
                  onCommand('design.pageBorders', { kind: 'box', style, width, color: '376FA3', applyTo: 'document' });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
            <Sep />
            <MenuRow
              onClick={() => {
                onCommand('design.pageBorders', { kind: 'none', applyTo: 'document' });
                close();
              }}
            >
              {t.noBorders}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Divider />
      <Popover title={t.paragraphSpacing} disabled={none} label={<span className="px-1">{t.paragraphSpacing}</span>}>
        {(close) => (
          <div className="flex w-48 flex-col">
            {(
              [
                ['default', t.psDefault],
                ['none', t.psNone],
                ['compact', t.psCompact],
                ['tight', t.psTight],
                ['open', t.psOpen],
                ['relaxed', t.psRelaxed],
                ['double', t.psDouble],
              ] as const
            ).map(([value, text]) => (
              <MenuRow
                key={value}
                onClick={() => {
                  onCommand('design.paragraphSpacing', { value });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}

// ───────────────────────────── Review ─────────────────────────────

export function ReviewMore({ t, doc, onCommand, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Btn wide title={`${t.thesaurus} (Shift+F7)`} disabled={none} onClick={() => onMore('thesaurus')}>
        <FileSearch className="h-4 w-4" /> {t.thesaurus}
      </Btn>
      <Popover title={t.proofingLanguage} disabled={none} label={label(<Languages className="h-4 w-4" />, t.proofingLanguage)}>
        {(close) => (
          <div className="flex w-60 flex-col">
            <Heading>{t.proofingLanguageHint}</Heading>
            {(
              [
                ['en-US', 'English (United States)'],
                ['en-GB', 'English (United Kingdom)'],
                ['ru-RU', 'Русский'],
                ['hy-AM', 'Հայերեն'],
              ] as const
            ).map(([lang, text]) => (
              <MenuRow
                key={lang}
                onClick={() => {
                  onCommand('review.language', { lang, noProof: false });
                  close();
                }}
              >
                {text}
              </MenuRow>
            ))}
            <Sep />
            <MenuRow
              onClick={() => {
                onCommand('review.language', { noProof: true });
                close();
              }}
            >
              {t.noProof}
            </MenuRow>
          </div>
        )}
      </Popover>
      <Divider />
      <Btn wide title={t.compareHint} disabled={none} onClick={() => onMore('compare')}>
        <GitCompare className="h-4 w-4" /> {t.compare}
      </Btn>
    </>
  );
}

// ───────────────────────────── File ─────────────────────────────

export function FileMore({ t, doc, onMore }: Props) {
  const none = !doc;
  return (
    <>
      <Btn wide title={t.newFromTemplate} onClick={() => onMore('template')}>
        <LayoutTemplate className="h-4 w-4" /> {t.newFromTemplate}
      </Btn>
      <Btn wide title={t.printPreview} disabled={none} onClick={() => onMore('printPreview')}>
        <Eye className="h-4 w-4" /> {t.printPreview}
      </Btn>
      <Divider />
      <Btn wide title={t.protectHint} active={doc?.encrypted} disabled={none} onClick={() => onMore('password')}>
        <Lock className="h-4 w-4" /> {t.protect}
      </Btn>
      <Btn wide title={t.properties} disabled={none} onClick={() => onMore('properties')}>
        <Info className="h-4 w-4" /> {t.properties}
      </Btn>
    </>
  );
}
