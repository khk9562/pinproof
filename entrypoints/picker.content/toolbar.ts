import { OverlayState, PickMode } from '@/lib/messages';
import { ICON, PIN_LOGO } from './icons';

const MODE_NAME: Record<PickMode, string> = { element: '요소', text: '텍스트', region: '영역' };
const MODE_HINT: Record<PickMode, string> = {
  element: '클릭해서 담기<span class="dot3"></span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 이동',
  text: '글자를 드래그해서 담기',
  region: '사각형을 그려서 담기',
};

export interface ToolbarHandlers {
  onMode: (mode: PickMode) => void;
  onNetwork: () => void;
  onToggleMarkers: () => void;
  onStop: () => void;
}

type Pos = { right: number; top: number };
const EDGE = 8;

/**
 * 페이지 오른쪽 위에 뜨는 플로팅 툴바. 사이드 패널이 열려 있을 때만 보인다.
 * 잡아 끌어 옮길 수 있고 위치는 앱(origin)별로 기억한다. 모드에 들어가면 안내 띠로 바뀐다.
 */
export class Toolbar {
  readonly el: HTMLElement;
  private swap: HTMLElement;
  private tools: HTMLElement;
  private guide: HTMLElement;
  private rec: HTMLElement;
  private logo: HTMLElement;
  private eye: HTMLButtonElement;
  private pos: Pos = { right: 24, top: 24 };
  private readonly key = `toolbarPos:${location.origin}`;
  private count: number | null = null;
  private hideTimer: number | undefined;
  private suppressClick = false;

  constructor(root: ShadowRoot, private h: ToolbarHandlers) {
    this.el = document.createElement('div');
    this.el.className = 'tb';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', 'PinProof 도구');
    this.el.hidden = true;
    this.el.innerHTML = `
      <span class="grip" title="잡아 끌어 옮기기">${ICON.grip}</span>
      <span class="logo" title="PinProof">${PIN_LOGO}</span>
      <div class="swap">
        <div class="tools">
          <button class="tbtn" data-mode="element" title="요소 담기 (Alt+Shift+E)">${ICON.element}요소</button>
          <button class="tbtn" data-mode="text" title="텍스트 담기 (Alt+Shift+T)">${ICON.text}텍스트</button>
          <button class="tbtn" data-mode="region" title="영역 담기 (Alt+Shift+R)">${ICON.region}영역</button>
          <button class="tbtn" data-act="network" title="이 route의 API 호출 담기 (Alt+Shift+N)">${ICON.network}네트워크</button>
          <span class="vsep"></span>
          <button class="tbtn icon" data-act="markers" aria-pressed="false" title="마커 숨기기 (Alt+Shift+H)" aria-label="마커 숨기기">${ICON.eye}</button>
        </div>
        <div class="guide" aria-live="polite"></div>
      </div>
      <span class="rec"></span>
    `;
    this.swap = this.el.querySelector('.swap')!;
    this.tools = this.el.querySelector('.tools')!;
    this.guide = this.el.querySelector('.guide')!;
    this.rec = this.el.querySelector('.rec')!;
    this.logo = this.el.querySelector('.logo')!;
    this.eye = this.el.querySelector('[data-act="markers"]')!;
    root.appendChild(this.el);

    this.el.addEventListener('click', this.onClick, true);
    this.el.addEventListener('mousedown', this.onDragStart);
    window.addEventListener('resize', () => this.place());
    chrome.storage.local
      .get(this.key)
      .then((v) => {
        const p = v[this.key] as Pos | undefined;
        if (p && typeof p.right === 'number' && typeof p.top === 'number') this.pos = p;
        this.place();
      })
      .catch(() => {});
    this.place();
  }

  show() {
    window.clearTimeout(this.hideTimer);
    if (!this.el.hidden && !this.el.classList.contains('leave')) return;
    this.el.classList.remove('leave');
    this.el.hidden = false;
    // 등장 애니메이션을 처음부터 다시
    this.el.style.animation = 'none';
    void this.el.offsetWidth;
    this.el.style.animation = '';
    this.fitSwap();
    this.place();
  }

