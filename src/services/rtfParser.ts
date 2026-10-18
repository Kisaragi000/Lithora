import { parseRTF, toHTML } from '@jonahschulte/rtf-toolkit';

/**
 * WordCraft RTF Parser and Serializer
 * Complete RTF specification handling with balanced group stripping for
 * Microsoft Word metadata (panose font tables, stylesheets, themedata, info, etc.),
 * CP1251 Cyrillic pre-decoding, and full Unicode escape handling for Armenian and Russian.
 */

/**
 * Parses RTF text into clean semantic HTML
 */
export function parseRtfToHtml(rawRtf: string): string {
  if (!rawRtf) {
    return '<p>Empty document</p>';
  }

  // Remove Byte Order Mark (BOM) if present and trim leading whitespace
  let text = rawRtf.replace(/^\uFEFF/, '').trim();

  // If text does not look like RTF at all, wrap as plain paragraphs
  if (!text.toLowerCase().includes('{\\rtf')) {
    return text
      .split('\n')
      .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
      .join('');
  }

  // Strip all non-body RTF header groups (fonttbl with Panose numbers, colortbl, stylesheet, info, etc.)
  text = cleanRtfHeaderGroups(text);

  // Handle Windows-1251 Cyrillic hex escapes if document is Russian/Cyrillic
  if (
    text.includes('ansicpg1251') ||
    text.includes('deflang1049') ||
    text.includes('fcharset204')
  ) {
    text = text.replace(/\\\'([0-9a-fA-F]{2})/g, (match, hex) => {
      const b = parseInt(hex, 16);
      if (b >= 0xc0 && b <= 0xff) {
        // Russian Cyrillic range: 0xC0..0xFF -> U+0410..0+044F
        return '\\u' + (b + 0x350) + '?';
      }
      if (b === 0xa8) return '\\u1025?'; // Ё
      if (b === 0xb8) return '\\u1105?'; // ё
      if (b === 0xaf) return '\\u1031?'; // Ї
      if (b === 0xbf) return '\\u1111?'; // ї
      if (b === 0xaa) return '\\u1028?'; // Є
      if (b === 0xba) return '\\u1108?'; // є
      if (b === 0xa5) return '\\u1168?'; // Ґ
      if (b === 0xb5) return '\\u1169?'; // ґ
      return match;
    });
  }

  // Primary parser: @jonahschulte/rtf-toolkit
  try {
    const doc = parseRTF(text);
    const html = toHTML(doc);
    if (html && html.trim() && !isGarbageOutput(html)) {
      return html;
    }
  } catch (err) {
    console.warn('rtf-toolkit parser encountered non-fatal error, falling back:', err);
  }

  // Fallback state-machine parser for resilient parsing of legacy or malformed RTF
  return fallbackRtfParser(text);
}

/**
 * Checks if output looks like leaked font table metadata
 */
function isGarbageOutput(html: string): boolean {
  // If html contains panose numbers like *02070309... or repeated font names without real text
  return html.includes('*020') || html.includes('*050') || (html.includes('Times New Roman CE;') && html.includes('Courier New Cyr;'));
}

/**
 * Strips balanced RTF metadata & destination groups like {\fonttbl ...}, {\colortbl ...},
 * and all {\*...} groups (such as panose data, alt font names, generators, etc.)
 */
export function cleanRtfHeaderGroups(rtf: string): string {
  let result = '';
  let i = 0;

  const skipGroups = [
    '\\*',
    '\\fonttbl',
    '\\colortbl',
    '\\stylesheet',
    '\\info',
    '\\latentstyles',
    '\\themedata',
    '\\colorschememapping',
    '\\filetable',
    '\\listtable',
    '\\listoverridetable',
    '\\rsidtbl',
    '\\mmathPr',
    '\\xmlnstbl',
    '\\generator',
    '\\docfmt',
    '\\userprops',
    '\\header',
    '\\footer',
    '\\headerl',
    '\\headerr',
    '\\footerl',
    '\\footerr',
  ];

  while (i < rtf.length) {
    if (rtf[i] === '{') {
      let k = i + 1;
      while (k < rtf.length && /\s/.test(rtf[k])) k++;
      const rest = rtf.slice(k, k + 30);
      const shouldSkip = skipGroups.some((prefix) => rest.startsWith(prefix));

      if (shouldSkip) {
        let depth = 1;
        let j = i + 1;
        while (j < rtf.length && depth > 0) {
          if (rtf[j] === '\\') {
            j += 2;
            continue;
          }
          if (rtf[j] === '{') {
            depth++;
          } else if (rtf[j] === '}') {
            depth--;
          }
          j++;
        }
        i = j;
        continue;
      }
    }
    result += rtf[i];
    i++;
  }
  return result;
}

