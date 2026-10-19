import React from 'react';
import { Check, X, Sparkles, BookOpen, ArrowRight } from 'lucide-react';
import { ProofreadIssueType } from '../../services/localProofreaderService';

export interface ActiveProofreadPopoverData {
  id: string;
  original: string;
  replacement: string;
  type: ProofreadIssueType;
  language: 'en' | 'ru' | 'hy';
  explanation: string;
  targetRect: DOMRect;
}

interface ProofreadPopoverProps {
  data: ActiveProofreadPopoverData | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

export const ProofreadPopover: React.FC<ProofreadPopoverProps> = ({
  data,
  onAccept,
  onDismiss,
  onClose,
}) => {
  if (!data) return null;

  const { original, replacement, type, language, explanation, targetRect, id } = data;

  // Position relative to viewport, adjusted to stay on screen
  const popoverWidth = 320;
  let top = targetRect.bottom + 8;
  let left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;

  // Prevent going off screen
  if (left < 16) left = 16;
  if (left + popoverWidth > window.innerWidth - 16) {
    left = window.innerWidth - popoverWidth - 16;
  }
  if (top + 160 > window.innerHeight) {
    // Show above if not enough room below
    top = targetRect.top - 170;
  }

  const getTypeLabel = (t: ProofreadIssueType) => {
    switch (t) {
      case 'spelling':
        return 'Spelling Error';
      case 'grammar':
        return 'Grammar Rule';
      case 'article':
        return 'Definite Article';
      case 'style':
        return 'Style & Conciseness';
      case 'punctuation':
        return 'Punctuation';
      case 'typography':
        return 'Typography';
      default:
        return 'Suggestion';
    }
  };

  const getLangBadge = (lang: string) => {
    switch (lang) {
      case 'hy':
        return { label: 'ARM / ՀԱՅ', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'ru':
        return { label: 'RU / РУС', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      case 'en':
      default:
        return { label: 'EN', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
  };

  const langBadge = getLangBadge(language);

  return (
    <div
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popoverWidth}px`,
        zIndex: 9999,
      }}
      className="bg-white rounded-xl shadow-2xl border border-purple-200 p-3 text-slate-800 animate-in fade-in zoom-in-95 duration-150 select-none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-purple-100">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center text-purple-700">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-purple-900">{getTypeLabel(type)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${langBadge.color}`}>
            {langBadge.label}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Diff View */}
      <div className="bg-purple-50/60 rounded-lg p-2.5 mb-2.5 border border-purple-100 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-500 mb-0.5">Original</div>
          <div className="text-xs line-through text-rose-600 font-mono bg-rose-50/80 px-1.5 py-0.5 rounded inline-block truncate max-w-full">
            {original}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-purple-400 shrink-0 mx-1" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-500 mb-0.5">Suggested Change</div>
          <div className="text-xs font-bold text-purple-800 font-mono bg-purple-100/90 px-1.5 py-0.5 rounded inline-block truncate max-w-full">
            {replacement}
          </div>
        </div>
      </div>

      {/* Explanation text */}
      <div className="text-xs text-slate-600 mb-3 px-0.5 leading-relaxed flex items-start gap-1.5">
        <BookOpen className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
        <span>{explanation}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
        <button
          onClick={() => onDismiss(id)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
        >
          <X className="w-3 h-3 text-slate-400" />
          <span>Ignore</span>
        </button>
        <button
          onClick={() => onAccept(id)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-md shadow-xs transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Apply Suggestion</span>
        </button>
      </div>
    </div>
  );
};
