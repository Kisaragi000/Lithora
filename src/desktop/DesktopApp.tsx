/**
 * Lithora's desktop editor. Documents open in Lithora's own engine (built on WordCraft's
 * Rust crates), which lays out every page the way Word does; this screen holds the tabs,
 * ribbon and status bar around those pages.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FileText, FolderOpen, Globe, Minus, Plus, Save, X } from 'lucide-react';
import type { Language } from '../types/document';
import { LithoraLogo } from '../components/LithoraLogo';
import { DropOverlay } from '../components/DropOverlay';
import { listenForFileDrops } from './fileDrop';
import { DocState, engine, OPEN_EXTENSIONS, SAVE_FILTERS } from './engine';
import { PageView, PageViewHandle } from './PageView';
import { Ribbon, RibbonAction } from './Ribbon';
import { strings } from './strings';

const LANGUAGE_KEY = 'lithora_ui_language';
const ZOOM_KEY = 'lithora_zoom';

function storedLanguage(): Language {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    if (v === 'en' || v === 'ru' || v === 'hy') return v;
  } catch {
    /* storage unavailable */
  }
  const sys = navigator.language.toLowerCase();
  return sys.startsWith('ru') ? 'ru' : sys.startsWith('hy') ? 'hy' : 'en';
}

function storedZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    if (v >= 0.5 && v <= 3) return v;
  } catch {
    /* storage unavailable */
  }
  return 1;
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const withoutExtension = (name: string) => name.replace(/\.[^.]+$/, '');

