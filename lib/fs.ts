import { appendExclude, WORKFLOW_MD, WORKFLOW_VERSION, workflowVersionOf } from './templates';
import {
  idFromFileName,
  itemFileName,
  itemIdFromFileName,
  mergeWithExisting,
  parseItemSummary,
  renderItem,
  statusOf,
  withStatus,
  padId,
  parseSummary,
  recordFileName,
  renderRecord,
  assetPath,
} from './markdown';
import { BugRecord, DEFAULT_CATEGORY, Item, ItemSummary, RecordSummary } from './types';

const NOTES_DIR = '.pinproof';
const ARCHIVE_DIR = 'archive';
const ASSETS_DIR = 'assets';
/** 이전 이름(BugNotes) 시절의 데이터 폴더·커맨드 파일 */
const LEGACY_DIR = '.bugnotes';
const LEGACY_COMMAND = 'bugnotes.md';

type Dir = FileSystemDirectoryHandle;

export async function ensurePermission(root: Dir, request: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const;
  // @ts-expect-error queryPermission/requestPermission은 아직 lib.dom 타입에 없음
  if ((await root.queryPermission(opts)) === 'granted') return true;
  if (!request) return false;
  // @ts-expect-error 위와 같음
  return (await root.requestPermission(opts)) === 'granted';
}

async function getDir(parent: Dir, path: string[], create: boolean): Promise<Dir | null> {
  let dir = parent;
  for (const name of path) {
    try {
      dir = await dir.getDirectoryHandle(name, { create });
    } catch (e) {
      if (!create && (e as DOMException).name === 'NotFoundError') return null;
      throw e;
    }
  }
  return dir;
}

async function readText(dir: Dir, name: string): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name);
    return await (await fh.getFile()).text();
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError' || (e as DOMException).name === 'TypeMismatchError') return null;
    throw e;
  }
}

