import {
  DEFAULT_CATEGORY,
  itemAssetPath,
  itemIdFromFileName,
  parseItemDetail,
  withStatus,
  type ArchiveItemDetail,
  type ArchiveProject,
} from '@pinproof/shared';

async function getSubDir(
  parent: FileSystemDirectoryHandle,
  name: string,
  create = false,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name, { create });
  } catch {
    return null;
  }
}

async function readTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function readAssetBlobUrl(
  baseDir: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string | undefined> {
  try {
    const parts = relPath.split('/').filter(Boolean);
    let current: FileSystemDirectoryHandle = baseDir;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    const fh = await current.getFileHandle(parts[parts.length - 1]);
    const file = await fh.getFile();
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

async function readItemsFromDir(
  dir: FileSystemDirectoryHandle,
  archived: boolean,
  projectId: string,
  projectName: string,
): Promise<ArchiveItemDetail[]> {
  const result: ArchiveItemDetail[] = [];
  const entries = (dir as unknown as AsyncIterable<[string, FileSystemHandle]>);
  for await (const [name, handle] of entries) {
    if (handle.kind !== 'file' || itemIdFromFileName(name) === null) continue;
    const text = await readTextFile(dir, name);
    if (!text) continue;
    const parsed = parseItemDetail(text, name, archived, projectId, projectName);
    if (!parsed) continue;
    const assetRel = parsed.screenshotRelPath || itemAssetPath(parsed.id);
    const screenshotUrl = await readAssetBlobUrl(dir, assetRel);
    result.push({
      ...parsed,
      screenshotUrl,
    });
  }
  return result;
}

export async function loadProjectFromHandle(
  id: string,
  name: string,
  rootHandle: FileSystemDirectoryHandle,
): Promise<ArchiveProject> {
  // 사용자가 프로젝트 루트를 골랐거나 .pinproof 폴더 자체를 골랐을 때 모두 지원
  const pinproofDir =
    rootHandle.name === '.pinproof'
      ? rootHandle
      : await getSubDir(rootHandle, '.pinproof', false);

  if (!pinproofDir) {
    return {
      id,
      name,
      source: 'fs',
      categories: [DEFAULT_CATEGORY],
      items: [],
      lastLoadedAt: Date.now(),
    };
  }

  let categories: string[] = [DEFAULT_CATEGORY];
  const catText = await readTextFile(pinproofDir, 'categories.json');
  if (catText) {
    try {
      const parsed = JSON.parse(catText);
      if (Array.isArray(parsed)) {
        categories = [...new Set([DEFAULT_CATEGORY, ...parsed.filter((v): v is string => typeof v === 'string')])];
      }
    } catch {
      // ignore invalid json
    }
  }

  const itemsDir = await getSubDir(pinproofDir, 'items', false);
  const items: ArchiveItemDetail[] = [];

  if (itemsDir) {
    const active = await readItemsFromDir(itemsDir, false, id, name);
    items.push(...active);

    const archiveDir = await getSubDir(itemsDir, 'archive', false);
    if (archiveDir) {
      const archived = await readItemsFromDir(archiveDir, true, id, name);
      items.push(...archived);
    }
  }

  for (const item of items) {
    if (!categories.includes(item.category)) {
      categories.push(item.category);
    }
  }

  return {
    id,
    name,
    source: 'fs',
    categories,
    items: items.sort((a, b) => b.id - a.id),
    lastLoadedAt: Date.now(),
  };
}

async function copyAssetIfExists(
  srcDir: FileSystemDirectoryHandle,
  dstDir: FileSystemDirectoryHandle,
  assetFileName: string,
): Promise<void> {
  const srcAssets = await getSubDir(srcDir, 'assets', false);
  if (!srcAssets) return;
  try {
    const fh = await srcAssets.getFileHandle(assetFileName);
    const file = await fh.getFile();
    const dstAssets = await getSubDir(dstDir, 'assets', true);
    if (!dstAssets) return;
    const dstFh = await dstAssets.getFileHandle(assetFileName, { create: true });
    const writable = await dstFh.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    await srcAssets.removeEntry(assetFileName);
  } catch {
    // 스크린샷이 없는 항목은 무시
  }
}

async function resolveItemsDir(
  rootHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  const pinproofDir =
    rootHandle.name === '.pinproof'
      ? rootHandle
      : await rootHandle.getDirectoryHandle('.pinproof', { create: true });
  return pinproofDir.getDirectoryHandle('items', { create: true });
}

export async function moveItemArchiveStateInFs(
  rootHandle: FileSystemDirectoryHandle,
  item: ArchiveItemDetail,
  toArchived: boolean,
): Promise<void> {
  const itemsDir = await resolveItemsDir(rootHandle);
  const archiveDir = await itemsDir.getDirectoryHandle('archive', { create: true });
  const srcDir = item.archived ? archiveDir : itemsDir;
  const dstDir = toArchived ? archiveDir : itemsDir;
  if (srcDir === dstDir) return;

  const existing = await readTextFile(srcDir, item.fileName);
  if (existing === null) return;

  const updatedText = withStatus(existing, toArchived ? '완료' : '대기');
  const dstFh = await dstDir.getFileHandle(item.fileName, { create: true });
  const writable = await dstFh.createWritable();
  await writable.write(updatedText);
  await writable.close();

  const assetName = `${String(item.id).padStart(3, '0')}.png`;
  await copyAssetIfExists(srcDir, dstDir, assetName);
  await srcDir.removeEntry(item.fileName);
}

export async function deleteItemInFs(
  rootHandle: FileSystemDirectoryHandle,
  item: ArchiveItemDetail,
): Promise<void> {
  const itemsDir = await resolveItemsDir(rootHandle);
  const targetDir = item.archived
    ? await getSubDir(itemsDir, 'archive', false)
    : itemsDir;
  if (!targetDir) return;

  try {
    await targetDir.removeEntry(item.fileName);
  } catch {
    // already deleted
  }
  const assetsDir = await getSubDir(targetDir, 'assets', false);
  if (assetsDir) {
    try {
      await assetsDir.removeEntry(`${String(item.id).padStart(3, '0')}.png`);
    } catch {
      // no asset
    }
  }
}
