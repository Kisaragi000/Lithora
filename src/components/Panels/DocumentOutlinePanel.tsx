import React from 'react';
import { X, AlignLeft, ChevronRight } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface DocumentOutlinePanelProps {
  isOpen: boolean;
  onClose: () => void;
  headings: Array<{ id: string; text: string; level: number }>;
  onSelectHeading: (id: string) => void;
  currentLang: Language;
}

export const DocumentOutlinePanel: React.FC<DocumentOutlinePanelProps> = ({
  isOpen,
  onClose,
  headings,
  onSelectHeading,
  currentLang,
}) => {
  const t = translations[currentLang];

  if (!isOpen) return null;

  return (
    <div className="w-64 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-lg select-none no-print">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
          <span>{t.documentOutline}</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 overflow-y-auto flex-1 space-y-1">
        {headings.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            {t.noHeadingsFound}
          </p>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.id}-${i}`}
              onClick={() => onSelectHeading(h.id)}
              className="w-full text-left text-xs py-1 px-2 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-1.5 truncate text-slate-700"
              style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
            >
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className={`truncate ${h.level === 1 ? 'font-bold' : h.level === 2 ? 'font-semibold' : 'font-normal'}`}>
                {h.text}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
