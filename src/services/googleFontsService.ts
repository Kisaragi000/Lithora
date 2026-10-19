/**
 * Lithora Google Fonts Catalog & Dynamic Loader Service
 *
 * Provides a comprehensive library of Google Fonts with full script support
 * (Latin, Cyrillic, Armenian, Greek) and dynamic runtime on-demand font injection.
 */

export interface GoogleFontItem {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  subsets: ('latin' | 'cyrillic' | 'armenian' | 'greek')[];
  popular?: boolean;
}

export const GOOGLE_FONTS_CATALOG: GoogleFontItem[] = [
  // --- Popular Sans-Serif ---
  { family: 'Sora', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Inter', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Roboto', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Open Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Montserrat', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Outfit', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Manrope', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Lato', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Poppins', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Nunito', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Nunito Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Raleway', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Rubik', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Oswald', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Ubuntu', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Work Sans', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Fira Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Quicksand', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'PT Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Source Sans 3', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'DM Sans', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Mulish', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Barlow', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Space Grotesk', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Urbanist', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Jost', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Lexend', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Figtree', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Public Sans', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Albert Sans', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Be Vietnam Pro', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Carlito', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Libre Franklin', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Kanit', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Heebo', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Cabin', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Overpass', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Titillium Web', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Exo 2', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Syne', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'IBM Plex Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Red Hat Display', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Red Hat Text', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Chivo', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Epilogue', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Hanken Grotesk', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Questrial', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Bricolage Grotesque', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Instrument Sans', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Schibsted Grotesk', category: 'sans-serif', subsets: ['latin'] },
  { family: 'Golos Text', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Onest', category: 'sans-serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Alegreya Sans', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Arimo', category: 'sans-serif', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Yanone Kaffeesatz', category: 'sans-serif', subsets: ['latin', 'cyrillic'] },

  // --- Popular Serif ---
  { family: 'Merriweather', category: 'serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Playfair Display', category: 'serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Lora', category: 'serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'PT Serif', category: 'serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'EB Garamond', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Cormorant Garamond', category: 'serif', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Libre Baskerville', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Cinzel', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Bitter', category: 'serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Bodoni Moda', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Spectral', category: 'serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Noto Serif', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Vollkorn', category: 'serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Arvo', category: 'serif', subsets: ['latin'] },
  { family: 'Crimson Text', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Domine', category: 'serif', subsets: ['latin'] },
  { family: 'Cardo', category: 'serif', subsets: ['latin', 'greek'] },
  { family: 'Faustina', category: 'serif', subsets: ['latin'] },
  { family: 'Frank Ruhl Libre', category: 'serif', subsets: ['latin'] },
  { family: 'Prata', category: 'serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Castoro', category: 'serif', subsets: ['latin'] },
  { family: 'Fraunces', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Newsreader', category: 'serif', subsets: ['latin'] },
  { family: 'Besley', category: 'serif', subsets: ['latin'] },
  { family: 'DM Serif Display', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Literata', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Alegreya', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Caladea', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Instrument Serif', category: 'serif', subsets: ['latin'], popular: true },
  { family: 'Marcellus', category: 'serif', subsets: ['latin'] },
  { family: 'IBM Plex Serif', category: 'serif', subsets: ['latin', 'cyrillic'] },
  { family: 'Rokkitt', category: 'serif', subsets: ['latin'] },
  { family: 'Tinos', category: 'serif', subsets: ['latin', 'cyrillic', 'greek'] },

  // --- Armenian Google Fonts ---
  { family: 'Noto Sans Armenian', category: 'sans-serif', subsets: ['latin', 'armenian'], popular: true },
  { family: 'Noto Serif Armenian', category: 'serif', subsets: ['latin', 'armenian'], popular: true },
  { family: 'Arev', category: 'sans-serif', subsets: ['latin', 'armenian'], popular: true },

  // --- Monospace ---
  { family: 'JetBrains Mono', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Roboto Mono', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Fira Code', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Source Code Pro', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'], popular: true },
  { family: 'Space Mono', category: 'monospace', subsets: ['latin'], popular: true },
  { family: 'Inconsolata', category: 'monospace', subsets: ['latin'] },
  { family: 'Courier Prime', category: 'monospace', subsets: ['latin', 'cyrillic'] },
  { family: 'IBM Plex Mono', category: 'monospace', subsets: ['latin', 'cyrillic'] },
  { family: 'Share Tech Mono', category: 'monospace', subsets: ['latin'] },
  { family: 'VT323', category: 'monospace', subsets: ['latin'] },
  { family: 'Anonymous Pro', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Cousine', category: 'monospace', subsets: ['latin', 'cyrillic', 'greek'] },

  // --- Display & Decorative ---
  { family: 'Bebas Neue', category: 'display', subsets: ['latin'], popular: true },
  { family: 'Comfortaa', category: 'display', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Lobster', category: 'display', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Pacifico', category: 'handwriting', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Caveat', category: 'handwriting', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Dancing Script', category: 'handwriting', subsets: ['latin'], popular: true },
  { family: 'Great Vibes', category: 'handwriting', subsets: ['latin'], popular: true },
  { family: 'Satisfy', category: 'handwriting', subsets: ['latin'] },
  { family: 'Righteous', category: 'display', subsets: ['latin'], popular: true },
  { family: 'Anton', category: 'sans-serif', subsets: ['latin'], popular: true },
  { family: 'Permanent Marker', category: 'handwriting', subsets: ['latin'] },
  { family: 'Comic Neue', category: 'handwriting', subsets: ['latin'], popular: true },
  { family: 'Sacramento', category: 'handwriting', subsets: ['latin'] },
  { family: 'Shadows Into Light', category: 'handwriting', subsets: ['latin'] },
  { family: 'Kalam', category: 'handwriting', subsets: ['latin'] },
  { family: 'Courgette', category: 'handwriting', subsets: ['latin'] },
  { family: 'Yellowtail', category: 'handwriting', subsets: ['latin'] },
  { family: 'Marck Script', category: 'handwriting', subsets: ['latin', 'cyrillic'] },
  { family: 'Bad Script', category: 'handwriting', subsets: ['latin', 'cyrillic'] },
  { family: 'Amatic SC', category: 'handwriting', subsets: ['latin', 'cyrillic'], popular: true },
  { family: 'Bangers', category: 'display', subsets: ['latin'] },
  { family: 'Press Start 2P', category: 'display', subsets: ['latin', 'cyrillic', 'greek'] },
  { family: 'Abril Fatface', category: 'display', subsets: ['latin'] },
  { family: 'Cinzel Decorative', category: 'display', subsets: ['latin'], popular: true },
  { family: 'Alfa Slab One', category: 'display', subsets: ['latin'] },
  { family: 'Shrikhand', category: 'display', subsets: ['latin'] },
  { family: 'Special Elite', category: 'display', subsets: ['latin'] },
  { family: 'Bungee', category: 'display', subsets: ['latin'] },
  { family: 'Monoton', category: 'display', subsets: ['latin'] },
];

// Standard Office & System Fonts
export const SYSTEM_FONTS = [
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Sylfaen (Armenian/Universal)', value: 'Sylfaen, serif' },
  { label: 'Arial AMU (Հայերեն)', value: '"Arial AMU", sans-serif' },
];

const loadedFontsSet = new Set<string>([
  'Noto Sans Armenian',
  'Noto Serif Armenian',
  'Plus Jakarta Sans',
  'Sora',
]);

/**
 * Dynamically loads any Google Font by name into document head
 */
export function loadGoogleFont(fontFamily: string): Promise<void> {
  const cleanFamily = fontFamily.replace(/["']/g, '').trim();
  if (!cleanFamily) return Promise.resolve();

  // If already loaded or standard system font, skip
  if (loadedFontsSet.has(cleanFamily)) return Promise.resolve();
  const isSystem = SYSTEM_FONTS.some(
    (f) => f.label.toLowerCase() === cleanFamily.toLowerCase()
  );
  if (isSystem && cleanFamily !== 'Noto Sans Armenian' && cleanFamily !== 'Noto Serif Armenian') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const linkId = `gfont-${cleanFamily.toLowerCase().replace(/\s+/g, '-')}`;
      if (document.getElementById(linkId)) {
        loadedFontsSet.add(cleanFamily);
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      const encodedFamily = encodeURIComponent(cleanFamily);
      link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600&display=swap`;
      link.onload = () => {
        loadedFontsSet.add(cleanFamily);
        resolve();
      };
      link.onerror = () => {
        // Fallback without weights if font doesn't support the full weight axis
        const fallbackLink = document.createElement('link');
        fallbackLink.id = `${linkId}-fallback`;
        fallbackLink.rel = 'stylesheet';
        fallbackLink.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}&display=swap`;
        fallbackLink.onload = () => {
          loadedFontsSet.add(cleanFamily);
          resolve();
        };
        fallbackLink.onerror = () => {
          console.warn(`Could not load Google Font: ${cleanFamily}`);
          resolve();
        };
        document.head.appendChild(fallbackLink);
      };
      document.head.appendChild(link);
    } catch {
      resolve();
    }
  });
}

/**
 * Pre-loads popular fonts for instantaneous UI rendering
 */
export function preloadPopularGoogleFonts(): void {
  const popular = [
    'Sora',
    'Roboto',
    'Open Sans',
    'Montserrat',
    'Inter',
    'Plus Jakarta Sans',
    'Outfit',
    'Merriweather',
    'Playfair Display',
    'Lora',
    'JetBrains Mono',
    'Roboto Mono',
    'Caveat',
    'Comfortaa',
  ];
  popular.forEach((f) => loadGoogleFont(f));
}
