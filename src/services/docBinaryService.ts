/**
 * Lithora Word 97-2003 Binary Document (.doc / .dot) Parser Service
 * 
 * Extracts text runs, paragraph breaks, table structures, and Cyrillic/Unicode
 * characters from Microsoft Word 97-2003 binary streams (CFB/OLE2).
 */

export interface DocParseResult {
  html: string;
  fonts: string[];
}

export async function parseDocBinaryToHtml(arrayBuffer: ArrayBuffer): Promise<DocParseResult> {
  const uint8 = new Uint8Array(arrayBuffer);
  const fonts = new Set<string>();

  // Verify OLE2 / Compound File Binary signature: 0xD0CF11E0A1B11AE1
  const isCfb =
    uint8.length >= 8 &&
    uint8[0] === 0xd0 &&
    uint8[1] === 0xcf &&
    uint8[2] === 0x11 &&
    uint8[3] === 0xe0 &&
    uint8[4] === 0xa1 &&
    uint8[5] === 0xb1 &&
    uint8[6] === 0x1a &&
    uint8[7] === 0xe1;

  if (!isCfb) {
    // If not CFB, could be Word 2003 XML or raw RTF or text
    const textHeader = new TextDecoder('utf-8', { fatal: false }).decode(uint8.subarray(0, 500));
    if (textHeader.trim().startsWith('{\\rtf')) {
      const { parseRtfWithFonts } = await import('./rtfParser');
      const text = new TextDecoder('utf-8').decode(uint8);
      return parseRtfWithFonts(text);
    }
  }

  // Detect Cyrillic vs Latin codepage hints in file headers
  let isCyrillic = false;
  for (let k = 0; k < Math.min(uint8.length, 2048); k++) {
    // 0x0419 = Russian LCID (1049) or 1251
    if (uint8[k] === 0x19 && uint8[k + 1] === 0x04) isCyrillic = true;
    if (uint8[k] === 0xe3 && uint8[k + 1] === 0x04) isCyrillic = true;
  }

  // Scan common font names in the binary file to preserve them
  const sampleText = String.fromCharCode(...uint8.subarray(0, Math.min(uint8.length, 16384)));
  const knownFonts = [
    'Calibri',
    'Times New Roman',
    'Arial',
    'Georgia',
    'Verdana',
    'Courier New',
    'Sylfaen',
    'Cambria',
    'Aptos',
    'Segoe UI',
    'Comic Sans MS',
    'Trebuchet MS',
    'Palatino',
    'Garamond',
    'Book Antiqua',
  ];
  for (const kf of knownFonts) {
    if (sampleText.includes(kf)) {
      fonts.add(kf);
    }
  }

  // Extract strings from the WordDocument stream
  // In Word binary, text can be 16-bit Unicode (UTF-16LE) or 8-bit characters.
  const paragraphs: string[] = [];
  let currentPara: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';

  // Extract UTF-16LE text runs (minimum length 3 readable characters)
  let pos = 512; // Skip standard CFB header sector
  const end = uint8.length - 1;

  while (pos < end) {
    // Check for UTF-16LE characters (char code with 0x00 high byte, or Cyrillic 0x04 high byte, or Armenian 0x05 high byte)
    const low = uint8[pos];
    const high = uint8[pos + 1];

    if (high === 0x00 || high === 0x04 || high === 0x05) {
      const code = low | (high << 8);

      if (code === 0x0d) {
        // \r = Paragraph break in Word binary
        if (inTable && currentRow.length > 0) {
          if (currentCell.trim()) currentRow.push(currentCell.trim());
          tableRows.push([...currentRow]);
          currentRow = [];
          currentCell = '';
        } else if (currentPara.length > 0) {
          paragraphs.push(currentPara.join('').trim());
          currentPara = [];
        }
        pos += 2;
        continue;
      }

      if (code === 0x07) {
        // \x07 = Cell mark in Word binary table
        inTable = true;
        currentRow.push(currentCell.trim());
        currentCell = '';
        pos += 2;
        continue;
      }

      if (code === 0x0b) {
        // Soft line break
        if (inTable) currentCell += '<br/>';
        else currentPara.push('<br/>');
        pos += 2;
        continue;
      }

      if (code === 0x09) {
        // Tab stop
        if (inTable) currentCell += '&emsp;';
        else currentPara.push('&emsp;');
        pos += 2;
        continue;
      }

      // Readable Unicode range
      if (
        (code >= 32 && code <= 126) ||
        (code >= 0x0400 && code <= 0x04ff) || // Cyrillic
        (code >= 0x0530 && code <= 0x058f) || // Armenian
        (code >= 0x00a0 && code <= 0x00ff)    // Latin-1 Supplement
      ) {
        const char = String.fromCharCode(code);
        if (inTable) {
          currentCell += escapeHtml(char);
        } else {
          currentPara.push(escapeHtml(char));
        }
        pos += 2;
        continue;
      }
    }

    // Check if end of table sequence
    if (inTable && tableRows.length > 0 && currentPara.length > 10) {
      // Flush table to paragraphs
      let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">';
      for (const row of tableRows) {
        tableHtml += '<tr>';
        for (const cell of row) {
          tableHtml += `<td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${cell || '&nbsp;'}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</table>';
      paragraphs.push(tableHtml);
      tableRows = [];
      currentRow = [];
      inTable = false;
    }

    pos++;
  }

  // Flush any remaining text
  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join('').trim());
  }
  if (inTable && tableRows.length > 0) {
    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">';
    for (const row of tableRows) {
      tableHtml += '<tr>';
      for (const cell of row) {
        tableHtml += `<td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${cell || '&nbsp;'}</td>`;
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</table>';
    paragraphs.push(tableHtml);
  }

  // Filter out noise or metadata blocks from binary stream
  const cleanParagraphs = paragraphs
    .filter((p) => p.length > 0 && !p.startsWith('<?xml') && !p.includes('Microsoft Word'))
    .map((p) => {
      if (p.startsWith('<table')) return p;
      return `<p style="margin-bottom: 8px; line-height: 1.4;">${p}</p>`;
    });

  const html = cleanParagraphs.length > 0 ? cleanParagraphs.join('\n') : '<p>Empty document</p>';

  return {
    html,
    fonts: Array.from(fonts),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
