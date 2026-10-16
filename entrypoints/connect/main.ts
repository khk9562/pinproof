import { connectFolder } from '@/lib/connect';

/** 사이드 패널에서 폴더 선택 창이 막히는 환경을 위한 대체 페이지(같은 익스텐션 origin이라 IndexedDB 공유) */
const origin = new URLSearchParams(location.search).get('origin') ?? '';
document.getElementById('origin')!.textContent = origin;
const status = document.getElementById('status')!;

document.getElementById('pick')!.addEventListener('click', async () => {
  try {
    const root = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
      mode: 'readwrite',
      id: 'pinproof-project',
    });
    const ok = await connectFolder(origin, root, (items, folder) =>
      window.confirm(`"${folder}" 폴더에 다음 작업을 합니다.\n\n- ${items.join('\n- ')}\n\n계속할까요?`),
    );
    if (!ok) {
      status.textContent = '취소했습니다.';
      return;
    }
    await chrome.storage.local.set({ lastConnected: { origin, at: Date.now() } });
    status.textContent = `"${root.name}" 폴더에 연결했습니다. 이 탭은 닫아도 됩니다.`;
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') status.textContent = `연결 실패: ${String(e)}`;
  }
});
