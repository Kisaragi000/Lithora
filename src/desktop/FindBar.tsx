/** Find and replace, in a bar above the pages (Ctrl+F, Ctrl+H). */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { Strings } from './strings';

export function FindBar({
  t,
  replaceMode,
  onCommand,
  onClose,
}: {
  t: Strings;
  /** Open with the Replace row showing. */
  replaceMode: boolean;
  /** Runs an engine command and resolves to its answer. */
  onCommand(name: string, params?: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
}) {
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(replaceMode);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setShowReplace((s) => s || replaceMode), [replaceMode]);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [replaceMode]);

  const opts = () => ({ text, matchCase, wholeWord, special: false });

  const countText = (n: number) => (n === 0 ? t.noMatches : n === 1 ? t.matchOne : t.matchCount.replace('{n}', String(n)));

  const search = async () => {
    if (!text) {
      setStatus('');
      return;
    }
    const r = (await onCommand('edit.find', opts())) as { count?: number } | null;
    setStatus(countText(r?.count ?? 0));
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => void search(), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, matchCase, wholeWord]);

  const step = async (forward: boolean) => {
    if (!text) return;
    const r = (await onCommand(forward ? 'edit.findNext' : 'edit.findPrevious', opts())) as { index?: number; count?: number } | null;
    if (r && typeof r.count === 'number') setStatus(r.count === 0 ? t.noMatches : `${(r.index ?? 0) + 1} / ${r.count}`);
  };

  const replaceOne = async () => {
    if (!text) return;
    await onCommand('edit.replace', { ...opts(), with: replacement });
    await search();
  };

  const replaceAll = async () => {
    if (!text) return;
    const r = (await onCommand('edit.replaceAll', { ...opts(), with: replacement })) as { replaced?: number } | null;
    await onCommand('select.collapse', { end: true });
    setStatus(t.replacedCount.replace('{n}', String(r?.replaced ?? 0)));
  };

  const box = 'h-7 w-56 rounded-md border border-slate-300 bg-white px-2 text-[13px] focus:border-[#376FA3] focus:outline-none';
  const small = 'inline-flex h-7 items-center rounded-md px-2 text-[12px] text-slate-700 hover:bg-[#6C9FCB]/15 disabled:opacity-40';

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-b border-slate-200 bg-[#F7F8FB] px-4 py-1.5 text-[13px]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setShowReplace((s) => !s)} className="rounded p-1 text-slate-500 hover:bg-slate-200" title={t.findReplace}>
          {showReplace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <input
          ref={input}
          value={text}
          placeholder={t.findPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void step(!e.shiftKey);
            }
          }}
          className={box}
        />
        <button type="button" className={small} onClick={() => void step(false)} disabled={!text}>
          {t.findPrevious}
        </button>
        <button type="button" className={small} onClick={() => void step(true)} disabled={!text}>
          {t.findNext}
        </button>
        <label className="ml-2 flex items-center gap-1 text-[12px] text-slate-600">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="accent-[#376FA3]" />
          {t.matchCase}
        </label>
        <label className="ml-2 flex items-center gap-1 text-[12px] text-slate-600">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} className="accent-[#376FA3]" />
          {t.wholeWord}
        </label>
        <span className="ml-3 text-[12px] text-slate-500">{status}</span>
        <button type="button" onClick={onClose} title={t.close} aria-label={t.close} className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-200">
          <X className="h-4 w-4" />
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-1.5 pl-[30px]">
          <input
            value={replacement}
            placeholder={t.replaceWith}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void replaceOne();
              }
            }}
            className={box}
          />
          <button type="button" className={small} onClick={() => void replaceOne()} disabled={!text}>
            {t.replace}
          </button>
          <button type="button" className={small} onClick={() => void replaceAll()} disabled={!text}>
            {t.replaceAll}
          </button>
        </div>
      )}
    </div>
  );
}
