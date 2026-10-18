/**
 * WordCraft Enterprise RTF Parser and Serializer
 * 
 * Supports:
 * 1. Complete group & destination stripping for Microsoft Word metadata
 *    ({\*...}, {\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\info...}, etc.)
 * 2. 100% accurate Windows-1251 Cyrillic decoding for hex escapes (\'hh) and raw bytes
 * 3. Automatic Cyrillic mojibake repair (ÂÈÇÎÂÀß -> ВИЗОВАЯ, ²íôîðìàöè ÿ -> Інформація)
 * 4. Full Unicode support (\uN? with signed 16-bit integer conversion) for Armenian & Russian
 * 5. Complete Table parsing (\trowd, \intbl, \cell, \row)
 * 6. Clean semantic HTML chunking (prevents per-character tag wrapping)
 * 7. Rich typography: bold, italic, underline, strikethrough, alignment, font sizes, headings
 */

// Full Windows-1251 mapping table for bytes 0x80..0xFF
export const CP1251_TABLE: Record<number, string> = {
  0x80: '\u0402', // Ђ
  0x81: '\u0403', // Ѓ
  0x82: '\u201A', // ‚
  0x83: '\u0453', // ѓ
  0x84: '\u201E', // „
  0x85: '\u2026', // …
  0x86: '\u2020', // †
  0x87: '\u2021', // ‡
  0x88: '\u20AC', // €
  0x89: '\u2030', // ‰
  0x8A: '\u0409', // Љ
  0x8B: '\u2039', // ‹
  0x8C: '\u040A', // Њ
  0x8D: '\u040C', // Ќ
  0x8E: '\u040B', // Ћ
  0x8F: '\u040F', // Џ
  0x90: '\u0452', // ђ
  0x91: '\u2018', // ‘
  0x92: '\u2019', // ’
  0x93: '\u201C', // “
  0x94: '\u201D', // ”
  0x95: '\u2022', // •
  0x96: '\u2013', // –
  0x97: '\u2014', // —
  0x98: '\u0098', // (unassigned)
  0x99: '\u2122', // ™
  0x9A: '\u0459', // љ
  0x9B: '\u203A', // ›
  0x9C: '\u045A', // њ
  0x9D: '\u045C', // ќ
  0x9E: '\u045B', // ћ
  0x9F: '\u045F', // џ
  0xA0: '\u00A0', // &nbsp;
  0xA1: '\u040E', // Ў
  0xA2: '\u045E', // ў
  0xA3: '\u0408', // Ј
  0xA4: '\u00A4', // ¤
  0xA5: '\u0490', // Ґ
  0xA6: '\u00A6', // ¦
  0xA7: '\u00A7', // §
  0xA8: '\u0401', // Ё
  0xA9: '\u00A9', // ©
  0xAA: '\u0404', // Є
  0xAB: '\u00AB', // «
  0xAC: '\u00AC', // ¬
  0xAD: '\u00AD', // soft hyphen
  0xAE: '\u00AE', // ®
  0xAF: '\u0407', // Ї
  0xB0: '\u00B0', // °
  0xB1: '\u00B1', // ±
  0xB2: '\u0406', // І (Ukrainian)
  0xB3: '\u0456', // і (Ukrainian)
  0xB4: '\u0491', // ґ
  0xB5: '\u00B5', // µ
  0xB6: '\u00B6', // ¶
  0xB7: '\u00B7', // ·
  0xB8: '\u0451', // ё
  0xB9: '\u2116', // №
  0xBA: '\u0454', // є
  0xBB: '\u00BB', // »
  0xBC: '\u0458', // ј
  0xBD: '\u0405', // Ѕ
  0xBE: '\u0455', // ѕ
  0xBF: '\u0457', // ї
};

export function decodeCp1251Byte(b: number): string {
  // Russian Cyrillic uppercase and lowercase: 0xC0..0xFF -> U+0410..U+044F
  if (b >= 0xC0 && b <= 0xFF) {
    return String.fromCharCode(b + 0x350);
  }
  if (CP1251_TABLE[b]) {
    return CP1251_TABLE[b];
  }
  return String.fromCharCode(b);
}

