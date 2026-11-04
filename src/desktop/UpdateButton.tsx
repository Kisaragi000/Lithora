/**
 * "Check for updates" in the header. Lithora also checks quietly a few seconds after it starts;
 * when a newer version exists the button turns into "Update to x.y.z". Updating downloads the
 * new installer, runs it and reopens Lithora.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Look for a new version quietly after start (the Settings menu can turn this off). */
  autoCheck: boolean;
}

const fill = (text: string, version: string) => text.replace('{version}', version);

/** The update errors Lithora's updater reports, in the interface's language. */
const ERRORS: [string, keyof Strings][] = [
  ['Could not reach GitHub', 'updErrOffline'],
  ['Unexpected answer from GitHub', 'updErrOffline'],
  ['No published release yet', 'updErrNoRelease'],
  ['Download failed', 'updErrDownload'],
  ['The download was incomplete', 'updErrDownload'],
  ['The downloaded file is damaged', 'updErrDamaged'],
  ['This update is not signed', 'updErrUnsigned'],
  ['The new release has no file', 'updErrNoFile'],
  ["This copy of Lithora can't update itself", 'updErrCantUpdate'],
  ['Could not start the installer', 'updErrInstall'],
  ['Could not replace Lithora', 'updErrInstall'],
  ['Could not restart Lithora', 'updErrInstall'],
  ['The update was not installed', 'updErrCancelled'],
];

function updateError(t: Strings, e: unknown): string {
  const text = String(e);
  const known = ERRORS.find(([start]) => text.startsWith(start));
  return `${t.updateFailed}: ${known ? String(t[known[1]]) : text}`;
}

/** The first points of a release's notes (its Markdown list), as plain text for the dialog. */
function releaseHighlights(notes: string, max = 8): string[] {
  const items: string[] = [];
  let inItem = false;
  for (const line of notes.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line) && items.length > 0) break;
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      if (items.length >= max) break;
      items.push(item[1]);
      inItem = true;
    } else if (inItem && /^\s+\S/.test(line)) {
      // A point that goes on over the next line.
      items[items.length - 1] += ` ${line.trim()}`;
    } else {
      inItem = false;
    }
  }
  const plain = (text: string) =>
    text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|`/g, '')
      .trim();
  return items.map(plain).filter(Boolean).map((text) => `• ${text}`);
}

export const UpdateButton: React.FC<Props> = ({ t, unsavedNames, notify, autoCheck }) => {
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
      if (!quiet) notify(updateError(t, e), true);
    }
    return null;
  }, [notify, t]);

  // A quiet check shortly after start, so a new version shows without anyone asking.
  // Only once per start: turning the setting back on doesn't check right away.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!autoCheck || autoChecked.current) return;
    const timer = setTimeout(() => {
      autoChecked.current = true;
      void check(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [autoCheck, check]);

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
    const highlights = releaseHighlights(info.notes);
    const message = [
      fill(t.updateConfirm, info.latest),
      highlights.length ? [t.whatsNew, ...highlights].join('\n') : '',
      unsaved.length ? `${unsaved.join(', ')} ${t.unsavedUpdate}` : '',
    ]
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
      notify(updateError(t, e), true);
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
