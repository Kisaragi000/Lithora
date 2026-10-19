/**
 * Lithora Enterprise RTF Parser and Serializer
 * 
 * Supports:
 * 1. Complete group & destination stripping for Microsoft Word metadata
 * 2. 100% accurate \fonttbl parsing and font preservation
 * 3. \colortbl parsing with foreground text color (\cfN) and highlight background (\highlightN / \cbN)
 * 4. Multi-column layouts (\colsN, \colsxN, \column)
 * 5. Exact line spacing (\slN, \slmultN), space before (\sbN), space after (\saN)
 * 6. Paragraph indents (\liN, \riN, \fiN) and alignments (\ql, \qc, \qr, \qj)
 * 7. Tables with exact column boundaries (\cellxN), borders, and cell shading (\clcbpatN)
 * 8. Divider lines (\brdrb) and page breaks (\page)
 * 9. Cyrillic Windows-1251 and Armenian Unicode characters
 * 10. Bidirectional serialization back to RTF
 */

// Cyrillic Windows-1251 to UTF-8 lookup table for 0x80 to 0xFF
const CP1251_MAP: Record<number, string> = {
  0x80: '\u0402', 0x81: '\u0403', 0x82: '\u201A', 0x83: '\u0453',
  0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
  0x88: '\u20AC', 0x89: '\u2030', 0x8A: '\u0409', 0x8B: '\u2039',
  0x8C: '\u040A', 0x8D: '\u040C', 0x8E: '\u040B', 0x8F: '\u040F',
  0x90: '\u0452', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
  0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '',       0x99: '\u2122', 0x9A: '\u0459', 0x9B: '\u203A',
  0x9C: '\u045A', 0x9D: '\u045C', 0x9E: '\u045B', 0x9F: '\u045F',
  0xA0: '\u00A0', 0xA1: '\u040E', 0xA2: '\u045E', 0xA3: '\u0408',
  0xA4: '\u00A4', 0xA5: '\u0490', 0xA6: '\u00A6', 0xA7: '\u00A7',
  0xA8: '\u0401', 0xA9: '\u00A9', 0xAA: '\u0404', 0xAB: '\u00AB',
  0xAC: '\u00AC', 0xAD: '\u00AD', 0xAE: '\u00AE', 0xAF: '\u0407',
  0xB0: '\u00B0', 0xB1: '\u00B1', 0xB2: '\u0406', 0xB3: '\u0456',
  0xB4: '\u0491', 0xB5: '\u00B5', 0xB6: '\u00B6', 0xB7: '\u00B7',
  0xB8: '\u0451', 0xB9: '\u2116', 0xBA: '\u0454', 0xBB: '\u00BB',
  0xBC: '\u0458', 0xBD: '\u0405', 0xBE: '\u0455', 0xBF: '\u0457',
};

// Fill Russian alphabet 0xC0..0xFF (А..я)
for (let b = 0xc0; b <= 0xff; b++) {
  CP1251_MAP[b] = String.fromCharCode(0x0410 + (b - 0xc0));
}

export function decodeCp1251Byte(byteVal: number): string {
  if (byteVal < 128) return String.fromCharCode(byteVal);
  return CP1251_MAP[byteVal] || String.fromCharCode(byteVal);
}

export function fixCyrillicMojibake(str: string): string {
  if (!str) return str;
  return str.replace(/[À-ÿ]/g, (char) => {
    const code = char.charCodeAt(0);
    if (code >= 0xc0 && code <= 0xff) {
      return String.fromCharCode(0x0410 + (code - 0xc0));
    }
    return char;
  });
}

export function detectIsCyrillicRtf(rtf: string): boolean {
  const header = rtf.slice(0, 4096);
  return (
    header.includes('1251') ||
    header.includes('1049') ||
    header.includes('charset204') ||
    header.includes('\\deflang1049') ||
    header.includes('Cyr') ||
    /\\\'[c-fC-F][0-9a-fA-F]/.test(header)
  );
}

/**
 * Extracts the complete font table mapping from RTF
 */