async function writeFile(dir: Dir, name: string, data: string | Blob): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function exists(dir: Dir, name: string, kind: 'file' | 'directory'): Promise<boolean> {
  try {
    if (kind === 'file') await dir.getFileHandle(name);
    else await dir.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function listNames(dir: Dir | null): Promise<string[]> {
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface SetupPlan {
  workflow: boolean;
  /** .git/info/exclude 에 .pinproof/ 를 추가할지 */
  exclude: boolean;
  /** repo: .git 폴더가 있음 · worktree: .git 이 파일(git 워크트리, exclude 는 메인 저장소 쪽에 있어 쓸 수 없음) · none: git 아님 */
  git: 'repo' | 'worktree' | 'none';
  /** 이전 이름의 .bugnotes/ 가 있어 .pinproof/ 로 옮길지 */
  legacy: boolean;
}

/** 폴더 연결 시 생성·수정할 파일 목록(동의 다이얼로그용) */
export async function planSetup(root: Dir): Promise<SetupPlan> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const git = (await exists(root, '.git', 'directory')) ? 'repo' : (await exists(root, '.git', 'file')) ? 'worktree' : 'none';
  return {
    workflow: !notes || !(await exists(notes, 'WORKFLOW.md', 'file')),
    exclude: git === 'repo' && appendExclude(await readExclude(root)) !== null,
    git,
    legacy: await exists(root, LEGACY_DIR, 'directory'),
  };
}

export async function applySetup(root: Dir): Promise<void> {
  if (await exists(root, LEGACY_DIR, 'directory')) await migrateLegacy(root);
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  // 이미 있으면 덮어쓰지 않는다(교체는 패널의 [업데이트] 버튼으로만)
  if (!(await exists(notes, 'WORKFLOW.md', 'file'))) await writeFile(notes, 'WORKFLOW.md', WORKFLOW_MD);
  await ensureExclude(root);
}

async function readExclude(root: Dir): Promise<string | null> {
  const info = await getDir(root, ['.git', 'info'], false);
  return info ? readText(info, 'exclude') : null;
}

/**
 * .git/info/exclude 에 .pinproof/ 를 추가한다(이미 있으면 그대로).
 * 팀이 함께 쓰는 .gitignore 와 프로젝트의 .claude/commands/ 는 건드리지 않는다.
 */
async function ensureExclude(root: Dir): Promise<void> {
  if (!(await exists(root, '.git', 'directory'))) return;
  const next = appendExclude(await readExclude(root));
  if (next !== null) await writeFile((await getDir(root, ['.git', 'info'], true))!, 'exclude', next);
}

async function listEntries(dir: Dir): Promise<[string, FileSystemHandle][]> {
  const out: [string, FileSystemHandle][] = [];
  for await (const entry of dir.entries()) out.push(entry);
  return out;
}

/** src 아래를 dst로 복사한다. 이미 있는 파일은 덮어쓰지 않고, skip이 true인 경로는 건너뛴다 */
async function copyTree(src: Dir, dst: Dir, skip: (path: string) => boolean, prefix = ''): Promise<void> {
  for (const [name, handle] of await listEntries(src)) {
    const path = prefix + name;
    if (skip(path)) continue;
    if (handle.kind === 'directory') {
      await copyTree(handle as Dir, await dst.getDirectoryHandle(name, { create: true }), skip, `${path}/`);
    } else if (!(await exists(dst, name, 'file'))) {
      await writeFile(dst, name, await (handle as FileSystemFileHandle).getFile());
    }
  }
}

export async function hasLegacy(root: Dir): Promise<boolean> {
  return exists(root, LEGACY_DIR, 'directory');
}

/**
 * 이전 이름의 .bugnotes/ 를 .pinproof/ 로 옮긴다.
 * - 기록·스크린샷·보관함을 복사(이미 있는 파일은 덮어쓰지 않음). WORKFLOW.md는 새 버전을 쓴다(옛 파일은 .bugnotes 경로를 가리킴)
 * - 같은 번호의 기록이 양쪽에 다르게 있으면 그 기록은 옮기지 않고 skipped로 알려준다
 * - 모두 옮겼으면 .bugnotes/ 와 옛 커맨드(/bugnotes)를 지우고, .git/info/exclude 에 .pinproof/ 를 추가한다
 *   (.gitignore 의 옛 블록은 팀 파일이라 건드리지 않는다)
 */
export async function migrateLegacy(root: Dir): Promise<{ skipped: number[] }> {
  const legacy = await getDir(root, [LEGACY_DIR], false);
  if (!legacy) return { skipped: [] };
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  const skipped: number[] = [];
  const skipPaths = new Set<string>(['WORKFLOW.md']);
  // .pinproof/ 쪽에 이미 있는 기록 번호 → 경로(보관함 포함)
  const taken = new Map<number, string>();
  for (const sub of ['', `${ARCHIVE_DIR}/`]) {
    for (const name of await listNames(sub ? await getDir(notes, [ARCHIVE_DIR], false) : notes)) {
      const id = idFromFileName(name);
      if (id !== null) taken.set(id, sub + name);
    }
  }
  for (const sub of ['', `${ARCHIVE_DIR}/`]) {
    for (const name of await listNames(sub ? await getDir(legacy, [ARCHIVE_DIR], false) : legacy)) {
      const id = idFromFileName(name);
      const at = id === null ? undefined : taken.get(id);
      if (id !== null && at && at !== sub + name) {
        skipped.push(id);
        skipPaths.add(sub + name);
        skipPaths.add(`${sub}${ASSETS_DIR}/${padId(id)}`);
      }
    }
  }
  await copyTree(legacy, notes, (p) => skipPaths.has(p));
  if (!(await exists(notes, 'WORKFLOW.md', 'file'))) await writeFile(notes, 'WORKFLOW.md', WORKFLOW_MD);

  const commands = await getDir(root, ['.claude', 'commands'], false);
  const oldCommand = commands && (await readText(commands, LEGACY_COMMAND));
  if (oldCommand?.includes('.bugnotes/WORKFLOW.md')) await commands!.removeEntry(LEGACY_COMMAND);
  await ensureExclude(root);

  if (skipped.length === 0) await root.removeEntry(LEGACY_DIR, { recursive: true });
  return { skipped };
}

export interface WorkflowStatus {
  current: number;
  latest: number;
}

/** 프로젝트의 WORKFLOW.md가 익스텐션보다 낮은 버전이면 상태를, 최신이거나 없으면 null */
export async function workflowStatus(root: Dir): Promise<WorkflowStatus | null> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const text = notes ? await readText(notes, 'WORKFLOW.md') : null;
  if (text === null) return null;
  const current = workflowVersionOf(text);
  return current < WORKFLOW_VERSION ? { current, latest: WORKFLOW_VERSION } : null;
}

export async function updateWorkflow(root: Dir): Promise<void> {
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  await writeFile(notes, 'WORKFLOW.md', WORKFLOW_MD);
}

export async function listRecords(root: Dir): Promise<RecordSummary[]> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const archive = notes ? await getDir(notes, [ARCHIVE_DIR], false) : null;
  const out: RecordSummary[] = [];
  for (const [dir, archived] of [
    [notes, false],
    [archive, true],
  ] as const) {
    if (!dir) continue;
    for (const name of await listNames(dir)) {
      if (idFromFileName(name) === null) continue;
      const text = await readText(dir, name);
      const summary = text && parseSummary(text, name, archived);
      if (summary) out.push(summary);
    }
  }
  return out.sort((a, b) => b.id - a.id);
}

