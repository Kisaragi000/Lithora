import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Language } from '../../types/document';
import { translations } from '../../i18n/translations';

interface SpecialSymbolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSymbol: (symbol: string) => void;
  currentLang: Language;
}

export const SpecialSymbolsModal: React.FC<SpecialSymbolsModalProps> = ({
  isOpen,
  onClose,
  onInsertSymbol,
  currentLang,
}) => {
  const t = translations[currentLang];
  const [activeTab, setActiveTab] = useState<'armenian' | 'russian' | 'general'>('armenian');

  if (!isOpen) return null;

  const armenianPunctuation = [
    { char: '։', name: 'Վերջակետ (Full stop)' },
    { char: '՝', name: 'Բութ (Comma/Pause)' },
    { char: '՛', name: 'Շեշտ (Emphasis)' },
    { char: '՞', name: 'Հարցական (Question)' },
    { char: '՜', name: 'Բացականչական (Exclamation)' },
    { char: '՚', name: 'Ապաթարց (Apostrophe)' },
    { char: '֊', name: 'Միության գծիկ (Hyphen)' },
    { char: '«', name: 'Ձախ չակերտ (Open Quote)' },
    { char: '»', name: 'Աջ չակերտ (Close Quote)' },
    { char: '֏', name: 'ՀՀ Դրամ (Dram Currency)' },
    { char: 'և', name: 'Եվ (Ligature Ev)' },
  ];

  const armenianAlphabet = [
    'Ա', 'ա', 'Բ', 'բ', 'Գ', 'գ', 'Դ', 'դ', 'Ե', 'ե', 'Զ', 'զ',
    'Է', 'է', 'Ը', 'ը', 'Թ', 'թ', 'Ժ', 'ժ', 'Ի', 'ի', 'Լ', 'լ',
    'Խ', 'խ', 'Ծ', 'ծ', 'Կ', 'կ', 'Հ', 'հ', 'Ձ', 'ձ', 'Ղ', 'ղ',
    'Ճ', 'ճ', 'Մ', 'մ', 'Յ', 'յ', 'Ն', 'ն', 'Շ', 'շ', 'Ո', 'ո',
    'Չ', 'չ', 'Պ', 'պ', 'Ջ', 'ջ', 'Ռ', 'ռ', 'Ս', 'ս', 'Վ', 'վ',
    'Տ', 'տ', 'Ր', 'ր', 'Ց', 'ց', 'Ու', 'ու', 'Փ', 'փ', 'Ք', 'ք',
    'Օ', 'օ', 'Ֆ', 'ֆ',
  ];

  const russianAlphabet = [
    'А', 'а', 'Б', 'б', 'В', 'в', 'Г', 'г', 'Д', 'д', 'Е', 'е',
    'Ё', 'ё', 'Ж', 'ж', 'З', 'з', 'И', 'и', 'Й', 'й', 'К', 'к',
    'Л', 'л', 'М', 'м', 'Н', 'н', 'О', 'о', 'П', 'п', 'Р', 'р',
    'С', 'с', 'Т', 'т', 'У', 'у', 'Ф', 'ф', 'Х', 'х', 'Ц', 'ц',
    'Ч', 'ч', 'Ш', 'ш', 'Щ', 'щ', 'Ъ', 'ъ', 'Ы', 'ы', 'Ь', 'ь',
    'Э', 'э', 'Ю', 'ю', 'Я', 'я',
  ];

  const generalSymbols = [
    '©', '®', '™', '§', '¶', '†', '‡', '•', '—', '–',
    '≠', '≈', '≤', '≥', '±', '×', '÷', '√', '∞', 'µ',
    '€', '$', '£', '¥', '₽', '֏', '№', '℃', '℉', '°',
    '“', '”', '‘', '’', '«', '»', '¿', '¡', '…', '‰',
  ];

  const handleSelect = (symbol: string) => {
    onInsertSymbol(symbol);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">{t.symbol}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab('armenian')}
            className={`px-3 py-1.5 rounded-t-md transition-colors ${
              activeTab === 'armenian'
                ? 'bg-white text-blue-700 font-semibold border-t border-x border-slate-200 -mb-px'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Հայերեն (Armenian)
          </button>
          <button
            onClick={() => setActiveTab('russian')}
            className={`px-3 py-1.5 rounded-t-md transition-colors ${
              activeTab === 'russian'
                ? 'bg-white text-blue-700 font-semibold border-t border-x border-slate-200 -mb-px'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Русский (Cyrillic)
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-3 py-1.5 rounded-t-md transition-colors ${
              activeTab === 'general'
                ? 'bg-white text-blue-700 font-semibold border-t border-x border-slate-200 -mb-px'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Symbols &amp; Math
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-80 overflow-y-auto">
          {activeTab === 'armenian' && (
            <div className="space-y-4 font-armenian">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Հայերեն Կետադրական և Հատուկ Նշաններ (Punctuation &amp; Marks)
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {armenianPunctuation.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelect(p.char)}
                      className="flex flex-col items-center justify-center p-2 rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      title={p.name}
                    >
                      <span className="text-xl font-bold text-slate-800">{p.char}</span>
                      <span className="text-[10px] text-slate-500 truncate w-full text-center mt-1">
                        {p.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Հայոց Այբուբեն (Armenian Alphabet)
                </span>
                <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
                  {armenianAlphabet.map((char, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelect(char)}
                      className="h-8 flex items-center justify-center text-sm font-semibold rounded border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 transition-colors"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'russian' && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                Русский алфавит (Кириллица)
              </span>
              <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
                {russianAlphabet.map((char, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelect(char)}
                    className="h-8 flex items-center justify-center text-sm font-semibold rounded border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 transition-colors"
                  >
                    {char}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                Universal Symbols &amp; Currencies
              </span>
              <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
                {generalSymbols.map((char, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelect(char)}
                    className="h-9 flex items-center justify-center text-base font-semibold rounded border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-800 transition-colors"
                  >
                    {char}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end p-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
