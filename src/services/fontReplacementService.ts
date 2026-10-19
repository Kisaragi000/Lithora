/**
 * Lithora Font Intelligence & Missing Font Replacement Service
 *
 * Detects document fonts, verifies local and Google Fonts availability,
 * and provides intelligent, typography-aware replacement suggestions
 * when proprietary or system fonts are missing.
 */

import { GOOGLE_FONTS_CATALOG, loadGoogleFont } from './googleFontsService';

export interface MissingFontReport {
  fontName: string;
  suggestedReplacement: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  reason: string;
  alternativeSuggestions: string[];
  occurrences: number;
}

// Curated typography-aware mapping for common proprietary and desktop fonts
const FONT_REPLACEMENT_DATABASE: Record<
  string,
  {
    suggestion: string;
    category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
    reason: string;
    alternatives: string[];
  }
> = {
  aptos: {
    suggestion: 'Plus Jakarta Sans',
    category: 'sans-serif',
    reason: 'Metric-compatible contemporary humanist sans-serif matching Microsoft 365 default',
    alternatives: ['Inter', 'Roboto', 'Open Sans'],
  },
  'aptos display': {
    suggestion: 'Plus Jakarta Sans',
    category: 'sans-serif',
    reason: 'Crisp modern geometric sans with excellent display legibility',
    alternatives: ['Outfit', 'Montserrat'],
  },
  calibri: {
    suggestion: 'Carlito',
    category: 'sans-serif',
    reason: 'Direct metric-compatible open equivalent designed specifically for Calibri',
    alternatives: ['Plus Jakarta Sans', 'Open Sans', 'Lato'],
  },
  'calibri light': {
    suggestion: 'Plus Jakarta Sans',
    category: 'sans-serif',
    reason: 'Clean contemporary light sans-serif with subtle rounded terminals',
    alternatives: ['Inter', 'Raleway'],
  },
  cambria: {
    suggestion: 'Caladea',
    category: 'serif',
    reason: 'Metric-compatible open equivalent designed specifically for Cambria',
    alternatives: ['Lora', 'Merriweather', 'PT Serif'],
  },
  'cambria math': {
    suggestion: 'Lora',
    category: 'serif',
    reason: 'High-contrast traditional transitional serif with clear glyph distinctions',
    alternatives: ['EB Garamond', 'Merriweather', 'PT Serif'],
  },
  'segoe ui': {
    suggestion: 'Open Sans',
    category: 'sans-serif',
    reason: 'Balanced neutral neo-grotesque with clear humanist proportions',
    alternatives: ['Inter', 'Roboto', 'Plus Jakarta Sans'],
  },
  'segoe ui semibold': {
    suggestion: 'Open Sans',
    category: 'sans-serif',
    reason: 'Clear humanist UI font with high legibility at medium weights',
    alternatives: ['Inter', 'Sora'],
  },
  'sf pro': {
    suggestion: 'Inter',
    category: 'sans-serif',
    reason: 'Premium screen-optimized neo-grotesque crafted for crisp UI rendering',
    alternatives: ['Roboto', 'Public Sans'],
  },
  'sf pro display': {
    suggestion: 'Inter',
    category: 'sans-serif',
    reason: 'Neutral versatile geometric typeface',
    alternatives: ['Plus Jakarta Sans', 'Manrope'],
  },
  'helvetica neue': {
    suggestion: 'Inter',
    category: 'sans-serif',
    reason: 'Ultra-crisp neo-grotesque with identical neutral modernist characteristics',
    alternatives: ['Roboto', 'Montserrat', 'Work Sans'],
  },
  helvetica: {
    suggestion: 'Roboto',
    category: 'sans-serif',
    reason: 'Classic Swiss modernist neutral grotesque',
    alternatives: ['Inter', 'Open Sans'],
  },
  'myriad pro': {
    suggestion: 'Montserrat',
    category: 'sans-serif',
    reason: 'Warm humanist proportions and friendly geometry matching Myriad aesthetics',
    alternatives: ['Open Sans', 'Lato', 'Rubik'],
  },
  myriad: {
    suggestion: 'Montserrat',
    category: 'sans-serif',
    reason: 'Humanist sans with open counters and balanced curves',
    alternatives: ['Open Sans', 'Ubuntu'],
  },
  futura: {
    suggestion: 'Jost',
    category: 'sans-serif',
    reason: 'Pure geometric proportions directly inspired by 1920s Bauhaus and Futura',
    alternatives: ['Urbanist', 'Montserrat'],
  },
  'futura pt': {
    suggestion: 'Jost',
    category: 'sans-serif',
    reason: 'Modern geometric sans with distinctive circular bowls and sharp apexes',
    alternatives: ['Urbanist', 'Lexend'],
  },
  'gill sans': {
    suggestion: 'Cabin',
    category: 'sans-serif',
    reason: 'Humanist sans with British modernist flair and warm geometry',
    alternatives: ['Lato', 'Fira Sans'],
  },
  'franklin gothic': {
    suggestion: 'Libre Franklin',
    category: 'sans-serif',
    reason: 'Faithful open-source revival of classic American newspaper grotesque',
    alternatives: ['Oswald', 'Barlow'],
  },
  'franklin gothic medium': {
    suggestion: 'Libre Franklin',
    category: 'sans-serif',
    reason: 'Sturdy American grotesque with strong vertical stress and punchy weight',
    alternatives: ['Oswald', 'Rubik'],
  },
  'century gothic': {
    suggestion: 'Questrial',
    category: 'sans-serif',
    reason: 'Large x-height circular geometric sans matching Century Gothic rhythm',
    alternatives: ['Montserrat', 'Poppins'],
  },
  garamond: {
    suggestion: 'EB Garamond',
    category: 'serif',
    reason: 'Masterful Claude Garamont Renaissance revival with classical proportions',
    alternatives: ['Cormorant Garamond', 'Libre Baskerville'],
  },
  'adobe garamond pro': {
    suggestion: 'EB Garamond',
    category: 'serif',
    reason: 'True Renaissance old-style serif with dynamic italics and refined grace',
    alternatives: ['Cormorant Garamond', 'Spectral'],
  },
  baskerville: {
    suggestion: 'Libre Baskerville',
    category: 'serif',
    reason: 'Optimized digital revival of John Baskerville 1757 transitional masterpiece',
    alternatives: ['Playfair Display', 'Merriweather'],
  },
  didot: {
    suggestion: 'Bodoni Moda',
    category: 'serif',
    reason: 'Extreme vertical contrast hairline serifs embodying high-fashion modernism',
    alternatives: ['Playfair Display', 'Cinzel'],
  },
  bodoni: {
    suggestion: 'Bodoni Moda',
    category: 'serif',
    reason: 'Giambattista Bodoni 1798 neoclassical masterwork with dramatic thicks and thins',
    alternatives: ['Playfair Display', 'Prata'],
  },
  palatino: {
    suggestion: 'Cinzel',
    category: 'serif',
    reason: 'Classical Italian Renaissance calligraphic serif with broad nib proportions',
    alternatives: ['Cardo', 'EB Garamond'],
  },
  'palatino linotype': {
    suggestion: 'Cardo',
    category: 'serif',
    reason: 'Hermann Zapf inspired book serif with generous proportions and graceful serifs',
    alternatives: ['EB Garamond', 'Lora'],
  },
  'book antiqua': {
    suggestion: 'EB Garamond',
    category: 'serif',
    reason: 'Classical humanist book face with high legibility across long passages',
    alternatives: ['Lora', 'Merriweather'],
  },
  consolas: {
    suggestion: 'Inconsolata',
    category: 'monospace',
    reason: 'Raph Levien clean humanist monospace specifically designed to rival Consolas',
    alternatives: ['JetBrains Mono', 'Fira Code', 'Roboto Mono'],
  },
  monaco: {
    suggestion: 'Source Code Pro',
    category: 'monospace',
    reason: 'Crisp developer monospace with distinct punctuation and zero/O clarity',
    alternatives: ['JetBrains Mono', 'Roboto Mono'],
  },
  menlo: {
    suggestion: 'JetBrains Mono',
    category: 'monospace',
    reason: 'High-legibility developer font with increased letter spacing and distinct symbols',
    alternatives: ['Fira Code', 'Roboto Mono'],
  },
  'comic sans ms': {
    suggestion: 'Comic Neue',
    category: 'handwriting',
    reason: 'Modern, balanced redesign of informal handwriting with improved typographic rhythm',
    alternatives: ['Caveat', 'Comfortaa'],
  },
  impact: {
    suggestion: 'Anton',
    category: 'sans-serif',
    reason: 'Dense, ultra-bold headline grotesque with narrow proportions and maximum punch',
    alternatives: ['Bebas Neue', 'Oswald'],
  },
  'arial amu': {
    suggestion: 'Noto Sans Armenian',
    category: 'sans-serif',
    reason: 'Official universal Google font for Armenian script with native typography',
    alternatives: ['Sylfaen'],
  },
  'armnet arial': {
    suggestion: 'Noto Sans Armenian',
    category: 'sans-serif',
    reason: 'Modern Armenian sans-serif with flawless Unicode encoding',
    alternatives: ['Sylfaen'],
  },
  'sylfaen amu': {
    suggestion: 'Noto Serif Armenian',
    category: 'serif',
    reason: 'Authentic Armenian serif with traditional calligraphic character',
    alternatives: ['Sylfaen'],
  },
};

