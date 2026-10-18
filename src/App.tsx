import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DocumentTab,
  Language,
  DocumentStats,
  CloudSnapshot,
  DocumentFormat,
  PageSettings,
} from './types/document';
import { translations } from './i18n/translations';
import {
  sampleEnglishDoc,
  sampleArmenianDoc,
  sampleRussianDoc,
} from './data/sampleDocuments';
import { parseRtfToHtml, serializeHtmlToRtf, fixCyrillicMojibake } from './services/rtfParser';
import { parseDocxToHtml, generateDocxBlob } from './services/docxService';
import {
  loadPersistedDocuments,
  persistDocuments,
  getCloudSnapshots,
  saveCloudSnapshot,
  deleteCloudSnapshot,
  exportCloudBackupJson,
  importCloudBackupJson,
} from './services/cloudSyncService';
import { Header } from './components/Header';
import { DocumentTabsBar } from './components/Tabs/DocumentTabsBar';
import { RibbonBar } from './components/Ribbon/RibbonBar';
import { DocumentRuler } from './components/Editor/DocumentRuler';
import { DocumentCanvas } from './components/Editor/DocumentCanvas';
import { StatusBar } from './components/StatusBar';
import { InsertTableModal } from './components/Modals/InsertTableModal';
import { InsertImageModal } from './components/Modals/InsertImageModal';
import { SpecialSymbolsModal } from './components/Modals/SpecialSymbolsModal';
import { ExportModal } from './components/Modals/ExportModal';
import { FindReplaceBar } from './components/Panels/FindReplaceBar';
import { DocumentOutlinePanel } from './components/Panels/DocumentOutlinePanel';
import { VirtualKeyboardHelper } from './components/Panels/VirtualKeyboardHelper';
import { CloudRevisionDrawer } from './components/Panels/CloudRevisionDrawer';

