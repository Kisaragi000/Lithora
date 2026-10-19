import React, { useState } from 'react';
import { X, AlertTriangle, ArrowRight, Check, Sparkles, RefreshCw, Eye } from 'lucide-react';
import { MissingFontReport } from '../../services/fontReplacementService';
import { GOOGLE_FONTS_CATALOG, SYSTEM_FONTS } from '../../services/googleFontsService';

interface MissingFontsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  missingFonts: MissingFontReport[];
  onApplyReplacements: (replacements: Record<string, string>) => void;
  onKeepOriginals: () => void;
}

export const MissingFontsModal: React.FC<MissingFontsModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  missingFonts,
  onApplyReplacements,
  onKeepOriginals,
}) => {
  // Map of fontName -> chosen replacement
  const [chosenReplacements, setChosenReplacements] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    missingFonts.forEach((mf) => {
      initial[mf.fontName] = mf.suggestedReplacement;
    });
    return initial;
  });

  const [previewText, setPreviewText] = useState('The quick brown fox jumps over the lazy dog 12345');

  if (!isOpen || missingFonts.length === 0) return null;

  const handleSelectReplacement = (fontName: string, replacement: string) => {
    setChosenReplacements((prev) => ({
      ...prev,
      [fontName]: replacement,
    }));
  };

  const handleApplyAll = () => {
    onApplyReplacements(chosenReplacements);
    onClose();
  };

  const handleKeepAll = () => {
    onKeepOriginals();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200 bg-amber-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Missing Document Fonts</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                  {missingFonts.length} {missingFonts.length === 1 ? 'font' : 'fonts'}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate max-w-md">
                In document: <span className="font-semibold text-slate-800">{documentTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info banner */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-4">
          <p>
            This file uses fonts not installed on your system. Lithora can preserve original font tags or swap them with high-fidelity Google Font equivalents.
          </p>
          <div className="shrink-0 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="Preview sample..."
              className="text-xs px-2 py-1 bg-white border border-slate-200 rounded w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Customize preview text"
            />
          </div>
        </div>

        {/* Font List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {missingFonts.map((mf) => {
            const chosen = chosenReplacements[mf.fontName] || mf.suggestedReplacement;

            return (
              <div
                key={mf.fontName}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-2xs space-y-3"
              >
                {/* Font Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {mf.fontName}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {mf.occurrences} {mf.occurrences === 1 ? 'occurrence' : 'occurrences'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      Replace with <ArrowRight className="w-3 h-3" />
                    </span>

                    {/* Replacement selector */}
                    <select
                      value={chosen}
                      onChange={(e) => handleSelectReplacement(mf.fontName, e.target.value)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-300 bg-blue-50/50 text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <optgroup label="Suggested Match">
                        <option value={mf.suggestedReplacement}>
                          ★ {mf.suggestedReplacement} (Recommended)
                        </option>
                      </optgroup>

                      {mf.alternativeSuggestions?.length > 0 && (
                        <optgroup label="Alternative Matches">
                          {mf.alternativeSuggestions.map((alt) => (
                            <option key={alt} value={alt}>
                              {alt}
                            </option>
                          ))}
                        </optgroup>
                      )}

                      <optgroup label="Popular Google Fonts">
                        {GOOGLE_FONTS_CATALOG.filter(f => f.popular).map((gf) => (
                          <option key={gf.family} value={gf.family}>
                            {gf.family} ({gf.category})
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label="System Standard">
                        {SYSTEM_FONTS.map((sf) => (
                          <option key={sf.label} value={sf.label}>
                            {sf.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* Reason description */}
                <div className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>{mf.reason}</span>
                </div>

                {/* Live Preview Box */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                    <span>Rendering preview using {chosen}:</span>
                    <span className="text-[9px] bg-slate-200 px-1 py-0.5 rounded text-slate-600">
                      {mf.category}
                    </span>
                  </div>
                  <div
                    className="text-base text-slate-800 truncate"
                    style={{ fontFamily: `"${chosen}", sans-serif` }}
                  >
                    {previewText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleKeepAll}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            title="Keep the original font names in HTML/RTF (will use browser visual fallback)"
          >
            Keep Original Fonts Intact
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyAll}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Replacement Suggestions</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
