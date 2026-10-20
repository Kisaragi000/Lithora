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
  trackChanges: boolean;
  /** The selected picture or shape's frame. */
  object: Mark | null;
  lineSpacing: number | null;
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

interface CommandReply {
  state: DocState;
  result: unknown;
}

export const engine = {
  open: (path: string) => invoke<DocState>('engine_open', { path }),
  create: (name: string) => invoke<DocState>('engine_new', { name }),
  close: (doc: number) => invoke<void>('engine_close', { doc }),
  state: (doc: number) => invoke<DocState>('engine_state', { doc }),
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