export const DesktopApp: React.FC = () => {
  const [lang, setLang] = useState<Language>(storedLanguage);
  const t = strings[lang];
  const [docs, setDocs] = useState<DocState[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(storedZoom);
  const [fonts, setFonts] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const view = useRef<PageViewHandle>(null);
  const untitledCount = useRef(0);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const active = docs.find((d) => d.id === activeId) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, lang);
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
  }, [lang, zoom]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const showError = useCallback((text: string) => setNotice({ text, error: true }), []);

  const updateDoc = useCallback((state: DocState) => {
    setDocs((list) => list.map((d) => (d.id === state.id ? state : d)));
  }, []);

  const addDoc = useCallback((state: DocState) => {
    setDocs((list) => [...list, state]);
    setActiveId(state.id);
    setCurrentPage(0);
  }, []);

  const loadFonts = useCallback((id: number) => {
    engine
      .fonts(id)
      .then((list) => setFonts([...new Set(list)].sort((a, b) => a.localeCompare(b))))
      .catch(() => undefined);
  }, []);

  const newDocument = useCallback(async () => {
    untitledCount.current += 1;
    const state = await engine.create(`${strings[lang].untitled} ${untitledCount.current}.docx`);
    addDoc(state);
    return state;
  }, [addDoc, lang]);

  const openPaths = useCallback(
    async (paths: string[]) => {
      let opened = 0;
      for (const path of paths) {
        // A file that is already open just comes to the front.
        const already = docsRef.current.find((d) => d.path === path);
        if (already) {
          setActiveId(already.id);
          opened += 1;
          continue;
        }
        try {
          const state = await engine.open(path);
          docsRef.current = [...docsRef.current, state];
          addDoc(state);
          opened += 1;
        } catch (e) {
          showError(`${strings[lang].couldNotOpen} ${baseName(path)}: ${e}`);
        }
      }
      return opened;
    },
    [addDoc, lang, showError],
  );

  const openFiles = useCallback(async () => {
    const picked = await openDialog({ multiple: true, filters: [{ name: 'Documents', extensions: OPEN_EXTENSIONS }] });
    if (!picked) return;
    await openPaths(Array.isArray(picked) ? picked : [picked]);
  }, [openPaths]);

  const saveAs = useCallback(
    async (doc: DocState) => {
      const target = await saveDialog({ defaultPath: doc.path ?? doc.name, filters: SAVE_FILTERS });
      if (!target) return false;
      try {
        updateDoc(await engine.save(doc.id, target));
        setNotice({ text: `${strings[lang].savedAs} ${baseName(target)}` });
        return true;
      } catch (e) {
        showError(`${strings[lang].couldNotSave}: ${e}`);
        return false;
      }
    },
    [lang, showError, updateDoc],
  );

  const save = useCallback(
    async (doc: DocState) => {
      if (!doc.path) return saveAs(doc);
      try {
        updateDoc(await engine.save(doc.id));
        setNotice({ text: `${strings[lang].savedAs} ${baseName(doc.path)}` });
        return true;
      } catch (e) {
        showError(`${strings[lang].couldNotSave}: ${e}`);
        return false;
      }
    },
    [lang, saveAs, showError, updateDoc],
  );

  const exportPdf = useCallback(
    async (doc: DocState) => {
      const target = await saveDialog({
        defaultPath: `${withoutExtension(doc.name)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (!target) return;
      try {
        await engine.command(doc.id, 'file.printPdf', { path: target });
        setNotice({ text: `${strings[lang].savedAs} ${baseName(target)}` });
      } catch (e) {
        showError(`${strings[lang].couldNotSave}: ${e}`);
      }
    },
    [lang, showError],
  );

  const closeDoc = useCallback(
    async (doc: DocState) => {
      if (doc.dirty) {
        const sure = await ask(`${doc.name} ${strings[lang].unsavedClose}`, {
          title: 'Lithora',
          kind: 'warning',
          okLabel: strings[lang].closeAnyway,
          cancelLabel: strings[lang].keep,
        });
        if (!sure) return;
      }
      await engine.close(doc.id).catch(() => undefined);
      const list = docsRef.current;
      const index = list.findIndex((d) => d.id === doc.id);
      const rest = list.filter((d) => d.id !== doc.id);
      setDocs(rest);
      setActiveId((current) => (current === doc.id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : current));
    },
    [lang],
  );

  // Open files passed on the command line, else start with a blank document, like Word.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const files = await engine.startupFiles().catch(() => [] as string[]);
      const opened = files.length > 0 ? await openPaths(files) : 0;
      if (opened === 0) {
        const blank = await newDocument();
        loadFonts(blank.id);
      } else {
        loadFonts(docsRef.current[0].id);
      }
    })().catch((e) => showError(String(e)));
  }, [loadFonts, newDocument, openPaths, showError]);

  // Files dropped onto the window open in new tabs.
  useEffect(() => listenForFileDrops({ onHover: setDragging, onDrop: (paths) => void openPaths(paths) }), [openPaths]);

  // Ask before closing the window with unsaved documents.
  useEffect(() => {
    let stop: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        const unsaved = docsRef.current.filter((d) => d.dirty);
        if (unsaved.length === 0) return;
        const sure = await ask(`${unsaved.map((d) => d.name).join(', ')} ${strings[lang].unsavedClose}`, {
          title: 'Lithora',
          kind: 'warning',
          okLabel: strings[lang].closeAnyway,
          cancelLabel: strings[lang].keep,
        });
        if (!sure) event.preventDefault();
      })
      .then((unlisten) => (stop = unlisten))
      .catch(() => undefined);
    return () => stop?.();
  }, [lang]);

  const shortcut = useCallback(
    (combo: string) => {
      const doc = docsRef.current.find((d) => d.id === activeId);
      switch (combo) {
        case 'Mod+S':
          if (doc) void save(doc);
          return true;
        case 'Mod+Shift+S':
        case 'F12':
          if (doc) void saveAs(doc);
          return true;
        case 'Mod+O':
          void openFiles();
          return true;
        case 'Mod+N':
          void newDocument();
          return true;
        case 'Mod+W':
        case 'Mod+F4':
          if (doc) void closeDoc(doc);
          return true;
        case 'Mod+P':
          if (doc) void exportPdf(doc);
          return true;
        case 'Mod+=':
        case 'Mod+Shift+=':
          setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10));
          return true;
        case 'Mod+-':
          setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10));
          return true;
        default:
          return false;
      }
    },
    [activeId, closeDoc, exportPdf, newDocument, openFiles, save, saveAs],
  );

  // The same shortcuts when the keyboard is outside the page (in the ribbon, say).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key;
      if (shortcut(`Mod+${e.shiftKey ? 'Shift+' : ''}${key}`)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const onCommand = (name: string, params?: Record<string, unknown>) => {
    view.current?.command(name, params).catch(() => undefined);
  };

  const onAction = async (action: RibbonAction) => {
    const doc = active;
    switch (action) {
      case 'new':
        return void newDocument();
      case 'open':
        return void openFiles();
      case 'save':
        return doc && void save(doc);
      case 'saveAs':
        return doc && void saveAs(doc);
      case 'exportPdf':
        return doc && void exportPdf(doc);
      case 'copy':
        return void view.current?.copy();
      case 'cut':
        return void view.current?.cut();
      case 'paste': {
        const text = await readText().catch(() => '');
        if (text) onCommand('edit.paste', { text });
        return;
      }
      case 'picture': {
        const picked = await openDialog({
          multiple: false,
          filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'webp', 'emf', 'wmf'] }],
        });
        if (typeof picked === 'string') onCommand('insert.picture', { path: picked });
        return;
      }
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#E9EEF5] font-sans text-slate-800">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 select-none">
        <div className="flex items-center gap-2">
          <LithoraLogo className="h-6 w-6" />
          <span className="text-[16px] tracking-tight text-[#083B69]" style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600 }}>
            Lithora
          </span>
        </div>
        <span className="h-5 w-px bg-slate-200" />
        <span className="min-w-0 truncate text-[13px] font-medium text-slate-700" title={active?.path ?? active?.name}>
          {active?.name}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void openFiles()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-100"
          >
            <FolderOpen className="h-4 w-4 text-[#376FA3]" /> {t.open}
          </button>
          <button
            type="button"
            disabled={!active}
            onClick={() => active && void save(active)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#083B69] px-3 text-[13px] font-medium text-white hover:bg-[#0B4A84] disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> {t.save}
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <Globe className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-slate-500" />
            {(
              [
                ['en', 'EN', 'English'],
                ['ru', 'RU', 'Русский'],
                ['hy', 'ՀԱՅ', 'Հայերեն'],
              ] as const
            ).map(([code, label, name]) => (
              <button
                key={code}
                type="button"
                title={name}
                onClick={() => setLang(code)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  lang === code ? 'bg-white text-[#083B69] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-slate-200 bg-[#EEF1F6] px-2 select-none">
        {docs.map((d) => (
          <div
            key={d.id}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeDoc(d);
              }
            }}
            className={`group flex h-8 max-w-[220px] shrink-0 cursor-default items-center gap-2 rounded-t-md border-x border-t px-3 text-[13px] ${
              d.id === activeId ? 'border-slate-200 bg-white text-[#083B69]' : 'border-transparent text-slate-600 hover:bg-white/60'
            }`}
            onClick={() => setActiveId(d.id)}
            title={d.path ?? d.name}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-[#376FA3]" />
            <span className="truncate">{d.name}</span>
            {d.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#376FA3]" title={t.unsaved} />}
            <button
              type="button"
              title={t.closeTab}
              aria-label={`${t.closeTab} ${d.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void closeDoc(d);
              }}
              className="rounded p-0.5 text-slate-400 opacity-60 hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          title={t.newTab}
          aria-label={t.newTab}
          onClick={() => void newDocument()}
          className="mb-1 rounded p-1 text-slate-500 hover:bg-white hover:text-[#083B69]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <Ribbon t={t} doc={active} fonts={fonts} onCommand={onCommand} onAction={(a) => void onAction(a)} />

      {active ? (
        <PageView
          key={active.id}
          ref={view}
          doc={active}
          zoom={zoom}
          onState={updateDoc}
          onError={showError}
          onShortcut={shortcut}
          onCurrentPage={setCurrentPage}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <LithoraLogo className="h-14 w-14 opacity-90" />
          <p className="max-w-sm text-[14px] text-slate-600">{t.openHint}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void openFiles()}
              className="rounded-md bg-[#083B69] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0B4A84]"
            >
              {t.open}
            </button>
            <button
              type="button"
              onClick={() => void newDocument()}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {t.newDocument}
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-white px-4 text-[12px] text-slate-600 select-none">
        {active && (
          <>
            <span>
              {t.page} {Math.min(currentPage + 1, active.pages.length)} {t.of} {active.pages.length}
            </span>
            <span className={active.dirty ? 'text-[#376FA3]' : 'text-emerald-700'}>{active.dirty ? t.unsaved : t.saved}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" title={t.zoom} onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} className="rounded p-0.5 hover:bg-slate-100">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            aria-label={t.zoom}
            min={50}
            max={300}
            step={10}
            value={zoomPercent}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            className="w-28 accent-[#376FA3]"
          />
          <button type="button" title={t.zoom} onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))} className="rounded p-0.5 hover:bg-slate-100">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="w-11 rounded text-right tabular-nums hover:bg-slate-100">
            {zoomPercent}%
          </button>
        </div>
      </footer>

      {notice && (
        <div
          role="status"
          className={`fixed bottom-10 right-4 z-50 max-w-md rounded-lg border px-4 py-2.5 text-[13px] shadow-lg ${
            notice.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          {notice.text}
        </div>
      )}
      {dragging && <DropOverlay label={t.dropToOpen} />}
    </div>
  );
};
