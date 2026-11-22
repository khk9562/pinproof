import { findBySelector } from '@/lib/dom';
import { MarkerInfo } from '@/lib/messages';
import { pagePath } from '@/lib/markdown';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Item = { m: MarkerInfo; el: HTMLButtonElement; target: Element | null; lastFind: number; x: number; y: number };

/** 요소를 다시 찾는 간격(프레임워크가 다시 그려 요소가 바뀐 경우) */
const REFIND_MS = 500;

/**
 * 담은 항목을 요소 위 테두리에 번호 마커로 보여준다.
 * 지금 주소(경로 + ?쿼리 + #해시)에서 담은 증거만, 요소가 화면에 있을 때만 보인다. 매 프레임 tick() 으로 위치를 맞춘다.
 */
export class Markers {
  readonly layer: HTMLElement;
  private items = new Map<string, Item>();

  constructor(
    root: ShadowRoot,
    private onPick: (m: MarkerInfo, pin: HTMLElement) => void,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'pins';
    root.appendChild(this.layer);
  }

  /** 상태가 바뀔 때마다 통째로 받는다. dropUid 는 방금 담은 증거(꽂힘 애니메이션) */
  set(markers: MarkerInfo[], dropUid: string | null) {
    const next = new Set(markers.map((m) => m.uid));
    for (const [uid, it] of this.items) {
      if (next.has(uid)) continue;
      this.items.delete(uid);
      this.leave(it.el);
    }
    for (const m of markers) {
      const it = this.items.get(m.uid);
      if (it) {
        const moved = it.m.selector !== m.selector;
        it.m = m;
        if (moved) it.target = null;
        this.render(it);
        continue;
      }
      const el = document.createElement('button');
      el.className = 'pin';
      el.hidden = true;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const cur = this.items.get(m.uid);
        if (cur) this.onPick(cur.m, el);
      });
      const item: Item = { m, el, target: null, lastFind: 0, x: NaN, y: NaN };
      this.items.set(m.uid, item);
      this.render(item);
      this.layer.appendChild(el);
      if (m.uid === dropUid) {
        el.classList.add('drop');
        window.setTimeout(() => el.classList.remove('drop'), 650);
      }
    }
  }

  clear() {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
  }

  setHidden(hidden: boolean) {
    this.layer.classList.toggle('off', hidden);
  }

  /** 마커 자리(화면 좌표). 화면에 없으면 null */
  pointOf(uid: string): { x: number; y: number; target: Element | null } | null {
    const it = this.items.get(uid);
    if (!it || it.el.hidden) return null;
    return { x: it.x, y: it.y, target: it.target };
  }

  /** 그 증거의 요소(region 이면 null) */
  elementOf(uid: string): Element | null {
    const it = this.items.get(uid);
    if (!it || !it.m.selector || it.m.kind === 'region') return null;
    return this.find(it);
  }

  setEditing(uid: string | null) {
    for (const [id, it] of this.items) it.el.classList.toggle('editing', id === uid);
  }

  /** 패널 목록에서 고른 마커: 펄스 3회 + 남색 링 */
  target(uid: string): boolean {
    const it = this.items.get(uid);
    if (!it) return false;
    it.el.classList.remove('target');
    void it.el.offsetWidth;
    it.el.classList.add('target');
    window.setTimeout(() => it.el.classList.remove('target'), 1900);
    return true;
  }

  /** 증거의 마커 자리를 계산한다(화면 좌표) */
  locate(m: MarkerInfo, target: Element | null): { x: number; y: number } | null {
    if (m.kind === 'region') {
      if (!m.anchor) return null;
      return { x: m.anchor.x - scrollX, y: m.anchor.y - scrollY };
    }
    if (!target) return null;
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + Math.min(1, Math.max(0, m.anchor?.x ?? 0.5)) * r.width, y: r.top };
  }

  tick() {
    const page = pagePath(location.href);
    for (const it of this.items.values()) {
      const here = it.m.page === page;
      const target = here && it.m.kind !== 'region' ? this.find(it) : null;
      const p = here ? this.locate(it.m, target) : null;
      const visible = !!p && p.y > -12 && p.y < innerHeight + 12 && p.x > -12 && p.x < innerWidth + 12;
      if (it.el.hidden === visible) it.el.hidden = !visible;
      if (!visible || !p) continue;
      if (p.x !== it.x || p.y !== it.y) {
        it.x = p.x;
        it.y = p.y;
        it.el.style.left = `${p.x}px`;
        it.el.style.top = `${p.y}px`;
      }
    }
  }

  private find(it: Item): Element | null {
    if (it.target?.isConnected) return it.target;
    const now = performance.now();
    if (now - it.lastFind < REFIND_MS) return null;
    it.lastFind = now;
    it.target = it.m.selector ? findBySelector(document, it.m.selector) : null;
    return it.target;
  }

  private render(it: Item) {
    const m = it.m;
    const id = `#${String(m.num).padStart(3, '0')}`;
    it.el.setAttribute('aria-label', `항목 ${id} 편집`);
    const note = m.note ? esc(m.note) : '<span class="none">메모 없음</span>';
    it.el.innerHTML = `${m.num}<span class="tip">${id} ${esc(m.category)} · ${note}</span>`;
  }

  private leave(el: HTMLElement) {
    if (el.hidden) {
      el.remove();
      return;
    }
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 180);
  }
}