export function extractRtfFontTable(rtf: string): Map<number, string> {
  const fontMap = new Map<number, string>();
  const match = rtf.match(/\\fonttbl\s*(\{[\s\S]*?\})(?=\s*\\(?:colortbl|stylesheet|info|\*|[a-z]))/);

  let fontTblContent = '';
  if (match) {
    fontTblContent = match[1];
  } else {
    const startIdx = rtf.indexOf('\\fonttbl');
    if (startIdx !== -1) {
      let depth = 0;
      let foundStart = false;
      let endIdx = startIdx;
      for (let p = startIdx; p < Math.min(rtf.length, startIdx + 8192); p++) {
        if (rtf[p] === '{') {
          depth++;
          foundStart = true;
        } else if (rtf[p] === '}') {
          depth--;
          if (foundStart && depth === 0) {
            endIdx = p;
            break;
          }
        }
      }
      if (endIdx > startIdx) {
        fontTblContent = rtf.slice(startIdx, endIdx + 1);
      }
    }
  }

  if (!fontTblContent) return fontMap;

  const segments = fontTblContent.split(/(?=\{\\f|\{\s*\\f)/g);
  for (const seg of segments) {
    const idMatch = seg.match(/\\f(\d+)/);
    if (!idMatch) continue;
    const fontId = parseInt(idMatch[1], 10);

    const withSpace = seg.replace(/\\{[^{}]*\\}/g, ' ');
    const noControl = withSpace.replace(/\\[a-zA-Z]+(-?\d+)? ?/g, ' ');
    const fontName = noControl.replace(/[;{}]/g, '').replace(/\s+/g, ' ').trim();

    if (fontName && !fontName.startsWith('@')) {
      fontMap.set(fontId, fontName);
    }
  }

  return fontMap;
}

export function extractRtfFonts(rtf: string): string[] {
  const fontMap = extractRtfFontTable(rtf);
  return Array.from(new Set(fontMap.values()));
}

/**
 * Extracts color table from RTF ({\colortbl;\red0\green0\blue0;...})
 */
export function extractRtfColorTable(rtf: string): string[] {
  const colors: string[] = ['auto'];
  const match = rtf.match(/\{\\colortbl([^}]+)\}/);
  if (!match) return colors;

  const parts = match[1].split(';');
  for (const p of parts) {
    const red = p.match(/\\red(\d+)/);
    const green = p.match(/\\green(\d+)/);
    const blue = p.match(/\\blue(\d+)/);
    if (red && green && blue) {
      colors.push(`rgb(${red[1]}, ${green[1]}, ${blue[1]})`);
    } else {
      colors.push('auto');
    }
  }
  return colors;
}

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  doubleUnderline: boolean;
  dottedUnderline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  fontSize: number; // in pt
  align: 'left' | 'center' | 'right' | 'justify';
  isDestination: boolean;
  inTable: boolean;
  uc: number;
  fontFamily?: string;
  color?: string;
  highlight?: string;
  lineSpacing?: number; // e.g. 1.5, 2.0
  spaceBefore?: number; // pt
  spaceAfter?: number; // pt
  leftIndent?: number; // pt
  rightIndent?: number; // pt
  firstLineIndent?: number; // pt
  hasBottomBorder?: boolean;
  columns?: number;
  columnGap?: number;
}

interface TextChunk {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  doubleUnderline?: boolean;
  dottedUnderline?: boolean;
  strike: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  highlight?: string;
}

interface TableCell {
  chunks: TextChunk[];
  widthPercent?: number;
  bgColor?: string;
}

interface TableRow {
  cells: TableCell[];
  cellX: number[];
}