/**
 * Normalizes a font family string by removing quotes, fallback fonts, and extra spaces
 */
export function normalizeFontName(fontFamily: string): string {
  if (!fontFamily) return '';
  // Split by comma if fallback list: e.g. "Calibri, sans-serif" -> "Calibri"
  const primary = fontFamily.split(',')[0];
  return primary.replace(/["']/g, '').trim();
}

/**
 * Checks if a font is available locally in the browser/OS environment
 */
export function isFontAvailableLocally(fontName: string): boolean {
  const clean = normalizeFontName(fontName);
  if (!clean) return true;

  // Standard safe web fonts
  const webSafe = new Set([
    'arial',
    'times new roman',
    'georgia',
    'courier new',
    'verdana',
    'tahoma',
    'trebuchet ms',
    'impact',
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
  ]);

  if (webSafe.has(clean.toLowerCase())) {
    return true;
  }

  // Use FontFaceSet API if supported
  if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.check === 'function') {
    try {
      return document.fonts.check(`16px "${clean}"`);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Analyzes a list of font names detected in a document.
 * 1. For Google Fonts, automatically attempts dynamic loading.
 * 2. For missing fonts, generates intelligent replacement suggestions.
 */
export async function analyzeDocumentFonts(
  rawFontNames: string[],
  contentHtml: string
): Promise<{
  allDetected: string[];
  loadedFromGoogle: string[];
  missingFonts: MissingFontReport[];
}> {
  const uniqueFonts = Array.from(
    new Set(rawFontNames.map(normalizeFontName).filter(Boolean))
  );

  const loadedFromGoogle: string[] = [];
  const missingFonts: MissingFontReport[] = [];

  for (const font of uniqueFonts) {
    const lower = font.toLowerCase();

    // Check if this font is in Google Fonts catalog or available on Google Fonts
    const catalogMatch = GOOGLE_FONTS_CATALOG.find(
      (gf) => gf.family.toLowerCase() === lower
    );

    if (catalogMatch) {
      // It is a known Google Font: load it right away so the document stays 100% intact!
      try {
        await loadGoogleFont(catalogMatch.family);
        loadedFromGoogle.push(catalogMatch.family);
        continue;
      } catch {
        // Fall through to local check
      }
    }

    // Try checking if it's already available locally or via active stylesheets
    if (isFontAvailableLocally(font)) {
      continue;
    }

    // Attempt to load from Google Fonts in case it's a valid uncataloged Google font
    let successfullyLoaded = false;
    try {
      await loadGoogleFont(font);
      if (isFontAvailableLocally(font)) {
        loadedFromGoogle.push(font);
        successfullyLoaded = true;
      }
    } catch {
      successfullyLoaded = false;
    }

    if (successfullyLoaded) {
      continue;
    }

    // The font is genuinely missing! Generate replacement suggestion
    const count = countFontOccurrences(font, contentHtml);
    const suggestionInfo = findReplacementSuggestion(font);

    missingFonts.push({
      fontName: font,
      suggestedReplacement: suggestionInfo.suggestion,
      category: suggestionInfo.category,
      reason: suggestionInfo.reason,
      alternativeSuggestions: suggestionInfo.alternatives,
      occurrences: count,
    });
  }

  return {
    allDetected: uniqueFonts,
    loadedFromGoogle,
    missingFonts,
  };
}

/**
 * Counts how many times a font name is referenced in the document HTML
 */
function countFontOccurrences(fontName: string, html: string): number {
  if (!html) return 1;
  const escaped = fontName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`font-family:[^;"]*?${escaped}`, 'gi');
  const matches = html.match(regex);
  return matches ? matches.length : 1;
}

/**
 * Finds the best replacement suggestion for a given font name
 */
export function findReplacementSuggestion(fontName: string): {
  suggestion: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  reason: string;
  alternatives: string[];
} {
  const lower = fontName.toLowerCase().trim();

  // 1. Direct database match
  if (FONT_REPLACEMENT_DATABASE[lower]) {
    return FONT_REPLACEMENT_DATABASE[lower];
  }

  // 2. Partial match in database
  for (const [key, val] of Object.entries(FONT_REPLACEMENT_DATABASE)) {
    if (lower.includes(key) || key.includes(lower)) {
      return val;
    }
  }

  // 3. Keyword heuristic
  if (lower.includes('mono') || lower.includes('code') || lower.includes('console') || lower.includes('typewriter')) {
    return {
      suggestion: 'JetBrains Mono',
      category: 'monospace',
      reason: 'Crisp developer monospace with exceptional character clarity',
      alternatives: ['Roboto Mono', 'Fira Code', 'Inconsolata'],
    };
  }

  if (lower.includes('serif') || lower.includes('roman') || lower.includes('book') || lower.includes('antiqua') || lower.includes('dutch')) {
    return {
      suggestion: 'Merriweather',
      category: 'serif',
      reason: 'Sturdy, highly legible book serif designed for effortless reading',
      alternatives: ['Lora', 'Playfair Display', 'EB Garamond'],
    };
  }

  if (lower.includes('script') || lower.includes('hand') || lower.includes('brush') || lower.includes('callig')) {
    return {
      suggestion: 'Caveat',
      category: 'handwriting',
      reason: 'Warm, natural handwritten typeface with lively character',
      alternatives: ['Pacifico', 'Dancing Script'],
    };
  }

  if (lower.includes('gothic') || lower.includes('grotesk') || lower.includes('sans')) {
    return {
      suggestion: 'Inter',
      category: 'sans-serif',
      reason: 'Versatile modern grotesque with high optical precision',
      alternatives: ['Plus Jakarta Sans', 'Roboto', 'Montserrat'],
    };
  }

  // Default universal fallback
  return {
    suggestion: 'Plus Jakarta Sans',
    category: 'sans-serif',
    reason: 'Contemporary, versatile geometric sans matching modern editorial aesthetics',
    alternatives: ['Inter', 'Roboto', 'Open Sans'],
  };
}

/**
 * Replaces all occurrences of a font family in the document HTML with a target replacement font
 */
export function applyFontReplacement(
  html: string,
  targetFont: string,
  replacementFont: string
): string {
  if (!html || !targetFont || !replacementFont) return html;

  // Clean names
  const cleanTarget = normalizeFontName(targetFont);
  const cleanReplacement = normalizeFontName(replacementFont);

  if (cleanTarget.toLowerCase() === cleanReplacement.toLowerCase()) {
    return html;
  }

  // Pre-load replacement font if Google Font
  loadGoogleFont(cleanReplacement);

  // Replace in style attributes: font-family: 'TargetFont' -> font-family: 'ReplacementFont'
  const escaped = cleanTarget.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const styleRegex = new RegExp(`(font-family:\\s*['"]?)${escaped}(['"]?[^;"]*)`, 'gi');
  let result = html.replace(styleRegex, `$1${cleanReplacement}$2`);

  // Replace in <font face="TargetFont"> attributes
  const faceRegex = new RegExp(`(<font[^>]*?\\sface=['"])${escaped}(['"][^>]*?>)`, 'gi');
  result = result.replace(faceRegex, `$1${cleanReplacement}$2`);

  return result;
}
