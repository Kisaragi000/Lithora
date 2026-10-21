/**
 * The Settings menu in the title bar. For now it holds AutoSave: how often Lithora keeps a
 * recovery copy of unsaved changes.
 */
import React, { useRef, useState } from 'react';
import { Check, ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { FloatingPanel } from './Ribbon';
import type { Strings } from './strings';

const AUTOSAVE_KEY = 'lithora_autosave_secs';
export const AUTOSAVE_DEFAULT = 300;

/** The AutoSave choices, in seconds, with their label's string key. */
const AUTOSAVE_OPTIONS = [
  [20, 'every20s'],
  [60, 'every1m'],
  [300, 'every5m'],
  [600, 'every10m'],
  [3600, 'every1h'],
] as const;

export function storedAutosave(): number {
  try {
    const v = Number(localStorage.getItem(AUTOSAVE_KEY));
    if (AUTOSAVE_OPTIONS.some(([s]) => s === v)) return v;
  } catch {
    /* storage unavailable */
  }
  return AUTOSAVE_DEFAULT;
}

export function storeAutosave(seconds: number) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, String(seconds));
  } catch {
    /* storage unavailable */
  }
}

/** "Every 5 minutes", for the chosen interval. */
export function autosaveLabel(t: Strings, seconds: number): string {
  const option = AUTOSAVE_OPTIONS.find(([s]) => s === seconds) ?? AUTOSAVE_OPTIONS[2];
  return t[option[1]];
}

export function SettingsMenu({ t, autosave, onAutosave }: { t: Strings; autosave: number; onAutosave(seconds: number): void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium hover:bg-slate-100 ${
          open ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-700'
        }`}
      >
        <SettingsIcon className="h-4 w-4 text-[#376FA3]" /> {t.settings}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && button.current && (
        <FloatingPanel anchor={button.current} onClose={close}>
          <div className="w-72 p-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{t.autosave}</p>
            <p className="mt-1 px-1 text-[12px] leading-snug text-slate-500">{t.autosaveHint}</p>
            <div role="radiogroup" aria-label={t.autosave} className="mt-2 flex flex-col">
              {AUTOSAVE_OPTIONS.map(([seconds, key]) => {
                const on = seconds === autosave;
                return (
                  <button
                    key={seconds}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onAutosave(seconds)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
                      on ? 'bg-[#376FA3]/12 font-medium text-[#083B69]' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">{on && <Check className="h-3.5 w-3.5 text-[#376FA3]" />}</span>
                    {t[key]}
                    {seconds === AUTOSAVE_DEFAULT && <span className="ml-auto text-[11px] text-slate-400">{t.defaultMark}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </FloatingPanel>
      )}
    </>
  );
}
