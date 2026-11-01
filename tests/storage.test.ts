import { describe, expect, it } from 'vitest';
import { listItems, moveItem, renameItemCategory, writeItem } from '../lib/fs';
import type { Item } from '../lib/types';

class Directory {
  kind = 'directory';
  children = new Map<string, Directory | StoredFile>();
  constructor(public name = 'project') {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    let entry = this.children.get(name);
    if (!entry && options?.create) this.children.set(name, entry = new Directory(name));
    if (!(entry instanceof Directory)) throw new DOMException('Missing directory', 'NotFoundError');
    return entry;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<StoredFile> {
    let entry = this.children.get(name);
    if (!entry && options?.create) this.children.set(name, entry = new StoredFile());
    if (!(entry instanceof StoredFile)) throw new DOMException('Missing file', 'NotFoundError');
    return entry;
  }
  async *entries() { yield* this.children.entries(); }
  async removeEntry(name: string) { this.children.delete(name); }
  handle() { return this as unknown as FileSystemDirectoryHandle; }
}
class StoredFile {
  kind = 'file';
  text = '';
  async getFile() { return new Blob([this.text]); }
  async createWritable() {
    let next = '';
    return { write: async (value: string | Blob) => { next = typeof value === 'string' ? value : await value.text(); }, close: async () => { this.text = next; } };
  }
}
const item = (id: number, app = 'http://localhost:3000'): Item => ({ id, app, category: 'Old', status: '대기', created: '2026-10-31T12:00', evidence: { uid: `uid-${id}`, kind: 'element', url: `${app}/page`, route: '/page', capturedAt: 1, viewportWidth: 1280, note: `note-${id}`, selector: '#target' } });
const itemsDirectory = async (root: Directory) => (await root.getDirectoryHandle('.pinproof')).getDirectoryHandle('items');

describe('item storage', () => {
  it('renames active and archived items across origins without restoring completed items or touching their results', async () => {
    const root = new Directory();
    await writeItem(root.handle(), item(1), true);
    await writeItem(root.handle(), item(2, 'http://localhost:4000'), true);
    const dir = await itemsDirectory(root);
    const file = await dir.getFileHandle('001.md');
    file.text = file.text.replace('status: 대기', 'status: 완료') + '\n## 처리 기록\nKept exactly.\n';
    await moveItem(root.handle(), 1, true);
    await renameItemCategory(root.handle(), 'Old', 'New $&');
    const items = await listItems(root.handle());
    expect(items.map(({ id, category, archived, status }) => ({ id, category, archived, status }))).toEqual([
      { id: 1, category: 'New $&', archived: true, status: '완료' },
      { id: 2, category: 'New $&', archived: false, status: '대기' },
    ]);
    expect(dir.children.has('001.md')).toBe(false);
    const archived = await (await dir.getDirectoryHandle('archive')).getFileHandle('001.md');
    expect(archived.text).toContain('\n## 처리 기록\nKept exactly.\n');
    expect(archived.text).toContain('# #001 · New $&');
  });

  it('updates an archived item in place and preserves its completed state', async () => {
    const root = new Directory();
    await writeItem(root.handle(), item(1), true);
    const dir = await itemsDirectory(root);
    const file = await dir.getFileHandle('001.md');
    file.text = file.text.replace('status: 대기', 'status: 완료');
    await moveItem(root.handle(), 1, true);
    await writeItem(root.handle(), { ...item(1), evidence: { ...item(1).evidence, note: 'updated' } });
    expect(await listItems(root.handle())).toMatchObject([{ id: 1, status: '완료', archived: true, note: 'updated' }]);
    expect(dir.children.has('001.md')).toBe(false);
  });

  it('refuses to recreate a deleted item when an old edit is retried', async () => {
    const root = new Directory();
    await expect(writeItem(root.handle(), item(1))).rejects.toThrow();
    expect(await listItems(root.handle())).toEqual([]);
  });

  it('refuses to overwrite an occupied number when retrying a new capture', async () => {
    const root = new Directory();
    await writeItem(root.handle(), item(1), true);
    await expect(writeItem(root.handle(), { ...item(1), evidence: { ...item(1).evidence, uid: 'other-capture', note: 'other capture' } }, true)).rejects.toThrow();
    expect(await listItems(root.handle())).toMatchObject([{ id: 1, note: 'note-1' }]);
  });

  it('reconciles a completed file after interruption without overwriting newer disk content', async () => {
    const root = new Directory();
    await writeItem(root.handle(), item(1), true);
    const dir = await itemsDirectory(root);
    const file = await dir.getFileHandle('001.md');
    file.text = file.text.replace('status: 대기', 'status: 완료').replace('category: "Old"', 'category: "External"') + '\n## 처리 기록\nWork completed after save.\n';
    await moveItem(root.handle(), 1, true);
    const archived = await (await dir.getDirectoryHandle('archive')).getFileHandle('001.md');
    const before = archived.text;
    const summary = await writeItem(root.handle(), item(1), true);
    expect(summary).toMatchObject({ id: 1, category: 'External', status: '완료', archived: true });
    expect(archived.text).toBe(before);
    expect(dir.children.has('001.md')).toBe(false);
  });

  it('retries a note edit without reverting a newer category or sent timestamp', async () => {
    const root = new Directory();
    await writeItem(root.handle(), item(1), true);
    const dir = await itemsDirectory(root);
    const file = await dir.getFileHandle('001.md');
    file.text = file.text.replace('category: "Old"', 'category: "External"').replace('status: 대기', 'status: 완료\nsent: 2026-10-31T13:00') + '\n## 처리 기록\nRetained.\n';
    await moveItem(root.handle(), 1, true);
    const summary = await writeItem(root.handle(), { ...item(1), evidence: { ...item(1).evidence, note: 'retry note' } }, false, ['note']);
    expect(summary).toMatchObject({ note: 'retry note', category: 'External', status: '완료', sent: '2026-10-31T13:00', archived: true });
    const archived = await (await dir.getDirectoryHandle('archive')).getFileHandle('001.md');
    expect(archived.text).toContain('## 처리 기록\nRetained.');
    expect(dir.children.has('001.md')).toBe(false);
  });
});
