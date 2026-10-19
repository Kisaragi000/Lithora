import React, { useState } from 'react';
import {
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Outdent,
  Indent,
  Table,
  Image,
  Minus,
  Calendar,
  Sparkles,
  Download,
  RotateCcw,
  Search,
  FileText,
  FilePlus,
  FolderOpen,
  Save,
  Printer,
  Sliders,
  Type,
  Palette,
  Eye,
  Trash2,
  FileCode,
  Code,
  AlertTriangle,
  Columns2,
  Columns3,
} from 'lucide-react';
import { Language, PageSettings, DocumentFormat } from '../../types/document';
import { translations } from '../../i18n/translations';
import { GoogleFontsModal } from '../Modals/GoogleFontsModal';
import { loadGoogleFont } from '../../services/googleFontsService';

interface RibbonBarProps {
  currentLang: Language;
  onCommand: (command: string, value?: string) => void;
  pageSettings: PageSettings;
  onUpdatePageSettings: (settings: Partial<PageSettings>) => void;
  activeFormat?: DocumentFormat;
  onExportDirect: (format: DocumentFormat) => void;
  // Modals & triggers
  onOpenTableModal: () => void;
  onOpenImageModal: () => void;
  onOpenSymbolsModal: () => void;
  onOpenExportModal: () => void;
  onOpenFiles: () => void;
  onNewDocFormat: (format: 'docx' | 'rtf') => void;
  onLoadSample: (type: 'en' | 'hy' | 'ru' | 'fonts' | 'proofread') => void;
  onSave: () => void;
  onPrint: () => void;
  // Review & Search
  isFindReplaceOpen: boolean;
  onToggleFindReplace: () => void;
  isOutlineOpen: boolean;
  onToggleOutline: () => void;
  isVirtualKeyboardOpen: boolean;
  onToggleVirtualKeyboard: () => void;
  onFixEncoding?: () => void;
  missingFontsCount?: number;
  onOpenMissingFontsModal?: () => void;
  // AI Proofreading
  onProofread?: () => void;
  isProofreading?: boolean;
  proofreadCount?: number;
  onAcceptAllProofread?: () => void;
  onClearProofread?: () => void;
}