export default function App() {
  const [currentLang, setCurrentLang] = useState<Language>('en');

  // Multi-document tab workspace
  const [documents, setDocuments] = useState<DocumentTab[]>(() => {
    const persisted = loadPersistedDocuments();
    if (persisted.documents && persisted.documents.length > 0) {
      return persisted.documents;
    }
    // Default open initial sample tabs for English (.docx), Armenian (.docx), and Russian (.rtf)
    return [sampleEnglishDoc, sampleArmenianDoc, sampleRussianDoc];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const persisted = loadPersistedDocuments();
    return persisted.activeTabId || sampleRussianDoc.id; // Show Russian RTF or English
  });

  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(null);
  const [isSplitView, setIsSplitView] = useState(false);

  // Active document
  const activeDoc = documents.find((d) => d.id === activeTabId) || documents[0] || sampleRussianDoc;
  const secondaryDoc = documents.find((d) => d.id === secondaryTabId) || documents[1] || documents[0];

  // Cloud Snapshots
  const [cloudSnapshots, setCloudSnapshots] = useState<CloudSnapshot[]>(() => getCloudSnapshots());
  const [isSyncing, setIsSyncing] = useState(false);

  // Modals state
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isSymbolsModalOpen, setIsSymbolsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isRevisionDrawerOpen, setIsRevisionDrawerOpen] = useState(false);

  // Auxiliary panels
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);

  // Headings outline
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: number }>>([]);

  // Editor Ref
  const editorRef = useRef<HTMLDivElement | null>(null);
  const secondaryEditorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-persist documents on change
  useEffect(() => {
    persistDocuments(documents, activeTabId);
  }, [documents, activeTabId]);

  // Document Statistics
  const computeStats = useCallback((html: string): DocumentStats => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s+/g, '').length;
    const paragraphs = temp.querySelectorAll('p, h1, h2, h3, li').length || 1;
    const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

    return {
      words,
      characters,
      charactersNoSpaces,
      paragraphs,
      readingTimeMinutes,
    };
  }, []);

  const [stats, setStats] = useState<DocumentStats>(() => computeStats(activeDoc?.content || ''));

  // Update statistics and headings outline
  const updateContentStatsAndHeadings = useCallback(
    (html: string) => {
      setStats(computeStats(html));

      // Extract headings for outline
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const headingEls = temp.querySelectorAll('h1, h2, h3');
      const found: Array<{ id: string; text: string; level: number }> = [];
      headingEls.forEach((el, index) => {
        const level = parseInt(el.tagName[1], 10);
        found.push({
          id: `heading-${index}`,
          text: el.textContent?.trim() || `Heading ${index + 1}`,
          level,
        });
      });
      setHeadings(found);
    },
    [computeStats]
  );

  useEffect(() => {
    if (activeDoc) {
      updateContentStatsAndHeadings(activeDoc.content);
    }
  }, [activeDoc?.id, updateContentStatsAndHeadings]);

  // Handle active document content change
  const handleContentChange = (newHtml: string) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeTabId
          ? {
              ...doc,
              content: newHtml,
              isDirty: true,
              cloudSyncStatus: 'modified',
            }
          : doc
      )
    );
    updateContentStatsAndHeadings(newHtml);
  };

  // Cloud Autosave debounced effect (every 5 seconds)
  useEffect(() => {
    if (!activeDoc || !activeDoc.isDirty) return;

    const timer = setTimeout(() => {
      setIsSyncing(true);
      // Auto-save snapshot quietly in background
      saveCloudSnapshot({
        documentId: activeDoc.id,
        documentTitle: activeDoc.title,
        content: activeDoc.content,
        wordCount: stats.words,
        format: activeDoc.format,
        source: 'auto',
      });

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === activeDoc.id
            ? {
                ...doc,
                isDirty: false,
                lastSaved: Date.now(),
                cloudSyncStatus: 'synced',
              }
            : doc
        )
      );

      setCloudSnapshots(getCloudSnapshots());
      setIsSyncing(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [activeDoc?.content, activeDoc?.isDirty, activeDoc?.id, stats.words]);

  // Manual Save (Cloud Snapshot + local)
  const handleSaveNow = () => {
    if (!activeDoc) return;
    setIsSyncing(true);

    saveCloudSnapshot({
      documentId: activeDoc.id,
      documentTitle: activeDoc.title,
      content: activeDoc.content,
      wordCount: stats.words,
      format: activeDoc.format,
      source: 'manual',
    });

    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDoc.id
          ? {
              ...doc,
              isDirty: false,
              lastSaved: Date.now(),
              cloudSyncStatus: 'synced',
            }
          : doc
      )
    );

    setCloudSnapshots(getCloudSnapshots());
    setIsSyncing(false);
  };

  // Quick Direct Save to Disk (.docx or .rtf depending on current document format)
  const handleDirectDownloadCurrentFormat = async () => {
    if (!activeDoc) return;
    await handleExport(activeDoc.format);
  };

  // Repair Cyrillic / Windows-1251 mojibake (e.g. ÂÈÇÎÂÀß -> ВИЗОВАЯ)
  const handleFixEncoding = () => {
    if (!activeDoc) return;
    const repaired = fixCyrillicMojibake(activeDoc.content);
    handleContentChange(repaired);
    if (editorRef.current) {
      editorRef.current.innerHTML = repaired;
    }
  };

  // Title change
  const handleTitleChange = (newTitle: string) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === activeTabId) {
          // Detect format from updated title extension if changed by user
          let newFormat = doc.format;
          if (newTitle.endsWith('.rtf')) newFormat = 'rtf';
          else if (newTitle.endsWith('.docx')) newFormat = 'docx';
          else if (newTitle.endsWith('.html')) newFormat = 'html';
          else if (newTitle.endsWith('.txt')) newFormat = 'txt';
          return { ...doc, title: newTitle, format: newFormat, isDirty: true };
        }
        return doc;
      })
    );
  };

  // Page settings update
  const handleUpdatePageSettings = (newSettings: Partial<PageSettings>) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeTabId
          ? {
              ...doc,
              pageSettings: {
                ...doc.pageSettings,
                ...newSettings,
              },
            }
          : doc
      )
    );
  };

  // Executive rich command runner
  const executeCommand = (command: string, value: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    if (command === 'formatBlock') {
      document.execCommand(command, false, value);
    } else if (command === 'insertHTML') {
      document.execCommand(command, false, value);
    } else {
      document.execCommand(command, false, value);
    }

    handleContentChange(editorRef.current.innerHTML);
  };

  // Tab operations
  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      handleNewBlankDoc('docx');
    }
    const remaining = documents.filter((d) => d.id !== id);
    setDocuments(remaining);
    if (activeTabId === id && remaining.length > 0) {
      setActiveTabId(remaining[0].id);
    }
  };

  const handleNewBlankDoc = (format: 'docx' | 'rtf' = 'docx') => {
    const newId = `doc_${Date.now()}`;
    const ext = format === 'rtf' ? '.rtf' : '.docx';
    const newDoc: DocumentTab = {
      id: newId,
      title: `Document_${documents.length + 1}${ext}`,
      format,
      content:
        format === 'rtf'
          ? '<h1>Untitled RTF Document</h1><p>Start writing rich text here...</p>'
          : '<h1>Untitled Document</h1><p>Start writing here...</p>',
      isDirty: false,
      createdAt: Date.now(),
      lastSaved: Date.now(),
      cloudSyncStatus: 'synced',
      pageSettings: {
        size: 'A4',
        orientation: 'portrait',
        margins: 'normal',
        pageColor: '#ffffff',
        showRuler: true,
        zoom: 100,
      },
      historyUndo: [],
      historyRedo: [],
    };
    setDocuments((prev) => [...prev, newDoc]);
    setActiveTabId(newId);
  };

  const handleLoadSample = (type: 'en' | 'hy' | 'ru') => {
    const sample =
      type === 'en'
        ? sampleEnglishDoc
        : type === 'hy'
        ? sampleArmenianDoc
        : sampleRussianDoc;

    const newId = `doc_sample_${type}_${Date.now()}`;
    const clonedSample = { ...sample, id: newId };
    setDocuments((prev) => [...prev, clonedSample]);
    setActiveTabId(newId);
  };

  // Robust Multi-File Ingestion (DOCX, RTF, HTML, TXT, MD)
  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newDocs: DocumentTab[] = [];

    for (const file of fileArray) {
      const fileNameLower = file.name.toLowerCase();
      let extension = fileNameLower.split('.').pop() || '';

      if (
        file.type === 'application/rtf' ||
        file.type === 'text/rtf' ||
        file.type === 'text/richtext'
      ) {
        extension = 'rtf';
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        extension = 'docx';
      }

      let format: DocumentFormat = 'docx';
      let content = '<p>Empty document</p>';

      try {
        if (extension === 'docx') {
          format = 'docx';
          const buffer = await file.arrayBuffer();
          content = await parseDocxToHtml(buffer);
        } else if (extension === 'rtf') {
          format = 'rtf';
          const buffer = await file.arrayBuffer();
          const uint8 = new Uint8Array(buffer);

          // Read initial ASCII header to inspect RTF codepage and font declarations
          let headerAscii = '';
          const headerLen = Math.min(uint8.length, 4096);
          for (let b = 0; b < headerLen; b++) {
            headerAscii += String.fromCharCode(uint8[b]);
          }

          const hasCyrillicHints =
            headerAscii.includes('1251') ||
            headerAscii.includes('1049') ||
            headerAscii.includes('charset204') ||
            headerAscii.includes('Cyr') ||
            /\\\'[c-fC-F][0-9a-fA-F]/.test(headerAscii);

          let text = '';
          if (hasCyrillicHints) {
            try {
              text = new TextDecoder('windows-1251').decode(buffer);
            } catch {
              text = new TextDecoder('utf-8').decode(buffer);
            }
          } else {
            try {
              text = new TextDecoder('utf-8').decode(buffer);
            } catch {
              text = new TextDecoder('windows-1251').decode(buffer);
            }
          }

          content = parseRtfToHtml(text);
        } else {
          // Check if file content begins with {\rtf
          const buffer = await file.arrayBuffer();
          const text = new TextDecoder('utf-8').decode(buffer);
          if (text.trim().toLowerCase().startsWith('{\\rtf')) {
            format = 'rtf';
            content = parseRtfToHtml(text);
          } else if (extension === 'html' || extension === 'htm') {
            format = 'html';
            content = text;
          } else {
            format = extension === 'md' ? 'md' : 'txt';
            content = text
              .split('\n')
              .map((line) => `<p>${line || '&nbsp;'}</p>`)
              .join('');
          }
        }

        content = fixCyrillicMojibake(content);

        newDocs.push({
          id: `doc_imported_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: file.name,
          format,
          content,
          isDirty: false,
          createdAt: Date.now(),
          lastSaved: Date.now(),
          cloudSyncStatus: 'synced',
          pageSettings: {
            size: 'A4',
            orientation: 'portrait',
            margins: 'normal',
            pageColor: '#ffffff',
            showRuler: true,
            zoom: 100,
          },
          historyUndo: [],
          historyRedo: [],
        });
      } catch (err) {
        console.error(`Error processing file ${file.name}:`, err);
        // Fallback: load as plain text
        try {
          const fallbackText = await file.text();
          newDocs.push({
            id: `doc_imported_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            title: file.name,
            format: 'txt',
            content: fallbackText
              .split('\n')
              .map((line) => `<p>${line || '&nbsp;'}</p>`)
              .join(''),
            isDirty: false,
            createdAt: Date.now(),
            lastSaved: Date.now(),
            cloudSyncStatus: 'synced',
            pageSettings: {
              size: 'A4',
              orientation: 'portrait',
              margins: 'normal',
              pageColor: '#ffffff',
              showRuler: true,
              zoom: 100,
            },
            historyUndo: [],
            historyRedo: [],
          });
        } catch {
          // ignore
        }
      }
    }

    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
      setActiveTabId(newDocs[0].id);
    }
  };

  // Drag and Drop files onto workspace
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Insert Table
  const handleInsertTable = (rows: number, cols: number) => {
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:1rem 0;">';
    for (let r = 0; r < rows; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < cols; c++) {
        if (r === 0) {
          tableHtml += `<th style="border:1px solid #cbd5e1; padding:8px; background-color:#f8fafc;">Header ${c + 1}</th>`;
        } else {
          tableHtml += `<td style="border:1px solid #cbd5e1; padding:8px;">Cell ${r + 1},${c + 1}</td>`;
        }
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</table><p><br></p>';
    executeCommand('insertHTML', tableHtml);
  };

  // Insert Image
  const handleInsertImage = (src: string) => {
    executeCommand(
      'insertHTML',
      `<p><img src="${src}" alt="Inserted Image" style="max-width:100%; height:auto; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,0.1);" /></p><p><br></p>`
    );
  };

  // Insert Symbol
  const handleInsertSymbol = (symbol: string) => {
    executeCommand('insertHTML', symbol);
  };

  // Find & Replace Handlers
  const handleFind = (term: string): number => {
    if (!term || !editorRef.current) return 0;
    const text = editorRef.current.innerText || '';
    const regex = new RegExp(term, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  };

  const handleReplace = (findTerm: string, replaceTerm: string, replaceAll: boolean) => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const regex = new RegExp(findTerm, replaceAll ? 'gi' : 'i');
    const updated = html.replace(regex, replaceTerm);
    editorRef.current.innerHTML = updated;
    handleContentChange(updated);
  };

  // Jump to Heading
  const handleSelectHeading = (headingId: string) => {
    if (!editorRef.current) return;
    const index = parseInt(headingId.replace('heading-', ''), 10);
    const headingsInDoc = editorRef.current.querySelectorAll('h1, h2, h3');
    if (headingsInDoc[index]) {
      headingsInDoc[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Export Document to Files
  const handleExport = async (format: DocumentFormat) => {
    if (!activeDoc) return;
    const titleWithoutExt = activeDoc.title.replace(/\.[^/.]+$/, '');

    if (format === 'docx') {
      const blob = await generateDocxBlob(activeDoc.content, activeDoc.title);
      downloadBlob(blob, `${titleWithoutExt}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } else if (format === 'rtf') {
      const rtfString = serializeHtmlToRtf(activeDoc.content, activeDoc.title);
      const blob = new Blob([rtfString], { type: 'application/rtf;charset=utf-8' });
      downloadBlob(blob, `${titleWithoutExt}.rtf`, 'application/rtf');
    } else if (format === 'html') {
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${activeDoc.title}</title>
<style>
body { font-family: Calibri, 'Plus Jakarta Sans', 'Noto Sans Armenian', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #1e293b; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { border: 1px solid #cbd5e1; padding: 8px 12px; }
th { background-color: #f8fafc; font-weight: 600; }
blockquote { border-left: 3px solid #94a3b8; padding-left: 1rem; color: #475569; font-style: italic; }
</style>
</head>
<body>
${activeDoc.content}
</body>
</html>`;
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      downloadBlob(blob, `${titleWithoutExt}.html`, 'text/html');
    } else if (format === 'txt') {
      const temp = document.createElement('div');
      temp.innerHTML = activeDoc.content;
      const plainText = temp.innerText || '';
      const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${titleWithoutExt}.txt`, 'text/plain');
    } else if (format === 'md') {
      const temp = document.createElement('div');
      temp.innerHTML = activeDoc.content;
      const plainText = temp.innerText || '';
      const blob = new Blob([plainText], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `${titleWithoutExt}.md`, 'text/markdown');
    }
  };

  const downloadBlob = (blob: Blob, filename: string, mimeType: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Print as PDF
  const handlePrint = () => {
    window.print();
  };

  // Snapshot restoration
  const handleRestoreSnapshot = (snapshot: CloudSnapshot) => {
    if (editorRef.current) {
      editorRef.current.innerHTML = snapshot.content;
    }
    handleContentChange(snapshot.content);
    setIsRevisionDrawerOpen(false);
  };

  const handleDeleteSnapshot = (id: string) => {
    deleteCloudSnapshot(id);
    setCloudSnapshots(getCloudSnapshots());
  };

  // Cloud Backup Export/Import
  const handleExportCloudBackup = () => {
    const json = exportCloudBackupJson(documents);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `wordcraft_workspace_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const handleImportCloudBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const text = await file.text();
        try {
          const result = importCloudBackupJson(text);
          setDocuments(result.documents);
          setCloudSnapshots(result.snapshots);
          if (result.documents.length > 0) {
            setActiveTabId(result.documents[0].id);
          }
        } catch (err: any) {
          alert('Failed to import backup: ' + err.message);
        }
      }
    };
    input.click();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800"
    >
      {/* Hidden File Picker for Batch Open supporting .docx, .rtf, .txt, .html, .md */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".docx,.rtf,.txt,.html,.md,application/rtf,text/rtf,text/richtext,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,*/*"
        onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        className="hidden"
      />

      {/* Top Header */}
      <Header
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        activeDocTitle={activeDoc.title}
        onTitleChange={handleTitleChange}
        cloudSyncStatus={activeDoc.cloudSyncStatus}
        lastSaved={activeDoc.lastSaved}
        activeFormat={activeDoc.format}
        onSave={handleSaveNow}
        onDirectDownload={handleDirectDownloadCurrentFormat}
        onOpenFiles={() => fileInputRef.current?.click()}
        onExportClick={() => setIsExportModalOpen(true)}
        onPrint={handlePrint}
        isSplitView={isSplitView}
        onToggleSplitView={() => {
          setIsSplitView(!isSplitView);
          if (!secondaryTabId && documents.length > 1) {
            setSecondaryTabId(documents.find((d) => d.id !== activeTabId)?.id || documents[0].id);
          }
        }}
      />

      {/* Document Tabs Bar */}
      <DocumentTabsBar
        documents={documents}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={(format) => handleNewBlankDoc(format || 'docx')}
        currentLang={currentLang}
      />

      {/* Ribbon Bar */}
      <RibbonBar
        currentLang={currentLang}
        onCommand={executeCommand}
        pageSettings={activeDoc.pageSettings}
        onUpdatePageSettings={handleUpdatePageSettings}
        activeFormat={activeDoc.format}
        onExportDirect={handleExport}
        onOpenTableModal={() => setIsTableModalOpen(true)}
        onOpenImageModal={() => setIsImageModalOpen(true)}
        onOpenSymbolsModal={() => setIsSymbolsModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenFiles={() => fileInputRef.current?.click()}
        onNewDocFormat={(fmt) => handleNewBlankDoc(fmt)}
        onLoadSample={handleLoadSample}
        onSave={handleSaveNow}
        onPrint={handlePrint}
        cloudSnapshots={cloudSnapshots}
        onSaveSnapshot={(label) => {
          saveCloudSnapshot({
            documentId: activeDoc.id,
            documentTitle: activeDoc.title,
            content: activeDoc.content,
            wordCount: stats.words,
            format: activeDoc.format,
            source: 'manual',
          });
          setCloudSnapshots(getCloudSnapshots());
        }}
        onRestoreSnapshot={handleRestoreSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
        onExportCloudBackup={handleExportCloudBackup}
        onImportCloudBackup={handleImportCloudBackup}
        onManualSync={handleSaveNow}
        isSyncing={isSyncing}
        isFindReplaceOpen={isFindReplaceOpen}
        onToggleFindReplace={() => setIsFindReplaceOpen(!isFindReplaceOpen)}
        isOutlineOpen={isOutlineOpen}
        onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
        isVirtualKeyboardOpen={isVirtualKeyboardOpen}
        onToggleVirtualKeyboard={() => setIsVirtualKeyboardOpen(!isVirtualKeyboardOpen)}
        onFixEncoding={handleFixEncoding}
      />

      {/* Find and Replace bar */}
      <FindReplaceBar
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        onFind={handleFind}
        onReplace={handleReplace}
        currentLang={currentLang}
      />

      {/* Virtual Keyboard bar */}
      <VirtualKeyboardHelper
        isOpen={isVirtualKeyboardOpen}
        onClose={() => setIsVirtualKeyboardOpen(false)}
        onInsertChar={(char) => executeCommand('insertHTML', char)}
        currentLang={currentLang}
      />

      {/* Cyrillic Mojibake Auto-Detection Banner */}
      {/[À-ÿ]{3,}/.test(activeDoc.content) && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between text-xs text-amber-900 z-20 shadow-xs animate-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-800">⚠️ Encoding Notice:</span>
            <span>
              This document contains Windows-1251 Cyrillic text displayed as Latin characters (e.g. <code>ÂÈÇÎÂÀß...</code>).
            </span>
          </div>
          <button
            onClick={handleFixEncoding}
            className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded shadow-xs transition-colors shrink-0 ml-2"
          >
            Decode to Russian (ВИЗОВАЯ...)
          </button>
        </div>
      )}

      {/* Optional Document Ruler */}
      {activeDoc.pageSettings.showRuler && (
        <DocumentRuler
          pageWidthMm={activeDoc.pageSettings.size === 'A4' ? 210 : 216}
          marginMm={
            activeDoc.pageSettings.margins === 'narrow'
              ? 12
              : activeDoc.pageSettings.margins === 'wide'
              ? 38
              : 25
          }
        />
      )}

      {/* Main Workspace Viewport (with Split View support & Side Panels) */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Primary Document Canvas */}
        <DocumentCanvas
          content={activeDoc.content}
          onChange={handleContentChange}
          pageSettings={activeDoc.pageSettings}
          editorRef={editorRef}
        />

        {/* Secondary Canvas if Split View is Active */}
        {isSplitView && secondaryDoc && (
          <div className="flex-1 border-l-2 border-slate-300 flex flex-col h-full overflow-hidden bg-slate-200">
            <div className="px-3 py-1.5 bg-slate-300/80 border-b border-slate-300 flex items-center justify-between text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <span>Split View:</span>
                <select
                  value={secondaryTabId || ''}
                  onChange={(e) => setSecondaryTabId(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DocumentCanvas
              content={secondaryDoc.content}
              onChange={(newHtml) => {
                setDocuments((prev) =>
                  prev.map((doc) =>
                    doc.id === secondaryTabId
                      ? { ...doc, content: newHtml, isDirty: true }
                      : doc
                  )
                );
              }}
              pageSettings={secondaryDoc.pageSettings}
              editorRef={secondaryEditorRef}
            />
          </div>
        )}

        {/* Document Outline Side Panel */}
        <DocumentOutlinePanel
          isOpen={isOutlineOpen}
          onClose={() => setIsOutlineOpen(false)}
          headings={headings}
          onSelectHeading={handleSelectHeading}
          currentLang={currentLang}
        />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        stats={stats}
        currentLang={currentLang}
        zoom={activeDoc.pageSettings.zoom}
        onZoomChange={(zoom) => handleUpdatePageSettings({ zoom })}
        isDirty={activeDoc.isDirty}
      />

      {/* Cloud Revision Drawer */}
      <CloudRevisionDrawer
        isOpen={isRevisionDrawerOpen}
        onClose={() => setIsRevisionDrawerOpen(false)}
        snapshots={cloudSnapshots}
        onRestore={handleRestoreSnapshot}
        onDelete={handleDeleteSnapshot}
        currentLang={currentLang}
      />

      {/* Dialog Modals */}
      <InsertTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        onInsert={handleInsertTable}
        currentLang={currentLang}
      />

      <InsertImageModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsertImage={handleInsertImage}
        currentLang={currentLang}
      />

      <SpecialSymbolsModal
        isOpen={isSymbolsModalOpen}
        onClose={() => setIsSymbolsModalOpen(false)}
        onInsertSymbol={handleInsertSymbol}
        currentLang={currentLang}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        documentTitle={activeDoc.title}
        onExport={handleExport}
        onPrintPdf={handlePrint}
        currentLang={currentLang}
      />
    </div>
  );
}
