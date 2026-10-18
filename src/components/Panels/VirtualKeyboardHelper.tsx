import React, { useState } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface VirtualKeyboardHelperProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertChar: (char: string) => void;
  currentLang: Language;
}

export const VirtualKeyboardHelper: React.FC<VirtualKeyboardHelperProps> = ({
  isOpen,
  onClose,
  onInsertChar,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [selectedScript, setSelectedScript] = useState<'hy' | 'ru'>('hy');
  const [isUppercase, setIsUppercase] = useState(false);

  if (!isOpen) return null;

  const armenianRowsLower = [
    ['ք', 'ո', 'ե', 'ռ', 'տ', 'ը', 'ւ', 'ի', 'օ', 'պ', 'խ', 'ծ'],
    ['ա', 'ս', 'դ', 'ֆ', 'գ', 'հ', 'յ', 'կ', 'լ', 'թ', 'փ'],
    ['զ', 'ղ', 'ց', 'վ', 'բ', 'ն', 'մ', 'շ', 'ճ', 'չ', 'ջ', 'ռ'],
    ['ժ', 'ի', 'լ', 'խ', 'ծ', 'կ', 'և'],
  ];

  const armenianRowsUpper = [
    ['Ք', 'Ո', 'Ե', 'Ռ', 'Տ', 'Ը', 'Ւ', 'Ի', 'Օ', 'Պ', 'Խ', 'Ծ'],
    ['Ա', 'Ս', 'Դ', 'Ֆ', 'Գ', 'Հ', 'Յ', 'Կ', 'Լ', 'Թ', 'Փ'],
    ['Զ', 'Ղ', 'Ց', 'Վ', 'Բ', 'Ն', 'Մ', 'Շ', 'Ճ', 'Չ', 'Ջ', 'Ռ'],
    ['Ժ', 'Ի', 'Լ', 'Խ', 'Ծ', 'Կ', 'և'],
  ];

  const armenianPunctuation = ['։', '՝', '՛', '՞', '՜', '՚', '֊', '«', '»', '֏'];

  const russianRowsLower = [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
  ];

  const russianRowsUpper = [
    ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
    ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Լ', 'Д', 'Ж', 'Э'],
    ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'Ё'],
  ];

  const currentRows =
    selectedScript === 'hy'
      ? isUppercase
        ? armenianRowsUpper
        : armenianRowsLower
      : isUppercase
      ? russianRowsUpper
      : russianRowsLower;

  return (
    <div className="bg-slate-100 border-b border-slate-300 p-2 text-xs shadow-inner no-print select-none">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="flex items-center gap-2">
          <Keyboard className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-bold text-slate-700">Quick Keyboard Assist:</span>
          <div className="flex items-center bg-white rounded border border-slate-300 p-0.5">
            <button
              onClick={() => setSelectedScript('hy')}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedScript === 'hy' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600'
              }`}
            >
              Հայերեն
            </button>
            <button
              onClick={() => setSelectedScript('ru')}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedScript === 'ru' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600'
              }`}
            >
              Русский
            </button>
          </div>
          <button
            onClick={() => setIsUppercase(!isUppercase)}
            className={`px-2 py-0.5 rounded border transition-colors ${
              isUppercase
                ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold'
                : 'bg-white border-slate-300 text-slate-600'
            }`}
          >
            Caps {isUppercase ? 'ON' : 'OFF'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-200"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Punctuation Row */}
      {selectedScript === 'hy' && (
        <div className="flex items-center gap-1 mb-1.5 px-1 flex-wrap">
          <span className="text-[10px] text-slate-500 font-semibold mr-1">Նշաններ:</span>
          {armenianPunctuation.map((p, i) => (
            <button
              key={i}
              onClick={() => onInsertChar(p)}
              className="px-2 py-1 bg-white hover:bg-blue-50 hover:border-blue-500 border border-slate-300 rounded text-slate-800 font-bold transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Keyboard Grid */}
      <div className="space-y-1">
        {currentRows.map((row, rIdx) => (
          <div key={rIdx} className="flex justify-center gap-1">
            {row.map((char, cIdx) => (
              <button
                key={`${rIdx}-${cIdx}`}
                onClick={() => onInsertChar(char)}
                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white hover:bg-blue-50 hover:border-blue-400 border border-slate-300 rounded font-semibold text-slate-800 shadow-xs active:bg-blue-600 active:text-white transition-colors"
              >
                {char}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
