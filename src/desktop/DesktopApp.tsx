/**
 * Lithora's desktop editor. Documents open in Lithora's own engine (built on WordCraft's
 * Rust crates), which lays out every page the way Word does; this screen holds the tabs,
 * ribbon and status bar around those pages.
 */
import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { BookOpen, CaseSensitive, ChevronDown, ClipboardPaste, Copy, FileText, FolderOpen, Globe, History, Link2, MessageSquarePlus, Minus, Plus, Save, Scissors, SpellCheck, SpellCheck2, WandSparkles, X } from 'lucide-react';
import type { Language } from '../types/document';
import { LithoraLogo } from '../components/LithoraLogo';
import { DropOverlay } from '../components/DropOverlay';
import { listenForFileDrops } from './fileDrop';
import { DocState, engine, OPEN_EXTENSIONS, ProofIssue, RecoveredDoc, SAVE_FILTERS } from './engine';
import { PageView, PageViewHandle } from './PageView';
import { Ribbon, RibbonAction } from './Ribbon';
import { strings } from './strings';
import { UpdateButton } from './UpdateButton';
import { ContextMenu, MenuItem } from './ContextMenu';
import { LinkDialog, PrintDialog, RecoveryDialog, SymbolDialog, TextDialog, WordCountDialog, WordCountInfo } from './Dialogs';
import { FindBar } from './FindBar';
import { HistoryState, PanelKind, SidePanel } from './SidePanel';
import { OWN_TITLE_BAR, WindowControls } from './WindowControls';
import { SettingsMenu, autosaveLabel, storeAutosave, storeUpdateCheck, storedAutosave, storedUpdateCheck } from './Settings';
import { SignatureDialog } from './SignatureDialog';
import type { MoreAction, Zoom } from './RibbonMore';
import { NavPane } from './NavPane';
import {
  BookmarkDialog,
  CaptionDialog,
  Commands,
  CrossReferenceDialog,
  DateTimeDialog,
  FontDialog,
  OpenPasswordDialog,
  PageSetupDialog,
  ParagraphDialog,
  PrintPreview,
  PropertiesDialog,
  ProtectDialog,
  ThesaurusDialog,
  WatermarkDialog,
} from './WordDialogs';
import type { ParagraphInfo } from './engine';

/** Pictures dropped onto a page go into the document; other files open in tabs. */
const PICTURE_FILE = /\.(png|jpe?g|gif|bmp|webp|emf|wmf)$/i;
/** Files a template can be. */
const TEMPLATE_EXTENSIONS = ['dotx', 'dotm', 'dot', 'ott', 'docx', 'doc', 'odt', 'rtf'];

const LANGUAGE_KEY = 'lithora_ui_language';
const ZOOM_KEY = 'lithora_zoom';
const RECENT_KEY = 'lithora_recent';
const RECENT_MAX = 12;

function storedRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => typeof p === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

type Dialog =
  | { kind: 'print' }
  | { kind: 'link' }
  | { kind: 'symbol' }
  | { kind: 'wordCount'; info: WordCountInfo }
  | { kind: 'comment' }
  | { kind: 'reply'; id: number }
  | { kind: 'signature' }
  | { kind: 'recovery'; docs: RecoveredDoc[] }
  | { kind: 'font' }
  | { kind: 'paragraph'; info: ParagraphInfo }
  | { kind: 'pageSetup' }
  | { kind: 'watermark' }
  | { kind: 'caption' }
  | { kind: 'crossReference' }
  | { kind: 'bookmark' }
  | { kind: 'dateTime' }
  | { kind: 'protect' }
  | { kind: 'openPassword'; path: string; wrong: boolean }
  | { kind: 'properties' }
  | { kind: 'thesaurus' }
  | { kind: 'preview' };