/**
 * Fallback resilient stack-based RTF parser
 */
function fallbackRtfParser(body: string): string {
  try {
    let output = '';
    let currentParagraph = '';
    let bold = false;
    let italic = false;
    let underline = false;
    let strikethrough = false;
    let currentAlign = 'left';

    const flushPara = () => {
      if (currentParagraph.trim() || output.length === 0) {
        const alignStyle = currentAlign !== 'left' ? ` style="text-align: ${currentAlign};"` : '';
        output += `<p${alignStyle}>${currentParagraph || '&nbsp;'}</p>`;
      }
      currentParagraph = '';
    };

    let i = 0;
    while (i < body.length) {
      const c = body[i];

      if (c === '\\') {
        i++;
        // Escaped literal
        if (body[i] === '\\' || body[i] === '{' || body[i] === '}') {
          currentParagraph += body[i];
          i++;
          continue;
        }

        // Hex byte \'hh
        if (body[i] === "'") {
          const hex = body.slice(i + 1, i + 3);
          const code = parseInt(hex, 16);
          if (!isNaN(code)) {
            currentParagraph += String.fromCharCode(code);
          }
          i += 3;
          continue;
        }

        // Read control word
        let word = '';
        while (i < body.length && /[a-zA-Z]/.test(body[i])) {
          word += body[i];
          i++;
        }

        // Read numeric parameter
        let numStr = '';
        let isNeg = false;
        if (body[i] === '-') {
          isNeg = true;
          i++;
        }
        while (i < body.length && /[0-9]/.test(body[i])) {
          numStr += body[i];
          i++;
        }
        const val = numStr ? (isNeg ? -parseInt(numStr, 10) : parseInt(numStr, 10)) : null;

        // Skip single delimiter space
        if (body[i] === ' ') {
          i++;
        }

        switch (word) {
          case 'u': // Unicode character escape \uN?
            if (val !== null) {
              let cp = val;
              if (cp < 0) cp += 65536;
              try {
                currentParagraph += String.fromCodePoint(cp);
              } catch {
                currentParagraph += '?';
              }
              // Skip trailing fallback char if present
              if (body[i] === '?') i++;
            }
            break;
          case 'b':
            bold = val !== 0;
            break;
          case 'i':
            italic = val !== 0;
            break;
          case 'ul':
            underline = true;
            break;
          case 'ulnone':
            underline = false;
            break;
          case 'strike':
            strikethrough = val !== 0;
            break;
          case 'qc':
            currentAlign = 'center';
            break;
          case 'qr':
            currentAlign = 'right';
            break;
          case 'ql':
            currentAlign = 'left';
            break;
          case 'qj':
            currentAlign = 'justify';
            break;
          case 'par':
          case 'line':
            flushPara();
            break;
          case 'tab':
            currentParagraph += '&emsp;';
            break;
          default:
            break;
        }
      } else if (c === '{' || c === '}') {
        i++;
      } else if (c === '\r' || c === '\n') {
        i++;
      } else {
        let span = escapeHtml(c);
        if (bold) span = `<strong>${span}</strong>`;
        if (italic) span = `<em>${span}</em>`;
        if (underline) span = `<u>${span}</u>`;
        if (strikethrough) span = `<s>${span}</s>`;
        currentParagraph += span;
        i++;
      }
    }

    flushPara();
    return output || '<p>Start typing here...</p>';
  } catch (e) {
    console.error('Fallback parser error:', e);
    return `<p>${escapeHtml(body)}</p>`;
  }
}

/**
 * Serializes rich HTML document into an authentic, compliant RTF document string
 * with Unicode escapes (\uN?) for Armenian, Russian, and international symbols,
 * complete table definitions (\trowd, \intbl, \cell, \row), and standard styling.
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
