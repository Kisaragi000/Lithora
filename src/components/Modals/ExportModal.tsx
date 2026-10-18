import React, { useState } from 'react';
import { X, Download, FileText, Code, FileCode, Printer, CheckCircle2 } from 'lucide-react';
import { Language, DocumentFormat } from '../../types/document';
import { translations } from '../../i18n/translations';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  onExport: (format: DocumentFormat) => Promise<void>;
  onPrintPdf: () => void;
  currentLang: Language;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  onExport,
  onPrintPdf,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [selectedFormat, setSelectedFormat] = useState<DocumentFormat>('docx');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedSuccess, setExportedSuccess] = useState(false);

  if (!isOpen) return null;

  const exportOptions: Array<{
    id: DocumentFormat | 'pdf';
    title: string;
    ext: string;
    desc: string;
    badge: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'docx',
      title: t.exportAsDocx,
      ext: '.docx',
      desc: t.docxDesc,
      badge: 'DOCX',
      icon: <FileText className="w-5 h-5 text-blue-600" />,
    },
    {
      id: 'rtf',
      title: t.exportAsRtf,
      ext: '.rtf',
      desc: t.rtfDesc,
      badge: 'RTF',
      icon: <FileText className="w-5 h-5 text-purple-600" />,
    },
    {
      id: 'pdf',
      title: t.exportAsPdf,
      ext: '.pdf',
      desc: t.pdfDesc,
      badge: 'PDF',
      icon: <Printer className="w-5 h-5 text-red-600" />,
    },
    {
      id: 'html',
      title: t.exportAsHtml,
      ext: '.html',
      desc: t.htmlDesc,
      badge: 'HTML',
      icon: <Code className="w-5 h-5 text-amber-600" />,
    },
    {
      id: 'txt',
      title: t.exportAsTxt,
      ext: '.txt',
      desc: t.txtDesc,
      badge: 'TXT',
      icon: <FileCode className="w-5 h-5 text-slate-600" />,
    },
    {
      id: 'md',
      title: t.exportAsMd,
      ext: '.md',
      desc: 'Standard Markdown representation for docs and wikis',
      badge: 'MD',
      icon: <FileCode className="w-5 h-5 text-teal-600" />,
    },
  ];

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      if ((selectedFormat as any) === 'pdf') {
        onPrintPdf();
        onClose();
        return;
      }
      await onExport(selectedFormat);
      setExportedSuccess(true);
      setTimeout(() => {
        setExportedSuccess(false);
        onClose();
      }, 900);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">{t.exportModalTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-500">
            Export <span className="font-semibold text-slate-800">{documentTitle}</span> into your desired format:
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {exportOptions.map((opt) => {
              const isSelected = selectedFormat === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedFormat(opt.id as any)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <span className="text-xs font-bold text-slate-800">{opt.title}</span>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {opt.ext}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{opt.desc}</p>
                </div>
              );
            })}
          </div>

          {exportedSuccess && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 text-emerald-800 rounded-md text-xs font-medium border border-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Export downloaded successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-[11px] text-slate-400">
              Unicode preservation active (Armenian &amp; Cyrillic)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Exporting...' : t.downloadFile}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
