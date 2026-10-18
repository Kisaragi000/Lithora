import { DocumentTab, CloudSnapshot } from '../types/document';

const STORAGE_KEY_DOCS = 'wordcraft_active_documents_v1';
const STORAGE_KEY_SNAPSHOTS = 'wordcraft_cloud_snapshots_v1';
const STORAGE_KEY_ACTIVE_TAB = 'wordcraft_active_tab_id';
const STORAGE_KEY_SETTINGS = 'wordcraft_app_settings';

export interface CloudSyncState {
  roomId: string;
  isOnline: boolean;
  lastSyncedAt: number;
}

/**
 * Loads saved document tabs from persistent browser storage
 */
export function loadPersistedDocuments(): { documents: DocumentTab[]; activeTabId?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOCS);
    const activeTabId = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) || undefined;
    if (raw) {
      const documents: DocumentTab[] = JSON.parse(raw);
      if (Array.isArray(documents) && documents.length > 0) {
        return { documents, activeTabId };
      }
    }
  } catch (e) {
    console.error('Failed to load persisted documents:', e);
  }
  return { documents: [] };
}

/**
 * Saves open document tabs to persistent storage
 */
export function persistDocuments(documents: DocumentTab[], activeTabId?: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(documents));
    if (activeTabId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, activeTabId);
    }
  } catch (e) {
    console.error('Failed to persist documents:', e);
  }
}

/**
 * Retrieves all saved cloud snapshots
 */
export function getCloudSnapshots(): CloudSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load cloud snapshots:', e);
  }
  return [];
}

/**
 * Saves a new cloud snapshot
 */
export function saveCloudSnapshot(snapshot: Omit<CloudSnapshot, 'id' | 'timestamp'>): CloudSnapshot {
  const snapshots = getCloudSnapshots();
  const newSnapshot: CloudSnapshot = {
    ...snapshot,
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  // Limit snapshots to 50 latest
  const updated = [newSnapshot, ...snapshots].slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save snapshot:', e);
  }
  return newSnapshot;
}

/**
 * Deletes a snapshot
 */
export function deleteCloudSnapshot(id: string): void {
  const snapshots = getCloudSnapshots();
  const updated = snapshots.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(updated));
}

/**
 * Generates exportable JSON bundle for Cloud Backup
 */
export function exportCloudBackupJson(documents: DocumentTab[]): string {
  const snapshots = getCloudSnapshots();
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    system: 'WordCraft Document Suite',
    documents,
    snapshots,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Restores documents and snapshots from a Cloud Backup JSON
 */
export function importCloudBackupJson(jsonString: string): { documents: DocumentTab[]; snapshots: CloudSnapshot[] } {
  const data = JSON.parse(jsonString);
  if (!data.documents || !Array.isArray(data.documents)) {
    throw new Error('Invalid backup file: missing documents array.');
  }

  persistDocuments(data.documents);
  if (data.snapshots && Array.isArray(data.snapshots)) {
    localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(data.snapshots));
  }

  return {
    documents: data.documents,
    snapshots: data.snapshots || [],
  };
}