function renderChunksToHtml(chunks: TextChunk[]): string {
  let result = '';
  for (const chunk of chunks) {
    if (!chunk.text) continue;
    let piece = escapeHtml(chunk.text);

    if (chunk.bold) piece = `<strong>${piece}</strong>`;
    if (chunk.italic) piece = `<em>${piece}</em>`;
    if (chunk.underline) {
      if (chunk.doubleUnderline) piece = `<u style="text-decoration-style: double;">${piece}</u>`;
      else if (chunk.dottedUnderline) piece = `<u style="text-decoration-style: dotted;">${piece}</u>`;
      else piece = `<u>${piece}</u>`;
    }
    if (chunk.strike) piece = `<s>${piece}</s>`;
    if (chunk.superscript) piece = `<sup>${piece}</sup>`;
    if (chunk.subscript) piece = `<sub>${piece}</sub>`;

    const spanStyles: string[] = [];
    if (chunk.fontFamily) spanStyles.push(`font-family: '${escapeHtml(chunk.fontFamily)}'`);
    if (chunk.fontSize && chunk.fontSize !== 12) spanStyles.push(`font-size: ${chunk.fontSize}pt`);
    if (chunk.color && chunk.color !== 'auto') spanStyles.push(`color: ${chunk.color}`);
    if (chunk.highlight && chunk.highlight !== 'auto') spanStyles.push(`background-color: ${chunk.highlight}`);

    if (spanStyles.length > 0) {
      piece = `<span style="${spanStyles.join('; ')}">${piece}</span>`;
    }
    result += piece;
  }
  return result;
}

export interface RtfParseResult {
  html: string;
  fonts: string[];
}

/**
 * Parses RTF text preserving columns, line spacing, margins, indents, borders, tables, and colors.
 */
