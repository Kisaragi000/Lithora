/**
 * The Settings menu in the title bar: AutoSave (how often Lithora keeps a recovery copy of
 * unsaved changes), whether Lithora looks for updates when it starts, and About Lithora (version,
 * license, warranty, privacy and trademark notes, and the third-party notices).
 */
import React, { useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { Check, ChevronDown, Info, Settings as SettingsIcon } from 'lucide-react';
import { FloatingPanel } from './ribbonParts';
import { Modal, PrimaryButton } from './Dialogs';
import type { Strings } from './strings';
import notices from '../../THIRD-PARTY-NOTICES.md?raw';

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

const UPDATE_CHECK_KEY = 'lithora_update_check';

/** Whether Lithora looks for a new version when it starts (on unless turned off). */
export function storedUpdateCheck(): boolean {
  try {
    return localStorage.getItem(UPDATE_CHECK_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function storeUpdateCheck(on: boolean) {
  try {
    localStorage.setItem(UPDATE_CHECK_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

/** "Every 5 minutes", for the chosen interval. */
export function autosaveLabel(t: Strings, seconds: number): string {
  const option = AUTOSAVE_OPTIONS.find(([s]) => s === seconds) ?? AUTOSAVE_OPTIONS[2];
  return t[option[1]];
}

interface MenuProps {
  t: Strings;
  autosave: number;
  onAutosave(seconds: number): void;
  updateCheck: boolean;
  onUpdateCheck(on: boolean): void;
}

export function SettingsMenu({ t, autosave, onAutosave, updateCheck, onUpdateCheck }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
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
            <p className="mt-3 border-t border-slate-200 px-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{t.updates}</p>
            <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100">
              <input
                type="checkbox"
                checked={updateCheck}
                onChange={(e) => onUpdateCheck(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#376FA3]"
              />
              <span>{t.autoUpdateCheck}</span>
            </label>
            <p className="px-1 text-[12px] leading-snug text-slate-500">{t.autoUpdateHint}</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAbout(true);
              }}
              className="mt-3 flex w-full items-center gap-2 rounded-md border-t border-slate-200 px-2 pb-1.5 pt-3 text-left text-[13px] text-slate-700 hover:bg-slate-100"
            >
              <Info className="h-4 w-4 text-[#376FA3]" /> {t.about}
            </button>
          </div>
        </FloatingPanel>
      )}
      {about && <AboutDialog t={t} onClose={() => setAbout(false)} />}
    </>
  );
}

function AboutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#376FA3]">{title}</h3>
      <p className="mt-1 leading-snug">{children}</p>
    </section>
  );
}

/** Version, license, no-warranty, signature, privacy and trademark notes, and third-party notices. */
export function AboutDialog({ t, onClose }: { t: Strings; onClose(): void }) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    getVersion().then(setVersion, () => setVersion(''));
  }, []);
  return (
    <Modal title={t.about} onClose={onClose} width="w-[560px]" footer={<PrimaryButton onClick={onClose}>OK</PrimaryButton>}>
      <p className="text-[15px] font-semibold text-[#083B69]">Lithora</p>
      {version && <p className="text-slate-500">{t.aboutVersion.replace('{version}', version)}</p>}
      <p className="mt-2 leading-snug">{t.aboutLicense}</p>
      <AboutSection title={t.aboutWarrantyTitle}>{t.aboutWarranty}</AboutSection>
      <AboutSection title={t.aboutSignatureTitle}>{t.signatureNotice}</AboutSection>
      <AboutSection title={t.aboutPrivacyTitle}>{t.aboutPrivacy}</AboutSection>
      <AboutSection title={t.aboutTrademarksTitle}>{t.aboutTrademarks}</AboutSection>
      <AboutSection title={t.aboutNotices}>{t.aboutNoticesHint}</AboutSection>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 font-sans text-[11.5px] leading-snug text-slate-600">
        {notices}
      </pre>
    </Modal>
  );
}