interface Issue {
  text: string;
  kind: 'spelling' | 'grammar';
  message: string;
  suggestions: string[];
}

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
  const [recent, setRecent] = useState<string[]>(storedRecent);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [findBar, setFindBar] = useState<'find' | 'replace' | null>(null);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  /** AutoSave: seconds between recovery copies of unsaved changes. */
  const [autosave, setAutosave] = useState(storedAutosave);
  /** Whether Lithora looks for a new version when it starts. */
  const [updateCheck, setUpdateCheckState] = useState(storedUpdateCheck);
  const setUpdateCheck = useCallback((on: boolean) => {
    setUpdateCheckState(on);
    storeUpdateCheck(on);
  }, []);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** The status bar's word count: the document's, and the selection's when there is one. */
  const [words, setWords] = useState<{ total: number; selected: number | null } | null>(null);
  const [histories, setHistories] = useState<Record<number, HistoryState>>({});
  const [navOpen, setNavOpen] = useState(false);
  /** Read mode: the pages without the tools, and the keyboard only moves around. */
  const [readMode, setReadMode] = useState(false);
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
    storeAutosave(autosave);
    void engine.setRecoveryInterval(autosave).catch(() => undefined);
  }, [autosave]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* storage unavailable */
    }
  }, [recent]);

  const remember = useCallback((path: string) => {
    setRecent((list) => [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const showError = useCallback((text: string) => setNotice({ text, error: true }), []);
  const notify = useCallback((text: string, error?: boolean) => setNotice({ text, error }), []);
  const unsavedNames = useCallback(() => docsRef.current.filter((d) => d.dirty).map((d) => d.name), []);

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
          remember(path);
          opened += 1;
        } catch (e) {
          if (String(e) === 'PASSWORD_REQUIRED') {
            setDialog({ kind: 'openPassword', path, wrong: false });
            opened += 1;
            continue;
          }
          showError(`${strings[lang].couldNotOpen} ${baseName(path)}: ${e}`);
          setRecent((list) => list.filter((p) => p !== path));
        }
      }
      return opened;
    },
    [addDoc, lang, remember, showError],
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
      // Plain text keeps only the words: say so first, as Word does.
      const wasText = /\.txt$/i.test(doc.path ?? '');
      if (/\.txt$/i.test(target) && !wasText) {
        const t = strings[lang];
        const sure = await ask(t.lossyFormat.replace('{format}', '.txt'), { title: 'Lithora', kind: 'warning', okLabel: t.saveAnyway, cancelLabel: t.cancel });
        if (!sure) return false;
      }
      try {
        updateDoc(await engine.save(doc.id, target));
        setNotice({ text: `${strings[lang].savedAs} ${baseName(target)}` });
        if (!/\.(pdf|html?|md|txt)$/i.test(target)) remember(target);
        return true;
      } catch (e) {
        showError(`${strings[lang].couldNotSave}: ${e}`);
        return false;
      }
    },
    [lang, remember, showError, updateDoc],
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
      // Documents Lithora kept copies of when it last closed without saving them.
      const left = await engine.recoveryList().catch(() => [] as RecoveredDoc[]);
      if (left.length > 0) setDialog({ kind: 'recovery', docs: left });
    })().catch((e) => showError(String(e)));
  }, [loadFonts, newDocument, openPaths, showError]);

  // Files dropped onto the window open in new tabs; pictures dropped onto a page go in there.
  const dropPictures = useRef<(paths: string[], at: { x: number; y: number }) => boolean>(() => false);
  dropPictures.current = (paths, at) => {
    if (!view.current || !docsRef.current.length || paths.length === 0 || !paths.every((p) => PICTURE_FILE.test(p))) return false;
    void view.current.dropPictures(paths, at.x, at.y);
    return true;
  };
  useEffect(
    () =>
      listenForFileDrops({
        onHover: setDragging,
        onDrop: (paths, at) => {
          if (!dropPictures.current(paths, at)) void openPaths(paths);
        },
      }),
    [openPaths],
  );

  // Files opened from the file manager while Lithora is already running come here, in new tabs.
  useEffect(() => {
    const off = listen<string[]>('open-files', (e) => void openPaths(e.payload));
    return () => {
      void off.then((f) => f());
    };
  }, [openPaths]);

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
          if (doc) setDialog({ kind: 'print' });
          return true;
        case 'Mod+F':
          if (doc) setFindBar((b) => b ?? 'find');
          return true;
        case 'Mod+H':
          if (doc) setFindBar('replace');
          return true;
        case 'Mod+K':
          if (doc) setDialog({ kind: 'link' });
          return true;
        case 'F7':
        case 'Mod+Alt+S':
          if (doc) void spellingRef.current();
          return true;
        case 'Mod+Alt+P':
          if (doc) setPanel((p) => (p === 'proofread' ? null : 'proofread'));
          return true;
        case 'Mod+Alt+H':
          if (doc) setPanel((p) => (p === 'history' ? null : 'history'));
          return true;
        case 'Mod+Shift+G':
          if (doc) void wordCountRef.current();
          return true;
        case 'Mod+Alt+M':
          if (doc) setDialog({ kind: 'comment' });
          return true;
        case 'Mod+D':
          if (doc) setDialog({ kind: 'font' });
          return true;
        case 'Shift+F7':
          if (doc) setDialog({ kind: 'thesaurus' });
          return true;
        case 'Escape':
          if (!readMode) return false;
          setReadMode(false);
          return true;
        default:
          return false;
      }
    },
    [activeId, closeDoc, newDocument, openFiles, readMode, save, saveAs],
  );

  // Ctrl + mouse wheel (or a touchpad pinch) zooms, in steps of 10%.
  useEffect(() => {
    let pending = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // One mouse notch is one step; touchpads send many small moves, which add up to one.
      const delta = e.deltaMode === 0 ? e.deltaY : e.deltaY * 50;
      pending = Math.abs(delta) >= 50 ? delta : pending + delta;
      if (Math.abs(pending) < 50) return;
      const step = pending > 0 ? -0.1 : 0.1;
      pending = 0;
      setZoom((z) => Math.min(3, Math.max(0.5, Math.round((z + step) * 10) / 10)));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // The same shortcuts when the keyboard is outside the page (in the ribbon, say).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && e.key !== 'F7') return;
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key;
      if (shortcut(`${mod ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${key}`)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const onCommand = (name: string, params?: Record<string, unknown>) => {
    view.current?.command(name, params).catch((e) => showError(String(e)));
  };

  /** Run an engine command and get its answer (errors become a notice). */
  const ask_ = useCallback(
    async (name: string, params?: Record<string, unknown>, keepFocus?: boolean): Promise<unknown> => {
      try {
        return await view.current?.command(name, params, keepFocus);
      } catch (e) {
        showError(String(e));
        return null;
      }
    },
    [showError],
  );

  const pxPerPt = (96 * zoom) / 72;

  /** Where a point on a page is in the window. */
  const screenPoint = (page: number, x: number, y: number) => {
    const el = document.querySelector(`[data-page="${page}"]`) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + x * pxPerPt, y: r.top + y * pxPerPt } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  };

  /** Menu rows for a misspelled word (or grammar issue) at the cursor. */
  const issueItems = (issue: Issue | null): MenuItem[] => {
    if (!issue) return [];
    const items: MenuItem[] = [];
    if (issue.kind === 'grammar') items.push({ label: issue.message, onClick: () => undefined, muted: true, disabled: true });
    if (issue.suggestions.length === 0) items.push({ label: t.noSuggestions, onClick: () => undefined, muted: true, disabled: true });
    for (const s of issue.suggestions.slice(0, 6)) items.push({ label: s, strong: true, onClick: () => onCommand('review.applySuggestion', { text: s }) });
    if (issue.kind === 'spelling') {
      items.push({ label: t.addToDictionary, onClick: () => onCommand('review.addToDictionary', { word: issue.text }) });
      items.push({ label: t.ignoreAll, onClick: () => onCommand('review.ignoreAll', { word: issue.text }) });
    }
    items.push({ separator: true });
    return items;
  };

  const openContextMenu = async (x: number, y: number) => {
    const doc = docsRef.current.find((d) => d.id === activeId);
    if (!doc) return;
    const items: MenuItem[] = [];
    if (doc.object) {
      items.push(
        { label: t.wrapInFront, onClick: () => onCommand('arrange.wrap', { wrap: 'inFrontOfText' }) },
        { label: t.wrapSquare, onClick: () => onCommand('arrange.wrap', { wrap: 'square' }) },
        { label: t.wrapInline, onClick: () => onCommand('arrange.wrap', { wrap: 'inline' }) },
        { separator: true },
      );
    } else if (doc.selection.length === 0) {
      const r = await engine.command(doc.id, 'review.suggestions').catch(() => null);
      items.push(...issueItems((r?.result as Issue | null) ?? null));
    }
    items.push(
      { label: t.cut2, icon: <Scissors className="h-3.5 w-3.5" />, onClick: () => void view.current?.cut(), disabled: doc.selection.length === 0 && !doc.object },
      { label: t.copy2, icon: <Copy className="h-3.5 w-3.5" />, onClick: () => void view.current?.copy(), disabled: doc.selection.length === 0 && !doc.object },
      { label: t.paste2, icon: <ClipboardPaste className="h-3.5 w-3.5" />, onClick: () => void onAction('paste') },
    );
    if (doc.object) items.push({ label: t.deleteObject, onClick: () => onCommand('text.delete') });
    if (doc.selection.length > 0 && !doc.object) {
      items.push(
        { separator: true },
        { label: t.caseUpper, icon: <CaseSensitive className="h-3.5 w-3.5" />, onClick: () => onCommand('format.changeCase', { mode: 'upper' }) },
        { label: t.caseLower, onClick: () => onCommand('format.changeCase', { mode: 'lower' }) },
        { label: t.caseTitle, onClick: () => onCommand('format.changeCase', { mode: 'title' }) },
      );
    }
    if (doc.inTable) {
      items.push(
        { separator: true },
        { label: t.rowAbove, onClick: () => onCommand('table.insertRowAbove') },
        { label: t.rowBelow, onClick: () => onCommand('table.insertRowBelow') },
        { label: t.colLeft, onClick: () => onCommand('table.insertColumnLeft') },
        { label: t.colRight, onClick: () => onCommand('table.insertColumnRight') },
        { label: t.deleteRow, onClick: () => onCommand('table.deleteRow') },
        { label: t.deleteColumn, onClick: () => onCommand('table.deleteColumn') },
        { label: t.mergeCells, onClick: () => onCommand('table.merge'), disabled: doc.selection.length === 0 },
      );
    }
    if (!doc.object) {
      items.push(
        { separator: true },
        { label: `${t.fontDialog}…`, hint: 'Ctrl+D', onClick: () => setDialog({ kind: 'font' }) },
        { label: `${t.paragraphSettings}…`, onClick: () => void latestHandlers.current.onMore('paragraphDialog') },
      );
    }
    items.push(
      { separator: true },
      { label: t.link, icon: <Link2 className="h-3.5 w-3.5" />, onClick: () => setDialog({ kind: 'link' }) },
      { label: t.newComment, icon: <MessageSquarePlus className="h-3.5 w-3.5" />, onClick: () => setDialog({ kind: 'comment' }) },
    );
    setMenu({ x, y, items });
  };

  /** F7: the next misspelling, with its suggestions in a menu beside it. */
  const spelling = async () => {
    const doc = docsRef.current.find((d) => d.id === activeId);
    if (!doc) return;
    const r = (await ask_('review.spelling')) as (Issue & { done?: boolean }) | null;
    if (!r || r.done) {
      setNotice({ text: t.spellingDone });
      return;
    }
    // The issue is selected now; open the menu under it.
    setTimeout(() => {
      const d = docsRef.current.find((x) => x.id === doc.id);
      const sel = d?.selection[0];
      const p = sel ? screenPoint(sel.page, sel.x, sel.y + sel.height) : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      setMenu({ x: p.x, y: p.y + 4, items: [...issueItems(r), { label: t.findNext, onClick: () => void spellingRef.current() }] });
    }, 30);
  };
  const spellingRef = useRef(spelling);
  spellingRef.current = spelling;

  const wordCount = async () => {
    const r = (await ask_('review.wordCount')) as WordCountInfo | null;
    if (r) setDialog({ kind: 'wordCount', info: r });
  };
  const wordCountRef = useRef(wordCount);
  wordCountRef.current = wordCount;

  // The status bar's word count, after typing pauses.
  useEffect(() => {
    if (!active) {
      setWords(null);
      return;
    }
    const id = active.id;
    const timer = setTimeout(() => {
      engine
        .command(id, 'review.wordCount')
        .then((r) => {
          const n = (r.result as WordCountInfo).words;
          const selecting = active.selection.length > 0 && !active.object;
          setWords((w) => (selecting ? { total: w?.total ?? n, selected: n } : { total: n, selected: null }));
        })
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [active]);

  // History: the undo steps from the engine, and the undone ones kept here (greyed in the panel).
  const lastUndo = useRef<Record<number, { labels: string[]; depth: number }>>({});
  useEffect(() => {
    if (!active) return;
    const { id, canRedo } = active;
    const timer = setTimeout(() => {
      engine
        .command(id, 'edit.undoHistory')
        .then((r) => {
          const res = r.result as { undo: string[]; depth: number };
          const labels = res.undo ?? [];
          const depth = res.depth ?? labels.length;
          const before = lastUndo.current[id] ?? { labels: [], depth: 0 };
          lastUndo.current[id] = { labels, depth };
          setHistories((all) => {
            const prev = all[id]?.undone ?? [];
            const delta = depth - before.depth;
            let undone = prev;
            if (!r.state.canRedo && !canRedo) undone = [];
            else if (delta < 0) undone = [...before.labels.slice(0, -delta).reverse(), ...prev];
            else if (delta > 0) undone = prev.slice(delta);
            return { ...all, [id]: { done: [...labels].reverse(), undone } };
          });
        })
        .catch(() => undefined);
    }, 120);
    return () => clearTimeout(timer);
  }, [active]);

  /** Replace every misspelling that has a suggestion with its first one, as one Undo step. */
  const fixAllSpelling = async (found?: ProofIssue[]) => {
    const doc = docsRef.current.find((d) => d.id === activeId);
    if (!doc) return;
    const list = (found ?? (await engine.proofread(doc.id).catch(() => [] as ProofIssue[]))).filter(
      (i) => i.autoFix,
    );
    if (list.length === 0) {
      setNotice({ text: t.noMisspellings });
      return;
    }
    const sure = await ask(t.fixAllConfirm.replace('{n}', String(list.length)), { title: t.fixAllSpelling, kind: 'info', okLabel: t.fixAll, cancelLabel: t.cancel });
    if (!sure) return;
    const fixes = list.map((i) => ({ start: i.start, end: i.end, text: i.text, replacement: i.suggestions[0] }));
    await view.current?.edit(() => engine.proofreadFix(doc.id, fixes));
    setNotice({ text: t.fixedN.replace('{n}', String(list.length)) });
  };

  const proofreadActions = {
    onSelect: (i: ProofIssue) => onCommand('select.range', { anchor: i.start, focus: i.end }),
    onFix: (i: ProofIssue, replacement: string) => {
      if (!active) return;
      const id = active.id;
      void view.current?.edit(() => engine.proofreadFix(id, [{ start: i.start, end: i.end, text: i.text, replacement }]));
    },
    onIgnoreWord: (word: string) => onCommand('review.ignoreAll', { word }),
    onFixAll: (list: ProofIssue[]) => void fixAllSpelling(list),
  };

  /** The Spelling menu under its button in the title bar. */
  const spellingMenuOpen = useRef(false);
  const openSpellingMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (spellingMenuOpen.current) {
      spellingMenuOpen.current = false;
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 4,
      items: [
        { label: t.nextMisspelling, hint: 'F7 · Ctrl+Alt+S', icon: <SpellCheck className="h-3.5 w-3.5" />, onClick: () => void spellingRef.current() },
        { label: t.proofread, hint: 'Ctrl+Alt+P', icon: <SpellCheck2 className="h-3.5 w-3.5" />, onClick: () => setPanel('proofread') },
        { label: t.fixAllSpelling, icon: <WandSparkles className="h-3.5 w-3.5" />, onClick: () => void fixAllSpelling() },
      ],
    });
  };

  // The ribbon catches up with typing a moment later, so a keystroke only redraws the page.
  const ribbonDoc = useDeferredValue(active);
  const latestHandlers = useRef({ openPaths, onCommand, onAction: (_: RibbonAction) => {}, onMore: (_: MoreAction) => {}, onZoom: (_: Zoom) => {} });
  const ribbonMore = useCallback((a: MoreAction) => latestHandlers.current.onMore(a), []);
  const ribbonZoom = useCallback((z: Zoom) => latestHandlers.current.onZoom(z), []);
  const ribbonOpenRecent = useCallback((path: string) => void latestHandlers.current.openPaths([path]), []);
  const ribbonClearRecent = useCallback(() => setRecent([]), []);
  const ribbonCommand = useCallback((name: string, params?: Record<string, unknown>) => latestHandlers.current.onCommand(name, params), []);
  const ribbonAction = useCallback((a: RibbonAction) => latestHandlers.current.onAction(a), []);

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
      case 'print':
        return doc && setDialog({ kind: 'print' });
      case 'copy':
        return void view.current?.copy();
      case 'cut':
        return void view.current?.cut();
      case 'paste':
        return paste('keep');
      case 'picture': {
        const picked = await openDialog({
          multiple: false,
          filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'emf', 'wmf'] }],
        });
        if (typeof picked === 'string') onCommand('insert.picture', { path: picked });
        return;
      }
      case 'signature':
        return setDialog({ kind: 'signature' });
      case 'link':
        return setDialog({ kind: 'link' });
      case 'symbol':
        return setDialog({ kind: 'symbol' });
      case 'comment':
        return setDialog({ kind: 'comment' });
      case 'wordCount':
        return void wordCount();
      case 'spelling':
        return void spelling();
      case 'find':
        return setFindBar('find');
      case 'replace':
        return setFindBar('replace');
      case 'history':
        return setPanel((p) => (p === 'history' ? null : 'history'));
      case 'comments':
        return setPanel((p) => (p === 'comments' ? null : 'comments'));
    }
  };
  /** Paste what the clipboard holds: formatted text, plain text or a picture. */
  const paste = (mode: 'keep' | 'merge' | 'text' | 'picture') => {
    const doc = active;
    if (!doc) return;
    void view.current?.edit(async () => {
      try {
        return (await engine.paste(doc.id, mode)).state;
      } catch (e) {
        // The engine can't see the clipboard (some Linux desktops): fall back to its text.
        const text = await readText().catch(() => '');
        if (text) return (await engine.command(doc.id, mode === 'text' ? 'edit.pasteText' : 'edit.paste', { text })).state;
        showError(String(e) === 'the clipboard is empty' ? t.clipboardEmpty : String(e));
        return null;
      }
    });
  };

  const dialogAsk = useCallback((name: string, params?: Record<string, unknown>) => ask_(name, params, true), [ask_]);
  const applyCommands = (list: Commands) => void view.current?.commands(list);
  const thesaurusLookup = useCallback(() => (activeId === null ? Promise.reject(new Error('no document')) : engine.thesaurus(activeId)), [activeId]);
  const unit = lang === 'en' ? ('in' as const) : ('cm' as const);

  const onZoom = (z: Zoom) => {
    if (typeof z === 'number') return setZoom(z);
    const page = active?.pages[Math.min(currentPage, (active?.pages.length ?? 1) - 1)];
    const box = view.current?.viewport();
    if (!page || !box) return;
    const perPt = 96 / 72;
    const width = (box.width - 56) / (page.width * perPt);
    const fit = z === 'pageWidth' ? width : Math.min(width, (box.height - 48) / (page.height * perPt));
    setZoom(Math.min(3, Math.max(0.5, Math.floor(fit * 100) / 100)));
  };

  const pickFile = async (title: string, extensions: string[]) => {
    const picked = await openDialog({ title, multiple: false, filters: [{ name: 'Documents', extensions }] });
    return typeof picked === 'string' ? picked : null;
  };

  const onMore = async (action: MoreAction) => {
    const doc = active;
    switch (action) {
      case 'pasteKeep':
        return paste('keep');
      case 'pasteMerge':
        return paste('merge');
      case 'pasteText':
        return paste('text');
      case 'pastePicture':
        return paste('picture');
      case 'navPane':
        return setNavOpen((o) => !o);
      case 'readMode':
        setFindBar(null);
        return setReadMode(true);
      case 'template': {
        const path = await pickFile(t.newFromTemplate, TEMPLATE_EXTENSIONS);
        if (!path) return;
        untitledCount.current += 1;
        try {
          addDoc(await engine.newFromTemplate(path, `${t.untitled} ${untitledCount.current}.docx`));
        } catch (e) {
          showError(`${t.couldNotOpen} ${baseName(path)}: ${e}`);
        }
        return;
      }
      case 'compare': {
        const original = await pickFile(t.compareOriginal, OPEN_EXTENSIONS);
        if (!original) return;
        const revised = await pickFile(t.compareRevised, OPEN_EXTENSIONS);
        if (!revised) return;
        try {
          addDoc(await engine.compare(original, revised, `${t.compareResult} ${withoutExtension(baseName(revised))}.docx`));
          setNotice({ text: t.compareDone });
        } catch (e) {
          showError(String(e));
        }
        return;
      }
    }
    if (!doc) return;
    switch (action) {
      case 'fontDialog':
        return setDialog({ kind: 'font' });
      case 'paragraphDialog': {
        const info = await engine.paragraph(doc.id).catch(() => null);
        if (info) setDialog({ kind: 'paragraph', info });
        return;
      }
      case 'pageSetup':
        return setDialog({ kind: 'pageSetup' });
      case 'customWatermark':
        return setDialog({ kind: 'watermark' });
      case 'caption':
        return setDialog({ kind: 'caption' });
      case 'crossReference':
        return setDialog({ kind: 'crossReference' });
      case 'bookmark':
        return setDialog({ kind: 'bookmark' });
      case 'dateTime':
        return setDialog({ kind: 'dateTime' });
      case 'password':
        return setDialog({ kind: 'protect' });
      case 'properties':
        return setDialog({ kind: 'properties' });
      case 'thesaurus':
        return setDialog({ kind: 'thesaurus' });
      case 'printPreview':
        return setDialog({ kind: 'preview' });
    }
  };

  const openWithPassword = async (path: string, password: string) => {
    try {
      const state = await engine.open(path, password);
      setDialog(null);
      docsRef.current = [...docsRef.current, state];
      addDoc(state);
      remember(path);
    } catch (e) {
      if (String(e) === 'WRONG_PASSWORD') setDialog({ kind: 'openPassword', path, wrong: true });
      else {
        setDialog(null);
        showError(`${t.couldNotOpen} ${baseName(path)}: ${e}`);
      }
    }
  };

  /** The Navigation pane's heading: the cursor goes there, and the page scrolls to it. */
  const goToHeading = (index: number) => {
    void view.current?.command('caret.set', { pos: { story: 'body', path: [index], off: 0 } }).then(() => {
      requestAnimationFrame(() => {
        const caret = document.querySelector<HTMLElement>('.lithora-caret');
        if (!caret) return;
        // Near the top, with a little room above it so the heading isn't cut off.
        caret.style.scrollMarginTop = '72px';
        caret.scrollIntoView({ block: 'start' });
      });
    });
  };

  latestHandlers.current = { openPaths, onCommand, onAction: (a) => void onAction(a), onMore: (a) => void onMore(a), onZoom };

  const insertSignature = (png: string, widthPt: number) => {
    // In line with the text at the cursor, like a typed word; right-click to float it.
    void view.current?.commands([['insert.picture', { data: png, width: widthPt, alt: t.signature }]]);
  };

  const openRecovered = async (r: RecoveredDoc) => {
    const base = r.name === 'Untitled draft' ? t.untitled : withoutExtension(r.name);
    const ext = r.name.match(/\.[^.]+$/)?.[0] ?? '.docx';
    try {
      const state = await engine.recoveryOpen(r.id, `${base} (${t.recovered})${ext}`);
      addDoc(state);
    } catch (e) {
      showError(String(e));
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#E9EEF5] font-sans text-slate-800">
      {/* Header */}
      {/* On Windows this is also the window's title bar: drag it to move the window, double-click to maximize. */}
      <header
        data-tauri-drag-region
        className={`flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white pl-4 select-none ${OWN_TITLE_BAR ? '' : 'pr-4'}`}
      >
        <div data-tauri-drag-region className="flex items-center gap-2">
          <LithoraLogo className="h-6 w-6" />
          <span className="text-[16px] tracking-tight text-[#083B69]" style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600 }}>
            Lithora
          </span>
        </div>
        <span className="h-5 w-px bg-slate-200" />
        <span data-tauri-drag-region className="min-w-0 truncate text-[13px] font-medium text-slate-700" title={active?.path ?? active?.name}>
          {active?.name}
        </span>
        <div data-tauri-drag-region className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!active}
            title={`${t.history} (Ctrl+Alt+H)`}
            onClick={() => setPanel((p) => (p === 'history' ? null : 'history'))}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium hover:bg-slate-100 disabled:opacity-40 ${
              panel === 'history' ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-700'
            }`}
          >
            <History className="h-4 w-4 text-[#376FA3]" /> {t.history}
          </button>
          <SettingsMenu t={t} autosave={autosave} onAutosave={setAutosave} updateCheck={updateCheck} onUpdateCheck={setUpdateCheck} />
          <button
            type="button"
            disabled={!active}
            onMouseDown={() => (spellingMenuOpen.current = menu !== null)}
            onClick={openSpellingMenu}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium hover:bg-slate-100 disabled:opacity-40 ${
              panel === 'proofread' ? 'bg-[#376FA3]/15 text-[#083B69]' : 'text-slate-700'
            }`}
          >
            <SpellCheck className="h-4 w-4 text-[#376FA3]" /> {t.spelling}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
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
          <UpdateButton t={t} unsavedNames={unsavedNames} notify={notify} autoCheck={updateCheck} />
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
        {OWN_TITLE_BAR && <WindowControls t={t} />}
      </header>

      {/* Tabs */}
      {readMode ? (
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-slate-200 bg-[#FBF8F0] px-4 text-[13px] select-none">
          <BookOpen className="h-4 w-4 text-[#376FA3]" />
          <span className="font-medium text-[#083B69]">{t.readMode}</span>
          <span className="text-slate-500">{t.readModeHint}</span>
          <button
            type="button"
            onClick={() => setReadMode(false)}
            className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {t.exitReadMode}
          </button>
        </div>
      ) : (
      <div className="lithora-slim-scroll flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b border-slate-200 bg-[#EEF1F6] px-2 select-none">
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
      )}

      {!readMode && (
      <Ribbon
        t={t}
        doc={ribbonDoc}
        fonts={fonts}
        recent={recent}
        onOpenRecent={ribbonOpenRecent}
        onClearRecent={ribbonClearRecent}
        onCommand={ribbonCommand}
        onAction={ribbonAction}
        recoveryEvery={autosaveLabel(t, autosave).toLocaleLowerCase(lang)}
        onMore={ribbonMore}
        zoom={zoom}
        onZoom={ribbonZoom}
        navOpen={navOpen}
      />
      )}

      {active && findBar && !readMode && (
        <FindBar
          t={t}
          replaceMode={findBar === 'replace'}
          onCommand={(name, params) => ask_(name, params, true)}
          onClose={() => {
            setFindBar(null);
            view.current?.focus();
          }}
        />
      )}

      {active ? (
        <div className="flex min-h-0 flex-1">
          {navOpen && !readMode && <NavPane t={t} doc={active} onGo={goToHeading} onClose={() => setNavOpen(false)} />}
          <PageView
            key={active.id}
            ref={view}
            doc={active}
            zoom={zoom}
            onState={updateDoc}
            onError={showError}
            onShortcut={shortcut}
            onCurrentPage={setCurrentPage}
            onContextMenu={(x, y) => void openContextMenu(x, y)}
            readOnly={readMode}
          />
          {panel && !readMode && (
            <SidePanel
              t={t}
              lang={lang}
              kind={panel}
              doc={active}
              history={histories[active.id] ?? { done: [], undone: [] }}
              onKind={setPanel}
              onClose={() => setPanel(null)}
              onCommand={onCommand}
              onUndoTo={(count) => onCommand('edit.undoTo', { count })}
              onRedo={(count) => void view.current?.commands(Array.from({ length: count }, () => ['edit.redo'] as [string]))}
              onReply={(id) => setDialog({ kind: 'reply', id })}
              proofread={proofreadActions}
            />
          )}
        </div>
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
            {words !== null && (
              <button type="button" onClick={() => void wordCount()} className="rounded px-1 hover:bg-slate-100" title={t.wordCount}>
                {words.selected !== null
                  ? t.wordsOf.replace('{n}', words.selected.toLocaleString()).replace('{total}', words.total.toLocaleString())
                  : words.total === 1
                    ? t.wordsOne
                    : t.wordsShort.replace('{n}', words.total.toLocaleString())}
              </button>
            )}
            <span className={active.dirty ? 'text-[#376FA3]' : 'text-emerald-700'}>{active.dirty ? t.unsaved : t.saved}</span>
            {active.trackChanges && <span className="rounded bg-red-50 px-1.5 text-red-700">{t.trackChanges}</span>}
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {dialog?.kind === 'print' && active && (
        <PrintDialog
          t={t}
          docId={active.id}
          hasSelection={active.selection.length > 0}
          currentPage={currentPage}
          onClose={() => setDialog(null)}
          onDone={(text, error) => setNotice({ text, error })}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkDialog t={t} initialText="" onClose={() => setDialog(null)} onInsert={(url, text) => onCommand('insert.link', text ? { url, text } : { url })} />
      )}
      {dialog?.kind === 'symbol' && <SymbolDialog t={t} onClose={() => setDialog(null)} onInsert={(char) => onCommand('insert.symbol', { char })} />}
      {dialog?.kind === 'wordCount' && <WordCountDialog t={t} info={dialog.info} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'comment' && (
        <TextDialog
          title={t.newComment}
          placeholder={t.commentPlaceholder}
          okLabel={t.insertBtn}
          cancelLabel={t.cancel}
          onClose={() => setDialog(null)}
          onSubmit={(text) => {
            // The comment's marks shift the text, so the old selection would no longer match it.
            void view.current?.commands([
              ['review.newComment', { text }],
              ['select.collapse', {}],
            ]);
            setPanel('comments');
          }}
        />
      )}
      {dialog?.kind === 'reply' && (
        <TextDialog
          title={t.reply}
          placeholder={t.commentPlaceholder}
          okLabel={t.reply}
          cancelLabel={t.cancel}
          onClose={() => setDialog(null)}
          onSubmit={(text) => onCommand('review.reply', { id: dialog.id, text })}
        />
      )}
      {dialog?.kind === 'font' && active && (
        <FontDialog t={t} format={active.format} fonts={fonts} onClose={() => setDialog(null)} onApply={applyCommands} />
      )}
      {dialog?.kind === 'paragraph' && <ParagraphDialog t={t} unit={unit} info={dialog.info} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'pageSetup' && <PageSetupDialog t={t} unit={unit} ask={dialogAsk} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'watermark' && <WatermarkDialog t={t} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'caption' && <CaptionDialog t={t} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'crossReference' && <CrossReferenceDialog t={t} ask={dialogAsk} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'bookmark' && <BookmarkDialog t={t} ask={dialogAsk} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'dateTime' && <DateTimeDialog t={t} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'protect' && active && (
        <ProtectDialog
          t={t}
          encrypted={active.encrypted}
          isWordFile={!active.path || /\.(docx|docm|dotx|dotm|doc)$/i.test(active.path)}
          onClose={() => setDialog(null)}
          onApply={(list) => {
            applyCommands(list);
            setNotice({ text: list[0]?.[1]?.password ? t.passwordSet : t.passwordRemoved });
          }}
        />
      )}
      {dialog?.kind === 'openPassword' && (
        <OpenPasswordDialog
          t={t}
          name={baseName(dialog.path)}
          wrong={dialog.wrong}
          onClose={() => setDialog(null)}
          onOpen={(pw) => void openWithPassword(dialog.path, pw)}
        />
      )}
      {dialog?.kind === 'properties' && <PropertiesDialog t={t} ask={dialogAsk} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'thesaurus' && <ThesaurusDialog t={t} lookup={thesaurusLookup} onClose={() => setDialog(null)} onApply={applyCommands} />}
      {dialog?.kind === 'preview' && active && (
        <PrintPreview
          t={t}
          docId={active.id}
          pages={active.pages}
          startPage={currentPage}
          onClose={() => setDialog(null)}
          onPrint={() => setDialog({ kind: 'print' })}
        />
      )}
      {dialog?.kind === 'signature' && <SignatureDialog t={t} onClose={() => setDialog(null)} onInsert={insertSignature} onError={showError} />}
      {dialog?.kind === 'recovery' && (
        <RecoveryDialog
          t={t}
          docs={dialog.docs}
          onClose={() => setDialog(null)}
          onOpen={(r) => {
            void openRecovered(r);
            const rest = dialog.docs.filter((d) => d.id !== r.id);
            setDialog(rest.length ? { kind: 'recovery', docs: rest } : null);
          }}
          onDiscard={(r) => {
            void engine.recoveryDiscard(r.id);
            const rest = dialog.docs.filter((d) => d.id !== r.id);
            setDialog(rest.length ? { kind: 'recovery', docs: rest } : null);
          }}
        />
      )}
    </div>
  );
};
