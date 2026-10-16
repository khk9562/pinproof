import { BugRecord, Evidence } from './types';

/**
 * 익스텐션 origin의 IndexedDB.
 * - handles: 앱 origin → 프로젝트 폴더 핸들
 * - records: 기록 건 모델 캐시(md를 다시 생성하기 위한 원본). 키 = `${origin}#${id}`
 * - inbox: 미분류 증거. 키 = uid, origin 필드로 앱 구분
 * - state: 앱별 작성 중인 건 id 등
 */
const DB_NAME = 'pinproof';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['handles', 'records', 'inbox', 'state']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const get = <T>(store: string, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key));
const put = (store: string, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key));
const del = (store: string, key: string) => tx(store, 'readwrite', (s) => s.delete(key));

export const getHandle = (origin: string) => get<FileSystemDirectoryHandle>('handles', origin);
export const setHandle = (origin: string, h: FileSystemDirectoryHandle) => put('handles', origin, h);
export const removeHandle = (origin: string) => del('handles', origin);

export const getRecordModel = (origin: string, id: number) => get<BugRecord>('records', `${origin}#${id}`);
export const setRecordModel = (origin: string, r: BugRecord) => put('records', `${origin}#${r.id}`, r);
export const deleteRecordModel = (origin: string, id: number) => del('records', `${origin}#${id}`);

export const getDraftId = (origin: string) => get<number>('state', `draft:${origin}`);
export const setDraftId = (origin: string, id: number | null) =>
  id === null ? del('state', `draft:${origin}`) : put('state', `draft:${origin}`, id);

interface InboxItem {
  origin: string;
  evidence: Evidence;
}

export async function listInbox(origin: string): Promise<Evidence[]> {
  const all = await tx<InboxItem[]>('inbox', 'readonly', (s) => s.getAll() as IDBRequest<InboxItem[]>);
  return all
    .filter((i) => i.origin === origin)
    .map((i) => i.evidence)
    .sort((a, b) => a.capturedAt - b.capturedAt);
}
export const addInbox = (origin: string, e: Evidence) => put('inbox', e.uid, { origin, evidence: e } satisfies InboxItem);
export const removeInbox = (uid: string) => del('inbox', uid);
