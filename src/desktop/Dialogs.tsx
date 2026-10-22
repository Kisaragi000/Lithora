/** Lithora's dialogs: print, link, symbol, word count, comment and recovered documents. */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer as PrinterIcon, X } from 'lucide-react';
import { engine, Printer, PrintOptions, RecoveredDoc } from './engine';
import type { Strings } from './strings';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'w-[440px]',
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[#083B69]/25 p-4 pt-[8vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`flex max-h-[86vh] max-w-full flex-col rounded-xl border border-slate-200 bg-white shadow-2xl ${width}`}
        onKeyDown={(e) => {
          // Enter in a text box presses the dialog's main button, as in Word.
          const box = e.target as HTMLElement;
          if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing || box.tagName !== 'INPUT') return;
          if (['checkbox', 'radio', 'button', 'file'].includes((box as HTMLInputElement).type)) return;
          const ok = e.currentTarget.querySelector<HTMLButtonElement>('button[data-primary]:not(:disabled)');
          if (!ok) return;
          e.preventDefault();
          ok.click();
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-[14px] font-semibold text-[#083B69]">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[13px] text-slate-700">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 bg-[#FBF8F0] px-4 py-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-primary
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#083B69] px-3.5 text-[13px] font-medium text-white hover:bg-[#0B4A84] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const field = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] focus:border-[#376FA3] focus:outline-none';

export function PrintDialog({
  t,
  docId,
  hasSelection,
  currentPage,
  onClose,
  onDone,
}: {
  t: Strings;
  docId: number;
  hasSelection: boolean;
  currentPage: number;
  onClose(): void;
  onDone(message: string, error?: boolean): void;
}) {
  const [printers, setPrinters] = useState<Printer[] | null>(null);
  const [opts, setOpts] = useState<PrintOptions>({
    printer: null,
    copies: 1,
    collate: true,
    range: 'all',
    pages: null,
    duplex: 'printerDefault',
    grayscale: false,
    currentPage,
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    engine
      .printers()
      .then((list) => {
        setPrinters(list);
        const def = list.find((p) => p.default) ?? list[0];
        if (def) setOpts((o) => ({ ...o, printer: def.name }));
      })
      .catch(() => setPrinters([]));
  }, []);
  const set = (patch: Partial<PrintOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const chosen = printers?.find((p) => p.name === opts.printer);
  const go = async () => {
    setBusy(true);
    try {
      await engine.print(docId, opts);
      onDone(t.sentToPrinter);
      onClose();
    } catch (e) {
      onDone(`${t.couldNotPrint}: ${e}`, true);
      setBusy(false);
    }
  };
  const radio = (value: PrintOptions['range'], label: string, disabled?: boolean) => (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-40' : ''}`}>
      <input type="radio" name="range" disabled={disabled} checked={opts.range === value} onChange={() => set({ range: value })} className="accent-[#376FA3]" />
      {label}
    </label>
  );
  return (
    <Modal
      title={t.printTitle}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{t.cancel}</SecondaryButton>
          <PrimaryButton onClick={() => void go()} disabled={busy || printers === null}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PrinterIcon className="h-4 w-4" />}
            {busy ? t.printing : t.print}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.printer}</span>
          {printers === null ? (
            <span className="flex h-8 items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          ) : printers.length === 0 ? (
            <span className="text-slate-500">{t.noPrinters}</span>
          ) : (
            <select className={field} value={opts.printer ?? ''} onChange={(e) => set({ printer: e.target.value })}>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.default ? ` (${t.defaultPrinter})` : ''}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span className="font-medium text-slate-800">{t.copies}</span>
            <input
              type="number"
              min={1}
              max={999}
              value={opts.copies}
              onChange={(e) => set({ copies: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
              className={`${field} w-20`}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={opts.collate} onChange={(e) => set({ collate: e.target.checked })} className="accent-[#376FA3]" />
            {t.collate}
          </label>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 font-medium text-slate-800">{t.pagesToPrint}</legend>
          {radio('all', t.allPages)}
          {radio('current', `${t.currentPage} (${currentPage + 1})`)}
          {radio('selection', t.selectionPages, !hasSelection)}
          <label className="flex items-center gap-2">
            <input type="radio" name="range" checked={opts.range === 'custom'} onChange={() => set({ range: 'custom' })} className="accent-[#376FA3]" />
            {t.customPages}
            <input
              value={opts.pages ?? ''}
              placeholder={t.customPagesHint}
              onFocus={() => set({ range: 'custom' })}
              onChange={(e) => set({ pages: e.target.value, range: 'custom' })}
              className={`${field} w-40`}
            />
          </label>
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.twoSided}</span>
          <select className={field} value={opts.duplex} onChange={(e) => set({ duplex: e.target.value as PrintOptions['duplex'] })} disabled={chosen?.twoSided === false}>
            <option value="printerDefault">{t.printerDefault}</option>
            <option value="off">{t.oneSided}</option>
            <option value="longEdge">{t.longEdge}</option>
            <option value="shortEdge">{t.shortEdge}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={opts.grayscale} onChange={(e) => set({ grayscale: e.target.checked })} className="accent-[#376FA3]" />
          {t.grayscale}
        </label>
      </div>
    </Modal>
  );
}

export function LinkDialog({
  t,
  initialText,
  onClose,
  onInsert,
}: {
  t: Strings;
  initialText: string;
  onClose(): void;
  onInsert(url: string, text: string): void;
}) {
  const [url, setUrl] = useState('https://');
  const [text, setText] = useState(initialText);
  const ok = url.trim().length > 0 && url.trim() !== 'https://';
  const submit = () => {
    if (!ok) return;
    let address = url.trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) address = address.includes('@') ? `mailto:${address}` : `https://${address}`;
    onInsert(address, text.trim());
    onClose();
  };
  return (
    <Modal
      title={t.linkTitle}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{t.cancel}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!ok}>
            {t.insertBtn}
          </PrimaryButton>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.linkAddress}</span>
          <input autoFocus className={field} value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-800">{t.linkText}</span>
          <input className={field} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

/** Symbols people reach for most, including Armenian and Russian punctuation. */
const SYMBOL_GROUPS: string[][] = [
  ['©', '®', '™', '§', '¶', '†', '‡', '•', '·', '…', '–', '—', '«', '»', '„', '“', '”', '‘', '’', '′', '″', '№'],
  ['€', '$', '£', '¥', '₽', '֏', '¢', '₹', '₴', '₸', '₾'],
  ['±', '×', '÷', '≈', '≠', '≤', '≥', '∞', '√', '∑', '∏', '∫', '∂', '∆', 'π', 'µ', 'Ω', '°', '‰', '½', '¼', '¾', '¹', '²', '³'],
  ['←', '→', '↑', '↓', '↔', '⇒', '⇔', '✓', '✔', '✗', '✘', '☐', '☑', '☒', '★', '☆', '♦', '♥', '♠', '♣', '■', '□', '●', '○', '▲', '►'],
  ['։', '՝', '՞', '՜', '՛', '՚', '«', '»', 'և', 'Ա', 'ա', 'Ё', 'ё', 'Й', 'й', 'Ъ', 'ъ', 'Ь', 'ь'],
  ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ξ', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω'],
];

export function SymbolDialog({ t, onClose, onInsert }: { t: Strings; onClose(): void; onInsert(char: string): void }) {
  return (
    <Modal title={t.symbolTitle} onClose={onClose} width="w-[520px]">
      <div className="flex flex-col gap-2">
        {SYMBOL_GROUPS.map((group, i) => (
          <div key={i} className="flex flex-wrap gap-1">
            {group.map((c, j) => (
              <button
                key={`${i}-${j}`}
                type="button"
                title={`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`}
                onClick={() => onInsert(c)}
                className="h-9 w-9 rounded-md border border-slate-200 text-[17px] text-slate-800 hover:border-[#6C9FCB] hover:bg-[#6C9FCB]/15"
              >
                {c}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export interface WordCountInfo {
  pages: number;
  words: number;
  characters: number;
  charactersWithSpaces: number;
  paragraphs: number;
  lines: number;
}

export function WordCountDialog({ t, info, onClose }: { t: Strings; info: WordCountInfo; onClose(): void }) {
  const rows: [string, number][] = [
    [t.pages, info.pages],
    [t.words, info.words],
    [t.characters, info.characters],
    [t.charactersWithSpaces, info.charactersWithSpaces],
    [t.paragraphs, info.paragraphs],
    [t.lines, info.lines],
  ];
  return (
    <Modal title={t.wordCount} onClose={onClose} width="w-[340px]" footer={<PrimaryButton onClick={onClose}>{t.close}</PrimaryButton>}>
      <table className="w-full">
        <tbody>
          {rows.map(([label, n]) => (
            <tr key={label} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right font-medium tabular-nums text-[#083B69]">{n.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function TextDialog({
  title,
  placeholder,
  okLabel,
  cancelLabel,
  initial = '',
  onClose,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  okLabel: string;
  cancelLabel: string;
  initial?: string;
  onClose(): void;
  onSubmit(text: string): void;
}) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton onClick={onClose}>{cancelLabel}</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!text.trim()}>
            {okLabel}
          </PrimaryButton>
        </>
      }
    >
      <textarea
        ref={area}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
        }}
        rows={5}
        className="w-full resize-y rounded-md border border-slate-300 p-2 text-[13px] focus:border-[#376FA3] focus:outline-none"
      />
    </Modal>
  );
}

export function RecoveryDialog({
  t,
  docs,
  onOpen,
  onDiscard,
  onClose,
}: {
  t: Strings;
  docs: RecoveredDoc[];
  onOpen(doc: RecoveredDoc): void;
  onDiscard(doc: RecoveredDoc): void;
  onClose(): void;
}) {
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };
  return (
    <Modal title={t.recoverTitle} onClose={onClose} footer={<SecondaryButton onClick={onClose}>{t.recoverLater}</SecondaryButton>}>
      <p className="mb-3">{t.recoverText}</p>
      <ul className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800">{d.name}</span>
              <span className="block text-[12px] text-slate-500">{when(d.savedAt)}</span>
            </span>
            <SecondaryButton onClick={() => onDiscard(d)}>{t.recoverDiscard}</SecondaryButton>
            <PrimaryButton onClick={() => onOpen(d)}>{t.recoverOpen}</PrimaryButton>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
