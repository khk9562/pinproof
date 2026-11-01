import { BugRecord, Evidence, Item, ItemEditField, PendingItemSave } from './types';

/**
 * 익스텐션 origin의 IndexedDB.
 * - handles: 앱 origin → 프로젝트 폴더 핸들
 * - records: 기록 건 모델 캐시(md를 다시 생성하기 위한 원본). 키 = `${origin}#${id}`
 * - inbox: 미분류 증거. 키 = uid, origin 필드로 앱 구분
 * - state: 앱별 작성 중인 건 id, 지금 담을 카테고리 등
 * - items: 항목 편집용 원본(md 를 다시 쓰기 위한 것). 키 = `${origin}#${id}`
 */
const DB_NAME = 'pinproof';
const VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['handles', 'records', 'inbox', 'state', 'items']) {
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

export const getItemModel = (origin: string, id: number) => get<Item>('items', `${origin}#${id}`);
export const setItemModel = (origin: string, item: Item) => put('items', `${origin}#${item.id}`, item);
export const deleteItemModel = (origin: string, id: number) => del('items', `${origin}#${id}`);

/** 이 앱(origin)의 항목 편집용 원본 전부 */
export async function listItemModels(origin: string): Promise<Item[]> {
  const all = await tx<Item[]>('items', 'readonly', (s) => s.getAll() as IDBRequest<Item[]>);
  return all.filter((i) => i.app === origin);
}

export const listAllItemModels = () => tx<Item[]>('items', 'readonly', (s) => s.getAll() as IDBRequest<Item[]>);
export const getPendingSave = (uid: string) => get<PendingItemSave>('state', `save:${uid}`);
export async function setPendingSave(save: PendingItemSave): Promise<PendingItemSave> {
  const next = { ...save, revision: crypto.randomUUID() };
  await put('state', `save:${save.item.evidence.uid}`, next);
  return next;
}
export async function queuePendingSave(item: Item, folder: FileSystemDirectoryHandle, create: boolean, fields: ItemEditField[], revision: string): Promise<PendingItemSave> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['state', 'items'], 'readwrite');
    const state = transaction.objectStore('state');
    const key = `save:${item.evidence.uid}`;
    const request = state.get(key);
    let next: PendingItemSave;
    request.onsuccess = () => {
      const previous = request.result as PendingItemSave | undefined;
      const merged = previous ? {
        ...item,
        category: fields.includes('category') ? item.category : previous.item.category,
        sent: fields.includes('sent') ? item.sent : previous.item.sent,
        evidence: { ...item.evidence, note: fields.includes('note') ? item.evidence.note : previous.item.evidence.note },
      } : item;
      next = { kind: 'item-save', revision, item: merged, folder, create: previous?.create ?? create, fields: [...new Set([...(previous?.fields ?? []), ...fields])] };
      state.put(next, key);
      if (!next.create) transaction.objectStore('items').put(merged, `${merged.app}#${merged.id}`);
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function settlePendingSave(save: PendingItemSave, result: { item: Item } | { error: string }): Promise<boolean> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['state', 'items'], 'readwrite');
    const state = transaction.objectStore('state');
    const key = `save:${save.item.evidence.uid}`;
    const request = state.get(key);
    let settled = false;
    request.onsuccess = () => {
      const current = request.result as PendingItemSave | undefined;
      if (!current || current.revision !== save.revision) return;
      settled = true;
      if ('error' in result) state.put({ ...current, error: result.error }, key);
      else {
        transaction.objectStore('items').put(result.item, `${result.item.app}#${result.item.id}`);
        state.delete(key);
      }
    };
    transaction.oncomplete = () => resolve(settled);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export const removePendingSave = (uid: string) => del('state', `save:${uid}`);
export async function listPendingSaves(folder: FileSystemDirectoryHandle): Promise<PendingItemSave[]> {
  const all = await tx<unknown[]>('state', 'readonly', (s) => s.getAll());
  const saves = all.filter((value): value is PendingItemSave => !!value && typeof value === 'object' && 'kind' in value && value.kind === 'item-save');
  const matching = await Promise.all(saves.map(async (save) => (await folder.isSameEntry(save.folder)) ? save : null));
  return matching.filter((save): save is PendingItemSave => save !== null);
}

/** 앱별 "지금 담을 카테고리" */
export const getCurrentCategory = (origin: string) => get<string>('state', `cat:${origin}`);
export const setCurrentCategory = (origin: string, category: string) => put('state', `cat:${origin}`, category);
