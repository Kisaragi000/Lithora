import React, { useState } from 'react';
import { X, Image, Upload, Check } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface InsertImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (src: string) => void;
  currentLang: Language;
}

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [imageUrl, setImageUrl] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPreview(result);
        setImageUrl(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlChange = (url: string) => {
    setImageUrl(url);
    setPreview(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (imageUrl.trim()) {
      onInsertImage(imageUrl.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">{t.insertImage}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t.imageUrlPrompt}
            </label>
            <input
              type="text"
              placeholder="https://example.com/image.png"
              value={imageUrl.startsWith('data:') ? 'Local file selected' : imageUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={imageUrl.startsWith('data:')}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="relative">
            <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg p-4 text-center cursor-pointer bg-slate-50 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
              <span className="text-xs font-medium text-slate-600 block">
                Click to browse local image file
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">PNG, JPG, SVG, WebP</span>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="max-h-40 overflow-hidden rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center p-2">
              <img
                src={preview}
                alt="Preview"
                className="max-h-36 max-w-full object-contain rounded"
                onError={() => setPreview(null)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={!imageUrl.trim()}
              className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t.insertButton}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
