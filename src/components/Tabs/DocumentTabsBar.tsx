import React, { useRef, useState } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, FileText, ChevronDown } from 'lucide-react';
import { DocumentTab, Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface DocumentTabsBarProps {
  documents: DocumentTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: (format?: 'docx' | 'rtf') => void;
  currentLang: Language;
}

export const DocumentTabsBar: React.FC<DocumentTabsBarProps> = ({
  documents,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  currentLang,
}) => {
  const t = translations[currentLang];
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -160, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 160, behavior: 'smooth' });
    }
  };

  const getFormatBadge = (format: string) => {
    switch (format) {
      case 'docx':
        return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'rtf':
        return 'bg-purple-100 text-purple-700 border border-purple-200 font-bold';
      case 'html':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      default:
        return 'bg-slate-200 text-slate-700';
    }
  };

  return (
    <div className="flex items-center bg-slate-200/80 border-b border-slate-300/80 px-2 pt-1 gap-1 select-none overflow-hidden relative">
      {/* Scroll left button */}
      <button
        onClick={scrollLeft}
        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded transition-colors"
        title="Scroll tabs left"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Tabs list container */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth flex-1 min-w-0"
      >
        {documents.map((doc) => {
          const isActive = doc.id === activeTabId;
          return (
            <div
              key={doc.id}
              onClick={() => onSelectTab(doc.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-t-lg cursor-pointer border-t border-x transition-all shrink-0 max-w-[240px] ${
                isActive
                  ? 'bg-white text-blue-700 border-slate-300 border-b-white -mb-px z-10 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-50 text-slate-600 border-transparent hover:border-slate-300'
              }`}
            >
              <span
                className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded leading-none shrink-0 ${getFormatBadge(
                  doc.format
                )}`}
              >
                .{doc.format}
              </span>

              <span className="truncate flex-1 font-medium text-slate-800" title={doc.title}>
                {doc.title}
              </span>

              {/* Dirty Unsaved Dot */}
              {doc.isDirty && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                  title={t.unsavedChanges}
                />
              )}

              {/* Close Tab Button */}
              <button
                onClick={(e) => onCloseTab(doc.id, e)}
                className="opacity-40 group-hover:opacity-100 hover:bg-slate-200 p-0.5 rounded transition-all text-slate-600 hover:text-red-600 shrink-0"
                title={t.closeTab}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Scroll right button */}
      <button
        onClick={scrollRight}
        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-300 rounded transition-colors"
        title="Scroll tabs right"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {/* New Document Button with Format Dropdown */}
      <div className="relative shrink-0">
        <div className="flex items-center bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 overflow-hidden text-xs">
          <button
            onClick={() => onNewTab('docx')}
            className="flex items-center gap-1 px-2 py-1 text-slate-700 hover:text-blue-700 font-medium transition-colors"
            title="Create new .docx file"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">.docx</span>
          </button>
          <div className="w-px h-4 bg-slate-300" />
          <button
            onClick={() => onNewTab('rtf')}
            className="flex items-center gap-1 px-2 py-1 text-slate-700 hover:text-purple-700 font-medium transition-colors"
            title="Create new .rtf file"
          >
            <Plus className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline">.rtf</span>
          </button>
          <div className="w-px h-4 bg-slate-300" />
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="px-1 py-1 text-slate-500 hover:text-slate-800 transition-colors"
            title="More document options"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Dropdown Menu */}
        {showNewMenu && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-44 z-30 text-xs font-medium">
            <button
              onClick={() => {
                onNewTab('docx');
                setShowNewMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-slate-700 flex items-center justify-between"
            >
              <span>New Word Document</span>
              <span className="text-[10px] font-bold text-blue-600">.DOCX</span>
            </button>
            <button
              onClick={() => {
                onNewTab('rtf');
                setShowNewMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-slate-700 flex items-center justify-between"
            >
              <span>New Rich Text Document</span>
              <span className="text-[10px] font-bold text-purple-600">.RTF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
