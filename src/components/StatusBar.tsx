import React from 'react';
import { ZoomIn, ZoomOut, FileText, CheckCheck, Clock } from 'lucide-react';
import { Language, DocumentStats } from '../types/document';
import { translations } from '../i18n/translations';

interface StatusBarProps {
  stats: DocumentStats;
  currentLang: Language;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  isDirty: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  stats,
  currentLang,
  zoom,
  onZoomChange,
  isDirty,
}) => {
  const t = translations[currentLang];

  const handleZoomIn = () => {
    onZoomChange(Math.min(200, zoom + 10));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(50, zoom - 10));
  };

  const handleZoomReset = () => {
    onZoomChange(100);
  };

  return (
    <footer className="h-7 bg-white border-t border-slate-300 px-3 flex items-center justify-between text-[11px] text-slate-600 select-none z-10 shrink-0 no-print">
      {/* Left stats: Page, Words, Chars, Reading time */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 text-slate-400" />
          <span>Page 1 of 1</span>
        </div>

        <div className="h-3 w-px bg-slate-300" />

        <div className="flex items-center gap-1 font-mono tabular-nums">
          <span className="font-semibold text-slate-800">{stats.words}</span>
          <span className="text-slate-500">{t.wordsLabel}</span>
        </div>

        <div className="h-3 w-px bg-slate-300 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-1 font-mono tabular-nums">
          <span className="font-semibold text-slate-800">{stats.characters}</span>
          <span className="text-slate-500">{t.charsLabel}</span>
        </div>

        <div className="h-3 w-px bg-slate-300 hidden md:block" />

        <div className="hidden md:flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{stats.readingTimeMinutes} min read</span>
        </div>

        <div className="h-3 w-px bg-slate-300" />

        {/* Saved Status */}
        <div className="flex items-center gap-1">
          {isDirty ? (
            <span className="text-amber-600 font-medium">{t.unsavedChanges}</span>
          ) : (
            <div className="flex items-center gap-1 text-emerald-700">
              <CheckCheck className="w-3 h-3 text-emerald-600" />
              <span>{t.statusSaved}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right controls: Script badge, Zoom controls */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-1 text-slate-500">
          <span>UTF-8 Unicode</span>
        </div>

        <div className="h-3 w-px bg-slate-300 hidden lg:block" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 font-mono tabular-nums">
          <button
            onClick={handleZoomOut}
            className="p-0.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={zoom}
            onChange={(e) => onZoomChange(parseInt(e.target.value, 10))}
            className="w-16 sm:w-20 accent-blue-600 cursor-pointer h-1"
          />

          <button
            onClick={handleZoomIn}
            className="p-0.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <button
            onClick={handleZoomReset}
            className="px-1 py-0.5 hover:bg-slate-100 rounded text-slate-700 font-semibold text-[10px] transition-colors"
            title="Reset Zoom to 100%"
          >
            {zoom}%
          </button>
        </div>
      </div>
    </footer>
  );
};