export async function nextRecordId(root: Dir): Promise<number> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const archive = notes ? await getDir(notes, [ARCHIVE_DIR], false) : null;
  let max = 0;
  for (const name of [...(await listNames(notes)), ...(await listNames(archive))]) {
    const id = idFromFileName(name);
    if (id !== null && id > max) max = id;
  }
  return max + 1;
}

async function findFileForId(dir: Dir, id: number): Promise<string | null> {
  const prefix = `${padId(id)}-`;
  for (const name of await listNames(dir)) {
    if (name.startsWith(prefix) && name.endsWith('.md')) return name;
  }
  return null;
}

/**
 * 프로젝트 폴더를 바꾸는 작업(기록 쓰기·보관·삭제)을 한 줄로 세워 차례로 실행한다.
 * 저장이 겹치면 한쪽이 다른 쪽의 쓰기 중 임시 파일(F.png.1.crswap)을 남은 스크린샷으로 보고 지우려다
 * NoModificationAllowedError 로 실패하고, 지우기에 성공하면 다른 쪽 쓰기가 깨진다.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/** 증거 스크린샷 파일 이름(assets/<id>/<문자>.png). 정리할 때 이 이름만 지운다 */
const SCREENSHOT_NAME = /^[A-Z]+\.png$/;

/** 기록 건을 md + 스크린샷으로 쓴다. 처리 기록 섹션은 보존하고, 제목이 바뀌었으면 파일명을 바꾼다. */
export function writeRecord(root: Dir, record: BugRecord): Promise<string> {
  return serial(() => writeRecordNow(root, record));
}

async function writeRecordNow(root: Dir, record: BugRecord): Promise<string> {
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  const fileName = recordFileName(record);
  const oldName = await findFileForId(notes, record.id);
  const existing = oldName ? await readText(notes, oldName) : null;

  const assets = await getDir(notes, [ASSETS_DIR, padId(record.id)], true);
  const keep = new Set<string>();
  for (const e of record.evidence) {
    if (!e.screenshot || !e.letter) continue;
    const name = assetPath(record.id, e.letter).split('/').pop()!;
    keep.add(name);
    await writeFile(assets!, name, dataUrlToBlob(e.screenshot));
  }
  // 삭제되거나 문자가 바뀐 증거의 스크린샷 정리 (임시 파일 등 다른 파일은 건드리지 않는다)
  for (const name of await listNames(assets)) {
    if (SCREENSHOT_NAME.test(name) && !keep.has(name)) await assets!.removeEntry(name);
  }

  await writeFile(notes, fileName, mergeWithExisting(renderRecord(record), existing));
  if (oldName && oldName !== fileName) await notes.removeEntry(oldName);
  return fileName;
}

