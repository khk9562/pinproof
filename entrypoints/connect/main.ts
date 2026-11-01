import '@/lib/tokens.css';
import { connectFolder } from '@/lib/connect';
import type { SetupAnswer, SetupPrompt } from '@/lib/connect';
import { applyTheme, loadTheme } from '@/lib/theme';
import { registerFonts } from '@/lib/fonts';

/** 사이드 패널에서 폴더 선택 창이 막히는 환경을 위한 대체 페이지(같은 익스텐션 origin이라 IndexedDB 공유) */
const origin = new URLSearchParams(location.search).get('origin') ?? '';
document.getElementById('origin')!.textContent = origin;
const status = document.getElementById('status')!;
registerFonts();
loadTheme().then((p) => applyTheme(document.documentElement, p));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** 폴더 연결 확인 창(사이드 패널의 확인 창과 같은 내용). 취소 · Esc 면 null */
function ask(prompt: SetupPrompt): Promise<SetupAnswer> {
  const dialog = $<HTMLDialogElement>('setup');
  const list = (el: HTMLElement, lines: string[]) =>
    el.replaceChildren(
      ...lines.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        if (t.startsWith('(')) li.className = 'muted';
        return li;
      }),
    );
  $('setup-title').textContent = `"${prompt.folder}" 폴더 연결`;
  list($('setup-items'), prompt.items);
  const check = $<HTMLInputElement>('skill-check');
  check.checked = false;
  $('setup-skill').hidden = !prompt.skill;
  if (prompt.skill) {
    $('skill-name').textContent = `/${prompt.skill.name}`;
    $('skill-note').textContent = prompt.skill.note;
  }
  return new Promise((resolve) => {
    const done = (a: SetupAnswer) => {
      dialog.close();
      resolve(a);
    };
    $('setup-ok').onclick = () => done({ skill: !!prompt.skill && check.checked });
    $('setup-cancel').onclick = () => done(null);
    dialog.oncancel = (e) => {
      e.preventDefault();
      done(null);
    };
    dialog.showModal();
  });
}

document.getElementById('pick')!.addEventListener('click', async () => {
  try {
    const root = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
      mode: 'readwrite',
      id: 'pinproof-project',
    });
    const ok = await connectFolder(origin, root, ask);
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