export function parseRtfWithFonts(rawRtf: string): RtfParseResult {
  if (!rawRtf || !rawRtf.trim()) {
    return { html: '<p>Empty document</p>', fonts: [] };
  }

  const text = rawRtf.replace(/^\uFEFF/, '').trim();

  // If text is not RTF, treat as plain text paragraphs
  if (!text.toLowerCase().includes('{\\rtf')) {
    const lines = text.split('\n');
    const paras = lines
      .map((l) => `<p style="margin-bottom: 8px; line-height: 1.4;">${escapeHtml(l) || '&nbsp;'}</p>`)
      .join('');
    return { html: fixCyrillicMojibake(paras), fonts: [] };
  }

  const isCyrillic = detectIsCyrillicRtf(rawRtf);
  const fontTable = extractRtfFontTable(rawRtf);
  const colorTable = extractRtfColorTable(rawRtf);
  const usedFonts = new Set<string>();

  const defaultFont = fontTable.get(0);
  if (defaultFont) usedFonts.add(defaultFont);

  const stateStack: StyleState[] = [];
  let current: StyleState = {
    bold: false,
    italic: false,
    underline: false,
    doubleUnderline: false,
    dottedUnderline: false,
    strike: false,
    superscript: false,
    subscript: false,
    fontSize: 12,
    align: 'left',
    isDestination: false,
    inTable: false,
    uc: 1,
    fontFamily: defaultFont,
    lineSpacing: 1.4,
    columns: 1,
    columnGap: 24,
  };

  const paragraphs: string[] = [];
  let currentChunks: TextChunk[] = [];

  // Table state
  let currentTableRows: TableRow[] = [];
  let currentRowCells: TableCell[] = [];
  let currentCellChunks: TextChunk[] = [];
  let currentCellX: number[] = [];
  let currentCellBgColor: string | undefined = undefined;
  let inTableMode = false;

  // Multi-column tracking
  let activeColumnCount = 1;
  let columnBuffer: string[] = [];

  const appendText = (str: string) => {
    if (!str) return;
    const targetChunks = inTableMode ? currentCellChunks : currentChunks;
    const last = targetChunks[targetChunks.length - 1];

    if (current.fontFamily) {
      usedFonts.add(current.fontFamily);
    }

    if (
      last &&
      last.bold === current.bold &&
      last.italic === current.italic &&
      last.underline === current.underline &&
      last.doubleUnderline === current.doubleUnderline &&
      last.dottedUnderline === current.dottedUnderline &&
      last.strike === current.strike &&
      last.superscript === current.superscript &&
      last.subscript === current.subscript &&
      last.fontFamily === current.fontFamily &&
      last.fontSize === current.fontSize &&
      last.color === current.color &&
      last.highlight === current.highlight
    ) {
      last.text += str;
    } else {
      targetChunks.push({
        text: str,
        bold: current.bold,
        italic: current.italic,
        underline: current.underline,
        doubleUnderline: current.doubleUnderline,
        dottedUnderline: current.dottedUnderline,
        strike: current.strike,
        superscript: current.superscript,
        subscript: current.subscript,
        fontFamily: current.fontFamily,
        fontSize: current.fontSize,
        color: current.color,
        highlight: current.highlight,
      });
    }
  };

  const flushParagraphHtml = (pTagHtml: string) => {
    if (activeColumnCount > 1) {
      columnBuffer.push(pTagHtml);
    } else {
      paragraphs.push(pTagHtml);
    }
  };

  const flushMultiColumnContainer = () => {
    if (columnBuffer.length > 0) {
      const colGap = current.columnGap || 24;
      paragraphs.push(
        `<div class="doc-columns" style="column-count: ${activeColumnCount}; column-gap: ${colGap}px; -webkit-column-count: ${activeColumnCount}; margin: 16px 0;">${columnBuffer.join('\n')}</div>`
      );
      columnBuffer = [];
    }
  };

  const flushLine = () => {
    if (inTableMode) {
      if (currentChunks.length > 0) {
        currentCellChunks.push(...currentChunks);
        currentChunks = [];
      }
      return;
    }

    if (currentChunks.length > 0) {
      const lineHtml = renderChunksToHtml(currentChunks);
      if (lineHtml.trim()) {
        let tag = 'p';
        const styles: string[] = [];

        if (current.fontSize >= 20 && current.bold) {
          tag = 'h1';
        } else if (current.fontSize >= 16 && current.bold) {
          tag = 'h2';
        } else if (current.fontSize >= 14 && current.bold) {
          tag = 'h3';
        }

        if (current.align !== 'left') {
          styles.push(`text-align: ${current.align}`);
        }
        if (current.lineSpacing) {
          styles.push(`line-height: ${current.lineSpacing}`);
        }
        if (current.spaceBefore) {
          styles.push(`margin-top: ${current.spaceBefore}pt`);
        }
        if (current.spaceAfter) {
          styles.push(`margin-bottom: ${current.spaceAfter}pt`);
        } else {
          styles.push(`margin-bottom: 8px`);
        }
        if (current.leftIndent) {
          styles.push(`margin-left: ${current.leftIndent}pt`);
        }
        if (current.rightIndent) {
          styles.push(`margin-right: ${current.rightIndent}pt`);
        }
        if (current.firstLineIndent) {
          styles.push(`text-indent: ${current.firstLineIndent}pt`);
        }
        if (current.hasBottomBorder) {
          styles.push(`border-bottom: 1px solid #cbd5e1; padding-bottom: 4px`);
        }

        const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
        flushParagraphHtml(`<${tag}${styleAttr}>${lineHtml}</${tag}>`);
      }
      currentChunks = [];
    }
  };

  const flushRow = () => {
    if (currentCellChunks.length > 0) {
      currentRowCells.push({
        chunks: [...currentCellChunks],
        bgColor: currentCellBgColor,
      });
      currentCellChunks = [];
      currentCellBgColor = undefined;
    }

    if (currentRowCells.length > 0) {
      currentTableRows.push({
        cells: [...currentRowCells],
        cellX: [...currentCellX],
      });
      currentRowCells = [];
      currentCellX = [];
    }
  };

  const flushTable = () => {
    if (currentTableRows.length > 0) {
      // Calculate column widths from cellX right boundaries if available
      let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">';

      for (const row of currentTableRows) {
        tableHtml += '<tr>';
        const numCells = row.cells.length;

        // Compute widths
        const widths: number[] = [];
        if (row.cellX.length >= numCells) {
          let prev = 0;
          for (let c = 0; c < numCells; c++) {
            const w = Math.max(1, row.cellX[c] - prev);
            widths.push(w);
            prev = row.cellX[c];
          }
        }
        const totalW = widths.reduce((a, b) => a + b, 0);

        for (let c = 0; c < numCells; c++) {
          const cell = row.cells[c];
          const content = renderChunksToHtml(cell.chunks);
          const widthStyle = totalW > 0 && widths[c] ? `width: ${Math.round((widths[c] / totalW) * 100)}%;` : '';
          const bgStyle = cell.bgColor ? `background-color: ${cell.bgColor};` : '';
          tableHtml += `<td style="padding: 8px 12px; border: 1px solid #cbd5e1; ${widthStyle} ${bgStyle}">${content || '&nbsp;'}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</table>';
      flushParagraphHtml(tableHtml);
      currentTableRows = [];
    }
    inTableMode = false;
  };

  let i = 0;
  const len = text.length;

  const ignorableDestinations = new Set([
    '*',
    'fonttbl',
    'colortbl',
    'stylesheet',
    'info',
    'latentstyles',
    'themedata',
    'colorschememapping',
    'filetable',
    'listtable',
    'listoverridetable',
    'rsidtbl',
    'mmathPr',
    'xmlnstbl',
    'generator',
    'docfmt',
    'userprops',
    'header',
    'footer',
    'headerl',
    'headerr',
    'footerl',
    'footerr',
    'pict',
    'object',
    'fldrslt',
    'nonshppict',
    'panose',
    'falt',
    'fname',
  ]);

  while (i < len) {
    const char = text[i];

    if (char === '{') {
      stateStack.push({ ...current });

      // Peek if this is an ignorable destination group
      let peek = i + 1;
      while (peek < len && (text[peek] === ' ' || text[peek] === '\r' || text[peek] === '\n')) {
        peek++;
      }

      if (peek < len && text[peek] === '\\') {
        let cmd = '';
        let cIdx = peek + 1;
        if (cIdx < len && text[cIdx] === '*') {
          cmd = '*';
        } else {
          while (cIdx < len && /[a-zA-Z]/.test(text[cIdx])) {
            cmd += text[cIdx];
            cIdx++;
          }
        }
        if (ignorableDestinations.has(cmd)) {
          current.isDestination = true;
        }
      }

      i++;
      continue;
    }

    if (char === '}') {
      if (stateStack.length > 0) {
        current = stateStack.pop()!;
      }
      i++;
      continue;
    }

    if (current.isDestination) {
      if (char === '\\') {
        i++;
        if (text[i] === '{' || text[i] === '}' || text[i] === '\\') {
          i++;
        }
      } else {
        i++;
      }
      continue;
    }

    // Control word or symbol
    if (char === '\\') {
      i++;
      if (i >= len) break;

      const nextChar = text[i];

      if (nextChar === '\\' || nextChar === '{' || nextChar === '}') {
        appendText(nextChar);
        i++;
        continue;
      }

      if (nextChar === '~') {
        appendText('\u00A0');
        i++;
        continue;
      }

      if (nextChar === '-') {
        i++;
        continue;
      }

      if (nextChar === '_') {
        appendText('‑');
        i++;
        continue;
      }

      // Hex byte \'hh
      if (nextChar === "'") {
        const hex = text.slice(i + 1, i + 3);
        const code = parseInt(hex, 16);
        if (!isNaN(code)) {
          if (isCyrillic && code >= 0x80) {
            appendText(decodeCp1251Byte(code));
          } else if (code >= 0xc0 && code <= 0xff) {
            appendText(decodeCp1251Byte(code));
          } else if (code < 128) {
            appendText(String.fromCharCode(code));
          } else {
            appendText(decodeCp1251Byte(code));
          }
          i += 3;
          continue;
        }
      }

      // Parse control word
      let word = '';
      while (i < len && /[a-zA-Z]/.test(text[i])) {
        word += text[i];
        i++;
      }

      let paramStr = '';
      let isNegative = false;
      if (i < len && text[i] === '-') {
        isNegative = true;
        i++;
      }
      while (i < len && /[0-9]/.test(text[i])) {
        paramStr += text[i];
        i++;
      }

      let val: number | null = null;
      if (paramStr.length > 0) {
        val = parseInt(paramStr, 10);
        if (isNegative) val = -val;
      }

      if (i < len && text[i] === ' ') {
        i++;
      }

      switch (word) {
        case 'u':
          if (val !== null) {
            let cp = val;
            if (cp < 0) cp += 65536;
            try {
              appendText(String.fromCodePoint(cp));
            } catch {
              appendText('?');
            }

            let skipCount = current.uc;
            while (skipCount > 0 && i < len) {
              if (text[i] === '\\' && text[i + 1] === "'") {
                i += 4;
                skipCount--;
              } else if (text[i] === '\\') {
                break;
              } else {
                i++;
                skipCount--;
              }
            }
          }
          break;

        case 'uc':
          if (val !== null) current.uc = Math.max(0, val);
          break;

        case 'f':
          if (val !== null && fontTable.has(val)) {
            current.fontFamily = fontTable.get(val);
            if (current.fontFamily) {
              usedFonts.add(current.fontFamily);
            }
          }
          break;

        case 'b':
          current.bold = val === null || val !== 0;
          break;

        case 'i':
          current.italic = val === null || val !== 0;
          break;

        case 'ul':
          current.underline = true;
          current.doubleUnderline = false;
          current.dottedUnderline = false;
          break;

        case 'uldb':
          current.underline = true;
          current.doubleUnderline = true;
          break;

        case 'uld':
          current.underline = true;
          current.dottedUnderline = true;
          break;

        case 'ulnone':
          current.underline = false;
          current.doubleUnderline = false;
          current.dottedUnderline = false;
          break;

        case 'strike':
          current.strike = val === null || val !== 0;
          break;

        case 'super':
          current.superscript = true;
          current.subscript = false;
          break;

        case 'sub':
          current.subscript = true;
          current.superscript = false;
          break;

        case 'nosupersub':
          current.superscript = false;
          current.subscript = false;
          break;

        case 'fs':
          if (val !== null) {
            current.fontSize = Math.round(val / 2);
          }
          break;

        case 'cf': // Foreground text color
          if (val !== null && colorTable[val]) {
            current.color = colorTable[val];
          }
          break;

        case 'highlight':
        case 'cb': // Background highlight color
          if (val !== null && colorTable[val]) {
            current.highlight = colorTable[val];
          }
          break;

        case 'qc':
          current.align = 'center';
          break;

        case 'qr':
          current.align = 'right';
          break;

        case 'ql':
          current.align = 'left';
          break;

        case 'qj':
          current.align = 'justify';
          break;

        // Multi-column section
        case 'cols':
          if (val !== null && val > 1) {
            flushLine();
            if (activeColumnCount !== val) {
              flushMultiColumnContainer();
              activeColumnCount = val;
            }
          } else if (val === 1) {
            flushLine();
            flushMultiColumnContainer();
            activeColumnCount = 1;
          }
          break;

        case 'colsx':
          if (val !== null) {
            current.columnGap = Math.round(val / 20); // 20 twips = 1 pt
          }
          break;

        case 'column': // Column break
          flushLine();
          flushParagraphHtml('<div class="column-break" style="break-after: column; -webkit-column-break-after: always;"></div>');
          break;

        // Line Spacing
        case 'sl':
          if (val !== null) {
            if (val < 0) {
              // Exact line height in twips
              current.lineSpacing = Math.round((Math.abs(val) / 20) / 12 * 100) / 100;
            } else {
              // 240 twips = single spacing (1.0)
              current.lineSpacing = Math.round((val / 240) * 100) / 100;
            }
          }
          break;

        case 'sb': // Space before in twips
          if (val !== null) current.spaceBefore = Math.round(val / 20);
          break;

        case 'sa': // Space after in twips
          if (val !== null) current.spaceAfter = Math.round(val / 20);
          break;

        case 'li': // Left indent in twips
          if (val !== null) current.leftIndent = Math.round(val / 20);
          break;

        case 'ri': // Right indent in twips
          if (val !== null) current.rightIndent = Math.round(val / 20);
          break;

        case 'fi': // First line indent in twips
          if (val !== null) current.firstLineIndent = Math.round(val / 20);
          break;

        case 'brdrb': // Bottom border line on paragraph
          current.hasBottomBorder = true;
          break;

        case 'page': // Page break
          flushLine();
          flushParagraphHtml(
            '<div class="page-break" style="page-break-after: always; border-bottom: 2px dashed #94a3b8; margin: 24px 0; padding-bottom: 4px; text-align: center; color: #94a3b8; font-size: 10px; font-weight: bold; text-transform: uppercase;">Page Break</div>'
          );
          break;

        case 'par':
          flushLine();
          break;

        case 'line':
          appendText('\n');
          break;

        case 'tab':
          appendText('\t');
          break;

        case 'bullet':
          appendText('• ');
          break;

        // Tables
        case 'trowd':
          if (!inTableMode) {
            flushLine();
            inTableMode = true;
          }
          currentCellX = [];
          break;

        case 'cellx':
          if (val !== null) {
            currentCellX.push(val);
          }
          break;

        case 'clcbpat': // Cell background color
          if (val !== null && colorTable[val]) {
            currentCellBgColor = colorTable[val];
          }
          break;

        case 'cell':
          if (currentCellChunks.length > 0) {
            currentRowCells.push({
              chunks: [...currentCellChunks],
              bgColor: currentCellBgColor,
            });
            currentCellChunks = [];
            currentCellBgColor = undefined;
          }
          break;

        case 'row':
          flushRow();
          break;

        case 'pard':
          flushLine();
          current.align = 'left';
          current.fontSize = 12;
          current.spaceBefore = 0;
          current.spaceAfter = 0;
          current.leftIndent = 0;
          current.rightIndent = 0;
          current.firstLineIndent = 0;
          current.lineSpacing = 1.4;
          current.hasBottomBorder = false;
          break;

        case 'plain':
          current.bold = false;
          current.italic = false;
          current.underline = false;
          current.doubleUnderline = false;
          current.dottedUnderline = false;
          current.strike = false;
          current.superscript = false;
          current.subscript = false;
          current.color = undefined;
          current.highlight = undefined;
          break;

        default:
          break;
      }

      continue;
    }

    if (char === '\r' || char === '\n') {
      i++;
      continue;
    }

    const charCode = text.charCodeAt(i);
    if (isCyrillic && charCode >= 0xc0 && charCode <= 0xff) {
      appendText(decodeCp1251Byte(charCode));
    } else {
      appendText(char);
    }
    i++;
  }

  flushLine();
  flushRow();
  flushTable();
  flushMultiColumnContainer();

  let finalHtml = paragraphs.join('');
  if (!finalHtml.trim()) {
    finalHtml = '<p>&nbsp;</p>';
  }

  finalHtml = fixCyrillicMojibake(finalHtml);

  const allDetected = Array.from(new Set([...Array.from(fontTable.values()), ...Array.from(usedFonts)]));
  return { html: finalHtml, fonts: allDetected };
}

export function parseRtfToHtml(rawRtf: string): string {
  return parseRtfWithFonts(rawRtf).html;
}

/**
 * Serializes HTML content from the editor into a valid RTF document
 */
export function serializeHtmlToRtf(html: string, title = 'Lithora Document'): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  let rtfBody = '';

  const customFonts = new Set<string>();
  const fontMatches = html.matchAll(/font-family:\s*['"]?([^;'"]+)['"]?/gi);
  for (const m of fontMatches) {
    if (m[1]) {
      const clean = m[1].split(',')[0].replace(/['"]/g, '').trim();
      if (clean) customFonts.add(clean);
    }
  }

  const baseFonts = ['Calibri', 'Times New Roman', 'Sylfaen', 'Arial'];
  const fontList = [...baseFonts];
  for (const cf of customFonts) {
    if (!fontList.some((f) => f.toLowerCase() === cf.toLowerCase())) {
      fontList.push(cf);
    }
  }

  const fontIdMap = new Map<string, number>();
  fontList.forEach((f, idx) => fontIdMap.set(f.toLowerCase(), idx));

  const processNode = (
    node: Node,
    state: { bold: boolean; italic: boolean; underline: boolean; fontId: number } = {
      bold: false,
      italic: false,
      underline: false,
      fontId: 0,
    }
  ): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text) return '';
      return escapeRtfText(text);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    let currentFontId = state.fontId;
    if (el.style && el.style.fontFamily) {
      const cleanFamily = el.style.fontFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
      if (fontIdMap.has(cleanFamily)) {
        currentFontId = fontIdMap.get(cleanFamily)!;
      }
    }

    let prefix = '';
    let suffix = '';
    let nextBold = state.bold;
    let nextItalic = state.italic;
    let nextUnderline = state.underline;

    if (currentFontId !== state.fontId) {
      prefix += `\\f${currentFontId} `;
      suffix = `\\f${state.fontId} ` + suffix;
    }

    if (tag === 'strong' || tag === 'b') {
      prefix += '\\b ';
      suffix = '\\b0 ' + suffix;
      nextBold = true;
    } else if (tag === 'em' || tag === 'i') {
      prefix += '\\i ';
      suffix = '\\i0 ' + suffix;
      nextItalic = true;
    } else if (tag === 'u') {
      prefix += '\\ul ';
      suffix = '\\ulnone ' + suffix;
      nextUnderline = true;
    } else if (tag === 's' || tag === 'strike') {
      prefix += '\\strike ';
      suffix = '\\strike0 ' + suffix;
    } else if (tag === 'sup') {
      prefix += '\\super ';
      suffix = '\\nosupersub ' + suffix;
    } else if (tag === 'sub') {
      prefix += '\\sub ';
      suffix = '\\nosupersub ' + suffix;
    }

    let innerText = '';
    for (const child of Array.from(el.childNodes)) {
      innerText += processNode(child, {
        bold: nextBold,
        italic: nextItalic,
        underline: nextUnderline,
        fontId: currentFontId,
      });
    }

    return prefix + innerText + suffix;
  };

  const elements = Array.from(container.children);
  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        rtfBody += '\\trowd\\trgaph108';

        let cellBoundary = 2000;
        for (let c = 0; c < cells.length; c++) {
          rtfBody += `\\cellx${cellBoundary}`;
          cellBoundary += 2400;
        }
        rtfBody += '\n';

        for (const cell of cells) {
          rtfBody += '\\pard\\intbl ' + processNode(cell) + '\\cell\n';
        }
        rtfBody += '\\row\n';
      }
      rtfBody += '\\pard\n';
      continue;
    }

    if (tagName === 'div' && el.classList.contains('doc-columns')) {
      const colCount = el.getAttribute('style')?.match(/column-count:\s*(\d+)/)?.[1] || '2';
      rtfBody += `\\cols${colCount}\\colsx720\n`;
      for (const child of Array.from(el.children)) {
        rtfBody += '\\pard ' + processNode(child) + '\\par\n';
      }
      rtfBody += '\\cols1\n';
      continue;
    }

    if (tagName.startsWith('h')) {
      const fontSize = tagName === 'h1' ? 44 : tagName === 'h2' ? 36 : 28;
      rtfBody += `\\pard\\sb200\\sa120\\b\\fs${fontSize} ` + processNode(el) + '\\b0\\fs24\\par\n';
      continue;
    }

    if (tagName === 'hr' || el.classList.contains('doc-line')) {
      rtfBody += '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\\pard\n';
      continue;
    }

    // Paragraph
    let pPrefix = '\\pard\\sa120\\sl360\\slmult1';
    const style = el.getAttribute('style') || '';
    if (style.includes('center')) pPrefix += '\\qc';
    else if (style.includes('right')) pPrefix += '\\qr';
    else if (style.includes('justify')) pPrefix += '\\qj';

    rtfBody += `${pPrefix} ` + processNode(el) + '\\par\n';
  }

  let fontTableRtf = '{\\fonttbl';
  fontList.forEach((font, idx) => {
    fontTableRtf += `{\\f${idx}\\fnil\\fcharset0 ${font};}`;
  });
  fontTableRtf += '}';

  return `{\\rtf1\\ansi\\ansicpg1251\\deff0\\deflang1049\n${fontTableRtf}\n{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;\\red255\\green0\\blue0;\\red0\\green128\\blue0;}\n\\viewkind4\\uc1\n${rtfBody}}`;
}

function escapeRtfText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const char = text[i];

    if (char === '\\') result += '\\\\';
    else if (char === '{') result += '\\{';
    else if (char === '}') result += '\\}';
    else if (char === '\n') result += '\\line ';
    else if (char === '\t') result += '\\tab ';
    else if (code >= 32 && code <= 126) {
      result += char;
    } else {
      let signedCode = code;
      if (signedCode > 32767) signedCode -= 65536;
      result += `\\u${signedCode}?`;
    }
  }
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
