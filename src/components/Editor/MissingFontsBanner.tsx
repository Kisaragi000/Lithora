import React from 'react';
import { AlertTriangle, ArrowRight, X, Sparkles } from 'lucide-react';
import { MissingFontReport } from '../../services/fontReplacementService';

interface MissingFontsBannerProps {
  missingFonts: MissingFontReport[];
  onOpenModal: () => void;
  onDismiss: () => void;
  onApplySuggestions: () => void;
}

export const MissingFontsBanner: React.FC<MissingFontsBannerProps> = ({
  missingFonts,
  onOpenModal,
  onDismiss,
  onApplySuggestions,
}) => {
  if (!missingFonts || missingFonts.length === 0) return null;

  const fontNames = missingFonts.map((f) => f.fontName).join(', ');
  const suggestedNames = missingFonts.map((f) => f.suggestedReplacement).join(', ');

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-3 text-xs text-amber-900 select-none animate-in fade-in duration-200 shadow-2xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" />
        </div>
        <div className="truncate">
          <span className="font-bold">Missing fonts detected: </span>
          <span className="font-semibold text-rose-800 bg-rose-100/70 px-1.5 py-0.5 rounded border border-rose-200/60 mr-1.5">
            {fontNames}
          </span>
          <span className="hidden sm:inline text-amber-700">
            (Suggested replacements: <span className="font-medium text-slate-800">{suggestedNames}</span>)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onApplySuggestions}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-[11px] shadow-2xs transition-colors"
          title="Apply suggested replacements immediately"
        >
          <Sparkles className="w-3 h-3" />
          <span className="hidden md:inline">Auto-Replace</span>
        </button>

        <button
          onClick={onOpenModal}
          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded font-semibold text-[11px] transition-colors"
        >
          <span>Review Suggestions</span>
          <ArrowRight className="w-3 h-3" />
        </button>

        <button
          onClick={onDismiss}
          className="p-1 text-amber-700 hover:text-amber-950 hover:bg-amber-200/50 rounded transition-colors"
          title="Keep original fonts intact and dismiss warning"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
