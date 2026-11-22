export interface StoredProjectHandle {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
}

const DB_NAME = 'pinproof-web-archive';
const STORE_NAME = 'project-handles';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listStoredProjects(): Promise<StoredProjectHandle[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as StoredProjectHandle[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStoredProject(entry: StoredProjectHandle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeStoredProject(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle,
  interactive: boolean,
): Promise<boolean> {
  const permHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (typeof permHandle.queryPermission === 'function') {
    const current = await permHandle.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
  }
  if (!interactive) return false;
  if (typeof permHandle.requestPermission === 'function') {
    const requested = await permHandle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }
  return true;
}
