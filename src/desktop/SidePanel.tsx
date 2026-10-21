/**
 * The panel beside the pages: History (every change, Photoshop-style: click a step to go back
 * to it) and Comments.
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, History as HistoryIcon, MessageSquare, RotateCcw, SpellCheck, Trash2, X } from 'lucide-react';
import type { Language } from '../types/document';
import { DocState, ProofIssue, engine } from './engine';
import { ProofreadPanel } from './Proofread';
import type { Strings } from './strings';

export type PanelKind = 'history' | 'comments' | 'proofread';

/** One change in the History panel. */
export interface HistoryState {
  /** Undo steps, oldest first. */
  done: string[];
  /** Steps that were undone and can be redone, the next one first. */
  undone: string[];
}

/** Undo labels come from the engine in English; these are the common ones in Russian and Armenian. */
const LABELS: Record<string, [string, string]> = {
  Typing: ['Ввод текста', 'Մուտքագրում'],
  Delete: ['Удаление', 'Ջնջում'],
  Backspace: ['Удаление', 'Ջնջում'],
  Paste: ['Вставка', 'Տեղադրում'],
  Cut: ['Вырезание', 'Կտրում'],
  Bold: ['Полужирный', 'Թավ'],
  Italic: ['Курсив', 'Շեղ'],
  Underline: ['Подчёркивание', 'Ընդգծում'],
  Strikethrough: ['Зачёркивание', 'Գծանցում'],
  Font: ['Шрифт', 'Տառատեսակ'],
  'Font Size': ['Размер шрифта', 'Տառաչափ'],
  'Font Color': ['Цвет текста', 'Տեքստի գույն'],
  'Text Highlight Color': ['Выделение цветом', 'Գունանշում'],
  'Clear All Formatting': ['Очистка формата', 'Ձևաչափի մաքրում'],
  'Align Left': ['По левому краю', 'Ձախ հավասարեցում'],
  Center: ['По центру', 'Կենտրոնում'],
  'Align Right': ['По правому краю', 'Աջ հավասարեցում'],
  Justify: ['По ширине', 'Լայնությամբ'],
  Bullets: ['Маркеры', 'Նշիչներ'],
  Numbering: ['Нумерация', 'Համարակալում'],
  Style: ['Стиль', 'Ոճ'],
  Styles: ['Стиль', 'Ոճ'],
  Table: ['Таблица', 'Աղյուսակ'],
  'Insert Table': ['Вставка таблицы', 'Աղյուսակի տեղադրում'],
  Pictures: ['Рисунок', 'Նկար'],
  'Page Break': ['Разрыв страницы', 'Էջի ընդհատում'],
  Margins: ['Поля', 'Լուսանցքներ'],
  Orientation: ['Ориентация', 'Կողմնորոշում'],
  Size: ['Размер', 'Չափ'],
  Columns: ['Колонки', 'Սյունակներ'],
  'New Comment': ['Примечание', 'Մեկնաբանություն'],
  Link: ['Ссылка', 'Հղում'],
  Symbol: ['Символ', 'Նշան'],
  Replace: ['Замена', 'Փոխարինում'],
  'Replace All': ['Замена всех', 'Բոլորի փոխարինում'],
  'Move or Resize': ['Перемещение рисунка', 'Նկարի տեղափոխում'],
  'Line and Paragraph Spacing': ['Междустрочный интервал', 'Տողամիջակայք'],
  'Paragraph Spacing': ['Интервал абзаца', 'Պարբերության միջակայք'],
  Header: ['Верхний колонтитул', 'Էջագլուխ'],
  Footer: ['Нижний колонтитул', 'Էջատակ'],
  'Page Number': ['Номер страницы', 'Էջի համար'],
  'Accept All Changes': ['Принятие исправлений', 'Փոփոխությունների ընդունում'],
  'Reject All Changes': ['Отклонение исправлений', 'Փոփոխությունների մերժում'],
  Tab: ['Табуляция', 'Ներդիր'],
  'Insert Above': ['Строка выше', 'Տող վերևում'],
  'Insert Below': ['Строка ниже', 'Տող ներքևում'],
  'Insert Left': ['Столбец слева', 'Սյունակ ձախից'],
  'Insert Right': ['Столбец справа', 'Սյունակ աջից'],
  'Merge Cells': ['Объединение ячеек', 'Վանդակների միավորում'],
  'Split Cells': ['Разделение ячеек', 'Վանդակի բաժանում'],
  Borders: ['Границы', 'Եզրագծեր'],
  Shading: ['Заливка', 'Լցում'],
  'New Paragraph': ['Новый абзац', 'Նոր պարբերություն'],
  Change: ['Исправление орфографии', 'Ուղղագրության ուղղում'],
  'Wrap Text': ['Обтекание текстом', 'Տեքստի շրջանցում'],
};

/** Engine labels that read better under another name. */
const RENAMED: Record<string, string> = {
  Pictures: 'Picture',
  Change: 'Spelling correction',
  'Insert Above': 'Insert row above',
  'Insert Below': 'Insert row below',
  'Insert Left': 'Insert column left',
  'Insert Right': 'Insert column right',
};

export function historyLabel(label: string, lang: Language): string {
  const tr = LABELS[label];
  if (lang === 'en' || !tr) {
    // Engine labels are in Title Case ("Insert Below"); the panel uses sentence case.
    const l = RENAMED[label] ?? label;
    return l.charAt(0) + l.slice(1).toLowerCase();
  }
  return lang === 'ru' ? tr[0] : tr[1];
}

