/**
 * "Check for updates" in the header. Lithora also checks quietly a few seconds after it starts;
 * when a newer version exists the button turns into "Update to x.y.z". Updating downloads the
 * new installer, runs it and reopens Lithora.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import type { Strings } from './strings';

interface UpdateInfo {
  current: string;
  latest: string;
  available: boolean;
  notes: string;
  page: string;
  canInstall: boolean;
}

type Phase = { kind: 'idle' } | { kind: 'checking' } | { kind: 'available'; info: UpdateInfo } | { kind: 'downloading'; percent: number };

interface Props {
  t: Strings;
  /** Names of documents with unsaved changes. */
  unsavedNames: () => string[];
  notify: (text: string, error?: boolean) => void;
}

const fill = (text: string, version: string) => text.replace('{version}', version);

export const UpdateButton: React.FC<Props> = ({ t, unsavedNames, notify }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const check = useCallback(async (quiet: boolean): Promise<UpdateInfo | null> => {
    if (!quiet) setPhase({ kind: 'checking' });
    try {
      const info = await invoke<UpdateInfo>('check_update');
      if (info.available) {
        setPhase({ kind: 'available', info });
        return info;
      }
      setPhase({ kind: 'idle' });
      if (!quiet) notify(fill(t.upToDate, info.current));
    } catch (e) {
      setPhase({ kind: 'idle' });
      if (!quiet) notify(`${t.updateFailed}: ${e}`, true);
    }
    return null;
  }, [notify, t]);

  // A quiet check shortly after start, so a new version shows without anyone asking.
  useEffect(() => {
    const timer = setTimeout(() => void check(true), 4000);
    return () => clearTimeout(timer);
  }, [check]);

  useEffect(() => {
    const off = listen<{ done: number; total: number }>('update-progress', (e) => {
      const { done, total } = e.payload;
      setPhase({ kind: 'downloading', percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 });
    });
    return () => {
      void off.then((f) => f());
    };
  }, []);

  const update = useCallback(async (info: UpdateInfo) => {
    if (!info.canInstall) {
      await invoke('open_releases_page').catch(() => undefined);
      return;
    }
    const unsaved = unsavedNames();
    const message = [fill(t.updateConfirm, info.latest), unsaved.length ? `${unsaved.join(', ')} ${t.unsavedUpdate}` : '']
      .filter(Boolean)
      .join('\n\n');
    const sure = await ask(message, { title: 'Lithora', kind: unsaved.length ? 'warning' : 'info', okLabel: t.updateNow, cancelLabel: t.later });
    if (!sure) return;
    setPhase({ kind: 'downloading', percent: 0 });
    try {
      // Lithora closes when the installer starts; the new version opens when it finishes.
      await invoke('install_update');
    } catch (e) {
      setPhase({ kind: 'available', info });
      notify(`${t.updateFailed}: ${e}`, true);
    }
  }, [notify, t, unsavedNames]);

  const onClick = async () => {
    if (phase.kind === 'available') return update(phase.info);
    if (phase.kind !== 'idle') return;
    const info = await check(false);
    if (info) await update(info);
  };

  const base = 'inline-flex h-8 shrink-0 items-center whitespace-nowrap gap-1.5 rounded-md px-2.5 text-[13px] font-medium disabled:opacity-60';
  if (phase.kind === 'available') {
    return (
      <button type="button" onClick={() => void onClick()} className={`${base} bg-[#B9AEDC]/40 text-[#083B69] hover:bg-[#B9AEDC]/60`} title={t.checkUpdates}>
        <Download className="h-4 w-4" /> {fill(t.updateTo, phase.info.latest)}
      </button>
    );
  }
  if (phase.kind === 'downloading') {
    return (
      <span className={`${base} text-slate-600`} role="status">
        <Loader2 className="h-4 w-4 animate-spin text-[#376FA3]" /> {t.downloadingUpdate} {phase.percent}%
      </span>
    );
  }
  return (
    <button type="button" disabled={phase.kind === 'checking'} onClick={() => void onClick()} title={t.checkUpdates} aria-label={t.checkUpdates} className={`${base} text-slate-700 hover:bg-slate-100`}>
      {phase.kind === 'checking' ? <Loader2 className="h-4 w-4 animate-spin text-[#376FA3]" /> : <RefreshCw className="h-4 w-4 text-[#376FA3]" />}
      {/* On a narrow window only the icon shows. */}
      <span className="hidden xl:inline">{phase.kind === 'checking' ? t.checkingUpdates : t.checkUpdates}</span>
    </button>
  );
};
