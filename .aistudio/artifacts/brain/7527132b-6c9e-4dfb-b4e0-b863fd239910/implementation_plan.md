# WordCraft: Multilingual Document Suite (.docx & .rtf)

A full-featured, professional document processor and word format file editor supporting `.docx` and `.rtf` formats with high-fidelity formatting, multi-file tabbed multitasking, automated cloud synchronization with version history, rich export options, and native tri-lingual support (English, Russian, Armenian).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The application is engineered for high-performance in-browser document processing with zero data loss. The confirmed choices below drive the core experience:

- **Confirmed Decision 1: Hybrid Cloud Synchronization & Offline Resilience**
  - Instant cloud synchronization engine backed by persistent IndexedDB and cloud snapshot storage, featuring automatic background sync, revision history snapshots, conflict-free document tabs, and cloud room sharing.
- **Confirmed Decision 2: Multi-File Tabbed Workspace**
  - Seamless multitasking allowing simultaneous opening of multiple `.docx`, `.rtf`, `.txt`, and `.html` files via drag-and-drop or file picker into dedicated document tabs with individual dirty states, independent undo/redo stacks, and split view.
- **Confirmed Decision 3: Comprehensive Native Localization (EN / RU / HY)**
  - Full tripartite UI localization (English, Русский, Հայերեն) across all ribbons, dialogs, menus, and status bars, combined with Armenian (Sylfaen, Noto Sans Armenian, Arial AMU) and Cyrillic typography presets and an on-demand Armenian/Russian symbol & virtual keyboard assist.
- **Confirmed Decision 4: Complete Save & Export Matrix**
  - Bidirectional `.docx` and `.rtf` viewer and writer, with additional exports to PDF (print-ready paginated output), Markdown (`.md`), HTML (`.html`), and plain text (`.txt`).

---

## 1. Overview & Core Concept

### What It Does
**WordCraft** delivers a desktop-grade word processing experience directly in the browser:
- **File Ingestion & Viewing**: Opens and parses `.docx` (Office Open XML) and `.rtf` (Rich Text Format) documents faithfully, preserving character formatting, fonts, colors, bulleted/numbered lists, alignments, and tables.
- **Advanced Formatting Ribbon**: A Microsoft Word-inspired contextual ribbon toolbar divided into **Home**, **Insert**, **Layout**, **Review**, **Cloud & Sync**, and **Export/File**.
- **Multi-Document Tabs**: Open multiple files simultaneously, drag between them, close individual files, inspect unsaved change indicators, and compare documents in split preview.
- **Cloud Synchronization**: Real-time cloud sync with automatic autosave interval, cloud snapshot timeline, manual "Sync Now" trigger, document recovery, and exportable cloud backups.
- **Linguistic & Script Precision**: Native support for Latin, Cyrillic (Russian), and Armenian scripts with correct Unicode RTF escaping (`\uN?`), typographic line heights, and complete UI translation.

### Target Audience & Persona
- Professionals, writers, translators, students, and legal/business users working with multilingual `.docx` and `.rtf` documents requiring accurate cross-script formatting and fast, seamless multi-document editing without heavy desktop software.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Multi-File Batch Open Flow**: User drops multiple `.docx` and `.rtf` files onto the drop zone or clicks "Open Files". Five tabs populate instantly in the top tab bar. The user navigates effortlessly between them with `Ctrl+Tab` or tab clicks.
2. **Editing & Advanced Formatting Flow**: User formats text using the ribbon (heading styles, font size, bold/italic, custom Armenian Sylfaen font, highlighters, table insertion, cell background shading, page margins).
3. **Multilingual Switching Flow**: User toggles UI language (English ↔ Русский ↔ Հայերեն) with one click; the entire UI updates smoothly without losing document state or cursor focus.
4. **Cloud Sync & Snapshot Flow**: Auto-sync saves active changes; the user can open the Cloud Revision drawer, browse timestamped cloud snapshots, preview differences, and restore any previous version.
5. **Save & Export Flow**: User clicks Export to generate authentic `.docx` files, encoded `.rtf` files (with Unicode RTF escape sequences for Cyrillic and Armenian characters), or clean paginated PDF printouts.