interface CommentInfo {
  id: number;
  author: string;
  date: string;
  resolved: boolean;
  parent: number | null;
  text: string;
  anchor: unknown;
}

export function SidePanel({
  t,
  lang,
  kind,
  doc,
  history,
  onKind,
  onClose,
  onCommand,
  onUndoTo,
  onRedo,
  onReply,
  proofread,
}: {
  t: Strings;
  lang: Language;
  kind: PanelKind;
  doc: DocState;
  history: HistoryState;
  onKind(kind: PanelKind): void;
  onClose(): void;
  onCommand(name: string, params?: Record<string, unknown>): void;
  /** Undo this many steps at once. */
  onUndoTo(count: number): void;
  /** Redo this many steps. */
  onRedo(count: number): void;
  onReply(id: number): void;
  /** What the Proofread tab does in the document. */
  proofread: {
    onSelect(issue: ProofIssue): void;
    onFix(issue: ProofIssue, replacement: string): void;
    onIgnoreWord(word: string): void;
    onFixAll(issues: ProofIssue[]): void;
  };
}) {
  const [comments, setComments] = useState<CommentInfo[]>([]);

  useEffect(() => {
    if (kind !== 'comments') return;
    let live = true;
    engine
      .command(doc.id, 'review.comments')
      .then((r) => live && setComments((r.result as CommentInfo[]) ?? []))
      .catch(() => live && setComments([]));
    return () => {
      live = false;
    };
  }, [kind, doc]);

  const tab = (k: PanelKind, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onKind(k)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium ${
        kind === k ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-600 hover:text-[#083B69]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const roots = comments.filter((c) => c.parent == null);
  const replies = (id: number) => comments.filter((c) => c.parent === id);
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const { done, undone } = history;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5">
        {tab('history', t.history, <HistoryIcon className="h-4 w-4" />)}
        {tab('comments', t.comments, <MessageSquare className="h-4 w-4" />)}
        {tab('proofread', t.proofread, <SpellCheck className="h-4 w-4" />)}
        <button type="button" onClick={onClose} title={t.close} aria-label={t.close} className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {kind === 'proofread' ? (
        <ProofreadPanel t={t} doc={doc} {...proofread} />
      ) : kind === 'history' ? (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <p className="mb-2 px-1 text-[12px] leading-snug text-slate-500">{t.historyHint}</p>
          <ol className="flex flex-col gap-0.5 text-[13px]">
            <li>
              <button
                type="button"
                onClick={() => done.length > 0 && onUndoTo(done.length)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  done.length === 0 ? 'bg-[#376FA3]/15 font-medium text-[#083B69]' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0 opacity-60" />
                {t.historyOpen}
              </button>
            </li>
            {done.map((label, i) => (
              <li key={`d${i}`}>
                <button
                  type="button"
                  onClick={() => i < done.length - 1 && onUndoTo(done.length - 1 - i)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                    i === done.length - 1 ? 'bg-[#376FA3]/15 font-medium text-[#083B69]' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                  <span className="truncate">{historyLabel(label, lang)}</span>
                </button>
              </li>
            ))}
            {undone.map((label, i) => (
              <li key={`u${i}`}>
                <button
                  type="button"
                  onClick={() => onRedo(i + 1)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums">{done.length + i + 1}</span>
                  <span className="truncate italic">{historyLabel(label, lang)}</span>
                </button>
              </li>
            ))}
          </ol>
          {done.length === 0 && undone.length === 0 && <p className="px-2 py-3 text-[12px] text-slate-500">{t.noHistory}</p>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {roots.length === 0 && <p className="px-1 py-2 text-[12px] leading-snug text-slate-500">{t.noComments}</p>}
          <ul className="flex flex-col gap-2">
            {roots.map((c) => (
              <li key={c.id} className={`rounded-lg border p-2.5 ${c.resolved ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-[#6C9FCB]/50 bg-[#B9AEDC]/10'}`}>
                <button type="button" className="block w-full text-left" onClick={() => c.anchor && onCommand('caret.set', { pos: c.anchor })}>
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-[#083B69]">{c.author || '—'}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-500">{when(c.date)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-slate-800">{c.text}</p>
                </button>
                {replies(c.id).map((r) => (
                  <div key={r.id} className="mt-2 border-l-2 border-[#6C9FCB]/50 pl-2">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[12px] font-semibold text-[#376FA3]">{r.author || '—'}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-500">{when(r.date)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] text-slate-800">{r.text}</p>
                  </div>
                ))}
                <div className="mt-2 flex gap-1">
                  <button type="button" onClick={() => onReply(c.id)} className="rounded px-1.5 py-0.5 text-[12px] text-[#376FA3] hover:bg-[#6C9FCB]/15">
                    {t.reply}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCommand('review.resolveComment', { id: c.id, value: !c.resolved })}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-[#376FA3] hover:bg-[#6C9FCB]/15"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> {c.resolved ? t.reopen : t.resolve}
                  </button>
                  <button
                    type="button"
                    title={t.deleteComment}
                    aria-label={t.deleteComment}
                    onClick={() => onCommand('review.deleteComment', { id: c.id })}
                    className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
