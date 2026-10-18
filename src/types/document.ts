export type DocumentFormat = 'docx' | 'rtf' | 'txt' | 'html' | 'md';

export type Language = 'en' | 'ru' | 'hy';

export type CloudSyncStatus = 'synced' | 'syncing' | 'modified' | 'offline' | 'conflict';

export interface PageSettings {
  size: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: 'normal' | 'narrow' | 'wide';
  customMargins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  pageColor: string;
  showRuler: boolean;
  zoom: number; // percentage, e.g., 100
}

export interface DocumentTab {
  id: string;
  title: string;
  format: DocumentFormat;
  content: string; // HTML markup for WYSIWYG
  isDirty: boolean;
  createdAt: number;
  lastSaved: number;
  cloudSyncStatus: CloudSyncStatus;
  pageSettings: PageSettings;
  historyUndo: string[];
  historyRedo: string[];
}

export interface CloudSnapshot {
  id: string;
  documentId: string;
  documentTitle: string;
  timestamp: number;
  content: string;
  wordCount: number;
  format: DocumentFormat;
  source: 'auto' | 'manual' | 'cloud';
}

export interface DocumentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  readingTimeMinutes: number;
}
