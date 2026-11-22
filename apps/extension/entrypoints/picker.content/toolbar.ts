import { OverlayState, PickMode } from '@/lib/messages';
import { ICON, PIN_LOGO } from './icons';

const MODE_NAME: Record<PickMode, string> = { element: '요소', text: '텍스트', region: '영역' };
/** 모드 중 안내 띠의 모드 이름을 누르면 여는 선택 메뉴 항목 */
const MENU: { pick: PickMode | 'network'; name: string; key: string }[] = [
  { pick: 'element', name: '요소', key: '⌥⇧E' },
  { pick: 'text', name: '텍스트', key: '⌥⇧T' },
  { pick: 'region', name: '영역', key: '⌥⇧R' },
  { pick: 'network', name: '네트워크 담기', key: '⌥⇧N' },
];
const CHEVRON = '<svg class="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 6.5L5 4l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MODE_HINT: Record<PickMode, string> = {
  element: '클릭해서 담기<span class="dot3"></span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> 이동<span class="dot3"></span><kbd>Alt</kbd> 누르는 동안 페이지 조작',
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
/** 드래그한 적이 없을 때 기본 위치: 화면 아래 가운데, 아래에서 이만큼 */
const BOTTOM_GAP = 24;

/**
 * 페이지 아래 가운데에 뜨는 플로팅 툴바. 사이드 패널이 열려 있을 때만 보인다.
 * 잡아 끌어 옮길 수 있고 위치는 앱(origin)별로 기억한다. 모드에 들어가면 안내 띠로 바뀐다.
 */
