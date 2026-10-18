import React, { useState } from 'react';
import { X, Search, Replace, ArrowRight } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface FindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  onFind: (term: string) => number;
  onReplace: (findTerm: string, replaceTerm: string, replaceAll: boolean) => void;
  currentLang: Language;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  isOpen,
  onClose,
  onFind,
  onReplace,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleFindSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (findText.trim()) {
      const count = onFind(findText);
      setMatchCount(count);
    }
  };

  const handleReplace = (all: boolean) => {
    if (findText) {
      onReplace(findText, replaceText, all);
      const count = onFind(findText);
      setMatchCount(count);
    }
  };

  return (
    <div className="bg-slate-50 border-b border-slate-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs animate-in slide-in-from-top-2 duration-150 no-print">
      <form onSubmit={handleFindSubmit} className="flex items-center gap-2 flex-wrap">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder={t.find}
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value);
              setMatchCount(null);
            }}
            className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
          />
        </div>

        <button
          type="submit"
          className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-md font-medium text-slate-700 transition-colors"
        >
          {matchCount !== null ? `${matchCount} found` : 'Find'}
        </button>

        <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />

        <div className="relative flex items-center">
          <Replace className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder={t.replace}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
          />
        </div>

        <button
          type="button"
          onClick={() => handleReplace(false)}
          className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-md font-medium text-slate-700 transition-colors"
        >
          {t.replace}
        </button>

        <button
          type="button"
          onClick={() => handleReplace(true)}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors shadow-xs"
        >
          {t.replaceAll}
        </button>
      </form>

      <button
        onClick={onClose}
        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
        title="Close Find & Replace"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
