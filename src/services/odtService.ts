/**
 * Lithora OpenDocument Text (.odt) Parser Service
 * 
 * Complies with OASIS OpenDocument Standard (supported natively by Microsoft Word).
 * Extracts text, headings, multi-column sections, tables, styles, and font declarations.
 */

import JSZip from 'jszip';

export interface OdtParseResult {
  html: string;
  fonts: string[];
}

export async function parseOdtToHtml(arrayBuffer: ArrayBuffer): Promise<OdtParseResult> {
  const fonts = new Set<string>();

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Read content.xml
    const contentXmlFile = zip.file('content.xml');
    if (!contentXmlFile) {
      throw new Error('Invalid .odt package: content.xml not found.');
    }
    const contentXmlStr = await contentXmlFile.async('text');

    // 2. Read styles.xml if available
    let stylesXmlStr = '';
    const stylesXmlFile = zip.file('styles.xml');
    if (stylesXmlFile) {
      stylesXmlStr = await stylesXmlFile.async('text');
    }

    const parser = new DOMParser();
    const contentDoc = parser.parseFromString(contentXmlStr, 'application/xml');
    const stylesDoc = stylesXmlStr ? parser.parseFromString(stylesXmlStr, 'application/xml') : null;

    // 3. Extract font declarations from both content and styles
    const fontDecls = [
      ...Array.from(contentDoc.querySelectorAll('font-face, font-decl, style\\:font-face')),
      ...(stylesDoc ? Array.from(stylesDoc.querySelectorAll('font-face, font-decl, style\\:font-face')) : []),
    ];

    for (const el of fontDecls) {
      const name = el.getAttribute('style:name') || el.getAttribute('svg:font-family') || el.getAttribute('name');
      if (name && !name.startsWith('@')) {
        fonts.add(name.replace(/['"]/g, '').trim());
      }
    }

    // 4. Map style definitions (bold, italic, color, font-family, line-height, text-align, margins)
    const styleMap = new Map<string, Record<string, string>>();
    const allStyles = [
      ...Array.from(contentDoc.querySelectorAll('style\\:style, style')),
      ...(stylesDoc ? Array.from(stylesDoc.querySelectorAll('style\\:style, style')) : []),
    ];

    for (const s of allStyles) {
      const name = s.getAttribute('style:name');
      if (!name) continue;

      const props: Record<string, string> = {};
      const textProps = s.querySelector('style\\:text-properties, text-properties');
      if (textProps) {
        const fontWeight = textProps.getAttribute('fo:font-weight') || textProps.getAttribute('style:font-weight');
        if (fontWeight === 'bold' || fontWeight === '700') props['font-weight'] = 'bold';

        const fontStyle = textProps.getAttribute('fo:font-style') || textProps.getAttribute('style:font-style');
        if (fontStyle === 'italic') props['font-style'] = 'italic';

        const fontName = textProps.getAttribute('style:font-name') || textProps.getAttribute('fo:font-family');
        if (fontName) {
          const cleanFont = fontName.replace(/['"]/g, '').trim();
          props['font-family'] = `'${cleanFont}', sans-serif`;
          fonts.add(cleanFont);
        }

        const fontSize = textProps.getAttribute('fo:font-size') || textProps.getAttribute('style:font-size');
        if (fontSize) props['font-size'] = fontSize;

        const color = textProps.getAttribute('fo:color') || textProps.getAttribute('style:color');
        if (color) props['color'] = color;

        const bg = textProps.getAttribute('fo:background-color') || textProps.getAttribute('style:background-color');
        if (bg && bg !== 'transparent') props['background-color'] = bg;

        const underline = textProps.getAttribute('style:text-underline-style');
        if (underline && underline !== 'none') props['text-decoration'] = 'underline';
      }

      const paraProps = s.querySelector('style\\:paragraph-properties, paragraph-properties');
      if (paraProps) {
        const align = paraProps.getAttribute('fo:text-align');
        if (align) props['text-align'] = align === 'start' ? 'left' : align === 'end' ? 'right' : align;

        const lineHeight = paraProps.getAttribute('fo:line-height');
        if (lineHeight) props['line-height'] = lineHeight;

        const marginTop = paraProps.getAttribute('fo:margin-top');
        if (marginTop) props['margin-top'] = marginTop;

        const marginBottom = paraProps.getAttribute('fo:margin-bottom');
        if (marginBottom) props['margin-bottom'] = marginBottom;

        const textIndent = paraProps.getAttribute('fo:text-indent');
        if (textIndent) props['text-indent'] = textIndent;

        // Multi-column section
        const colsEl = paraProps.querySelector('style\\:columns, columns');
        if (colsEl) {
          const colCount = colsEl.getAttribute('fo:column-count');
          if (colCount && parseInt(colCount, 10) > 1) {
            props['column-count'] = colCount;
            const colGap = colsEl.getAttribute('fo:column-gap');
            if (colGap) props['column-gap'] = colGap;
          }
        }
      }

      const tableProps = s.querySelector('style\\:table-cell-properties, table-cell-properties');
      if (tableProps) {
        const bg = tableProps.getAttribute('fo:background-color');
        if (bg && bg !== 'transparent') props['background-color'] = bg;

        const border = tableProps.getAttribute('fo:border');
        if (border && border !== 'none') props['border'] = border;
      }

      if (Object.keys(props).length > 0) {
        styleMap.set(name, props);
      }
    }

    // 5. Parse <office:text> into HTML elements
    const officeText = contentDoc.querySelector('office\\:text, text');
    if (!officeText) {
      return { html: '<p>Empty document</p>', fonts: Array.from(fonts) };
    }

    const htmlParts: string[] = [];

    const renderChildren = (parent: Element): string => {
      let out = '';
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          out += escapeHtml(node.textContent || '');
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const tagName = el.localName || el.tagName.split(':').pop() || '';

          if (tagName === 'span') {
            const styleName = el.getAttribute('text:style-name') || el.getAttribute('style-name');
            const style = styleName ? buildCssString(styleMap.get(styleName)) : '';
            const inner = renderChildren(el);
            out += style ? `<span style="${style}">${inner}</span>` : inner;
          } else if (tagName === 'line-break') {
            out += '<br/>';
          } else if (tagName === 'tab') {
            out += '&emsp;';
          } else if (tagName === 's') {
            const count = parseInt(el.getAttribute('text:c') || '1', 10);
            out += '&nbsp;'.repeat(count);
          } else if (tagName === 'a') {
            const href = el.getAttribute('xlink:href') || '#';
            out += `<a href="${href}" target="_blank" rel="noopener noreferrer">${renderChildren(el)}</a>`;
          } else {
            out += renderChildren(el);
          }
        }
      }
      return out;
    };

    for (const child of Array.from(officeText.children)) {
      const tagName = child.localName || child.tagName.split(':').pop() || '';

      if (tagName === 'h') {
        const level = Math.min(6, Math.max(1, parseInt(child.getAttribute('text:outline-level') || '1', 10)));
        const styleName = child.getAttribute('text:style-name') || child.getAttribute('style-name');
        const style = styleName ? buildCssString(styleMap.get(styleName)) : '';
        const inner = renderChildren(child);
        htmlParts.push(`<h${level}${style ? ` style="${style}"` : ''}>${inner}</h${level}>`);
      } else if (tagName === 'p') {
        const styleName = child.getAttribute('text:style-name') || child.getAttribute('style-name');
        const styleObj = styleName ? styleMap.get(styleName) : undefined;
        const style = styleObj ? buildCssString(styleObj) : '';
        const inner = renderChildren(child) || '&nbsp;';
        htmlParts.push(`<p${style ? ` style="${style}"` : ''}>${inner}</p>`);
      } else if (tagName === 'table') {
        let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">';
        const rows = Array.from(child.querySelectorAll('table\\:table-row, table-row'));
        for (const row of rows) {
          tableHtml += '<tr>';
          const cells = Array.from(row.querySelectorAll('table\\:table-cell, table-cell'));
          for (const cell of cells) {
            const cellStyleName = cell.getAttribute('table:style-name') || cell.getAttribute('style-name');
            const cellStyle = cellStyleName ? buildCssString(styleMap.get(cellStyleName)) : '';
            const cellContent = renderChildren(cell) || '&nbsp;';
            tableHtml += `<td style="padding: 8px 12px; border: 1px solid #cbd5e1; ${cellStyle}">${cellContent}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</table>';
        htmlParts.push(tableHtml);
      } else if (tagName === 'list') {
        let listHtml = '<ul style="margin: 12px 0; padding-left: 24px;">';
        const items = Array.from(child.querySelectorAll('text\\:list-item, list-item'));
        for (const item of items) {
          listHtml += `<li>${renderChildren(item)}</li>`;
        }
        listHtml += '</ul>';
        htmlParts.push(listHtml);
      } else if (tagName === 'section') {
        const styleName = child.getAttribute('text:style-name') || child.getAttribute('style-name');
        const styleObj = styleName ? styleMap.get(styleName) : undefined;
        const style = styleObj ? buildCssString(styleObj) : '';
        htmlParts.push(`<div class="doc-section"${style ? ` style="${style}"` : ''}>${renderChildren(child)}</div>`);
      }
    }

    const html = htmlParts.length > 0 ? htmlParts.join('\n') : '<p>Empty document</p>';
    return { html, fonts: Array.from(fonts) };
  } catch (error) {
    console.error('Error parsing .odt document:', error);
    throw new Error('Failed to parse OpenDocument (.odt) file.');
  }
}

function buildCssString(props?: Record<string, string>): string {
  if (!props) return '';
  return Object.entries(props)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
