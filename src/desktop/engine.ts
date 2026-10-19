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
  fonts: (doc: number) => invoke<string[]>('engine_fonts', { doc }),
  startupFiles: () => invoke<string[]>('startup_files'),
  async renderPage(doc: number, page: number, scale: number): Promise<ImageData> {
    const buf = await invoke<ArrayBuffer>('engine_render_page', { doc, page, scale });
    const view = new DataView(buf);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    return new ImageData(new Uint8ClampedArray(buf, 8, width * height * 4), width, height);
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
