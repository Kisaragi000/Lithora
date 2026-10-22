/**
 * Word's everyday dialogs: Font, Paragraph, Page Setup, a custom watermark, captions,
 * cross-references, bookmarks, date and time, passwords, document properties, the thesaurus
 * and Print Preview. Each one reads what it needs from the engine and applies its changes as
 * engine commands.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Printer as PrinterIcon } from 'lucide-react';
import { engine, FormatState, ParagraphInfo } from './engine';
import type { Strings } from './strings';
import { Modal, PrimaryButton, SecondaryButton } from './Dialogs';
import { TEXT_COLORS } from './ribbonParts';

const field = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] focus:border-[#376FA3] focus:outline-none';
const check = 'accent-[#376FA3]';

/** A list of commands to run in order, each with its settings. */
export type Commands = [string, Record<string, unknown>?][];

/** Lengths in the dialogs: inches in English, centimetres in Russian and Armenian. */
export type Unit = 'in' | 'cm';
const PT_PER: Record<Unit, number> = { in: 72, cm: 72 / 2.54 };
const toUnit = (pt: number, u: Unit) => Math.round((pt / PT_PER[u]) * 100) / 100;
const fromUnit = (v: number, u: Unit) => v * PT_PER[u];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#376FA3]">{title}</legend>
      {children}
    </fieldset>
  );
}

/** A number box that keeps what is typed until it is a number. */
function NumberBox({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  suffix,
  width = 'w-24',
}: {
  value: number;
  onChange(v: number): void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
        }}
        className={`${field} ${width} text-right tabular-nums`}
      />
      {suffix && <span className="w-6 text-[12px] text-slate-500">{suffix}</span>}
    </span>
  );
}

function Footer({ t, onCancel, onOk, okLabel, busy }: { t: Strings; onCancel(): void; onOk(): void; okLabel?: string; busy?: boolean }) {
  return (
    <>
      <SecondaryButton onClick={onCancel}>{t.cancel}</SecondaryButton>
      <PrimaryButton onClick={onOk} disabled={busy}>
        {okLabel ?? t.ok}
      </PrimaryButton>
    </>
  );
}

// ───────────────────────────── Font ─────────────────────────────

const UNDERLINES = ['none', 'single', 'words', 'double', 'thick', 'dotted', 'dash', 'dotDash', 'wave'] as const;

