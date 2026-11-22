import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArchiveItemDetail, ArchiveProject } from '@pinproof/shared';
import {
  deleteItemInFs,
  loadProjectFromHandle,
  moveItemArchiveStateInFs,
} from '@/entities/pinproof-item/api/fs-archive';
import {
  ensureReadWritePermission,
  listStoredProjects,
  removeStoredProject,
  saveStoredProject,
  supportsDirectoryPicker,
  type StoredProjectHandle,
} from '@/entities/pinproof-item/model/fs-store';
import { createSampleProjects } from '@/entities/pinproof-item/model/sample-projects';

const QUERY_KEY = ['pinproof-archive-projects'] as const;

export function useArchiveProjects() {
  const queryClient = useQueryClient();
  const [sampleProjects, setSampleProjects] = useState<ArchiveProject[]>(() =>
    createSampleProjects(),
  );
  const [showSample, setShowSample] = useState(false);
  const [permissionNeeded, setPermissionNeeded] = useState<StoredProjectHandle[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const handleMapRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());

  const fsQuery = useQuery({
    queryKey: QUERY_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<ArchiveProject[]> => {
      const stored = await listStoredProjects();
      const loaded: ArchiveProject[] = [];
      const needPerm: StoredProjectHandle[] = [];
      const nextHandles = new Map<string, FileSystemDirectoryHandle>();

      for (const entry of stored) {
        nextHandles.set(entry.id, entry.handle);
        const granted = await ensureReadWritePermission(entry.handle, false);
        if (!granted) {
          needPerm.push(entry);
          continue;
        }
        try {
          const project = await loadProjectFromHandle(entry.id, entry.name, entry.handle);
          loaded.push(project);
        } catch {
          needPerm.push(entry);
        }
      }
      handleMapRef.current = nextHandles;
      setPermissionNeeded(needPerm);
      return loaded;
    },
  });

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const fsProjects = fsQuery.data ?? [];
  const hasConnectedFs = fsProjects.length > 0;

  const projects = useMemo(() => {
    if (showSample) return [...fsProjects, ...sampleProjects];
    return fsProjects;
  }, [fsProjects, sampleProjects, showSample]);

  const connectFolder = useCallback(async () => {
    if (!supportsDirectoryPicker()) {
      setStatusMessage('이 브라우저는 로컬 폴더 선택(File System Access API)을 지원하지 않습니다. Chrome/Edge에서 사용해 주세요.');
      return;
    }
    try {
      const picker = (
        window as unknown as {
          showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      const handle = await picker({ mode: 'readwrite' });
      const id = `fs-${handle.name}-${Date.now().toString(36)}`;
      await saveStoredProject({
        id,
        name: handle.name,
        handle,
        addedAt: Date.now(),
      });
      handleMapRef.current.set(id, handle);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setStatusMessage(`"${handle.name}" 폴더를 연결했습니다.`);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setStatusMessage('폴더를 열지 못했습니다. 읽기/쓰기 권한을 확인해 주세요.');
    }
  }, [queryClient]);

  const grantStoredPermission = useCallback(
    async (entry: StoredProjectHandle) => {
      const ok = await ensureReadWritePermission(entry.handle, true);
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        setStatusMessage(`"${entry.name}" 폴더 권한을 복원했습니다.`);
      }
    },
    [queryClient],
  );

  const disconnectProject = useCallback(
    async (projectId: string) => {
      if (projectId.startsWith('sample-')) {
        setSampleProjects((prev) => prev.filter((p) => p.id !== projectId));
        return;
      }
      await removeStoredProject(projectId);
      handleMapRef.current.delete(projectId);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setStatusMessage('프로젝트 폴더 연결을 해제했습니다.');
    },
    [queryClient],
  );

  const setItemsArchived = useCallback(
    async (items: ArchiveItemDetail[], toArchived: boolean) => {
      const fsItems = items.filter((i) => !i.projectId.startsWith('sample-'));
      const sampleItems = items.filter((i) => i.projectId.startsWith('sample-'));

      for (const item of fsItems) {
        const handle = handleMapRef.current.get(item.projectId);
        if (!handle) continue;
        await moveItemArchiveStateInFs(handle, item, toArchived);
      }

      if (sampleItems.length > 0) {
        const keySet = new Set(sampleItems.map((i) => `${i.projectId}::${i.id}`));
        setSampleProjects((prev) =>
          prev.map((proj) => ({
            ...proj,
            items: proj.items.map((it) =>
              keySet.has(`${proj.id}::${it.id}`)
                ? { ...it, archived: toArchived, status: toArchived ? '완료' : '대기' }
                : it,
            ),
          })),
        );
      }

      if (fsItems.length > 0) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
      setStatusMessage(
        toArchived
          ? `${items.length}개 항목을 보관함으로 옮겼습니다.`
          : `${items.length}개 항목을 대기 상태로 되돌렸습니다.`,
      );
    },
    [queryClient],
  );

  const deleteItems = useCallback(
    async (items: ArchiveItemDetail[]) => {
      const fsItems = items.filter((i) => !i.projectId.startsWith('sample-'));
      const sampleItems = items.filter((i) => i.projectId.startsWith('sample-'));

      for (const item of fsItems) {
        const handle = handleMapRef.current.get(item.projectId);
        if (!handle) continue;
        await deleteItemInFs(handle, item);
      }

      if (sampleItems.length > 0) {
        const keySet = new Set(sampleItems.map((i) => `${i.projectId}::${i.id}`));
        setSampleProjects((prev) =>
          prev.map((proj) => ({
            ...proj,
            items: proj.items.filter((it) => !keySet.has(`${proj.id}::${it.id}`)),
          })),
        );
      }

      if (fsItems.length > 0) {
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
      setStatusMessage(`${items.length}개 항목을 삭제했습니다.`);
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    setStatusMessage('프로젝트 기록을 새로 읽었습니다.');
  }, [queryClient]);

  return {
    projects,
    isLoading: fsQuery.isLoading,
    hasConnectedFs,
    showSample,
    setShowSample,
    permissionNeeded,
    statusMessage,
    supportsFs: supportsDirectoryPicker(),
    connectFolder,
    grantStoredPermission,
    disconnectProject,
    setItemsArchived,
    deleteItems,
    refresh,
  };
}
