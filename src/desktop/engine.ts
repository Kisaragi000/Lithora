// Calls into Lithora's document engine (src-tauri/src/engine), one session per open document.
import { invoke } from '@tauri-apps/api/core';

export interface PageSize {
  width: number;
  height: number;
}

/** A rectangle on one page, in points from the page's top-left corner. */
export interface Mark {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Formatting at the cursor, from the engine's format.state. A null field is mixed. */
export interface FormatState {
  font?: string | null;
  size?: number | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string | null;
  highlight?: string | null;
  style?: string;
  styleName?: string;
}

export interface DocState {
  id: number;
  name: string;
  path: string | null;
  pages: PageSize[];
  cursor: Mark | null;
  selection: Mark[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  format: FormatState | null;
  align: string | null;
  /** Where the cursor is: body, header, footer, textBox, note or comment. */
  story: string;
  inTable: boolean;
  /** Vertical alignment: the table cell's in a table, otherwise the page's. */
  valign: 'top' | 'center' | 'justify' | 'bottom';
  trackChanges: boolean;
  /** The selected picture or shape's frame. */
  object: Mark | null;
  lineSpacing: number | null;
  /** Format Painter holds formatting for the next selection. */
  painter: boolean;
  /** Formatting marks (¶) are shown. */
  marks: boolean;
  /** Saved with a password. */
  encrypted: boolean;
}

/** A heading in the Navigation pane. */
export interface Heading {
  index: number;
  level: number;
  text: string;
}

/** The cursor paragraph's settings as they come out on the page (points). */
export interface ParagraphInfo {
  align: string;
  indentLeft: number;
  indentRight: number;
  indentFirst: number;
  spaceBefore: number;
  spaceAfter: number;
  lineSpacing: { rule: "multiple" | "atLeast" | "exactly"; value: number };
  keepNext: boolean;
  keepLines: boolean;
  pageBreakBefore: boolean;
  widowControl: boolean;
  contextualSpacing: boolean;
}

export interface Printer {
  name: string;
  default: boolean;
  twoSided: boolean | null;
}

export interface PrintOptions {
  printer: string | null;
  copies: number;
  collate: boolean;
  range: 'all' | 'current' | 'selection' | 'custom';
  pages: string | null;
  duplex: 'printerDefault' | 'off' | 'longEdge' | 'shortEdge';
  grayscale: boolean;
  currentPage: number | null;
}

export interface RecoveredDoc {
  id: string;
  name: string;
  savedAt: string;
}

export interface Signature {
  id: string;
  /** PNG, base64. */
  data: string;
}

/** A page drawn by the engine: its size in pixels, and the rows that changed from `top` down (none: no change). */
export interface PageImage {
  width: number;
  height: number;
  top: number;
  band: ImageData | null;
}

/** A place in the document, as the engine names it. */
export type Pos = unknown;

/** One issue Proofread found. */
export interface ProofIssue {
  start: Pos;
  end: Pos;
  text: string;
  kind: 'spelling' | 'grammar' | 'style';
  message: string;
  suggestions: string[];
  /** The words around it, and where the issue is in them. */
  context: string;
  at: [number, number];
  /** A misspelling Fix all corrects (a close suggestion, not a name). */
  autoFix: boolean;
}

/** Replace the text between `start` and `end` (if it still reads `text`). */
export interface ProofFix {
  start: Pos;
  end: Pos;
  text: string;
  replacement: string;
}

interface CommandReply {
  state: DocState;
  result: unknown;
}

export const engine = {
  open: (path: string, password?: string) => invoke<DocState>('engine_open', { path, password: password ?? null }),
  newFromTemplate: (path: string, name: string) => invoke<DocState>('engine_new_from_template', { path, name }),
  compare: (original: string, revised: string, name: string) => invoke<DocState>('engine_compare', { original, revised, name }),
  headings: (doc: number) => invoke<Heading[]>('engine_headings', { doc }),
  thesaurus: (doc: number) => invoke<{ word: string; synonyms: string[]; anchor?: unknown; focus?: unknown }>('engine_thesaurus', { doc }),
  paragraph: (doc: number) => invoke<ParagraphInfo | null>('engine_paragraph', { doc }),
  /** Paste the clipboard: keep source formatting, merge with the text around, text only, or a picture. */
  paste: (doc: number, mode: 'keep' | 'merge' | 'text' | 'picture') => invoke<CommandReply>('engine_paste', { doc, mode }),
  clipboardKinds: () => invoke<{ text: boolean; picture: boolean }>('clipboard_kinds'),
  /** Draw a whole page for Print Preview, apart from the editing view's drawings. */
  async previewPage(doc: number, page: number, scale: number): Promise<ImageData> {
    const buf = await invoke<ArrayBuffer>('engine_preview_page', { doc, page, scale });
    const view = new DataView(buf);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    return new ImageData(new Uint8ClampedArray(buf, 16, width * height * 4), width, height);
  },
  create: (name: string) => invoke<DocState>('engine_new', { name }),
  close: (doc: number) => invoke<void>('engine_close', { doc }),
  state: (doc: number) => invoke<DocState>('engine_state', { doc }),
  /** Show document `doc` in a window of its own at screen point (x, y), logical pixels. */
  openDocWindow: (doc: number, title: string, x: number, y: number) => invoke<void>('open_doc_window', { doc, title, x, y }),
  type: (doc: number, text: string) => invoke<DocState>('engine_type', { doc, text }),
  key: (doc: number, key: string) => invoke<DocState | null>('engine_key', { doc, key }),
  click: (doc: number, page: number, x: number, y: number, extend: boolean) =>
    invoke<DocState>('engine_click', { doc, page, x, y, extend }),
  command: (doc: number, command: string, params?: Record<string, unknown>) =>
    invoke<CommandReply>('engine_command', { doc, command, params: params ?? null }),
  save: (doc: number, path?: string) => invoke<DocState>('engine_save', { doc, path: path ?? null }),
  doubleClick: (doc: number, page: number, x: number, y: number) => invoke<DocState>('engine_double_click', { doc, page, x, y }),
  fonts: (doc: number) => invoke<string[]>('engine_fonts', { doc }),
  printers: () => invoke<Printer[]>('print_printers'),
  print: (doc: number, options: PrintOptions) => invoke<string>('engine_print', { doc, options }),
  recoveryList: () => invoke<RecoveredDoc[]>('recovery_list'),
  recoveryOpen: (id: string, name: string) => invoke<DocState>('recovery_open', { id, name }),
  recoveryDiscard: (id: string) => invoke<void>('recovery_discard', { id }),
  signatures: () => invoke<Signature[]>('signatures_list'),
  addSignature: (data: string) => invoke<string>('signature_add', { data }),
  deleteSignature: (id: string) => invoke<void>('signature_delete', { id }),
  startupFiles: () => invoke<string[]>('startup_files'),
  /** How often recovery copies of unsaved changes are kept, in seconds. */
  setRecoveryInterval: (seconds: number) => invoke<void>('recovery_set_interval', { seconds }),
  proofread: (doc: number) => invoke<ProofIssue[]>('engine_proofread', { doc }),
  /** Make these changes as one Undo step. */
  proofreadFix: (doc: number, fixes: ProofFix[]) => invoke<DocState>('engine_proofread_fix', { doc, fixes }),
  /**
   * Draw one page at `scale` pixels per point. With `have` (the window holds this page as the
   * engine last sent it, at this scale) only the rows that changed come back, or none.
   */
  async renderPage(doc: number, page: number, scale: number, have: boolean): Promise<PageImage> {
    const buf = await invoke<ArrayBuffer>('engine_render_page', { doc, page, scale, have });
    const view = new DataView(buf);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const top = view.getUint32(8, true);
    const rows = view.getUint32(12, true);
    const band = rows > 0 ? new ImageData(new Uint8ClampedArray(buf, 16, width * rows * 4), width, rows) : null;
    return { width, height, top, band };
  },
};

/** File types Lithora opens. */
export const OPEN_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'rtf', 'odt', 'ott', 'xml', 'htm', 'html', 'md', 'txt'];

/** File types Lithora saves, in the order the Save dialog offers them. */
export const SAVE_FILTERS = [
  { name: 'Word document', extensions: ['docx'] },
  { name: 'Rich Text Format', extensions: ['rtf'] },
  { name: 'OpenDocument text', extensions: ['odt'] },
  { name: 'Word 97-2003 document', extensions: ['doc'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Web page', extensions: ['html'] },
  { name: 'Markdown', extensions: ['md'] },
  { name: 'Plain text', extensions: ['txt'] },
];