export function FontDialog({
  t,
  format,
  fonts,
  onClose,
  onApply,
}: {
  t: Strings;
  format: FormatState | null;
  fonts: string[];
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const f = (format ?? {}) as FormatState & Record<string, unknown>;
  const [font, setFont] = useState(f.font ?? '');
  const [size, setSize] = useState<number>(f.size ?? 11);
  const [bold, setBold] = useState(!!f.bold);
  const [italic, setItalic] = useState(!!f.italic);
  const [underline, setUnderline] = useState<(typeof UNDERLINES)[number]>(f.underline ? 'single' : 'none');
  const [color, setColor] = useState<string>(f.color ?? 'auto');
  const [fx, setFx] = useState({
    strike: !!f.strike,
    doubleStrike: false,
    superscript: !!f.superscript,
    subscript: !!f.subscript,
    smallCaps: !!f.smallCaps,
    caps: !!f.caps,
    hidden: !!f.hidden,
  });
  const [spacing, setSpacing] = useState<number>(typeof f.spacing === 'number' ? f.spacing : 0);
  const [position, setPosition] = useState(0);
  const toggle = (k: keyof typeof fx) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const on = e.target.checked;
    setFx((v) => ({
      ...v,
      [k]: on,
      // Superscript and subscript, and all caps and small caps, go one at a time.
      ...(k === 'superscript' && on ? { subscript: false } : {}),
      ...(k === 'subscript' && on ? { superscript: false } : {}),
      ...(k === 'caps' && on ? { smallCaps: false } : {}),
      ...(k === 'smallCaps' && on ? { caps: false } : {}),
      ...(k === 'strike' && on ? { doubleStrike: false } : {}),
      ...(k === 'doubleStrike' && on ? { strike: false } : {}),
    }));
  };
  const apply = () => {
    const props: Record<string, unknown> = {
      bold,
      italic,
      strike: fx.strike,
      doubleStrike: fx.doubleStrike,
      caps: fx.caps,
      smallCaps: fx.smallCaps,
      hidden: fx.hidden,
      vertAlign: fx.superscript ? 'superscript' : fx.subscript ? 'subscript' : 'baseline',
      spacing,
      position,
      underline,
    };
    if (size > 0) props.size = size;
    const list: Commands = [];
    if (font) list.push(['format.font', { name: font }]);
    list.push(['format.set', { props }], ['format.color', { color }]);
    onApply(list);
    onClose();
  };
  const previewStyle: React.CSSProperties = {
    fontFamily: font ? `'${font}', sans-serif` : undefined,
    fontSize: Math.min(36, Math.max(8, size)) * 1.33,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? 'italic' : 'normal',
    textDecoration: [underline !== 'none' ? 'underline' : '', fx.strike || fx.doubleStrike ? 'line-through' : ''].join(' ').trim() || 'none',
    textDecorationStyle: underline === 'double' || fx.doubleStrike ? 'double' : underline === 'dotted' ? 'dotted' : underline === 'dash' ? 'dashed' : underline === 'wave' ? 'wavy' : 'solid',
    textTransform: fx.caps ? 'uppercase' : 'none',
    fontVariant: fx.smallCaps ? 'small-caps' : 'normal',
    color: color === 'auto' ? '#000' : `#${color}`,
    letterSpacing: spacing ? `${spacing}pt` : undefined,
    verticalAlign: fx.superscript ? 'super' : fx.subscript ? 'sub' : undefined,
    opacity: fx.hidden ? 0.45 : 1,
  };
  return (
    <Modal title={t.fontDialog} onClose={onClose} width="w-[520px]" footer={<Footer t={t} onCancel={onClose} onOk={apply} />}>
      <datalist id="lithora-font-list">
        {fonts.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.font}</span>
            <input list="lithora-font-list" value={font} onChange={(e) => setFont(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.fontStyle}</span>
            <select
              className={field}
              value={`${bold ? 'b' : ''}${italic ? 'i' : ''}`}
              onChange={(e) => {
                setBold(e.target.value.includes('b'));
                setItalic(e.target.value.includes('i'));
              }}
            >
              <option value="">{t.styleRegular}</option>
              <option value="i">{t.styleItalic}</option>
              <option value="b">{t.styleBold}</option>
              <option value="bi">{t.styleBoldItalic}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.fontSize}</span>
            <NumberBox value={size} onChange={setSize} step={0.5} min={1} max={1638} width="w-20" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.underlineStyle}</span>
            <select className={field} value={underline} onChange={(e) => setUnderline(e.target.value as (typeof UNDERLINES)[number])}>
              {UNDERLINES.map((u) => (
                <option key={u} value={u}>
                  {t[`ul_${u}` as keyof Strings]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.textColor}</span>
            <div className="grid grid-cols-9 gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c === 'auto' ? t.automatic : `#${c}`}
                  onClick={() => setColor(c)}
                  className={`h-4 w-4 rounded-sm border ${color === c ? 'border-[#083B69] ring-2 ring-[#6C9FCB]' : 'border-slate-300'}`}
                  style={{ background: c === 'auto' ? 'linear-gradient(135deg,#000 50%,#fff 50%)' : `#${c}` }}
                />
              ))}
            </div>
          </div>
        </div>
        <Section title={t.effects}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(
              [
                ['strike', t.strike],
                ['doubleStrike', t.doubleStrike],
                ['superscript', t.superscript],
                ['subscript', t.subscript],
                ['smallCaps', t.smallCaps],
                ['caps', t.allCaps],
                ['hidden', t.hiddenText],
              ] as const
            ).map(([k, text]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className={check} checked={fx[k]} onChange={toggle(k)} />
                {text}
              </label>
            ))}
          </div>
        </Section>
        <Section title={t.charSpacing}>
          <div className="grid grid-cols-2 gap-3">
            <Row label={t.spacingExpand}>
              <NumberBox value={spacing} onChange={setSpacing} step={0.1} min={-50} max={50} suffix="pt" width="w-20" />
            </Row>
            <Row label={t.positionRaise}>
              <NumberBox value={position} onChange={setPosition} step={0.5} min={-100} max={100} suffix="pt" width="w-20" />
            </Row>
          </div>
        </Section>
        <div className="flex h-20 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white px-3">
          <span style={previewStyle} className="truncate">
            {font || 'Lithora'} · Հայերեն · Русский
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Paragraph ─────────────────────────────

type Spacing = 'single' | '1.15' | '1.5' | 'double' | 'multiple' | 'atLeast' | 'exactly';