### Visual Identity & Theme
- **Aesthetic Direction**: Professional, distraction-free productivity suite adhering to clean SaaS guidelines. Warm neutral canvas, subtle hairline dividers (`border-slate-200 / border-slate-700`), crisp typography, and high-density toolbar controls.
- **Color Palette**:
  - Dominant Neutral Canvas (60%): `#F8FAFC` (slate-50) page surround, `#FFFFFF` crisp sheet canvas.
  - Structural Surfaces (30%): `#FFFFFF` toolbar ribbon, `#F1F5F9` (slate-100) tab bar and dialog backdrops, `#E2E8F0` hairline borders.
  - Intent Accent Budget (10%): `#2563EB` (Wordcraft Royal Blue) for active tab indicators, primary actions, and selection highlights.
- **Typography & Font Pairings**:
  - UI Display & Controls: `Plus Jakarta Sans`, sans-serif.
  - Document Engine Fonts: Arial, Times New Roman, Calibri, Georgia, Garamond, plus dedicated Armenian faces (`Sylfaen`, `Noto Sans Armenian`, `Arial AMU`) and Cyrillic typefaces.
  - Telemetry & Stats: `tabular-nums` for word counters, page indicators, and timestamps.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: DOCX & RTF Parsing and Generation Strategy
- **Approach**:
  - **DOCX**: Mammoth engine for converting incoming `.docx` files into clean, semantic HTML preserving headings, formatting, and tables. Client-side DOCX builder engine using OpenXML zip packaging with docx library generation for faithful `.docx` exports.
  - **RTF**: Custom bidirectional parser and serializer built specifically to handle RTF control words (`\rtf1`, `\ansi`, `\b`, `\i`, `\ul`, `\fsN`, `\cfN`, `\qc`, `\qr`, `\ql`, `\qj`, `\par`, `\cell`) and crucially **UTF-16 Unicode RTF escapes** (`\u1330?`, `\u1040?`) so Armenian and Russian Cyrillic characters are preserved without garbled mojibake.
- **Why**: Standard web editors fail on Armenian and Cyrillic RTF exports because of codepage mismatches; our Unicode-aware serializer guarantees 100% fidelity.

### Decision 2: Multi-File Tab State Architecture
- **Approach**: Centralized Document Workspace state managing an array of open document tabs. Each document tab maintains:
  - `id`: Unique document ID
  - `title`: File name (e.g. `Report_2026.docx`)
  - `format`: `'docx' | 'rtf' | 'txt' | 'html'`
  - `content`: HTML document DOM string
  - `isDirty`: Unsaved modification flag
  - `lastSaved`: Timestamp
  - `cloudSyncStatus`: `'synced' | 'syncing' | 'modified' | 'offline'`
  - `undoStack` & `redoStack`: Independent document history
  - `pageSettings`: Margins, orientation, paper size
- **Why**: Keeps document memory segregated, prevents cross-document undo leaks, and enables instant tab switching.

### Decision 3: Cloud Synchronization Engine
- **Approach**: Multi-layer cloud sync manager:
  - Local persistence via IndexedDB / localStorage for zero-latency instant offline capability.
  - Active cloud sync simulation and snapshot storage with automatic background sync debounce (1.5s), version snapshot logging, manual "Sync Now" trigger, and cloud backup export/import bundles.
  - Visual status pill-free quiet indicators: subtle sync icons (`CheckCircle`, `RefreshCw`, `CloudOff`) with last synced timestamp.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WordCraft Workspace                             │