export class Toolbar {
  readonly el: HTMLElement;
  private swap: HTMLElement;
  private tools: HTMLElement;
  private guide: HTMLElement;
  private logo: HTMLElement;
  private eye: HTMLButtonElement;
  /** 드래그해서 옮긴 위치. 없으면 아래 가운데(기본) */
  private pos: Pos | null = null;
  private readonly key = `toolbarPos:${location.origin}`;
  /** 마커 수. 늘면(방금 담음) 압정 로고를 한 번 튕긴다 */
  private count: number | null = null;
  private hideTimer: number | undefined;
  private suppressClick = false;
  private mode: PickMode | null = null;
  private menu: HTMLElement;
  /** 메뉴가 열린 동안 페이지를 덮어, 바깥을 눌러도 요소가 담기지 않고 메뉴만 닫히게 한다 */
  private shield: HTMLElement;

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
          <button class="tbtn" data-mode="element" title="요소 담기 (Alt+Shift+E) · 선택 중 Alt를 누르면 페이지 조작">${ICON.element}요소</button>
          <button class="tbtn" data-mode="text" title="텍스트 담기 (Alt+Shift+T)">${ICON.text}텍스트</button>
          <button class="tbtn" data-mode="region" title="영역 담기 (Alt+Shift+R)">${ICON.region}영역</button>
          <button class="tbtn" data-act="network" title="이 route의 API 호출 담기 (Alt+Shift+N)">${ICON.network}네트워크</button>
          <span class="vsep"></span>
          <button class="tbtn icon" data-act="markers" aria-pressed="false" title="마커 숨기기 (Alt+Shift+H)" aria-label="마커 숨기기">${ICON.eye}</button>
        </div>
        <div class="guide" aria-live="polite"></div>
      </div>
    `;
    this.swap = this.el.querySelector('.swap')!;
    this.tools = this.el.querySelector('.tools')!;
    this.guide = this.el.querySelector('.guide')!;
    this.logo = this.el.querySelector('.logo')!;
    this.eye = this.el.querySelector('[data-act="markers"]')!;
    this.menu = document.createElement('div');
    this.menu.className = 'mode-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.hidden = true;
    this.el.appendChild(this.menu);
    this.shield = document.createElement('div');
    this.shield.style.cssText = 'position:fixed;inset:0;pointer-events:auto;';
    this.shield.hidden = true;
    this.shield.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.closeMenu();
    });
    root.appendChild(this.shield);
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
    this.closeMenu();
    this.mode = mode;
    if (mode) {
      this.guide.innerHTML =
        `<button class="mode-name" data-act="menu" aria-haspopup="menu" aria-expanded="false" title="다른 모드로 바꾸기">${MODE_NAME[mode]}${CHEVRON}</button><span class="dot3"></span>` +
        `<span class="hint">${MODE_HINT[mode]}</span><span class="dot3"></span>` +
        `<button class="hint stop tbtn" data-act="stop" title="모드 종료 (Esc)"><kbd>Esc</kbd> 종료</button>`;
    }
    this.el.classList.toggle('mode', !!mode);
    this.fitSwap();
  }

  setPageInteraction(active: boolean) {
    if (this.mode !== 'element') return;
    this.guide.querySelector('.hint')!.innerHTML = active ? '페이지 조작 중<span class="dot3"></span><kbd>Alt</kbd>를 놓으면 요소 선택' : MODE_HINT.element;
    this.fitSwap();
  }

  setMarkersHidden(hidden: boolean) {
    this.eye.setAttribute('aria-pressed', String(hidden));
    this.eye.innerHTML = hidden ? ICON.eyeOff : ICON.eye;
    this.eye.title = hidden ? '마커 보이기 (Alt+Shift+H)' : '마커 숨기기 (Alt+Shift+H)';
  }

  setState(state: OverlayState) {
    const count = state.markers.length;
    const grew = this.count !== null && count > this.count && !this.el.hidden;
    this.count = count;
    if (grew) {
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
    const pick = btn.getAttribute('data-pick') as PickMode | 'network' | null;
    if (pick) {
      this.closeMenu();
      if (pick === 'network') this.h.onNetwork();
      else if (pick !== this.mode) this.h.onMode(pick); // 다른 모드로 바로 전환(지금 모드를 고르면 그대로)
      return;
    }
    if (act === 'menu') {
      if (this.menu.hidden) this.openMenu(btn);
      else this.closeMenu();
      return;
    }
    if (mode) this.h.onMode(mode);
    else if (act === 'network') this.h.onNetwork();
    else if (act === 'markers') this.h.onToggleMarkers();
    else if (act === 'stop') this.h.onStop();
  };

  // ---------- 모드 선택 메뉴 ----------
  /** 툴바가 화면 아래쪽이면 위로, 위쪽으로 옮겨 두었으면 아래로 연다 */
  private openMenu(anchor: HTMLElement) {
    const cur = this.mode;
    this.menu.innerHTML = MENU.map(
      (m) =>
        `<button class="mode-item" role="menuitemradio" data-pick="${m.pick}" aria-checked="${m.pick === cur}">` +
        `${m.pick === 'network' ? ICON.network : ICON[m.pick]}<span>${m.name}</span><span class="sp"></span><kbd>${m.key}</kbd></button>`,
    ).join('');
    const tb = this.el.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    this.menu.classList.toggle('down', tb.top < 220);
    this.menu.style.left = `${Math.max(0, a.left - tb.left - 4)}px`;
    this.menu.hidden = false;
    this.shield.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    this.menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  get menuOpen(): boolean {
    return !this.menu.hidden;
  }

  /** 열려 있었으면 닫고 true. 모드 중 Esc 를 먼저 여기서 받는다 */
  closeMenu(): boolean {
    if (this.menu.hidden) return false;
    this.menu.hidden = true;
    this.shield.hidden = true;
    this.guide.querySelector('[data-act="menu"]')?.setAttribute('aria-expanded', 'false');
    return true;
  }

  // ---------- 위치 ----------
  private place() {
    const s = this.el.style;
    if (!this.pos) {
      // 기본: 아래 가운데. translate 로 가운데를 잡아 모드 전환으로 폭이 바뀌어도 가운데를 지킨다
      Object.assign(s, { left: '50%', right: 'auto', top: 'auto', bottom: `${BOTTOM_GAP}px`, translate: '-50% 0' });
      return;
    }
    const w = this.el.offsetWidth || 400;
    const h = this.el.offsetHeight || 40;
    const right = Math.min(Math.max(EDGE, this.pos.right), Math.max(EDGE, innerWidth - w - EDGE));
    const top = Math.min(Math.max(EDGE, this.pos.top), Math.max(EDGE, innerHeight - h - EDGE));
    Object.assign(s, { left: 'auto', bottom: 'auto', translate: 'none', right: `${right}px`, top: `${top}px` });
  }

  private onDragStart = (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('button, .mode-menu')) return;
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, right: innerWidth - r.right, top: r.top };
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