/**
 * Repairs Windows-1251 Cyrillic mojibake where CP1251 bytes were incorrectly
 * read as ISO-8859-1 (Latin-1).
 * Example: "ÂÈÇÎÂÀß À ÍÊÅÒÀ" -> "ВИЗОВАЯ АНКЕТА"
 * Example: "²íôîðìàöè ÿ" -> "Інформація"
 * Example: "Ô.È.Î: Äåâè÷üÿ" -> "Ф.И.О: Девичья"
 */
export function fixCyrillicMojibake(htmlOrText: string): string {
  if (!htmlOrText) return htmlOrText;

  // Process text outside HTML tags and HTML entities
  return htmlOrText.replace(/([^<>&;]+)/g, (segment) => {
    // If the segment contains Latin-1 accented characters that match CP1251 mojibake:
    if (/[À-ÿ\u0080-\u00BF]/.test(segment)) {
      let converted = '';
      for (let i = 0; i < segment.length; i++) {
        const code = segment.charCodeAt(i);
        if (code >= 0x80 && code <= 0xFF) {
          converted += decodeCp1251Byte(code);
        } else {
          converted += segment[i];
        }
      }
      return converted;
    }
    return segment;
  });
}

/**
 * Checks if a string has Cyrillic hints (e.g. ansicpg1251, deflang1049, fcharset204, or high Cyrillic hex escapes)
 */
function detectIsCyrillicRtf(rtf: string): boolean {
  return (
    rtf.includes('ansicpg1251') ||
    rtf.includes('deflang1049') ||
    rtf.includes('lang1049') ||
    rtf.includes('fcharset204') ||
    rtf.includes('Times New Roman Cyr') ||
    rtf.includes('Arial Cyr') ||
    rtf.includes('Courier New Cyr') ||
    /\\\'[c-fC-F][0-9a-fA-F]/.test(rtf)
  );
}

interface StyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  fontSize: number; // in pt (half-points / 2)
  align: 'left' | 'center' | 'right' | 'justify';
  isDestination: boolean;
  inTable: boolean;
  uc: number; // number of chars to skip after \uN
}

interface TextChunk {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

interface TableCell {
  chunks: TextChunk[];
}

interface TableRow {
  cells: TableCell[];
}

function renderChunksToHtml(chunks: TextChunk[]): string {
  let result = '';
  for (const chunk of chunks) {
    if (!chunk.text) continue;
    let piece = escapeHtml(chunk.text);
    if (chunk.bold) piece = `<strong>${piece}</strong>`;
    if (chunk.italic) piece = `<em>${piece}</em>`;
    if (chunk.underline) piece = `<u>${piece}</u>`;
    if (chunk.strike) piece = `<s>${piece}</s>`;
    result += piece;
  }
  return result;
}

/**
 * Parses RTF text into clean semantic HTML with table, styling, and multi-language support.
 */
export function parseRtfToHtml(rawRtf: string): string {
  if (!rawRtf || !rawRtf.trim()) {
    return '<p>Empty document</p>';
  }

  let text = rawRtf.replace(/^\uFEFF/, '').trim();

  // If text is not RTF, treat as plain text paragraphs
  if (!text.toLowerCase().includes('{\\rtf')) {
    const lines = text.split('\n');
    const paras = lines
      .map((l) => `<p>${escapeHtml(l) || '&nbsp;'}</p>`)
      .join('');
    return fixCyrillicMojibake(paras);
  }

  const isCyrillic = detectIsCyrillicRtf(rawRtf);

  // Group stack
  const stateStack: StyleState[] = [];
  let current: StyleState = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    fontSize: 12,
    align: 'left',
    isDestination: false,
    inTable: false,
    uc: 1,
  };

  const paragraphs: string[] = [];
  let currentChunks: TextChunk[] = [];