├────────────────────────────────────────────────────────────────────────┤
│  Top Navigation Bar: Brand · Language (EN/RU/HY) · Cloud Status · Menu  │
├────────────────────────────────────────────────────────────────────────┤
│  Document Tabs Bar: [Doc1.docx ×] [Contract.rtf •] [+ New] [Split View] │
├────────────────────────────────────────────────────────────────────────┤
│  Office Ribbon Toolbar:                                                │
│  [File] [Home] [Insert] [Layout] [Review] [Cloud Sync] [Export]        │
├────────────────────────────────────────────────────────────────────────┤
│                                   │                                    │
│       Document Canvas             │       Auxiliary Side Panel         │
│   ┌───────────────────────────┐   │   ┌────────────────────────────┐   │
│   │   Interactive Ruler       │   │   │ · Document Outline Tree    │   │
│   ├───────────────────────────┤   │   │ · Find & Replace           │   │
│   │                           │   │   │ · Cloud Revision Snapshots │   │
│   │   Paginated A4/Letter     │   │   │ · Armenian/RU Key Helper   │   │
│   │   WYSIWYG Editor Sheet    │   │   │ · Word/Char/Reading Stats  │   │
│   │                           │   │   └────────────────────────────┘   │
│   └───────────────────────────┘   │                                    │
├────────────────────────────────────────────────────────────────────────┤
│  Bottom Status Bar: Page 1/1 · 842 Words · EN/RU/HY · Zoom 100% · UTF-8│
└────────────────────────────────────────────────────────────────────────┘
```

### Core Modules To Implement:
1. **`src/types/document.ts`**: Types for Document, Tab, Format, PageSettings, CloudSnapshot, Language (`en` | `ru` | `hy`), FormattingCommand.
2. **`src/i18n/translations.ts`**: Complete, high-quality translations for English, Russian, and Armenian covering all ribbons, buttons, dialogs, formats, and messages.
3. **`src/services/rtfParser.ts`**: Bidirectional RTF parser and generator with full Unicode code point mapping (`\uN?`).
4. **`src/services/docxService.ts`**: DOCX parsing (mammoth / xml unzipper) and DOCX file generator with standard styles.
5. **`src/services/cloudSyncService.ts`**: Cloud synchronization manager with revision history, autosave, conflict detection, and backup snapshots.
6. **`src/components/Ribbon/`**:
   - `HomeTab.tsx`: Font selector, size, bold, italic, underline, alignments, lists, heading levels, text & highlight color pickers.
   - `InsertTab.tsx`: Table wizard (rows × cols), images, page breaks, horizontal lines, date-time, symbols.
   - `LayoutTab.tsx`: Margins (Normal, Narrow, Wide), Orientation (Portrait/Landscape), Paper Size (A4, Letter, Legal).
   - `ReviewTab.tsx`: Spellcheck aid, statistics, word & character count, find & replace, outline navigator.
   - `CloudTab.tsx`: Cloud sync status, revision snapshot history, restore points, cloud backup download/upload.
   - `ExportMenu.tsx`: Dedicated modal & menu for `.docx`, `.rtf`, `.pdf`, `.html`, `.txt`, `.md`.
7. **`src/components/Editor/`**:
   - `DocumentCanvas.tsx`: Scaled A4/Letter sheet container with real margins, page shadow, and rich contenteditable area.
   - `DocumentTabs.tsx`: Tab management with add, close, rename, and unsaved indicators.
   - `DocumentRuler.tsx`: Interactive margin and indent ruler.
   - `ArmenianKeyboardHelper.tsx`: Quick Armenian & Russian Cyrillic virtual character palette for fast multilingual typing.
8. **`src/components/StatusBar.tsx`**: Word/character/reading-time counts, language indicator, zoom slider (50%–200%), page counter.

---

## 5. Verification Plan

- **Compilation & Linting**: Run `compile_applet` and `lint_applet` to ensure error-free TypeScript compilation.
- **DOCX & RTF Verification**:
  - Test loading sample `.docx` and `.rtf` documents.
  - Test exporting rich formatted documents (tables, headings, colored text) to `.docx` and `.rtf`.
  - Validate that Armenian (Հայերեն) and Russian (Русский) characters correctly survive RTF and DOCX export without encoding corruption.
- **Multi-File Concurrency**: Test opening multiple files simultaneously, editing distinct tabs, and ensuring state isolation.
- **Cloud Sync & Snapshots**: Test autosave, snapshot creation, and restoring a previous revision.
- **Export Options**: Verify `.docx`, `.rtf`, `.pdf` print layout, `.html`, and `.txt` outputs.
