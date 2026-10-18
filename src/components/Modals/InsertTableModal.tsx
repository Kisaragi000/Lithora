import React, { useState } from 'react';
import { X, Table, Check } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface InsertTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (rows: number, cols: number) => void;
  currentLang: Language;
}

export const InsertTableModal: React.FC<InsertTableModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hoverRows, setHoverRows] = useState(0);
  const [hoverCols, setHoverCols] = useState(0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInsert(Math.max(1, rows), Math.max(1, cols));
    onClose();
  };

  const handleGridClick = (r: number, c: number) => {
    onInsert(r, c);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">{t.insertTable}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Visual Grid Picker */}
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-2">
              {hoverRows > 0 && hoverCols > 0
                ? `${hoverRows} × ${hoverCols} ${t.table}`
                : `${rows} × ${cols} ${t.table}`}
            </span>
            <div
              className="grid grid-cols-6 gap-1 p-2 bg-slate-50 border border-slate-200 rounded-lg w-fit mx-auto cursor-pointer"
              onMouseLeave={() => {
                setHoverRows(0);
                setHoverCols(0);
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((r) =>
                [1, 2, 3, 4, 5, 6].map((c) => {
                  const isHovered =
                    hoverRows > 0 && hoverCols > 0
                      ? r <= hoverRows && c <= hoverCols
                      : r <= rows && c <= cols;
                  return (
                    <div
                      key={`${r}-${c}`}
                      onMouseEnter={() => {
                        setHoverRows(r);
                        setHoverCols(c);
                      }}
                      onClick={() => handleGridClick(r, c)}
                      className={`w-6 h-6 rounded-xs border transition-colors ${
                        isHovered
                          ? 'bg-blue-500 border-blue-600'
                          : 'bg-white border-slate-300 hover:border-blue-400'
                      }`}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Numeric custom inputs */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t.tableRows}</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={rows}
                  onChange={(e) => setRows(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t.tableCols}</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={cols}
                  onChange={(e) => setCols(parseInt(e.target.value) || 1)}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t.insertButton}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