export const RibbonBar: React.FC<RibbonBarProps> = ({
  currentLang,
  onCommand,
  pageSettings,
  onUpdatePageSettings,
  activeFormat = 'docx',
  onExportDirect,
  onOpenTableModal,
  onOpenImageModal,
  onOpenSymbolsModal,
  onOpenExportModal,
  onOpenFiles,
  onNewDocFormat,
  onLoadSample,
  onSave,
  onPrint,
  isFindReplaceOpen,
  onToggleFindReplace,
  isOutlineOpen,
  onToggleOutline,
  isVirtualKeyboardOpen,
  onToggleVirtualKeyboard,
  onFixEncoding,
  missingFontsCount = 0,
  onOpenMissingFontsModal,
  onProofread,
  isProofreading = false,
  proofreadCount = 0,
  onAcceptAllProofread,
  onClearProofread,
}) => {
  const t = translations[currentLang];
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'layout' | 'review' | 'file' | 'export'>('home');
  const [fontColor, setFontColor] = useState('#0f172a');
  const [hiliteColor, setHiliteColor] = useState('#fef08a');
  const [selectedFont, setSelectedFont] = useState('Calibri');
  const [selectedFontSize, setSelectedFontSize] = useState('3');
  const [isGoogleFontsModalOpen, setIsGoogleFontsModalOpen] = useState(false);
  const [recentFonts, setRecentFonts] = useState<string[]>(['Plus Jakarta Sans', 'Montserrat', 'Playfair Display']);

  const fontSizes = [
    { label: '10 pt', value: '1' },
    { label: '12 pt', value: '2' },
    { label: '14 pt', value: '3' },
    { label: '18 pt', value: '4' },
    { label: '24 pt', value: '5' },
    { label: '32 pt', value: '6' },
    { label: '48 pt', value: '7' },
  ];

  const handleFontChange = (val: string) => {
    if (val === '__browse_google_fonts__') {
      setIsGoogleFontsModalOpen(true);
      return;
    }
    setSelectedFont(val);
    loadGoogleFont(val);
    onCommand('fontName', val);
    if (!recentFonts.includes(val)) {
      setRecentFonts((prev) => [val, ...prev.slice(0, 7)]);
    }
  };

  const handleSelectFromModal = (fontFamily: string) => {
    setSelectedFont(fontFamily);
    loadGoogleFont(fontFamily);
    onCommand('fontName', fontFamily);
    if (!recentFonts.includes(fontFamily)) {
      setRecentFonts((prev) => [fontFamily, ...prev.slice(0, 7)]);
    }
  };

  const handleFontSizeChange = (val: string) => {
    setSelectedFontSize(val);
    onCommand('fontSize', val);
  };

  const insertCurrentDateTime = () => {
    const locale = currentLang === 'hy' ? 'hy-AM' : currentLang === 'ru' ? 'ru-RU' : 'en-US';
    const now = new Date().toLocaleString(locale, {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    onCommand('insertHTML', `<span>${now}</span>`);
  };

  const insertPageBreak = () => {
    onCommand('insertHTML', '<div style="page-break-after: always; border-bottom: 2px dashed #94a3b8; margin: 2rem 0;"><span style="color:#94a3b8; font-size:10px;">--- PAGE BREAK ---</span></div><p><br></p>');
  };

  return (
    <div className="bg-white border-b border-slate-300 shadow-xs select-none">
      {/* Ribbon Navigation Tabs */}
      <div className="flex items-center gap-1 px-3 pt-1 border-b border-slate-200 bg-slate-50 text-xs font-semibold">
        <button
          onClick={() => setActiveRibbonTab('file')}
          className={`px-3 py-1.5 rounded-t transition-colors font-bold ${
            activeRibbonTab === 'file'
              ? 'bg-blue-600 text-white'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          {t.tabFile}
        </button>

        <button
          onClick={() => setActiveRibbonTab('home')}
          className={`px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'home'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabHome}
        </button>

        <button
          onClick={() => setActiveRibbonTab('insert')}
          className={`px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'insert'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabInsert}
        </button>

        <button
          onClick={() => setActiveRibbonTab('layout')}
          className={`px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'layout'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabLayout}
        </button>

        <button
          onClick={() => setActiveRibbonTab('review')}
          className={`px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'review'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.tabReview}
        </button>

        <button
          onClick={() => setActiveRibbonTab('export')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'export'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.tabExport}</span>
        </button>
      </div>

      {/* Sub-Ribbon Toolbar Panels */}
      <div className="p-2 min-h-[58px] flex items-center gap-3 overflow-x-auto no-scrollbar">
        {/* FILE TAB PANEL */}
        {activeRibbonTab === 'file' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onNewDocFormat('docx')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-blue-50 rounded-md text-slate-700 transition-colors"
              title="Create new Word (.docx) document"
            >
              <FilePlus className="w-4 h-4 text-blue-600" />
              <span>+ New .docx</span>
            </button>

            <button
              onClick={() => onNewDocFormat('rtf')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-purple-50 rounded-md text-slate-700 transition-colors"
              title="Create new Rich Text (.rtf) document"
            >
              <FilePlus className="w-4 h-4 text-purple-600" />
              <span>+ New .rtf</span>
            </button>

            <button
              onClick={onOpenFiles}
              className="flex flex-col items-center gap-1 p-2 hover:bg-slate-100 rounded-md text-slate-700 transition-colors"
              title="Open .docx, .rtf, or other text files"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>{t.openFiles}</span>
            </button>

            <div className="h-8 w-px bg-slate-200 mx-1" />

            {/* Direct Save Downloads */}
            <button
              onClick={() => onExportDirect('docx')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-blue-50 rounded-md text-slate-700 transition-colors"
              title="Download as Microsoft Word (.docx)"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-blue-800">Save .docx</span>
            </button>

            <button
              onClick={() => onExportDirect('rtf')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-purple-50 rounded-md text-slate-700 transition-colors"
              title="Download as Rich Text Format (.rtf) with Unicode support"
            >
              <FileText className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-purple-800">Save .rtf</span>
            </button>

            <button
              onClick={onSave}
              className="flex flex-col items-center gap-1 p-2 hover:bg-slate-100 rounded-md text-slate-700 transition-colors"
              title="Save changes"
            >
              <Save className="w-4 h-4 text-emerald-600" />
              <span>{t.saveNow}</span>
            </button>

            <button
              onClick={onPrint}
              className="flex flex-col items-center gap-1 p-2 hover:bg-slate-100 rounded-md text-slate-700 transition-colors"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>{t.printPreview}</span>
            </button>

            <div className="h-8 w-px bg-slate-200 mx-1" />

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                Sample Files
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onLoadSample('ru')}
                  className="px-2 py-1 text-xs bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 rounded transition-colors font-semibold"
                  title="Open Russian sample in .rtf format"
                >
                  Русский (.rtf)
                </button>
                <button
                  onClick={() => onLoadSample('hy')}
                  className="px-2 py-1 text-xs bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 rounded transition-colors font-armenian font-semibold"
                  title="Open Armenian sample in .docx format"
                >
                  Հայերեն (.docx)
                </button>
                <button
                  onClick={() => onLoadSample('en')}
                  className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors font-semibold"
                  title="Open English sample in .docx format"
                >
                  English (.docx)
                </button>
                <button
                  onClick={() => onLoadSample('fonts')}
                  className="px-2 py-1 text-xs bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded transition-colors font-semibold flex items-center gap-1"
                  title="Open sample document containing Aptos and proprietary fonts to test missing font detection and replacement"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>Aptos/Fonts (.docx)</span>
                </button>
                <button
                  onClick={() => onLoadSample('proofread')}
                  className="px-2 py-1 text-xs bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100 rounded transition-colors font-semibold flex items-center gap-1"
                  title="Open tri-lingual proofreading test document to test local AI proofreading for EN, RU, and ARM"
                >
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>Proofread Sample (EN·RU·ARM)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* HOME TAB PANEL */}
        {activeRibbonTab === 'home' && (
          <div className="flex items-center gap-3">
            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
              <button
                onClick={() => onCommand('undo')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.undo}
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('redo')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.redo}
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>

            {/* Font Family, Google Fonts Picker & Size */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
              <select
                value={selectedFont}
                onChange={(e) => handleFontChange(e.target.value)}
                className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 max-w-[155px] font-medium"
                title={t.fontFamily}
              >
                {recentFonts.length > 0 && (
                  <optgroup label="🕒 Recent & Custom">
                    {recentFonts.map((f) => (
                      <option key={`recent-${f}`} value={f}>
                        {f}
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="🇦🇲 Armenian Fonts (Հայերեն)">
                  <option value="Noto Sans Armenian">Noto Sans Armenian</option>
                  <option value="Noto Serif Armenian">Noto Serif Armenian</option>
                  <option value="Sylfaen">Sylfaen (Universal)</option>
                  <option value="Arev">Arev Armenian</option>
                  <option value="Arial AMU">Arial AMU</option>
                </optgroup>

                <optgroup label="✨ Google Fonts - Sans Serif">
                  <option value="Sora">Sora (Lithora Font)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Inter">Inter</option>
                  <option value="Outfit">Outfit</option>
                  <option value="Manrope">Manrope</option>
                  <option value="Lato">Lato</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Nunito">Nunito</option>
                  <option value="Raleway">Raleway</option>
                  <option value="Rubik">Rubik</option>
                  <option value="Oswald">Oswald</option>
                  <option value="Ubuntu">Ubuntu</option>
                  <option value="Fira Sans">Fira Sans</option>
                </optgroup>

                <optgroup label="✨ Google Fonts - Serif">
                  <option value="Playfair Display">Playfair Display</option>
                  <option value="Merriweather">Merriweather</option>
                  <option value="Lora">Lora</option>
                  <option value="PT Serif">PT Serif</option>
                  <option value="EB Garamond">EB Garamond</option>
                  <option value="Cormorant Garamond">Cormorant Garamond</option>
                  <option value="Cinzel">Cinzel</option>
                  <option value="Libre Baskerville">Libre Baskerville</option>
                  <option value="Spectral">Spectral</option>
                </optgroup>

                <optgroup label="✨ Google Fonts - Monospace">
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Roboto Mono">Roboto Mono</option>
                  <option value="Fira Code">Fira Code</option>
                  <option value="Source Code Pro">Source Code Pro</option>
                  <option value="Space Mono">Space Mono</option>
                </optgroup>

                <optgroup label="✨ Google Fonts - Display & Script">
                  <option value="Caveat">Caveat (Handwriting)</option>
                  <option value="Comfortaa">Comfortaa (Rounded)</option>
                  <option value="Pacifico">Pacifico</option>
                  <option value="Dancing Script">Dancing Script</option>
                  <option value="Lobster">Lobster</option>
                  <option value="Bebas Neue">Bebas Neue</option>
                </optgroup>

                <optgroup label="🖥️ Classic Office Fonts">
                  <option value="Calibri">Calibri</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Garamond">Garamond</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Verdana">Verdana</option>
                </optgroup>

                <option value="__browse_google_fonts__" className="font-bold text-blue-600 bg-blue-50">
                  ✨ + Browse 100+ Google Fonts...
                </option>
              </select>

              {/* Direct Google Fonts Dialog button */}
              <button
                type="button"
                onClick={() => setIsGoogleFontsModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 text-xs font-semibold rounded border border-blue-200/80 transition-all shadow-2xs hover:shadow-xs shrink-0"
                title="Browse & Search 100+ Google Fonts"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                <span className="hidden sm:inline">Fonts</span>
              </button>

              {missingFontsCount > 0 && onOpenMissingFontsModal && (
                <button
                  type="button"
                  onClick={onOpenMissingFontsModal}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded border border-amber-300 transition-all shadow-2xs shrink-0"
                  title={`${missingFontsCount} missing fonts in this document. Click to review replacement suggestions.`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden md:inline">{missingFontsCount} Missing</span>
                </button>
              )}

              <select
                value={selectedFontSize}
                onChange={(e) => handleFontSizeChange(e.target.value)}
                className="text-xs border border-slate-300 rounded px-1.5 py-1 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 w-16"
                title={t.fontSize}
              >
                {fontSizes.map((s) => (
                  <option key={s.label} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Bold, Italic, Underline, Strike */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
              <button
                onClick={() => onCommand('bold')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors font-bold"
                title={t.bold}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('italic')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors italic"
                title={t.italic}
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('underline')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors underline"
                title={t.underline}
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('strikeThrough')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.strikethrough}
              >
                <Strikethrough className="w-4 h-4" />
              </button>
            </div>

            {/* Subscript & Superscript */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
              <button
                onClick={() => onCommand('subscript')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.subscript}
              >
                <Subscript className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('superscript')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.superscript}
              >
                <Superscript className="w-4 h-4" />
              </button>
            </div>

            {/* Color Pickers */}
            <div className="flex items-center gap-1 pr-2 border-r border-slate-200">
              <div className="flex items-center gap-1" title={t.textColor}>
                <Type className="w-3.5 h-3.5 text-slate-600" />
                <input
                  type="color"
                  value={fontColor}
                  onChange={(e) => {
                    setFontColor(e.target.value);
                    onCommand('foreColor', e.target.value);
                  }}
                  className="w-5 h-5 rounded cursor-pointer border border-slate-300 p-0"
                />
              </div>

              <div className="flex items-center gap-1" title={t.highlightColor}>
                <Palette className="w-3.5 h-3.5 text-amber-500" />
                <input
                  type="color"
                  value={hiliteColor}
                  onChange={(e) => {
                    setHiliteColor(e.target.value);
                    onCommand('hiliteColor', e.target.value);
                  }}
                  className="w-5 h-5 rounded cursor-pointer border border-slate-300 p-0"
                />
              </div>
            </div>

            {/* Alignments */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
              <button
                onClick={() => onCommand('justifyLeft')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.alignLeft}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('justifyCenter')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.alignCenter}
              >
                <AlignCenter className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('justifyRight')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.alignRight}
              >
                <AlignRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('justifyFull')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.alignJustify}
              >
                <AlignJustify className="w-4 h-4" />
              </button>
            </div>

            {/* Lists & Indents */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-slate-200">
              <button
                onClick={() => onCommand('insertUnorderedList')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.bulletList}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('insertOrderedList')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.numberedList}
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('outdent')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.outdent}
              >
                <Outdent className="w-4 h-4" />
              </button>
              <button
                onClick={() => onCommand('indent')}
                className="p-1.5 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t.indent}
              >
                <Indent className="w-4 h-4" />
              </button>
            </div>

            {/* Heading Styles */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCommand('formatBlock', '<p>')}
                className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded transition-colors font-medium"
              >
                {t.headingNormal}
              </button>
              <button
                onClick={() => onCommand('formatBlock', '<h1>')}
                className="px-2 py-1 text-xs font-bold text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                H1
              </button>
              <button
                onClick={() => onCommand('formatBlock', '<h2>')}
                className="px-2 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100 rounded transition-colors"
              >
                H2
              </button>
              <button
                onClick={() => onCommand('formatBlock', '<h3>')}
                className="px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
              >
                H3
              </button>
              <button
                onClick={() => onCommand('formatBlock', '<blockquote>')}
                className="px-2 py-1 text-xs italic text-slate-600 hover:bg-slate-100 rounded transition-colors"
              >
                Quote
              </button>
            </div>
          </div>
        )}

        {/* INSERT TAB PANEL */}
        {activeRibbonTab === 'insert' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={onOpenTableModal}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-md transition-colors"
            >
              <Table className="w-4 h-4 text-blue-600" />
              <span>{t.insertTable}</span>
            </button>

            <button
              onClick={onOpenImageModal}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-md transition-colors"
            >
              <Image className="w-4 h-4 text-emerald-600" />
              <span>{t.insertImage}</span>
            </button>

            <button
              onClick={() => onCommand('insertHorizontalRule')}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-md transition-colors"
            >
              <Minus className="w-4 h-4 text-slate-500" />
              <span>{t.horizontalLine}</span>
            </button>

            <button
              onClick={insertPageBreak}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-md transition-colors"
            >
              <FileText className="w-4 h-4 text-purple-600" />
              <span>{t.pageBreak}</span>
            </button>

            <button
              onClick={insertCurrentDateTime}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-slate-700 rounded-md transition-colors"
            >
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>{t.dateTime}</span>
            </button>

            <button
              onClick={onOpenSymbolsModal}
              className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-blue-50 text-blue-700 rounded-md border border-blue-200 transition-colors font-medium"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>{t.symbol} (Հայ / Рус)</span>
            </button>
          </div>
        )}

        {/* LAYOUT TAB PANEL */}
        {activeRibbonTab === 'layout' && (
          <div className="flex items-center gap-3 text-xs">
            {/* Margins */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-slate-500 font-medium">{t.pageMargins}:</span>
              <button
                onClick={() => onUpdatePageSettings({ margins: 'normal' })}
                className={`px-2.5 py-1 rounded transition-colors ${
                  pageSettings.margins === 'normal'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.marginsNormal}
              </button>
              <button
                onClick={() => onUpdatePageSettings({ margins: 'narrow' })}
                className={`px-2.5 py-1 rounded transition-colors ${
                  pageSettings.margins === 'narrow'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.marginsNarrow}
              </button>
              <button
                onClick={() => onUpdatePageSettings({ margins: 'wide' })}
                className={`px-2.5 py-1 rounded transition-colors ${
                  pageSettings.margins === 'wide'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.marginsWide}
              </button>
            </div>

            {/* Orientation */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-slate-500 font-medium">{t.orientation}:</span>
              <button
                onClick={() => onUpdatePageSettings({ orientation: 'portrait' })}
                className={`px-2 py-1 rounded transition-colors ${
                  pageSettings.orientation === 'portrait'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.portrait}
              </button>
              <button
                onClick={() => onUpdatePageSettings({ orientation: 'landscape' })}
                className={`px-2 py-1 rounded transition-colors ${
                  pageSettings.orientation === 'landscape'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.landscape}
              </button>
            </div>

            {/* Paper Size */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-slate-500 font-medium">{t.paperSize}:</span>
              <select
                value={pageSettings.size}
                onChange={(e) => onUpdatePageSettings({ size: e.target.value as any })}
                className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-800"
              >
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="Letter">US Letter (8.5 × 11 in)</option>
                <option value="Legal">US Legal (8.5 × 14 in)</option>
              </select>
            </div>

            {/* Multi-Columns Selector */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-slate-500 font-medium">Columns:</span>
              <button
                type="button"
                onClick={() => onCommand('insertHTML', '<div class="doc-columns" style="column-count: 2; column-gap: 24px; -webkit-column-count: 2;"><p>Left column text...</p><p>Right column text...</p></div><p><br></p>')}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 transition-colors"
                title="Format into 2 Columns"
              >
                <Columns2 className="w-3.5 h-3.5 text-blue-600" />
                <span>2 Col</span>
              </button>
              <button
                type="button"
                onClick={() => onCommand('insertHTML', '<div class="doc-columns" style="column-count: 3; column-gap: 20px; -webkit-column-count: 3;"><p>Col 1...</p><p>Col 2...</p><p>Col 3...</p></div><p><br></p>')}
                className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 transition-colors"
                title="Format into 3 Columns"
              >
                <Columns3 className="w-3.5 h-3.5 text-purple-600" />
                <span>3 Col</span>
              </button>
              <button
                type="button"
                onClick={() => onCommand('insertHTML', '<div class="column-break" style="break-after: column; -webkit-column-break-after: always;"></div>')}
                className="px-1.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                title="Insert Column Break"
              >
                Break
              </button>
            </div>

            {/* Line Spacing */}
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
              <span className="text-slate-500 font-medium">Line Spacing:</span>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  onCommand('insertHTML', `<div style="line-height: ${val};">${window.getSelection()?.toString() || 'Selected text line spacing'}</div>`);
                }}
                defaultValue="1.4"
                className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-800"
              >
                <option value="1.0">1.0 Single</option>
                <option value="1.15">1.15 Normal</option>
                <option value="1.5">1.5 Lines</option>
                <option value="2.0">2.0 Double</option>
              </select>
            </div>

            {/* Toggle Ruler */}
            <button
              onClick={() => onUpdatePageSettings({ showRuler: !pageSettings.showRuler })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                pageSettings.showRuler
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{t.toggleRuler}</span>
            </button>
          </div>
        )}

        {/* REVIEW TAB PANEL */}
        {activeRibbonTab === 'review' && (
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={onToggleFindReplace}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isFindReplaceOpen
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>{t.findReplace}</span>
            </button>

            <button
              onClick={onToggleOutline}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isOutlineOpen
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{t.documentOutline}</span>
            </button>

            <button
              onClick={onToggleVirtualKeyboard}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isVirtualKeyboardOpen
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'hover:bg-slate-100 text-slate-700'
              }`}
            >
              <Type className="w-4 h-4 text-purple-600" />
              <span>{t.armenianKeyboard} / RU</span>
            </button>

            {onFixEncoding && (
              <button
                onClick={onFixEncoding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-amber-50 text-amber-800 border border-amber-300 bg-amber-50/50 transition-colors font-medium"
                title="Decode Windows-1251 Cyrillic mojibake (ÂÈÇ... -> ВИЗОВАЯ...)"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Fix Russian Encoding (CP1251)</span>
              </button>
            )}

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* AI Proofreader in Review Tab */}
            {onProofread && (
              <button
                onClick={onProofread}
                disabled={isProofreading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-semibold transition-colors"
                title="Proofread active document locally for English, Russian, and Armenian"
              >
                <Sparkles className={`w-4 h-4 text-purple-700 ${isProofreading ? 'animate-spin' : ''}`} />
                <span>Local AI Proofread (EN·RU·ARM)</span>
                {proofreadCount !== undefined && proofreadCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] bg-purple-600 text-white font-bold rounded-full">
                    {proofreadCount}
                  </span>
                )}
              </button>
            )}

            {proofreadCount !== undefined && proofreadCount > 0 && onAcceptAllProofread && (
              <button
                onClick={onAcceptAllProofread}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
              >
                <span>Accept All ({proofreadCount})</span>
              </button>
            )}

            {proofreadCount !== undefined && proofreadCount > 0 && onClearProofread && (
              <button
                onClick={onClearProofread}
                className="px-2 py-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <span>Clear Highlights</span>
              </button>
            )}
          </div>
        )}

        {/* EXPORT TAB PANEL */}
        {activeRibbonTab === 'export' && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onExportDirect('docx')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 font-semibold rounded-md shadow-xs transition-colors"
              title="Download Microsoft Word (.docx)"
            >
              <FileText className="w-4 h-4" />
              <span>Download .docx</span>
            </button>

            <button
              onClick={() => onExportDirect('rtf')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white hover:bg-purple-700 font-semibold rounded-md shadow-xs transition-colors"
              title="Download Rich Text Format (.rtf)"
            >
              <FileText className="w-4 h-4" />
              <span>Download .rtf</span>
            </button>

            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 font-semibold rounded-md shadow-xs transition-colors"
              title="Print or Save as PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={() => onExportDirect('html')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
              title="Download Web Page (.html)"
            >
              <Code className="w-4 h-4 text-amber-600" />
              <span>.html</span>
            </button>

            <button
              onClick={() => onExportDirect('txt')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
              title="Download Plain Text (.txt)"
            >
              <FileCode className="w-4 h-4 text-slate-600" />
              <span>.txt</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.exportModalTitle}...</span>
            </button>
          </div>
        )}
      </div>

      {/* Google Fonts Library Modal */}
      <GoogleFontsModal
        isOpen={isGoogleFontsModalOpen}
        onClose={() => setIsGoogleFontsModalOpen(false)}
        currentFont={selectedFont}
        onSelectFont={handleSelectFromModal}
        currentLang={currentLang}
      />
    </div>
  );
};
