/**
 * The Proofread panel: every spelling, grammar and style issue in the document, with its
 * suggestions. Click an issue to select it in the document; click a suggestion to fix it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, SpellCheck2, WandSparkles } from 'lucide-react';
import { DocState, ProofIssue, engine } from './engine';
import type { Strings } from './strings';

type Filter = 'all' | ProofIssue['kind'];

const KIND_COLORS: Record<ProofIssue['kind'], string> = {
  spelling: 'bg-red-500',
  grammar: 'bg-[#376FA3]',
  style: 'bg-[#9B8AD0]',
};

export function ProofreadPanel({
  t,
  doc,
  onSelect,
  onFix,
  onIgnoreWord,
  onFixAll,
}: {
  t: Strings;
  doc: DocState;
  /** Select the issue's text in the document. */
  onSelect(issue: ProofIssue): void;
  onFix(issue: ProofIssue, replacement: string): void;
  onIgnoreWord(word: string): void;
  onFixAll(issues: ProofIssue[]): void;
}) {
  const [issues, setIssues] = useState<ProofIssue[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // Grammar and style issues skipped in this session, by message and text.
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const [tick, setTick] = useState(0);

  // Check again after each change, once typing pauses.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      engine
        .proofread(doc.id)
        .then((list) => live && setIssues(list))
        .catch(() => live && setIssues([]));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [doc, tick]);

  const shown = useMemo(
    () => (issues ?? []).filter((i) => !ignored.has(`${i.message}|${i.text}`) && (filter === 'all' || i.kind === filter)),
    [issues, ignored, filter],
  );
  const count = (k: Filter) => (issues ?? []).filter((i) => !ignored.has(`${i.message}|${i.text}`) && (k === 'all' || i.kind === k)).length;
  const fixable = (issues ?? []).filter((i) => i.autoFix && !ignored.has(`${i.message}|${i.text}`));

  const chip = (k: Filter, label: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setFilter(k)}
      className={`rounded-full px-2 py-0.5 text-[12px] ${filter === k ? 'bg-[#083B69] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {label} {issues ? count(k) : ''}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-2">
        <p className="px-1 text-[12px] leading-snug text-slate-500">{t.proofreadHint}</p>
        <div className="flex flex-wrap gap-1">
          {chip('all', t.kindAll)}
          {chip('spelling', t.kindSpelling)}
          {chip('grammar', t.kindGrammar)}
          {chip('style', t.kindStyle)}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={fixable.length === 0}
            onClick={() => onFixAll(fixable)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#083B69] px-2 py-1.5 text-[12px] font-medium text-white hover:bg-[#0B4A84] disabled:opacity-40"
          >
            <WandSparkles className="h-3.5 w-3.5" /> {t.fixAllSpelling} {fixable.length > 0 ? `(${fixable.length})` : ''}
          </button>
          <button
            type="button"
            title={t.checkAgain}
            aria-label={t.checkAgain}
            onClick={() => {
              setIgnored(new Set());
              setTick((n) => n + 1);
            }}
            className="rounded-md border border-slate-200 px-2 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {issues === null && <p className="px-1 py-2 text-[12px] text-slate-500">{t.proofreadChecking}</p>}
        {issues !== null && shown.length === 0 && (
          <p className="flex items-center gap-2 px-1 py-2 text-[12px] text-slate-500">
            <SpellCheck2 className="h-4 w-4 text-[#376FA3]" /> {t.proofreadClean}
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {shown.map((issue, n) => (
            <li key={`${n}|${issue.text}|${issue.message}`} className="rounded-lg border border-slate-200 bg-white p-2 hover:border-[#6C9FCB]">
              <button type="button" className="block w-full text-left" onClick={() => onSelect(issue)}>
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${KIND_COLORS[issue.kind]}`} />
                  {issue.kind === 'spelling' ? t.kindSpelling : issue.kind === 'grammar' ? t.kindGrammar : t.kindStyle}
                </div>
                <p className="text-[13px] leading-snug text-slate-600">
                  {issue.context.slice(0, issue.at[0])}
                  <mark className="rounded bg-[#B9AEDC]/40 px-0.5 text-slate-900 underline decoration-red-500 decoration-wavy underline-offset-2">
                    {issue.context.slice(issue.at[0], issue.at[1]).replace(/ /g, ' ')}
                  </mark>
                  {issue.context.slice(issue.at[1])}
                </p>
                <p className="mt-1 text-[12px] text-slate-700">{issue.message || t.possibleMisspelling}</p>
              </button>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {issue.suggestions.slice(0, 4).map((s, k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onFix(issue, s)}
                    className="rounded-md bg-[#376FA3]/10 px-2 py-0.5 text-[12px] font-medium text-[#083B69] hover:bg-[#376FA3]/20"
                  >
                    {s === '' ? t.deleteText : s.replace(/ /g, ' ')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (issue.kind === 'spelling') onIgnoreWord(issue.text);
                    setIgnored((set) => new Set(set).add(`${issue.message}|${issue.text}`));
                  }}
                  className="ml-auto rounded-md px-2 py-0.5 text-[12px] text-slate-500 hover:bg-slate-100"
                >
                  {issue.kind === 'spelling' ? t.ignoreAll : t.ignore}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 px-1 text-[11px] leading-snug text-slate-400">{t.proofreadNote}</p>
      </div>
    </div>
  );
}
