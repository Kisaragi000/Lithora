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
  Cloud,
  CloudUpload,
  CloudCheck,
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
} from 'lucide-react';
import { Language, PageSettings, CloudSnapshot, DocumentFormat } from '../../types/document';
import { translations } from '../../i18n/translations';

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
  onLoadSample: (type: 'en' | 'hy' | 'ru') => void;
  onSave: () => void;
  onPrint: () => void;
  // Cloud Sync
  cloudSnapshots: CloudSnapshot[];
  onSaveSnapshot: (label: string) => void;
  onRestoreSnapshot: (snapshot: CloudSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onExportCloudBackup: () => void;
  onImportCloudBackup: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
  // Review & Search
  isFindReplaceOpen: boolean;
  onToggleFindReplace: () => void;
  isOutlineOpen: boolean;
  onToggleOutline: () => void;
  isVirtualKeyboardOpen: boolean;
  onToggleVirtualKeyboard: () => void;
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
  cloudSnapshots,
  onSaveSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onExportCloudBackup,
  onImportCloudBackup,
  onManualSync,
  isSyncing,
  isFindReplaceOpen,
  onToggleFindReplace,
  isOutlineOpen,
  onToggleOutline,
  isVirtualKeyboardOpen,
  onToggleVirtualKeyboard,
}) => {
  const t = translations[currentLang];
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'insert' | 'layout' | 'review' | 'cloud' | 'file' | 'export'>('home');
  const [snapshotNameInput, setSnapshotNameInput] = useState('');
  const [fontColor, setFontColor] = useState('#0f172a');
  const [hiliteColor, setHiliteColor] = useState('#fef08a');
  const [selectedFont, setSelectedFont] = useState('Calibri');
  const [selectedFontSize, setSelectedFontSize] = useState('3');

  const fonts = [
    { label: 'Calibri', value: 'Calibri, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Garamond', value: 'Garamond, serif' },
    { label: 'Sylfaen (Armenian)', value: 'Sylfaen, serif' },
    { label: 'Noto Sans Armenian (Հայերեն)', value: '"Noto Sans Armenian", sans-serif' },
    { label: 'Arial AMU (Հայերեն)', value: '"Arial AMU", sans-serif' },
    { label: 'Courier New', value: '"Courier New", monospace' },
  ];

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
    setSelectedFont(val);
    onCommand('fontName', val);
  };

  const handleFontSizeChange = (val: string) => {
    setSelectedFontSize(val);
    onCommand('fontSize', val);
  };

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSnapshot(snapshotNameInput.trim() || `Snapshot ${new Date().toLocaleTimeString()}`);
    setSnapshotNameInput('');
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
          onClick={() => setActiveRibbonTab('cloud')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-t transition-colors ${
            activeRibbonTab === 'cloud'
              ? 'bg-white text-blue-700 border-t border-x border-slate-300 -mb-px'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>{t.tabCloud}</span>
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
              title="Save snapshot to cloud"
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

            {/* Font Family & Size */}
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
              <select
                value={selectedFont}
                onChange={(e) => handleFontChange(e.target.value)}
                className="text-xs border border-slate-300 rounded px-2 py-1 bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 max-w-[140px]"
                title={t.fontFamily}
              >
                {fonts.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

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
          </div>
        )}

        {/* CLOUD & SYNC TAB PANEL */}
        {activeRibbonTab === 'cloud' && (
          <div className="flex items-center gap-4 text-xs w-full justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs transition-colors shrink-0"
              >
                {isSyncing ? (
                  <CloudUpload className="w-4 h-4 animate-bounce" />
                ) : (
                  <CloudCheck className="w-4 h-4" />
                )}
                <span>{isSyncing ? t.syncing : t.syncNow}</span>
              </button>

              {/* Create Snapshot Form */}
              <form onSubmit={handleCreateSnapshot} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={t.snapshotName}
                  value={snapshotNameInput}
                  onChange={(e) => setSnapshotNameInput(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 w-48 sm:w-60"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors"
                >
                  {t.createSnapshot}
                </button>
              </form>
            </div>

            {/* Cloud Backup Export/Import */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onExportCloudBackup}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                title={t.exportCloudBackup}
              >
                Backup (.json)
              </button>
              <button
                onClick={onImportCloudBackup}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                title={t.importCloudBackup}
              >
                Restore Backup
              </button>
            </div>
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
    </div>
  );
};
