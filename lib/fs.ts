import { appendGitignore, COMMAND_MD, WORKFLOW_MD, WORKFLOW_VERSION, workflowVersionOf } from './templates';
import {
  idFromFileName,
  mergeWithExisting,
  padId,
  parseSummary,
  recordFileName,
  renderRecord,
  assetPath,
} from './markdown';
import { BugRecord, RecordSummary } from './types';

const NOTES_DIR = '.bugnotes';
const ARCHIVE_DIR = 'archive';
const ASSETS_DIR = 'assets';

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
  command: boolean;
  gitignore: boolean;
  hasGit: boolean;
}

/** 폴더 연결 시 생성·수정할 파일 목록(동의 다이얼로그용) */
export async function planSetup(root: Dir): Promise<SetupPlan> {
  const notes = await getDir(root, [NOTES_DIR], false);
  const commands = await getDir(root, ['.claude', 'commands'], false);
  const hasGit = await exists(root, '.git', 'directory');
  const gitignore = await readText(root, '.gitignore');
  return {
    workflow: !notes || !(await exists(notes, 'WORKFLOW.md', 'file')),
    command: !commands || !(await exists(commands, 'bugnotes.md', 'file')),
    gitignore: hasGit && appendGitignore(gitignore) !== null,
    hasGit,
  };
}

export async function applySetup(root: Dir): Promise<void> {
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  // 이미 있으면 덮어쓰지 않는다(교체는 패널의 [업데이트] 버튼으로만)
  if (!(await exists(notes, 'WORKFLOW.md', 'file'))) await writeFile(notes, 'WORKFLOW.md', WORKFLOW_MD);
  const commands = (await getDir(root, ['.claude', 'commands'], true))!;
  if (!(await exists(commands, 'bugnotes.md', 'file'))) {
    await writeFile(commands, 'bugnotes.md', COMMAND_MD);
  }
  if (await exists(root, '.git', 'directory')) {
    const next = appendGitignore(await readText(root, '.gitignore'));
    if (next !== null) await writeFile(root, '.gitignore', next);
  }
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

/** 기록 건을 md + 스크린샷으로 쓴다. 처리 기록 섹션은 보존하고, 제목이 바뀌었으면 파일명을 바꾼다. */
export async function writeRecord(root: Dir, record: BugRecord): Promise<string> {
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
  // 삭제되거나 문자가 바뀐 증거의 스크린샷 정리
  for (const name of await listNames(assets)) {
    if (!keep.has(name)) await assets!.removeEntry(name);
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
export async function archiveRecord(root: Dir, id: number, restore = false): Promise<void> {
  const notes = (await getDir(root, [NOTES_DIR], true))!;
  const archive = (await getDir(notes, [ARCHIVE_DIR], true))!;
  const [from, to] = restore ? [archive, notes] : [notes, archive];
  const name = await findFileForId(from, id);
  if (!name) throw new Error(`#${padId(id)} 파일을 찾을 수 없습니다.`);
  await moveFile(from, to, name);
  await moveAssets(from, to, id);
}

/** 기록 삭제: md와 assets/<id>를 지운다(보관함에 있으면 보관함에서). 되돌릴 수 없다 */
export async function deleteRecord(root: Dir, id: number, archived: boolean): Promise<void> {
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