  // Table building
  let currentTableRows: TableRow[] = [];
  let currentRowCells: TableCell[] = [];
  let currentCellChunks: TextChunk[] = [];
  let inTableMode = false;

  const appendText = (str: string) => {
    if (!str) return;
    const targetChunks = inTableMode ? currentCellChunks : currentChunks;
    const last = targetChunks[targetChunks.length - 1];

    if (
      last &&
      last.bold === current.bold &&
      last.italic === current.italic &&
      last.underline === current.underline &&
      last.strike === current.strike
    ) {
      last.text += str;
    } else {
      targetChunks.push({
        text: str,
        bold: current.bold,
        italic: current.italic,
        underline: current.underline,
        strike: current.strike,
      });
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
        let styleAttr = '';

        if (current.fontSize >= 20 && current.bold) {
          tag = 'h1';
        } else if (current.fontSize >= 16 && current.bold) {
          tag = 'h2';
        } else if (current.fontSize >= 14 && current.bold) {
          tag = 'h3';
        }

        if (current.align !== 'left') {
          styleAttr = ` style="text-align: ${current.align};"`;
        }

        paragraphs.push(`<${tag}${styleAttr}>${lineHtml}</${tag}>`);
      }
      currentChunks = [];
    }
  };

  const flushTable = () => {
    if (currentTableRows.length > 0) {
      let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:1rem 0;"><tbody>';
      for (let r = 0; r < currentTableRows.length; r++) {
        const row = currentTableRows[r];
        tableHtml += '<tr>';
        for (let c = 0; c < row.cells.length; c++) {
          const cell = row.cells[c];
          const cellHtml = renderChunksToHtml(cell.chunks);
          const isHeader = r === 0 && row.cells.length > 1 && row.cells.some(c => c.chunks.some(ch => ch.bold));
          const cellTag = isHeader ? 'th' : 'td';
          const bg = isHeader ? ' background-color: #f8fafc;' : '';
          tableHtml += `<${cellTag} style="border: 1px solid #cbd5e1; padding: 8px 12px;${bg}">${cellHtml || '&nbsp;'}</${cellTag}>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      paragraphs.push(tableHtml);
      currentTableRows = [];
    }
    inTableMode = false;
  };

  let i = 0;
  const len = text.length;

  // List of RTF header/destination groups that must be fully ignored
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

      // Peek if this is an ignorable destination group like {\*...} or {\fonttbl...}
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

        if (current.isDestination || ignorableDestinations.has(cmd)) {
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

    // If currently inside an ignored metadata/destination group, skip content
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

      // Escaped literals
      if (nextChar === '\\' || nextChar === '{' || nextChar === '}') {
        appendText(nextChar);
        i++;
        continue;
      }

      // Non-breaking space
      if (nextChar === '~') {
        appendText('\u00A0');
        i++;
        continue;
      }

      // Optional hyphen
      if (nextChar === '-') {
        i++;
        continue;
      }

      // Non-breaking hyphen
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
          } else if (code >= 0xC0 && code <= 0xFF) {
            appendText(decodeCp1251Byte(code));
          } else if (code < 128) {
            appendText(String.fromCharCode(code));
          } else {
            appendText(decodeCp1251Byte(code));
          }
        }
        i += 3;
        continue;
      }

      // Read control word
      let word = '';
      while (i < len && /[a-zA-Z]/.test(text[i])) {
        word += text[i];
        i++;
      }

      // Read optional integer parameter
      let numStr = '';
      let isNeg = false;
      if (i < len && text[i] === '-') {
        isNeg = true;
        i++;
      }
      while (i < len && /[0-9]/.test(text[i])) {
        numStr += text[i];
        i++;
      }
      const val = numStr ? (isNeg ? -parseInt(numStr, 10) : parseInt(numStr, 10)) : null;

      // Single trailing space is a delimiter in RTF
      if (i < len && text[i] === ' ') {
        i++;
      }

      // Process control word
      switch (word) {
        case 'u': // Unicode character \uN
          if (val !== null) {
            let cp = val;
            if (cp < 0) cp += 65536;
            try {
              appendText(String.fromCodePoint(cp));
            } catch {
              appendText('?');
            }

            // Skip `uc` fallback chars (default 1)
            let skipCount = current.uc;
            while (skipCount > 0 && i < len) {
              if (text[i] === '\\' && text[i + 1] === "'") {
                i += 4; // \'hh
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

        case 'b':
          current.bold = val === null || val !== 0;
          break;

        case 'i':
          current.italic = val === null || val !== 0;
          break;

        case 'ul':
          current.underline = true;
          break;

        case 'ulnone':
          current.underline = false;
          break;

        case 'strike':
          current.strike = val === null || val !== 0;
          break;

        case 'fs': // Font size in half-points
          if (val !== null) {
            current.fontSize = Math.round(val / 2);
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

        case 'trowd': // Start table row definition
          if (!inTableMode) {
            flushLine();
            inTableMode = true;
          }
          break;

        case 'intbl':
          inTableMode = true;
          break;

        case 'cell': // End of table cell
          if (currentChunks.length > 0) {
            currentCellChunks.push(...currentChunks);
            currentChunks = [];
          }
          currentRowCells.push({ chunks: [...currentCellChunks] });
          currentCellChunks = [];
          break;

        case 'row': // End of table row
          if (currentChunks.length > 0) {
            currentCellChunks.push(...currentChunks);
            currentChunks = [];
          }
          if (currentCellChunks.length > 0) {
            currentRowCells.push({ chunks: [...currentCellChunks] });
            currentCellChunks = [];
          }
          if (currentRowCells.length > 0) {
            currentTableRows.push({ cells: [...currentRowCells] });
            currentRowCells = [];
          }
          break;

        case 'pard': // Reset paragraph defaults
          if (inTableMode && currentRowCells.length === 0 && currentTableRows.length > 0) {
            const nextSlice = text.slice(i, i + 50);
            if (!nextSlice.includes('\\intbl') && !nextSlice.includes('\\trowd')) {
              flushTable();
            }
          }
          current.align = 'left';
          current.fontSize = 12;
          break;

        default:
          break;
      }
      continue;
    }

    // Skip carriage returns and newlines in RTF
    if (char === '\r' || char === '\n') {
      i++;
      continue;
    }

    // Raw 8-bit character in text
    if (isCyrillic && char.charCodeAt(0) >= 0x80 && char.charCodeAt(0) <= 0xFF) {
      appendText(decodeCp1251Byte(char.charCodeAt(0)));
      i++;
      continue;
    }

    // Regular content character
    appendText(char);
    i++;
  }

  // End of file cleanup
  flushLine();
  flushTable();

  let finalHtml = paragraphs.filter((p) => p.trim()).join('');

  if (!finalHtml.trim()) {
    finalHtml = '<p>Start typing here...</p>';
  }

  // Final pass: clean up any remaining mojibake
  finalHtml = fixCyrillicMojibake(finalHtml);

  return finalHtml;
}

/**
 * Serializes rich HTML document into a standardized, compliant RTF string
 * with Unicode escapes (\uN?) for Armenian, Russian, and international symbols,
 * full table specifications (\trowd, \intbl, \cell, \row), and font definitions.
 */
export function serializeHtmlToRtf(htmlContent: string, title = 'WordCraft Document'): string {
  const container = document.createElement('div');
  container.innerHTML = htmlContent;

  let rtfBody = '';

  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      return escapeRtfText(text);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      let inner = '';
      for (const child of Array.from(el.childNodes)) {
        inner += processNode(child);
      }

      switch (tag) {
        case 'h1':
          return `\\par\\pard\\qc\\b\\fs40 ${inner}\\b0\\fs24\\par\\pard\\ql `;
        case 'h2':
          return `\\par\\pard\\ql\\b\\fs32 ${inner}\\b0\\fs24\\par `;
        case 'h3':
          return `\\par\\pard\\ql\\b\\fs28 ${inner}\\b0\\fs24\\par `;
        case 'p': {
          let alignWord = '\\ql';
          const style = el.getAttribute('style') || '';
          if (style.includes('center')) alignWord = '\\qc';
          else if (style.includes('right')) alignWord = '\\qr';
          else if (style.includes('justify')) alignWord = '\\qj';
          return `\\pard${alignWord} ${inner}\\par `;
        }
        case 'b':
        case 'strong':
          return `\\b ${inner}\\b0 `;
        case 'i':
        case 'em':
          return `\\i ${inner}\\i0 `;
        case 'u':
          return `\\ul ${inner}\\ulnone `;
        case 's':
        case 'strike':
          return `\\strike ${inner}\\strike0 `;
        case 'ul':
        case 'ol':
          return `\\par ${inner}\\par `;
        case 'li':
          return `{\\pntext\\bullet\\tab}${inner}\\par `;
        case 'blockquote':
          return `\\par\\li720\\ri720\\i ${inner}\\i0\\par\\li0\\ri0 `;
        case 'table':
          return processTableToRtf(el);
        case 'tr':
          return inner;
        case 'td':
        case 'th':
          return `\\pard\\intbl ${inner}\\cell `;
        case 'hr':
          return '\\par\\brdrb\\brdrs\\brdrw10\\brsp20 \\par ';
        case 'br':
          return '\\line ';
        default:
          return inner;
      }
    }

    return '';
  };

  const processTableToRtf = (tableEl: HTMLElement): string => {
    let tableRtf = '\\par ';
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const numCells = cells.length || 1;
      const cellWidth = Math.floor(9000 / numCells);

      // Define row header
      tableRtf += '\\trowd\\trgaph108';
      let currentRight = cellWidth;
      for (let c = 0; c < numCells; c++) {
        tableRtf += `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${currentRight}`;
        currentRight += cellWidth;
      }
      tableRtf += ' ';

      // Output row cells
      for (const cell of cells) {
        let cellText = '';
        for (const child of Array.from(cell.childNodes)) {
          cellText += processNode(child);
        }
        tableRtf += `\\pard\\intbl ${cellText}\\cell `;
      }
      tableRtf += '\\row ';
    }
    tableRtf += '\\pard\\par ';
    return tableRtf;
  };

  for (const child of Array.from(container.childNodes)) {
    rtfBody += processNode(child);
  }

  // Construct standard RTF wrapper with Calibri, Times New Roman, Sylfaen (for Armenian), and Arial
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033
{\\fonttbl
{\\f0\\fnil\\fcharset0 Calibri;}
{\\f1\\fnil\\fcharset0 Times New Roman;}
{\\f2\\fnil\\fcharset0 Sylfaen;}
{\\f3\\fnil\\fcharset0 Arial;}
}
{\\colortbl ;\\red15\\green23\\blue42;\\red37\\green99\\blue235;\\red220\\green38\\blue38;}
{\\info{\\title ${escapeRtfText(title)}}{\\author WordCraft Suite}}
\\viewkind4\\uc1\\pard\\f0\\fs24 
${rtfBody}
}`;
}

/**
 * Escapes characters for RTF, crucially converting any non-ASCII characters
 * (Russian Cyrillic, Armenian alphabet) into Unicode escape sequences \uN?
 */
export function escapeRtfText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);

    if (char === '\\') {
      result += '\\\\';
    } else if (char === '{') {
      result += '\\{';
    } else if (char === '}') {
      result += '\\}';
    } else if (char === '\n') {
      result += '\\par ';
    } else if (char === '\r') {
      // ignore
    } else if (code < 128) {
      result += char;
    } else {
      // Unicode escape: \uN?
      // RTF uses signed 16-bit integers: if code > 32767, use code - 65536
      const signedCode = code > 32767 ? code - 65536 : code;
      result += `\\u${signedCode}?`;
    }
  }
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