async function moveFile(from: Dir, to: Dir, name: string): Promise<void> {
  const fh = await from.getFileHandle(name);
  await writeFile(to, name, await fh.getFile());
  await from.removeEntry(name);
}

async function moveAssets(fromNotes: Dir, toNotes: Dir, id: number): Promise<void> {
  const src = await getDir(fromNotes, [ASSETS_DIR, padId(id)], false);
  if (!src) return;
  const dst = (await getDir(toNotes, [ASSETS_DIR, padId(id)], true))!;
  for (const name of await listNames(src)) await moveFile(src, dst, name);
  const assetsRoot = (await getDir(fromNotes, [ASSETS_DIR], false))!;
  await assetsRoot.removeEntry(padId(id), { recursive: true });
}

/** 보관: md와 assets/<id>를 archive/로 옮긴다(삭제하지 않음). restore=true면 되돌린다. */
export function archiveRecord(root: Dir, id: number, restore = false): Promise<void> {
  return serial(() => archiveRecordNow(root, id, restore));
}

async function archiveRecordNow(root: Dir, id: number, restore: boolean): Promise<void> {
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  const archive = (await getDir(notes, [ARCHIVE_DIR], true))!;
  const [from, to] = restore ? [archive, notes] : [notes, archive];
  const name = await findFileForId(from, id);
  if (!name) throw new Error(`#${padId(id)} 파일을 찾을 수 없습니다.`);
  await moveFile(from, to, name);
  await moveAssets(from, to, id);
}

/** 기록 삭제: md와 assets/<id>를 지운다(보관함에 있으면 보관함에서). 되돌릴 수 없다 */
export function deleteRecord(root: Dir, id: number, archived: boolean): Promise<void> {
  return serial(() => deleteRecordNow(root, id, archived));
}

async function deleteRecordNow(root: Dir, id: number, archived: boolean): Promise<void> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const dir = notes && (archived ? await getDir(notes, [ARCHIVE_DIR], false) : notes);
  if (!dir) throw new Error(`#${padId(id)} 파일을 찾을 수 없습니다.`);
  const name = await findFileForId(dir, id);
  if (!name) throw new Error(`#${padId(id)} 파일을 찾을 수 없습니다.`);
  await dir.removeEntry(name);
  const assets = await getDir(dir, [ASSETS_DIR], false);
  if (assets) {
    try {
      await assets.removeEntry(padId(id), { recursive: true });
    } catch (e) {
      if ((e as DOMException).name !== 'NotFoundError') throw e;
    }
  }
}

export async function readRecordText(root: Dir, summary: RecordSummary): Promise<string | null> {
  const dir = await getDir(root, summary.archived ? [NOTES_DIR, ARCHIVE_DIR] : [NOTES_DIR], false);
  return dir ? readText(dir, summary.fileName) : null;
}

// ---------- 항목(items/): 항목 하나 = md 하나, 카테고리로 묶음 ----------

const ITEMS_DIR = 'items';
const CATEGORIES_FILE = 'categories.json';

async function itemsDir(root: Dir, archived: boolean, create: boolean): Promise<Dir | null> {
  return getDir(root, archived ? [NOTES_DIR, ITEMS_DIR, ARCHIVE_DIR] : [NOTES_DIR, ITEMS_DIR], create);
}

/**
 * 항목을 md + 스크린샷으로 쓴다. 처리 기록 섹션은 보존한다.
 * 파일에 이미 status: 완료(에이전트가 표시)가 있으면 익스텐션이 대기로 되돌리지 않는다.
 */
export function writeItem(root: Dir, item: Item): Promise<void> {
  return serial(async () => {
    const dir = (await itemsDir(root, false, true))!;
    const name = itemFileName(item.id);
    const existing = await readText(dir, name);
    const keep = existing && statusOf(existing) === '완료' && item.status === '대기' ? { ...item, status: '완료' as const } : item;
    const assets = (await getDir(dir, [ASSETS_DIR], true))!;
    const shot = `${padId(item.id)}.png`;
    if (item.evidence.screenshot) await writeFile(assets, shot, dataUrlToBlob(item.evidence.screenshot));
    else if (await exists(assets, shot, 'file')) await assets.removeEntry(shot);
    await writeFile(dir, name, mergeWithExisting(renderItem(keep), existing));
  });
}

