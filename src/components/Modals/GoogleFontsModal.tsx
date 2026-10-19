import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Sparkles, Check, Plus, ExternalLink, Globe } from 'lucide-react';
import { Language } from '../../types/document';
import {
  GOOGLE_FONTS_CATALOG,
  SYSTEM_FONTS,
  GoogleFontItem,
  loadGoogleFont,
} from '../../services/googleFontsService';

interface GoogleFontsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFont: string;
  onSelectFont: (fontFamily: string) => void;
  currentLang: Language;
}

export const GoogleFontsModal: React.FC<GoogleFontsModalProps> = ({
  isOpen,
  onClose,
  currentFont,
  onSelectFont,
  currentLang,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customFontInput, setCustomFontInput] = useState('');
  const [customFontsList, setCustomFontsList] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState(() => {
    if (currentLang === 'hy') return 'Հայաստանի Մշակույթն ու Պատմությունը 2026';
    if (currentLang === 'ru') return 'Съешь же ещё этих мягких французских булок, да выпей чаю';
    return 'The quick brown fox jumps over the lazy dog 12345';
  });

  const categories = [
    { id: 'all', label: 'All Fonts' },
    { id: 'sans-serif', label: 'Sans Serif' },
    { id: 'serif', label: 'Serif' },
    { id: 'display', label: 'Display' },
    { id: 'handwriting', label: 'Handwriting' },
    { id: 'monospace', label: 'Monospace' },
    { id: 'armenian', label: 'Armenian (Հայերեն)' },
    { id: 'cyrillic', label: 'Cyrillic (Русский)' },
  ];

  // Filtered fonts
  const filteredFonts = useMemo(() => {
    return GOOGLE_FONTS_CATALOG.filter((font) => {
      // Category filter
      if (selectedCategory === 'armenian') {
        if (!font.subsets.includes('armenian') && font.family !== 'Sylfaen') return false;
      } else if (selectedCategory === 'cyrillic') {
        if (!font.subsets.includes('cyrillic')) return false;
      } else if (selectedCategory !== 'all' && font.category !== selectedCategory) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          font.family.toLowerCase().includes(term) ||
          font.category.toLowerCase().includes(term) ||
          font.subsets.some((s) => s.includes(term))
        );
      }

      return true;
    });
  }, [selectedCategory, searchTerm]);

  // Pre-load visible fonts into head for crisp preview
  useEffect(() => {
    if (!isOpen) return;
    const topFonts = filteredFonts.slice(0, 24);
    topFonts.forEach((f) => loadGoogleFont(f.family));
  }, [isOpen, filteredFonts]);

  if (!isOpen) return null;

  const handleApplyFont = (fontFamily: string) => {
    loadGoogleFont(fontFamily).then(() => {
      onSelectFont(fontFamily);
      onClose();
    });
  };

  const handleAddCustomFont = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customFontInput.trim();
    if (!clean) return;

    loadGoogleFont(clean).then(() => {
      setCustomFontsList((prev) => [clean, ...prev.filter((f) => f.toLowerCase() !== clean.toLowerCase())]);
      onSelectFont(clean);
      setCustomFontInput('');
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Google Fonts Library</h2>
              <p className="text-xs text-slate-500">
                Browse, preview, and apply 100+ Google Fonts with English, Russian, and Armenian support
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search, Custom Load, and Category Filter Bar */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Google Fonts (e.g. Montserrat, Playfair, Noto Sans Armenian)..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Custom Google Font Direct Loader */}
            <form onSubmit={handleAddCustomFont} className="flex items-center gap-1.5 w-full sm:w-auto">
              <input
                type="text"
                value={customFontInput}
                onChange={(e) => setCustomFontInput(e.target.value)}
                placeholder="Any Google Font name..."
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full sm:w-48"
              />
              <button
                type="submit"
                disabled={!customFontInput.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Load</span>
              </button>
            </form>
          </div>

          {/* Custom preview text input & Category tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors font-medium ${
                    selectedCategory === cat.id
                      ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Live preview text input */}
            <div className="w-full sm:w-72 shrink-0">
              <input
                type="text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                title="Customize preview text"
                className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Fonts Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
          {/* Custom Loaded Fonts Section if any */}
          {customFontsList.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Custom Loaded Fonts
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {customFontsList.map((font) => (
                  <div
                    key={font}
                    onClick={() => handleApplyFont(font)}
                    className="p-3.5 bg-white border border-blue-200 rounded-lg hover:border-blue-500 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-800">{font}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                        Custom
                      </span>
                    </div>
                    <div
                      className="text-base text-slate-700 py-1 truncate"
                      style={{ fontFamily: `"${font}", sans-serif` }}
                    >
                      {previewText}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard Catalog */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredFonts.map((font) => {
              const isSelected =
                currentFont.toLowerCase().includes(font.family.toLowerCase());

              return (
                <div
                  key={font.family}
                  onClick={() => handleApplyFont(font.family)}
                  className={`p-3.5 bg-white rounded-lg border transition-all cursor-pointer flex flex-col justify-between group hover:shadow-sm ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
                      : 'border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {font.family}
                      </span>
                      {isSelected && (
                        <span className="flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full font-bold">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 capitalize bg-slate-100 px-1.5 py-0.5 rounded">
                        {font.category}
                      </span>
                      {font.subsets.includes('armenian') && (
                        <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1 py-0.5 rounded font-semibold">
                          Հայ
                        </span>
                      )}
                      {font.subsets.includes('cyrillic') && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded font-semibold">
                          Рус
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sample rendered in actual font */}
                  <div
                    className="text-base text-slate-800 py-1.5 truncate border-t border-slate-100 mt-1"
                    style={{ fontFamily: `"${font.family}", ${font.category}` }}
                  >
                    {previewText}
                  </div>

                  <div className="flex items-center justify-between pt-1 mt-1 text-[11px] text-slate-400">
                    <span>Google Fonts</span>
                    <span className="group-hover:text-blue-600 font-medium transition-colors">
                      Click to apply &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredFonts.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="text-sm">No fonts matching "{searchTerm}"</p>
              <p className="text-xs text-slate-400 mt-1">
                You can load any Google Font directly using the box above!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span>All fonts are loaded via Google Fonts CDN with global caching</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
