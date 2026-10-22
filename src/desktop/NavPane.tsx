/** The Navigation pane: the document's headings; click one to go there. */
import React, { useEffect, useState } from 'react';
import { ListTree, X } from 'lucide-react';
import { DocState, engine, Heading } from './engine';
import type { Strings } from './strings';

export function NavPane({
  t,
  doc,
  onGo,
  onClose,
}: {
  t: Strings;
  doc: DocState;
  onGo(index: number): void;
  onClose(): void;
}) {
  const [headings, setHeadings] = useState<Heading[] | null>(null);
  const [filter, setFilter] = useState('');
  // Headings change as the document does; look again once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      engine
        .headings(doc.id)
        .then(setHeadings)
        .catch(() => setHeadings([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [doc]);
  const q = filter.trim().toLowerCase();
  const shown = (headings ?? []).filter((h) => !q || h.text.toLowerCase().includes(q));
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white select-none">
      <div className="flex h-10 items-center gap-2 border-b border-slate-200 px-3">
        <ListTree className="h-4 w-4 text-[#376FA3]" />
        <span className="text-[13px] font-semibold text-[#083B69]">{t.navigationPane}</span>
        <button type="button" onClick={onClose} aria-label={t.close} className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.searchHeadings}
          className="h-8 w-full rounded-md border border-slate-300 px-2 text-[13px] focus:border-[#376FA3] focus:outline-none"
        />
      </div>
      <div className="lithora-slim-scroll min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {headings !== null && shown.length === 0 && <p className="px-2 py-2 text-[12px] leading-5 text-slate-500">{q ? t.noMatches : t.noHeadings}</p>}
        {shown.map((h) => (
          <button
            key={h.index}
            type="button"
            title={h.text}
            onClick={() => onGo(h.index)}
            className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-[#6C9FCB]/15 hover:text-[#083B69] ${
              h.level === 1 ? 'text-[13px] font-semibold text-slate-800' : 'text-[12.5px] text-slate-700'
            }`}
            style={{ paddingLeft: 8 + (Math.min(h.level, 6) - 1) * 14 }}
          >
            {h.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