export async function listItems(root: Dir): Promise<ItemSummary[]> {
  const out: ItemSummary[] = [];
  for (const archived of [false, true]) {
    const dir = await itemsDir(root, archived, false);
    for (const name of await listNames(dir)) {
      if (itemIdFromFileName(name) === null) continue;
      const text = await readText(dir!, name);
      const summary = text && parseItemSummary(text, name, archived);
      if (summary) out.push(summary);
    }
  }
  return out.sort((a, b) => a.id - b.id);
}

/** 보관(archived=true)·되돌리기(false): md 와 스크린샷을 옮긴다. 되돌리면 상태를 대기로 */
export function moveItem(root: Dir, id: number, toArchive: boolean): Promise<void> {
  return serial(async () => {
    const from = (await itemsDir(root, !toArchive, true))!;
    const to = (await itemsDir(root, toArchive, true))!;
    const name = itemFileName(id);
    const text = await readText(from, name);
    if (text === null) throw new Error(`항목 #${padId(id)} 파일을 찾을 수 없습니다.`);
    await writeFile(to, name, toArchive ? text : withStatus(text, '대기'));
    await from.removeEntry(name);
    const shot = `${padId(id)}.png`;
    const fromAssets = await getDir(from, [ASSETS_DIR], false);
    if (fromAssets && (await exists(fromAssets, shot, 'file'))) {
      await moveFile(fromAssets, (await getDir(to, [ASSETS_DIR], true))!, shot);
    }
  });
}

/** 항목 삭제(되돌릴 수 없음): md 와 스크린샷 */
export function deleteItem(root: Dir, id: number, archived: boolean): Promise<void> {
  return serial(async () => {
    const dir = await itemsDir(root, archived, false);
    if (!dir) return;
    const name = itemFileName(id);
    if (await exists(dir, name, 'file')) await dir.removeEntry(name);
    const assets = await getDir(dir, [ASSETS_DIR], false);
    const shot = `${padId(id)}.png`;
    if (assets && (await exists(assets, shot, 'file'))) await assets.removeEntry(shot);
  });
}

/** 다음 항목 번호: 기존 기록(보관 포함)과 항목(보관 포함)을 통틀어 가장 큰 번호 + 1 — "/pinproof 7" 이 겹치지 않게 */
export async function nextItemId(root: Dir): Promise<number> {
  let max = (await nextRecordId(root)) - 1;
  for (const archived of [false, true]) {
    for (const name of await listNames(await itemsDir(root, archived, false))) {
      const id = itemIdFromFileName(name);
      if (id !== null && id > max) max = id;
    }
  }
  return max + 1;
}

/** 카테고리 목록(비어 있는 카테고리도 유지). 미분류는 늘 맨 앞 */
export async function readCategories(root: Dir): Promise<string[]> {
  const notes = await getDir(root, [NOTES_DIR], false);
  let list: string[] = [];
  try {
    const text = notes ? await readText(notes, CATEGORIES_FILE) : null;
    const parsed = text ? JSON.parse(text) : [];
    if (Array.isArray(parsed)) list = parsed.filter((c): c is string => typeof c === 'string' && c.trim() !== '');
  } catch {
    /* 사람이 고치다 깨진 파일이면 기본값으로 */
  }
  return [DEFAULT_CATEGORY, ...list.filter((c) => c !== DEFAULT_CATEGORY)].filter((c, i, a) => a.indexOf(c) === i);
}

export function writeCategories(root: Dir, list: string[]): Promise<void> {
  return serial(async () => {
    const notes = (await getDir(root, [NOTES_DIR], true))!;
    const clean = [DEFAULT_CATEGORY, ...list.filter((c) => c.trim() && c !== DEFAULT_CATEGORY)];
    await writeFile(notes, CATEGORIES_FILE, `${JSON.stringify(clean, null, 2)}\n`);
  });
}
