import React from 'react';
import { X, Clock, RotateCcw, Trash2, CloudCheck } from 'lucide-react';
import { Language, CloudSnapshot } from '../../types/document';
import { translations } from '../../i18n/translations';

interface CloudRevisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: CloudSnapshot[];
  onRestore: (snapshot: CloudSnapshot) => void;
  onDelete: (id: string) => void;
  currentLang: Language;
}

export const CloudRevisionDrawer: React.FC<CloudRevisionDrawerProps> = ({
  isOpen,
  onClose,
  snapshots,
  onRestore,
  onDelete,
  currentLang,
}) => {
  const t = translations[currentLang];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 no-print">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold text-slate-800">{t.revisionHistory}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 overflow-y-auto flex-1 space-y-2.5">
        {snapshots.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            <CloudCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p>{t.noSnapshotsYet}</p>
          </div>
        ) : (
          snapshots.map((snap) => {
            const date = new Date(snap.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = date.toLocaleDateString();

            return (
              <div
                key={snap.id}
                className="p-3 rounded-lg border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-white transition-all space-y-2"
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 truncate max-w-[180px]">
                      {snap.documentTitle}
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      {dateStr} &middot; {timeStr}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold uppercase">
                    {snap.format}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>{snap.wordCount} words</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onRestore(snap)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title={t.restoreSnapshot}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => onDelete(snap.id)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete snapshot"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500">
        Automatic cloud autosave continuously preserves your document versions.
      </div>
    </div>
  );
};
