import React from 'react';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  X,
  Languages,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';
import { ProofreadLanguage } from '../../services/localProofreaderService';

interface ProofreadFloatingBarProps {
  totalSuggestions: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onAcceptAll: () => void;
  onClearAll: () => void;
  selectedLanguage: ProofreadLanguage;
  onSelectLanguage: (lang: ProofreadLanguage) => void;
  onRunProofread: () => void;
  isProofreading: boolean;
}

export const ProofreadFloatingBar: React.FC<ProofreadFloatingBarProps> = ({
  totalSuggestions,
  currentIndex,
  onNext,
  onPrev,
  onAcceptAll,
  onClearAll,
  selectedLanguage,
  onSelectLanguage,
  onRunProofread,
  isProofreading,
}) => {
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-purple-200/90 px-4 py-2 flex items-center gap-3 text-xs select-none animate-in slide-in-from-bottom-3 duration-200">
      {/* Icon & Engine Label */}
      <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="leading-tight">
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <span>AI Proofreader</span>
            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
              <HardDrive className="w-2.5 h-2.5" />
              100% Local
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            {totalSuggestions > 0 ? (
              <span className="text-purple-700 font-semibold">
                {totalSuggestions} suggestion{totalSuggestions === 1 ? '' : 's'} highlighted
              </span>
            ) : (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Document looks clean!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Language Selector */}
      <div className="flex items-center gap-1">
        <Languages className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
        <select
          value={selectedLanguage}
          onChange={(e) => onSelectLanguage(e.target.value as ProofreadLanguage)}
          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2 py-1 text-slate-700 text-xs font-medium focus:ring-1 focus:ring-purple-500 cursor-pointer"
          title="Select proofreading language model"
        >
          <option value="auto">Auto (EN / RU / ARM)</option>
          <option value="en">English (EN)</option>
          <option value="ru">Русский (RU)</option>
          <option value="hy">Հայերեն (ARM)</option>
        </select>
      </div>

      {/* Scan Again Button */}
      <button
        onClick={onRunProofread}
        disabled={isProofreading}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 font-medium border border-purple-200 transition-colors"
      >
        <Sparkles className={`w-3 h-3 ${isProofreading ? 'animate-spin' : ''}`} />
        <span>{isProofreading ? 'Checking...' : 'Re-scan'}</span>
      </button>

      {/* Navigation & Controls when suggestions exist */}
      {totalSuggestions > 0 && (
        <>
          <div className="h-4 w-px bg-slate-200" />

          {/* Stepper counter */}
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              title="Previous issue"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-slate-600 font-medium px-1">
              {currentIndex + 1} / {totalSuggestions}
            </span>
            <button
              onClick={onNext}
              className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              title="Next issue"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Accept All */}
          <button
            onClick={onAcceptAll}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-xs transition-colors"
            title="Accept all suggested changes"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Accept All ({totalSuggestions})</span>
          </button>
        </>
      )}

      {/* Dismiss / Close Highlights */}
      <button
        onClick={onClearAll}
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors ml-1"
        title="Clear proofreading highlights"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
