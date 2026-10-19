/**
 * Lithora Word 2003 XML & Flat OPC XML Parser Service
 * 
 * Supports Microsoft Word XML formats (<w:wordDocument> and <pkg:package>).
 * Preserves paragraphs, formatting, tables, lines, and fonts.
 */

export interface XmlWordParseResult {
  html: string;
  fonts: string[];
}

export function parseXmlWordToHtml(xmlText: string): XmlWordParseResult {
  const fonts = new Set<string>();

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // Extract declared fonts
    const fontEls = Array.from(doc.querySelectorAll('w\\:font, font'));
    for (const el of fontEls) {
      const name = el.getAttribute('w:name') || el.getAttribute('name');
      if (name && !name.startsWith('@')) {
        fonts.add(name.trim());
      }
    }

    // Find body
    const body = doc.querySelector('w\\:body, body');
    if (!body) {
      return { html: '<p>Empty document</p>', fonts: Array.from(fonts) };
    }

    const htmlParts: string[] = [];

    // Process paragraphs and tables
    for (const child of Array.from(body.children)) {
      const tag = child.localName || child.tagName.split(':').pop() || '';

      if (tag === 'p') {
        const pPr = child.querySelector('w\\:pPr, pPr');
        let styleStr = 'margin-bottom: 8px; line-height: 1.4;';

        if (pPr) {
          const jc = pPr.querySelector('w\\:jc, jc');
          if (jc) {
            const val = jc.getAttribute('w:val') || jc.getAttribute('val');
            if (val === 'center') styleStr += ' text-align: center;';
            else if (val === 'right') styleStr += ' text-align: right;';
            else if (val === 'both') styleStr += ' text-align: justify;';
          }
          const spacing = pPr.querySelector('w\\:spacing, spacing');
          if (spacing) {
            const line = spacing.getAttribute('w:line') || spacing.getAttribute('line');
            if (line) {
              const num = parseInt(line, 10);
              if (num > 0) styleStr += ` line-height: ${(num / 240).toFixed(2)};`;
            }
          }
        }

        let pContent = '';
        const runs = Array.from(child.querySelectorAll('w\\:r, r'));
        for (const r of runs) {
          let text = '';
          const tEls = Array.from(r.querySelectorAll('w\\:t, t'));
          for (const t of tEls) {
            text += escapeHtml(t.textContent || '');
          }

          if (r.querySelector('w\\:br, br')) {
            text += '<br/>';
          }

          if (!text) continue;

          let runStyle = '';
          const rPr = r.querySelector('w\\:rPr, rPr');
          let isBold = false;
          let isItalic = false;
          let isUnderline = false;

          if (rPr) {
            if (rPr.querySelector('w\\:b, b')) isBold = true;
            if (rPr.querySelector('w\\:i, i')) isItalic = true;
            if (rPr.querySelector('w\\:u, u')) isUnderline = true;

            const rFonts = rPr.querySelector('w\\:rFonts, rFonts');
            if (rFonts) {
              const fName = rFonts.getAttribute('w:ascii') || rFonts.getAttribute('w:hAnsi') || rFonts.getAttribute('ascii');
              if (fName) {
                runStyle += `font-family: '${fName}', sans-serif; `;
                fonts.add(fName);
              }
            }

            const color = rPr.querySelector('w\\:color, color');
            if (color) {
              const cVal = color.getAttribute('w:val') || color.getAttribute('val');
              if (cVal && cVal !== 'auto') runStyle += `color: #${cVal}; `;
            }
          }

          let formattedText = text;
          if (isBold) formattedText = `<strong>${formattedText}</strong>`;
          if (isItalic) formattedText = `<em>${formattedText}</em>`;
          if (isUnderline) formattedText = `<u>${formattedText}</u>`;
          if (runStyle) formattedText = `<span style="${runStyle}">${formattedText}</span>`;

          pContent += formattedText;
        }

        htmlParts.push(`<p style="${styleStr}">${pContent || '&nbsp;'}</p>`);
      } else if (tag === 'tbl') {
        let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">';
        const rows = Array.from(child.querySelectorAll('w\\:tr, tr'));
        for (const row of rows) {
          tableHtml += '<tr>';
          const cells = Array.from(row.querySelectorAll('w\\:tc, tc'));
          for (const cell of cells) {
            const pEls = Array.from(cell.querySelectorAll('w\\:p, p'));
            const cellText = pEls.map((p) => p.textContent?.trim() || '').filter(Boolean).join('<br/>');
            tableHtml += `<td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${cellText || '&nbsp;'}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</table>';
        htmlParts.push(tableHtml);
      }
    }

    const html = htmlParts.length > 0 ? htmlParts.join('\n') : '<p>Empty document</p>';
    return { html, fonts: Array.from(fonts) };
  } catch (err) {
    console.error('Error parsing Word XML:', err);
    return { html: `<p>${escapeHtml(xmlText)}</p>`, fonts: [] };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
