import React from 'react';
import {
  FileText,
  CloudCheck,
  CloudUpload,
  CloudOff,
  Download,
  Printer,
  Save,
  FolderOpen,
  Globe,
  Columns,
  Square,
  ArrowDownToLine,
} from 'lucide-react';
import { Language, CloudSyncStatus, DocumentFormat } from '../types/document';
import { translations } from '../i18n/translations';

interface HeaderProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  activeDocTitle: string;
  onTitleChange: (newTitle: string) => void;
  cloudSyncStatus: CloudSyncStatus;
  lastSaved: number;
  activeFormat?: DocumentFormat;
  onSave: () => void;
  onDirectDownload?: () => void;
  onOpenFiles: () => void;
  onExportClick: () => void;
  onPrint: () => void;
  isSplitView: boolean;
  onToggleSplitView: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentLang,
  onLanguageChange,
  activeDocTitle,
  onTitleChange,
  cloudSyncStatus,
  lastSaved,
  activeFormat = 'docx',
  onSave,
  onDirectDownload,
  onOpenFiles,
  onExportClick,
  onPrint,
  isSplitView,
  onToggleSplitView,
}) => {
  const t = translations[currentLang];

  const getSyncIcon = () => {
    switch (cloudSyncStatus) {
      case 'synced':
        return <CloudCheck className="w-4 h-4 text-emerald-600" />;
      case 'syncing':
        return <CloudUpload className="w-4 h-4 text-blue-600 animate-pulse" />;
      case 'modified':
        return <CloudUpload className="w-4 h-4 text-amber-500" />;
      default:
        return <CloudOff className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSyncLabel = () => {
    switch (cloudSyncStatus) {
      case 'synced':
        return t.synced;
      case 'syncing':
        return t.syncing;
      case 'modified':
        return t.modified;
      default:
        return t.offline;
    }
  };

  const formatLastSaved = (ts: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-2.5 bg-white border-b border-slate-200 select-none">
      {/* Zone 1: Brand & Document Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <span className="text-base font-bold tracking-tight text-slate-900 leading-none">
              WordCraft
            </span>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-200 hidden sm:block" />

        {/* Format Badge */}
        <span
          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border leading-none shrink-0 ${
            activeFormat === 'rtf'
              ? 'bg-purple-100 text-purple-800 border-purple-200'
              : 'bg-blue-100 text-blue-800 border-blue-200'
          }`}
        >
          .{activeFormat}
        </span>

        {/* Inline editable document title */}
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={activeDocTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            className="px-2 py-1 text-sm font-semibold text-slate-800 bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded border border-transparent hover:border-slate-300 focus:border-blue-500 transition-colors truncate max-w-[180px] sm:max-w-[280px]"
            title="Click to rename document"
          />
        </div>

        {/* Cloud Sync Status Indicator */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-slate-500 bg-slate-50 border border-slate-200/60 shrink-0"
          title={`${getSyncLabel()} ${lastSaved ? `· ${formatLastSaved(lastSaved)}` : ''}`}
        >
          {getSyncIcon()}
          <span className="font-medium text-slate-600">{getSyncLabel()}</span>
        </div>
      </div>

      {/* Zone 2: Document actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onOpenFiles}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          title="Open .docx, .rtf, or other documents"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">{t.openFiles}</span>
        </button>

        {/* Direct Download in active format (.rtf or .docx) */}
        {onDirectDownload && (
          <button
            onClick={onDirectDownload}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
              activeFormat === 'rtf'
                ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
            }`}
            title={`Download as .${activeFormat}`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save .{activeFormat}</span>
          </button>
        )}

        <button
          onClick={onSave}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          title="Save snapshot to cloud"
        >
          <Save className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">{t.saveNow}</span>
        </button>

        <button
          onClick={onToggleSplitView}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            isSplitView
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
          }`}
          title={isSplitView ? t.singleView : t.splitView}
        >
          {isSplitView ? <Square className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">{isSplitView ? t.singleView : t.splitView}</span>
        </button>

        <button
          onClick={onPrint}
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          title={t.printPreview}
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* Primary Export CTA */}
        <button
          onClick={onExportClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-md shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.tabExport}</span>
        </button>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        {/* Tri-Lingual Language Switcher */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <Globe className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5 shrink-0" />
          <button
            onClick={() => onLanguageChange('en')}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              currentLang === 'en' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="English"
          >
            EN
          </button>
          <button
            onClick={() => onLanguageChange('ru')}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              currentLang === 'ru' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Русский"
          >
            RU
          </button>
          <button
            onClick={() => onLanguageChange('hy')}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              currentLang === 'hy' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Հայերեն"
          >
            ՀԱՅ
          </button>
        </div>
      </div>
    </header>
  );
};
