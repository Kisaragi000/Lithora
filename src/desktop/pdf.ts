// Calls into Lithora's PDF editor (src-tauri/src/pdf): one open PDF per tab. Positions and
// sizes are in points from the page's top-left corner, as the page is shown.
import { invoke } from '@tauri-apps/api/core';
import type { PageSize, PrintOptions } from './engine';

export interface PdfInfo {
  id: number;
  name: string;
  path: string | null;
  pages: PageSize[];
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Opened with a password (and saved with it). */
  encrypted: boolean;
  /** Fonts the PDF names but neither holds nor finds on this computer. */
  missingFonts: number;
}

/** A line of text on a page, as it can be edited. */
export interface PdfText {
  key: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseline: number;
  /** Where each letter starts, and where the last one ends (one more than the letters). */
  edges: number[];
  /** The font's name in the PDF ("Calibri Bold") and its family. */
  font: string;
  family: string;
  fontKey: number | null;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  editable: boolean;
  edited: boolean;
  /** Fonts some of its letters are drawn in instead, because the PDF's copy lacks them. */
  substituted: string[];
}

export interface PdfGraphic {
  id: number;
  kind: 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  edited: boolean;
}

/** A signature (or other picture) placed on the page. */
export interface PdfStamp {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageItems {
  page: number;
  /** Why the page's text can't be edited ("rotated"), if it can't. */
  locked: string | null;
  texts: PdfText[];
  graphics: PdfGraphic[];
  stamps: PdfStamp[];
}

export interface PdfEditReply {
  info: PdfInfo;
  items: PdfPageItems;
}

export interface PdfStyleChange {
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export type FontStatus = 'missing' | 'subset' | 'embedded' | 'builtin' | 'installed';

export interface PdfFontReport {
  key: number;
  name: string;
  family: string;
  bold: boolean;
  italic: boolean;
  embedded: 'no' | 'subset' | 'full';
  installed: boolean;
  status: FontStatus;
  /** The font new letters (or the whole text, when missing) are drawn in. */
  replacement: string;
  /** The user chose the replacement. */
  replaced: boolean;
  pages: number[];
}

/** A drawn page (or part of it): its size and where it starts on the page, in pixels. */
export interface PdfImage {
  width: number;
  height: number;
  x: number;
  y: number;
  image: ImageData;
}

/** A rectangle: x, y, width, height. */
export type Rect = [number, number, number, number];

export const pdf = {
  open: (path: string, password?: string) => invoke<PdfInfo>('pdf_open', { path, password: password ?? null }),
  close: (doc: number) => invoke<void>('pdf_close', { doc }),
  state: (doc: number) => invoke<PdfInfo>('pdf_state', { doc }),
  async render(doc: number, page: number, scale: number, rect?: Rect): Promise<PdfImage> {
    const buf = await invoke<ArrayBuffer>('pdf_render_page', { doc, page, scale, rect: rect ?? null });
    const view = new DataView(buf);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const x = view.getUint32(8, true);
    const y = view.getUint32(12, true);
    return { width, height, x, y, image: new ImageData(new Uint8ClampedArray(buf, 16, width * height * 4), width, height) };
  },
  items: (doc: number, page: number) => invoke<PdfPageItems>('pdf_page_items', { doc, page }),
  setText: (doc: number, page: number, key: string, text: string, undoable: boolean) =>
    invoke<PdfEditReply>('pdf_set_text', { doc, page, key, text, undoable }),
  /** Restyle letters from..to of a line (the whole line when both are 0). */
  styleText: (doc: number, page: number, key: string, from: number, to: number, change: PdfStyleChange) =>
    invoke<PdfEditReply>('pdf_style_text', { doc, page, key, from, to, change }),
  moveText: (doc: number, page: number, key: string, dx: number, dy: number) => invoke<PdfEditReply>('pdf_move_text', { doc, page, key, dx, dy }),
  addText: (doc: number, page: number, x: number, y: number, text: string) => invoke<[string, PdfEditReply]>('pdf_add_text', { doc, page, x, y, text }),
  deleteText: (doc: number, page: number, key: string) => invoke<PdfEditReply>('pdf_delete_text', { doc, page, key }),
  /** Put a picture or shape in `rect`, or take it off the page (null). */
  placeGraphic: (doc: number, page: number, id: number, rect: Rect | null) => invoke<PdfEditReply>('pdf_place_graphic', { doc, page, id, rect }),
  addStamp: (doc: number, page: number, png: string, rect: Rect) => invoke<[number, PdfEditReply]>('pdf_add_stamp', { doc, page, png, rect }),
  placeStamp: (doc: number, page: number, id: number, rect: Rect | null) => invoke<PdfEditReply>('pdf_place_stamp', { doc, page, id, rect }),
  undo: (doc: number) => invoke<{ info: PdfInfo; pages: number[] }>('pdf_undo', { doc }),
  redo: (doc: number) => invoke<{ info: PdfInfo; pages: number[] }>('pdf_redo', { doc }),
  save: (doc: number, path?: string) => invoke<PdfInfo>('pdf_save', { doc, path: path ?? null }),
  fonts: (doc: number) => invoke<PdfFontReport[]>('pdf_fonts', { doc }),
  replaceFont: (doc: number, key: number, family: string | null) => invoke<PdfInfo>('pdf_replace_font', { doc, key, family }),
  print: (doc: number, options: PrintOptions) => invoke<string>('pdf_print', { doc, options }),
  /** Add a font file to Lithora (kept for next time). Returns the families in it. */
  addFontFile: (path: string) => invoke<string[]>('fonts_add_file', { path }),
  installedFonts: () => invoke<string[]>('fonts_installed'),
};

export const isPdfPath = (path: string) => /\.pdf$/i.test(path);

/** How many letters (code points) a piece of text has: the editor counts them, not UTF-16 units. */
export const letterCount = (s: string) => Array.from(s).length;

/** The letter index for a UTF-16 position in `s`. */
export function letterIndex(s: string, utf16: number): number {
  return Array.from(s.slice(0, utf16)).length;
}

/** The UTF-16 position of letter `n` of `s`. */
export function utf16Index(s: string, n: number): number {
  return Array.from(s).slice(0, n).join('').length;
}