export function ParagraphDialog({
  t,
  unit,
  info,
  onClose,
  onApply,
}: {
  t: Strings;
  unit: Unit;
  info: ParagraphInfo;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [align, setAlign] = useState(info.align === 'distribute' ? 'justify' : info.align);
  const [left, setLeft] = useState(toUnit(info.indentLeft, unit));
  const [right, setRight] = useState(toUnit(info.indentRight, unit));
  const [special, setSpecial] = useState<'none' | 'first' | 'hanging'>(info.indentFirst > 0 ? 'first' : info.indentFirst < 0 ? 'hanging' : 'none');
  const [by, setBy] = useState(toUnit(Math.abs(info.indentFirst), unit) || toUnit(unit === 'in' ? 36 : 35.43, unit));
  const [before, setBefore] = useState(info.spaceBefore);
  const [after, setAfter] = useState(info.spaceAfter);
  const ls = info.lineSpacing;
  const initialSpacing: Spacing =
    ls.rule === 'multiple'
      ? Math.abs(ls.value - 1) < 0.01
        ? 'single'
        : Math.abs(ls.value - 1.15) < 0.01
          ? '1.15'
          : Math.abs(ls.value - 1.5) < 0.01
            ? '1.5'
            : Math.abs(ls.value - 2) < 0.01
              ? 'double'
              : 'multiple'
      : ls.rule;
  const [spacing, setSpacing] = useState<Spacing>(initialSpacing);
  const [at, setAt] = useState(ls.rule === 'multiple' ? (initialSpacing === 'multiple' ? ls.value : 3) : ls.value);
  const [flags, setFlags] = useState({
    widowControl: info.widowControl,
    keepNext: info.keepNext,
    keepLines: info.keepLines,
    pageBreakBefore: info.pageBreakBefore,
  });
  const apply = () => {
    const first = special === 'none' ? 0 : special === 'first' ? fromUnit(by, unit) : -fromUnit(by, unit);
    const line =
      spacing === 'single'
        ? { value: 1 }
        : spacing === '1.15'
          ? { value: 1.15 }
          : spacing === '1.5'
            ? { value: 1.5 }
            : spacing === 'double'
              ? { value: 2 }
              : spacing === 'multiple'
                ? { value: at }
                : spacing === 'atLeast'
                  ? { atLeast: at }
                  : { exactly: at };
    onApply([
      ['para.align', { value: align }],
      ['para.indents', { left: fromUnit(left, unit), right: fromUnit(right, unit), firstLine: first }],
      ['para.spacing', { before, after }],
      ['para.lineSpacing', line],
      ['para.widowControl', { value: flags.widowControl }],
      ['para.keepNext', { value: flags.keepNext }],
      ['para.keepLines', { value: flags.keepLines }],
      ['para.pageBreakBefore', { value: flags.pageBreakBefore }],
    ]);
    onClose();
  };
  const u = unit === 'in' ? t.unitIn : t.unitCm;
  return (
    <Modal title={t.paragraphSettings} onClose={onClose} width="w-[520px]" footer={<Footer t={t} onCancel={onClose} onOk={apply} />}>
      <div className="flex flex-col gap-4">
        <Section title={t.general}>
          <Row label={t.alignment}>
            <select className={`${field} w-44`} value={align} onChange={(e) => setAlign(e.target.value)}>
              <option value="left">{t.left}</option>
              <option value="center">{t.center}</option>
              <option value="right">{t.right}</option>
              <option value="justify">{t.justified}</option>
            </select>
          </Row>
        </Section>
        <Section title={t.indentation}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <Row label={t.indentLeft}>
              <NumberBox value={left} onChange={setLeft} suffix={u} />
            </Row>
            <Row label={t.special}>
              <select className={`${field} w-32`} value={special} onChange={(e) => setSpecial(e.target.value as typeof special)}>
                <option value="none">{t.specialNone}</option>
                <option value="first">{t.firstLine}</option>
                <option value="hanging">{t.hanging}</option>
              </select>
            </Row>
            <Row label={t.indentRight}>
              <NumberBox value={right} onChange={setRight} suffix={u} />
            </Row>
            <Row label={t.by}>
              <NumberBox value={by} onChange={setBy} suffix={u} />
            </Row>
          </div>
        </Section>
        <Section title={t.spacing}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <Row label={t.spaceBefore}>
              <NumberBox value={before} onChange={setBefore} step={6} min={0} max={1584} suffix="pt" />
            </Row>
            <Row label={t.lineSpacingLabel}>
              <select className={`${field} w-32`} value={spacing} onChange={(e) => setSpacing(e.target.value as Spacing)}>
                <option value="single">{t.lsSingle}</option>
                <option value="1.15">1.15</option>
                <option value="1.5">1.5</option>
                <option value="double">{t.lsDouble}</option>
                <option value="multiple">{t.lsMultiple}</option>
                <option value="atLeast">{t.lsAtLeast}</option>
                <option value="exactly">{t.lsExactly}</option>
              </select>
            </Row>
            <Row label={t.spaceAfter}>
              <NumberBox value={after} onChange={setAfter} step={6} min={0} max={1584} suffix="pt" />
            </Row>
            <Row label={spacing === 'multiple' || spacing === 'atLeast' || spacing === 'exactly' ? t.at : ''}>
              {spacing === 'multiple' || spacing === 'atLeast' || spacing === 'exactly' ? (
                <NumberBox value={at} onChange={setAt} step={spacing === 'multiple' ? 0.25 : 1} min={0} max={1584} suffix={spacing === 'multiple' ? '×' : 'pt'} />
              ) : (
                <span className="w-32" />
              )}
            </Row>
          </div>
        </Section>
        <Section title={t.pagination}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(
              [
                ['widowControl', t.widowControl],
                ['keepNext', t.keepWithNext],
                ['keepLines', t.keepLinesTogether],
                ['pageBreakBefore', t.pageBreakBefore],
              ] as const
            ).map(([k, text]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className={check} checked={flags[k]} onChange={(e) => setFlags((v) => ({ ...v, [k]: e.target.checked }))} />
                {text}
              </label>
            ))}
          </div>
        </Section>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Page Setup ─────────────────────────────

/** Paper sizes in points (portrait). */
const PAPERS: [string, number, number][] = [
  ['A4', 595.3, 841.9],
  ['A5', 419.5, 595.3],
  ['A3', 841.9, 1190.6],
  ['B5', 498.9, 708.7],
  ['Letter', 612, 792],
  ['Legal', 612, 1008],
  ['Executive', 522, 756],
  ['Tabloid', 792, 1224],
];

interface Section {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gutter: number;
  pageW: number;
  pageH: number;
  landscape: boolean;
  header: number;
  footer: number;
  valign: string;
}

export function PageSetupDialog({
  t,
  unit,
  ask,
  onClose,
  onApply,
}: {
  t: Strings;
  unit: Unit;
  ask(name: string, params?: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [sect, setSect] = useState<Section | null>(null);
  const [m, setM] = useState({ top: 0, bottom: 0, left: 0, right: 0, gutter: 0 });
  const [landscape, setLandscape] = useState(false);
  const [paper, setPaper] = useState('custom');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [valign, setValign] = useState('top');
  useEffect(() => {
    void ask('layout.section').then((r) => {
      const s = r as Section | null;
      if (!s) return;
      setSect(s);
      setM({ top: toUnit(s.marginTop, unit), bottom: toUnit(s.marginBottom, unit), left: toUnit(s.marginLeft, unit), right: toUnit(s.marginRight, unit), gutter: toUnit(s.gutter, unit) });
      setLandscape(s.landscape);
      const w = Math.min(s.pageW, s.pageH);
      const h = Math.max(s.pageW, s.pageH);
      setSize({ w: toUnit(w, unit), h: toUnit(h, unit) });
      setPaper(PAPERS.find(([, pw, ph]) => Math.abs(pw - w) < 2 && Math.abs(ph - h) < 2)?.[0] ?? 'custom');
      setValign(s.valign);
    });
  }, [ask, unit]);
  const u = unit === 'in' ? t.unitIn : t.unitCm;
  const apply = () => {
    const w = fromUnit(size.w, unit);
    const h = fromUnit(size.h, unit);
    onApply([
      ['layout.orientation', { value: landscape ? 'landscape' : 'portrait' }],
      paper === 'custom' ? ['layout.size', { width: landscape ? h : w, height: landscape ? w : h }] : ['layout.size', { name: paper }],
      ['layout.margins', { top: fromUnit(m.top, unit), bottom: fromUnit(m.bottom, unit), left: fromUnit(m.left, unit), right: fromUnit(m.right, unit), gutter: fromUnit(m.gutter, unit) }],
      ['layout.verticalAlign', { value: valign }],
    ]);
    onClose();
  };
  const pw = landscape ? size.h : size.w;
  const ph = landscape ? size.w : size.h;
  const scale = 120 / Math.max(pw || 1, ph || 1);
  return (
    <Modal title={t.pageSetup} onClose={onClose} width="w-[560px]" footer={<Footer t={t} onCancel={onClose} onOk={apply} busy={!sect} />}>
      {!sect ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="flex gap-5">
          <div className="flex flex-1 flex-col gap-4">
            <Section title={t.margins}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                {(
                  [
                    ['top', t.marginTop],
                    ['bottom', t.marginBottom],
                    ['left', t.marginLeft],
                    ['right', t.marginRight],
                    ['gutter', t.gutter],
                  ] as const
                ).map(([k, text]) => (
                  <Row key={k} label={text}>
                    <NumberBox value={m[k]} onChange={(v) => setM((x) => ({ ...x, [k]: v }))} min={0} suffix={u} width="w-20" />
                  </Row>
                ))}
              </div>
            </Section>
            <Section title={t.orientation}>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" className={check} checked={!landscape} onChange={() => setLandscape(false)} /> {t.portrait}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" className={check} checked={landscape} onChange={() => setLandscape(true)} /> {t.landscape}
                </label>
              </div>
            </Section>
            <Section title={t.paperSize}>
              <select
                className={field}
                value={paper}
                onChange={(e) => {
                  setPaper(e.target.value);
                  const p = PAPERS.find(([name]) => name === e.target.value);
                  if (p) setSize({ w: toUnit(p[1], unit), h: toUnit(p[2], unit) });
                }}
              >
                {PAPERS.map(([name, w, h]) => (
                  <option key={name} value={name}>
                    {name} ({toUnit(w, unit)} × {toUnit(h, unit)} {u})
                  </option>
                ))}
                <option value="custom">{t.customSize}</option>
              </select>
              <div className="grid grid-cols-2 gap-x-5">
                <Row label={t.width}>
                  <NumberBox
                    value={size.w}
                    onChange={(v) => {
                      setSize((s) => ({ ...s, w: v }));
                      setPaper('custom');
                    }}
                    min={0.1}
                    suffix={u}
                    width="w-20"
                  />
                </Row>
                <Row label={t.height}>
                  <NumberBox
                    value={size.h}
                    onChange={(v) => {
                      setSize((s) => ({ ...s, h: v }));
                      setPaper('custom');
                    }}
                    min={0.1}
                    suffix={u}
                    width="w-20"
                  />
                </Row>
              </div>
            </Section>
            <Row label={t.verticalAlignment}>
              <select className={`${field} w-36`} value={valign} onChange={(e) => setValign(e.target.value)}>
                <option value="top">{t.vaTop}</option>
                <option value="center">{t.center}</option>
                <option value="justify">{t.justified}</option>
                <option value="bottom">{t.vaBottom}</option>
              </select>
            </Row>
          </div>
          <div className="flex w-36 shrink-0 items-center justify-center rounded-md bg-[#F3F5F9]">
            <div className="relative border border-slate-400 bg-white shadow-sm" style={{ width: pw * scale, height: ph * scale }}>
              <div
                className="absolute bg-[repeating-linear-gradient(#6C9FCB_0_1px,transparent_1px_4px)] opacity-70"
                style={{ left: (m.left + m.gutter) * scale, right: m.right * scale, top: m.top * scale, bottom: m.bottom * scale }}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── Watermark ─────────────────────────────

const WATERMARK_COLORS = ['C0C0C0', 'A6A6A6', 'D9D9D9', 'B9CDE5', '6C9FCB', 'B9AEDC', 'FFC7CE', 'C00000'];

export function WatermarkDialog({ t, onClose, onApply }: { t: Strings; onClose(): void; onApply(list: Commands): void }) {
  const [text, setText] = useState(t.wmConfidential);
  const [diagonal, setDiagonal] = useState(true);
  const [color, setColor] = useState('C0C0C0');
  return (
    <Modal
      title={t.wmCustom}
      onClose={onClose}
      footer={
        <Footer
          t={t}
          onCancel={onClose}
          onOk={() => {
            if (text.trim()) onApply([['design.watermark', { text: text.trim(), diagonal, color }]]);
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.wmText}</span>
          <input autoFocus value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className={field} />
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" className={check} checked={diagonal} onChange={() => setDiagonal(true)} /> {t.wmDiagonal}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" className={check} checked={!diagonal} onChange={() => setDiagonal(false)} /> {t.wmHorizontal}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-slate-700">{t.textColor}</span>
          {WATERMARK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`#${c}`}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-sm border ${color === c ? 'border-[#083B69] ring-2 ring-[#6C9FCB]' : 'border-slate-300'}`}
              style={{ background: `#${c}` }}
            />
          ))}
        </div>
        <div className="flex h-28 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
          <span className={`whitespace-nowrap text-[22px] font-semibold ${diagonal ? '-rotate-[35deg]' : ''}`} style={{ color: `#${color}` }}>
            {text}
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Caption ─────────────────────────────

export function CaptionDialog({ t, onClose, onApply }: { t: Strings; onClose(): void; onApply(list: Commands): void }) {
  const labels = [t.capFigure, t.capTable, t.capEquation];
  const [labelText, setLabel] = useState(labels[0]);
  const [text, setText] = useState('');
  const [position, setPosition] = useState<'below' | 'above'>('below');
  const [format, setFormat] = useState('ARABIC');
  return (
    <Modal
      title={t.insertCaption}
      onClose={onClose}
      footer={
        <Footer
          t={t}
          onCancel={onClose}
          onOk={() => {
            onApply([['references.caption', { label: labelText.trim() || labels[0], text, position, format, separator: ':' }]]);
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-slate-200 bg-[#F7F8FB] px-3 py-2 text-[14px] text-slate-800">
          {labelText} {format === 'ARABIC' ? '1' : format === 'ALPHABETIC' ? 'A' : format === 'alphabetic' ? 'a' : format === 'ROMAN' ? 'I' : 'i'}
          {text ? `: ${text}` : ''}
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.capText}</span>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className={field} />
        </label>
        <Row label={t.capLabel}>
          <input list="lithora-caption-labels" value={labelText} onChange={(e) => setLabel(e.target.value)} className={`${field} w-48`} />
          <datalist id="lithora-caption-labels">
            {labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Row>
        <Row label={t.capPosition}>
          <select className={`${field} w-48`} value={position} onChange={(e) => setPosition(e.target.value as 'below' | 'above')}>
            <option value="below">{t.capBelow}</option>
            <option value="above">{t.capAbove}</option>
          </select>
        </Row>
        <Row label={t.capNumbering}>
          <select className={`${field} w-48`} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="ARABIC">1, 2, 3</option>
            <option value="alphabetic">a, b, c</option>
            <option value="ALPHABETIC">A, B, C</option>
            <option value="roman">i, ii, iii</option>
            <option value="ROMAN">I, II, III</option>
          </select>
        </Row>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Cross-reference ─────────────────────────────

export function CrossReferenceDialog({
  t,
  ask,
  onClose,
  onApply,
}: {
  t: Strings;
  ask(name: string, params?: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const kinds: [string, string][] = [
    ['heading', t.xrHeading],
    ['bookmark', t.bookmark],
    [`label:${t.capFigure}`, t.capFigure],
    [`label:${t.capTable}`, t.capTable],
    [`label:${t.capEquation}`, t.capEquation],
    // Captions from English Word documents, when the interface calls them something else.
    ...(t.capFigure === 'Figure' ? [] : ([['figure', 'Figure']] as [string, string][])),
    ...(t.capTable === 'Table' ? [] : ([['table', 'Table']] as [string, string][])),
  ];
  const [to, setTo] = useState('heading');
  const [items, setItems] = useState<string[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [show, setShow] = useState('text');
  useEffect(() => {
    setItems(null);
    setPick(null);
    void ask('insert.crossReference', { to }).then((r) => setItems(Array.isArray(r) ? (r as string[]) : []));
  }, [ask, to]);
  const target = (item: string) => (to === 'heading' || to === 'bookmark' ? item : item.split(':')[0].trim());
  const isCaption = to !== 'heading' && to !== 'bookmark';
  return (
    <Modal
      title={t.crossReference}
      onClose={onClose}
      width="w-[480px]"
      footer={
        <Footer
          t={t}
          okLabel={t.insertBtn}
          busy={!pick}
          onCancel={onClose}
          onOk={() => {
            if (pick) onApply([['insert.crossReference', { to, target: target(pick), show }]]);
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.xrType}</span>
            <select className={field} value={to} onChange={(e) => setTo(e.target.value)}>
              {kinds.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">{t.xrInsertAs}</span>
            <select className={field} value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="text">{isCaption ? t.xrWholeCaption : t.xrText}</option>
              {isCaption && <option value="number">{t.xrLabelNumber}</option>}
              <option value="page">{t.xrPage}</option>
              <option value="aboveBelow">{t.xrAboveBelow}</option>
            </select>
          </label>
        </div>
        <div className="h-56 overflow-auto rounded-md border border-slate-200">
          {items === null ? (
            <Loader2 className="m-3 h-4 w-4 animate-spin text-slate-400" />
          ) : items.length === 0 ? (
            <p className="p-3 text-slate-500">{t.xrNone}</p>
          ) : (
            items.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPick(item)}
                onDoubleClick={() => {
                  onApply([['insert.crossReference', { to, target: target(item), show }]]);
                  onClose();
                }}
                className={`block w-full truncate px-3 py-1.5 text-left ${pick === item ? 'bg-[#376FA3]/15 text-[#083B69]' : 'hover:bg-slate-50'}`}
              >
                {item}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Bookmark ─────────────────────────────

export function BookmarkDialog({
  t,
  ask,
  onClose,
  onApply,
}: {
  t: Strings;
  ask(name: string, params?: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState('');
  useEffect(() => {
    void ask('link.targets').then((r) => {
      const list = (r as { bookmarks?: unknown[] } | null)?.bookmarks ?? [];
      setNames(list.map((b) => (typeof b === 'string' ? b : String((b as { name?: string }).name ?? ''))).filter(Boolean));
    });
  }, [ask]);
  // Word's rule: a letter first, then letters, digits and underscores, up to 40.
  const valid = /^\p{L}[\p{L}\p{N}_]{0,39}$/u.test(name);
  return (
    <Modal
      title={t.bookmark}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton
            disabled={!names.includes(name)}
            onClick={() => {
              onApply([['edit.goto', { bookmark: name }]]);
              onClose();
            }}
          >
            {t.goTo}
          </SecondaryButton>
          <PrimaryButton
            disabled={!valid}
            onClick={() => {
              onApply([['insert.bookmark', { name }]]);
              onClose();
            }}
          >
            {t.add}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.bookmarkName}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, '_'))} className={field} />
          {name && !valid && <span className="text-[12px] text-red-700">{t.bookmarkRule}</span>}
        </label>
        <div className="h-40 overflow-auto rounded-md border border-slate-200">
          {names.length === 0 ? (
            <p className="p-3 text-slate-500">{t.noBookmarks}</p>
          ) : (
            names.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setName(n)}
                className={`block w-full truncate px-3 py-1.5 text-left ${name === n ? 'bg-[#376FA3]/15 text-[#083B69]' : 'hover:bg-slate-50'}`}
              >
                {n}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Date and time ─────────────────────────────

const DATE_FORMATS = ['M/d/yyyy', 'dd.MM.yyyy', 'd.M.yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MMMM d, yyyy', 'd MMMM yyyy', 'dddd, MMMM d, yyyy', 'MMM-yy', 'HH:mm', 'h:mm am/pm', 'dd.MM.yyyy HH:mm'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** What a Word date picture (M/d/yyyy) shows for `d`, as Word would. */
export function formatDate(picture: string, d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h12 = d.getHours() % 12 || 12;
  return picture.replace(/am\/pm|AM\/PM|yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|ss/g, (tok) => {
    switch (tok) {
      case 'yyyy':
        return String(d.getFullYear());
      case 'yy':
        return pad(d.getFullYear() % 100);
      case 'MMMM':
        return MONTHS[d.getMonth()];
      case 'MMM':
        return MONTHS[d.getMonth()].slice(0, 3);
      case 'MM':
        return pad(d.getMonth() + 1);
      case 'M':
        return String(d.getMonth() + 1);
      case 'dddd':
        return DAYS[d.getDay()];
      case 'ddd':
        return DAYS[d.getDay()].slice(0, 3);
      case 'dd':
        return pad(d.getDate());
      case 'd':
        return String(d.getDate());
      case 'HH':
        return pad(d.getHours());
      case 'H':
        return String(d.getHours());
      case 'hh':
        return pad(h12);
      case 'h':
        return String(h12);
      case 'mm':
        return pad(d.getMinutes());
      case 'ss':
        return pad(d.getSeconds());
      case 'am/pm':
        return d.getHours() < 12 ? 'am' : 'pm';
      default:
        return d.getHours() < 12 ? 'AM' : 'PM';
    }
  });
}

export function DateTimeDialog({ t, onClose, onApply }: { t: Strings; onClose(): void; onApply(list: Commands): void }) {
  const [pick, setPick] = useState(DATE_FORMATS[0]);
  const [update, setUpdate] = useState(false);
  const now = useRef(new Date()).current;
  // Formats that look the same today (d.M.yyyy and dd.MM.yyyy on the 22nd) are shown once.
  const formats = useMemo(() => {
    const seen = new Set<string>();
    return DATE_FORMATS.filter((f) => {
      const shown = formatDate(f, now);
      if (seen.has(shown)) return false;
      seen.add(shown);
      return true;
    });
  }, [now]);
  const insert = (format: string) => {
    onApply([['insert.dateTime', { format, update }]]);
    onClose();
  };
  return (
    <Modal title={t.dateTime} onClose={onClose} footer={<Footer t={t} okLabel={t.insertBtn} onCancel={onClose} onOk={() => insert(pick)} />}>
      <div className="flex flex-col gap-3">
        <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPick(f)}
              onDoubleClick={() => insert(f)}
              className={`block w-full px-3 py-1.5 text-left ${pick === f ? 'bg-[#376FA3]/15 text-[#083B69]' : 'hover:bg-slate-50'}`}
            >
              {formatDate(f, now)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" className={check} checked={update} onChange={(e) => setUpdate(e.target.checked)} />
          {t.updateAutomatically}
        </label>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Password ─────────────────────────────

/** Protect the document with a password (Word documents), or take the password off. */
export function ProtectDialog({
  t,
  encrypted,
  isWordFile,
  onClose,
  onApply,
}: {
  t: Strings;
  encrypted: boolean;
  isWordFile: boolean;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const match = pw.length > 0 && pw === again;
  return (
    <Modal
      title={t.protect}
      onClose={onClose}
      footer={
        <>
          {encrypted && (
            <SecondaryButton
              onClick={() => {
                onApply([['file.encrypt', { password: null }]]);
                onClose();
              }}
            >
              {t.removePassword}
            </SecondaryButton>
          )}
          <SecondaryButton onClick={onClose}>{t.cancel}</SecondaryButton>
          <PrimaryButton
            disabled={!match}
            onClick={() => {
              onApply([['file.encrypt', { password: pw }]]);
              onClose();
            }}
          >
            {t.setPassword}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-slate-600">{t.protectExplain}</p>
        {!isWordFile && <p className="rounded-md bg-[#FFF2CC] px-3 py-2 text-[12px] text-slate-700">{t.protectWordOnly}</p>}
        {encrypted && <p className="rounded-md bg-[#E2EFDA] px-3 py-2 text-[12px] text-slate-700">{t.isProtected}</p>}
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.password}</span>
          <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.passwordAgain}</span>
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
          {again && !match && <span className="text-[12px] text-red-700">{t.passwordsDiffer}</span>}
        </label>
        <p className="text-[12px] text-slate-500">{t.passwordWarning}</p>
      </div>
    </Modal>
  );
}

/** Ask for the password of a protected file being opened. */
export function OpenPasswordDialog({
  t,
  name,
  wrong,
  onClose,
  onOpen,
}: {
  t: Strings;
  name: string;
  wrong: boolean;
  onClose(): void;
  onOpen(password: string): void;
}) {
  const [pw, setPw] = useState('');
  const go = () => {
    if (pw) onOpen(pw);
  };
  return (
    <Modal title={t.passwordNeeded} onClose={onClose} footer={<Footer t={t} okLabel={t.open} onCancel={onClose} onOk={go} busy={!pw} />}>
      <div className="flex flex-col gap-3">
        <p className="text-slate-700">{t.passwordFor.replace('{name}', name)}</p>
        <input
          autoFocus
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              go();
            }
          }}
          className={field}
        />
        {wrong && <p className="text-[12px] text-red-700">{t.wrongPassword}</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────────── Properties ─────────────────────────────

interface Props {
  title: string;
  subject: string;
  creator: string;
  keywords: string;
  description: string;
  category: string;
  created?: string;
  modified?: string;
  lastModifiedBy?: string;
}

export function PropertiesDialog({
  t,
  ask,
  onClose,
  onApply,
}: {
  t: Strings;
  ask(name: string, params?: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [p, setP] = useState<Props | null>(null);
  useEffect(() => {
    void ask('file.properties', {}).then((r) => setP((r as Props) ?? null));
  }, [ask]);
  const set = (k: keyof Props) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP((x) => (x ? { ...x, [k]: e.target.value } : x));
  return (
    <Modal
      title={t.properties}
      onClose={onClose}
      width="w-[480px]"
      footer={
        <Footer
          t={t}
          busy={!p}
          onCancel={onClose}
          onOk={() => {
            if (p) onApply([['file.properties', { title: p.title, subject: p.subject, author: p.creator, keywords: p.keywords, comments: p.description, category: p.category }]]);
            onClose();
          }}
        />
      }
    >
      {!p ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {(
            [
              ['title', t.propTitle],
              ['subject', t.propSubject],
              ['creator', t.propAuthor],
              ['keywords', t.propKeywords],
              ['category', t.propCategory],
            ] as const
          ).map(([k, text]) => (
            <label key={k} className="grid grid-cols-[110px_1fr] items-center gap-2">
              <span className="text-slate-700">{text}</span>
              <input value={p[k] ?? ''} onChange={set(k)} className={field} />
            </label>
          ))}
          <label className="grid grid-cols-[110px_1fr] items-start gap-2">
            <span className="pt-1.5 text-slate-700">{t.propComments}</span>
            <textarea value={p.description ?? ''} onChange={set('description')} rows={3} className={`${field} h-auto py-1.5`} />
          </label>
          {(p.created || p.modified) && (
            <div className="mt-1 grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[12px] text-slate-500">
              {p.created && (
                <>
                  <span>{t.propCreated}</span>
                  <span>{new Date(p.created).toLocaleString()}</span>
                </>
              )}
              {p.modified && (
                <>
                  <span>{t.propModified}</span>
                  <span>
                    {new Date(p.modified).toLocaleString()}
                    {p.lastModifiedBy ? ` · ${p.lastModifiedBy}` : ''}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── Thesaurus ─────────────────────────────

export interface Thesaurus {
  word: string;
  synonyms: string[];
  anchor?: unknown;
  focus?: unknown;
}

/** A synonym written the way the word it replaces is: "Quick" → "Fast", "QUICK" → "FAST". */
function matchCase(synonym: string, word: string): string {
  if (word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()) return synonym.toUpperCase();
  if (word[0] && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) return synonym[0].toUpperCase() + synonym.slice(1);
  return synonym;
}

export function ThesaurusDialog({
  t,
  lookup,
  onClose,
  onApply,
}: {
  t: Strings;
  lookup(): Promise<Thesaurus>;
  onClose(): void;
  onApply(list: Commands): void;
}) {
  const [r, setR] = useState<Thesaurus | null>(null);
  useEffect(() => {
    lookup()
      .then(setR)
      .catch(() => setR({ word: '', synonyms: [] }));
  }, [lookup]);
  const replace = (s: string) => {
    if (!r?.anchor || !r.focus) return;
    onApply([
      ['select.range', { anchor: r.anchor, focus: r.focus }],
      ['text.insert', { text: matchCase(s, r.word) }],
    ]);
    onClose();
  };
  return (
    <Modal title={t.thesaurus} onClose={onClose} footer={<SecondaryButton onClick={onClose}>{t.close}</SecondaryButton>}>
      {!r ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      ) : !r.word ? (
        <p className="text-slate-600">{t.thesaurusPick}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-[#083B69]">{r.word}</p>
          {r.synonyms.length === 0 ? (
            <p className="text-slate-600">{t.noSynonyms}</p>
          ) : (
            <>
              <p className="text-[12px] text-slate-500">{t.thesaurusHint}</p>
              <div className="flex flex-wrap gap-1.5">
                {r.synonyms.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => replace(s)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[13px] text-slate-700 hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── Print Preview ─────────────────────────────

/** The pages as they will print, one at a time, with Print beside them. */
export function PrintPreview({
  t,
  docId,
  pages,
  startPage,
  onClose,
  onPrint,
}: {
  t: Strings;
  docId: number;
  pages: { width: number; height: number }[];
  startPage: number;
  onClose(): void;
  onPrint(): void;
}) {
  const [page, setPage] = useState(Math.min(startPage, pages.length - 1));
  const [busy, setBusy] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = pages[page] ?? { width: 612, height: 792 };
  // Fit the page in the window, sharp on high-density screens.
  const cssScale = Math.min((window.innerHeight * 0.72) / size.height, (window.innerWidth * 0.6) / size.width);
  const dpr = window.devicePixelRatio || 1;
  useEffect(() => {
    let live = true;
    setBusy(true);
    engine
      .previewPage(docId, page, cssScale * dpr)
      .then((img) => {
        const c = canvas.current;
        if (!live || !c) return;
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')?.putImageData(img, 0, 0);
      })
      .catch(() => undefined)
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [docId, page, cssScale, dpr]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(pages.length - 1, p + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(0, p - 1));
      if (e.key === 'Home') setPage(0);
      if (e.key === 'End') setPage(pages.length - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pages.length]);
  return (
    <Modal
      title={t.printPreview}
      onClose={onClose}
      width="w-auto"
      footer={
        <>
          <SecondaryButton onClick={onClose}>{t.close}</SecondaryButton>
          <PrimaryButton onClick={onPrint}>
            <PrinterIcon className="h-4 w-4" /> {t.print}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative bg-[#E9EEF5] p-4">
          <canvas
            ref={canvas}
            className="block bg-white shadow-[0_1px_3px_rgba(8,59,105,0.18),0_4px_14px_rgba(8,59,105,0.08)]"
            style={{ width: size.width * cssScale, height: size.height * cssScale }}
          />
          {busy && <Loader2 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-[#376FA3]" />}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label={t.previousPage}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums">
            {t.page} {page + 1} {t.of} {pages.length}
          </span>
          <button
            type="button"
            disabled={page >= pages.length - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
            aria-label={t.nextPage}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