  hide() {
    if (this.el.hidden) return;
    this.el.classList.add('leave');
    this.hideTimer = window.setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('leave');
    }, 200);
  }

  setMode(mode: PickMode | null) {
    if (mode) {
      this.guide.innerHTML =
        `<span class="mode-name">${MODE_NAME[mode]}</span><span class="dot3"></span>` +
        `<span class="hint">${MODE_HINT[mode]}</span><span class="dot3"></span>` +
        `<button class="hint stop tbtn" data-act="stop" title="모드 종료 (Esc)"><kbd>Esc</kbd> 종료</button>`;
    }
    this.el.classList.toggle('mode', !!mode);
    this.fitSwap();
  }

  setMarkersHidden(hidden: boolean) {
    this.eye.setAttribute('aria-pressed', String(hidden));
    this.eye.innerHTML = hidden ? ICON.eyeOff : ICON.eye;
    this.eye.title = hidden ? '마커 보이기 (Alt+Shift+H)' : '마커 숨기기 (Alt+Shift+H)';
  }

  setState(state: OverlayState) {
    const r = state.record;
    const count = r ? r.count : state.inboxCount;
    const grew = this.count !== null && count > this.count && !this.el.hidden;
    const prev = this.count;
    this.count = count;
    this.rec.classList.toggle('loose', !r);
    this.rec.title = r ? `작성 중인 기록 #${String(r.id).padStart(3, '0')} ${r.title}` : '작성 중인 기록이 없어 담는 증거는 미분류로 갑니다';
    const head = r ? `<b>#${String(r.id).padStart(3, '0')}</b>작성 중 · ` : '미분류 · ';
    this.rec.innerHTML = `${head}<span class="n"><i>${count}</i></span>`;
    if (grew) {
      const n = this.rec.querySelector('.n')!;
      n.innerHTML = `<span class="roll" style="display:block"><i>${prev}</i><i>${count}</i></span>`;
      window.setTimeout(() => (n.innerHTML = `<i>${count}</i>`), 220);
      this.logo.classList.remove('bump');
      void this.logo.offsetWidth;
      this.logo.classList.add('bump');
    }
    this.place();
  }

  /** 버튼 묶음과 안내 띠 중 보이는 쪽의 폭에 맞춘다(폭 전환 애니메이션의 목표값) */
  private fitSwap() {
    const w = this.el.classList.contains('mode') ? this.guide.scrollWidth : this.tools.scrollWidth;
    this.swap.style.width = `${w}px`;
    window.setTimeout(() => this.place(), 520);
  }

  private onClick = (e: MouseEvent) => {
    if (this.suppressClick) {
      this.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    const btn = (e.target as Element).closest('button');
    if (!btn) return;
    const mode = btn.getAttribute('data-mode') as PickMode | null;
    const act = btn.getAttribute('data-act');
    if (mode) this.h.onMode(mode);
    else if (act === 'network') this.h.onNetwork();
    else if (act === 'markers') this.h.onToggleMarkers();
    else if (act === 'stop') this.h.onStop();
  };

  // ---------- 위치 ----------
  private place() {
    const w = this.el.offsetWidth || 400;
    const h = this.el.offsetHeight || 40;
    const right = Math.min(Math.max(EDGE, this.pos.right), Math.max(EDGE, innerWidth - w - EDGE));
    const top = Math.min(Math.max(EDGE, this.pos.top), Math.max(EDGE, innerHeight - h - EDGE));
    this.el.style.right = `${right}px`;
    this.el.style.top = `${top}px`;
  }

  private onDragStart = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, right: parseFloat(this.el.style.right), top: parseFloat(this.el.style.top) };
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      this.el.classList.add('dragging');
      this.pos = { right: start.right - dx, top: start.top + dy };
      this.place();
    };
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      this.el.classList.remove('dragging');
      if (!moved) return;
      this.suppressClick = true;
      window.setTimeout(() => (this.suppressClick = false), 0);
      this.pos = { right: parseFloat(this.el.style.right), top: parseFloat(this.el.style.top) };
      chrome.storage.local.set({ [this.key]: this.pos }).catch(() => {});
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  };
}
