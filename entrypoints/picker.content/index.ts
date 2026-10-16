import {
  buildSelector,
  elementsInRect,
  textsInRect,
  findBySelector,
  friendlyName,
  outerHtmlPreview,
  quoteFromSelection,
  tableSummary,
  truncate,
  visibleText,
} from '@/lib/dom';
import {
  BRIDGE_KEY,
  BridgeRequest,
  BridgeResponse,
  NetworkSnapshot,
  PickMode,
  TARGET_ATTR,
  ToContent,
  ToPanel,
} from '@/lib/messages';
import { currentRoute } from '@/lib/network';
import { ComponentInfo, Evidence, NetworkEntry } from '@/lib/types';
import { OVERLAY_CSS } from './style';

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_idle',
  main() {
    new Picker().init();
  },
});

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** isolated world → MAIN world 요청 */
function bridge<T>(req: Omit<BridgeRequest, 'key' | 'dir' | 'id'>, timeoutMs = 400): Promise<T | null> {
  return new Promise((resolve) => {
    const id = uid();
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const msg = ev.data as BridgeResponse;
      if (ev.source !== window || !msg || msg.key !== BRIDGE_KEY || msg.dir !== 'res' || msg.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      resolve(msg.data as T);
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ ...req, key: BRIDGE_KEY, dir: 'req', id }, location.origin);
  });
}

async function componentFor(el: Element): Promise<ComponentInfo | null> {
  const nonce = uid();
  el.setAttribute(TARGET_ATTR, nonce);
  try {
    // 첫 조회는 소스맵을 받아오느라 느릴 수 있다(이후 캐시)
    return await bridge<ComponentInfo>({ op: 'component', target: nonce } as never, 2000);
  } finally {
    el.removeAttribute(TARGET_ATTR);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: head.match(/data:(.*?);/)?.[1] ?? 'image/png' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

type Box = { left: number; top: number; width: number; height: number };

class Picker {
  private host!: HTMLElement;
  private root!: ShadowRoot;
  private box!: HTMLElement;
  private label!: HTMLElement;
  private toastEl!: HTMLElement;
  private chip!: HTMLButtonElement;
  private catcher!: HTMLElement;
  private dragRect!: HTMLElement;

  private mode: PickMode | null = null;
  private current: Element | null = null;
  private lastMouseTarget: Element | null = null;
  private downPath: Element[] = [];
  private labelCache = new WeakMap<Element, string>();
  private pendingQuote: { quote: NonNullable<ReturnType<typeof quoteFromSelection>>; rect: DOMRect; container: Element } | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private lastUrl = location.href;
  private busy = false;
  private pendingWarning: string | null = null;

  init() {
    this.mountUi();
    chrome.runtime.onMessage.addListener((msg: ToContent, _sender, sendResponse) => {
      switch (msg.type) {
        case 'bn:ping':
          sendResponse({ mode: this.mode, url: location.href });
          return;
        case 'bn:start':
          this.start(msg.mode);
          sendResponse({ ok: true });
          return;
        case 'bn:stop':
          this.stop();
          sendResponse({ ok: true });
          return;
        case 'bn:flash':
          sendResponse({ found: this.flash(msg.selector) });
          return;
        case 'bn:network':
          this.networkSnapshot().then(sendResponse);
          return true;
      }
    });

    // 단축키: Alt+Shift+E/T/R 로 모드 시작 (입력 중에는 무시)
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.isTyping(e)) return;
        if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) {
          if (e.code === 'KeyN') {
            e.preventDefault();
            this.captureNetwork();
            return;
          }
          const map: Record<string, PickMode> = { KeyE: 'element', KeyT: 'text', KeyR: 'region' };
          const m = map[e.code];
          if (m) {
            e.preventDefault();
            this.mode === m ? this.stop() : this.start(m);
          }
        }
      },
      true,
    );

    // SPA route 변경 감지 → 패널에 현재 URL을 알린다
    setInterval(() => {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        this.hello();
      }
    }, 400);
    this.hello();

    const loop = () => {
      if (this.current && this.mode === 'element') this.positionBox(this.current);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private hello() {
    this.send({ type: 'bn:hello', url: location.href }).catch(() => {});
  }

  private send(msg: ToPanel): Promise<unknown> {
    return chrome.runtime.sendMessage(msg);
  }

  private isTyping(e: Event): boolean {
    const t = (e.composedPath()[0] ?? e.target) as HTMLElement | null;
    if (!t || !(t instanceof HTMLElement)) return false;
    return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  }

  // ---------- UI ----------
  private mountUi() {
    this.host = document.createElement('bugnotes-overlay');
    this.host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `
      <style>${OVERLAY_CSS}</style>
      <div class="box" hidden></div>
      <div class="label" hidden></div>
      <div class="catcher" hidden><div class="drag" hidden></div></div>
      <button class="chip" hidden>+ 담기</button>
      <div class="toast" hidden></div>
    `;
    this.box = this.root.querySelector('.box')!;
    this.label = this.root.querySelector('.label')!;
    this.catcher = this.root.querySelector('.catcher')!;
    this.dragRect = this.root.querySelector('.drag')!;
    this.chip = this.root.querySelector('.chip')!;
    this.toastEl = this.root.querySelector('.toast')!;
    document.documentElement.appendChild(this.host);

    this.chip.addEventListener('mousedown', (e) => e.preventDefault());
    this.chip.addEventListener('click', () => this.captureText());
    this.catcher.addEventListener('mousedown', this.onDragStart);
  }

  private toast(text: string, kind: 'ok' | 'warn' = 'ok') {
    this.toastEl.textContent = text;
    this.toastEl.dataset.kind = kind;
    this.toastEl.hidden = false;
    clearTimeout((this.toastEl as unknown as { _t: number })._t);
    (this.toastEl as unknown as { _t: number })._t = window.setTimeout(() => (this.toastEl.hidden = true), 2200);
  }

  private positionBox(el: Element) {
    const r = el.getBoundingClientRect();
    Object.assign(this.box.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    const labelTop = r.top > 26 ? r.top - 24 : Math.min(r.bottom + 4, innerHeight - 24);
    Object.assign(this.label.style, { left: `${Math.max(0, Math.min(r.left, innerWidth - 320))}px`, top: `${labelTop}px` });
  }

  private async setCurrent(el: Element | null) {
    if (el === this.current) return;
    this.current = el;
    if (!el) {
      this.box.hidden = true;
      this.label.hidden = true;
      return;
    }
    this.box.hidden = false;
    this.label.hidden = false;
    this.positionBox(el);
    const r = el.getBoundingClientRect();
    const size = `${Math.round(r.width)}×${Math.round(r.height)}`;
    const base = friendlyName(el);
    const cached = this.labelCache.get(el);
    this.label.textContent = `${cached ?? `<${base}>`} · ${size}`;
    if (cached === undefined) {
      const comp = await componentFor(el);
      const text = comp && comp.chain.length ? `<${base}> in ${comp.chain.slice(0, 2).join(' › ')}` : `<${base}>`;
      this.labelCache.set(el, text);
      if (this.current === el) this.label.textContent = `${text} · ${size}`;
    }
  }

  // ---------- 모드 ----------
  start(mode: PickMode) {
    this.stop(false);
    this.mode = mode;
    if (mode === 'element') {
      for (const t of ['mousemove'] as const) window.addEventListener(t, this.onMove, true);
      for (const t of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu'] as const) {
        window.addEventListener(t, this.onBlock, true);
      }
      document.documentElement.style.cursor = 'crosshair';
    } else if (mode === 'text') {
      window.addEventListener('mouseup', this.onTextUp, true);
    } else {
      this.catcher.hidden = false;
    }
    window.addEventListener('keydown', this.onKey, true);
    this.send({ type: 'bn:mode', mode }).catch(() => {});
  }

  stop(notify = true) {
    if (!this.mode) return;
    window.removeEventListener('mousemove', this.onMove, true);
    for (const t of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu'] as const) {
      window.removeEventListener(t, this.onBlock, true);
    }
    window.removeEventListener('mouseup', this.onTextUp, true);
    window.removeEventListener('keydown', this.onKey, true);
    document.documentElement.style.cursor = '';
    this.catcher.hidden = true;
    this.dragRect.hidden = true;
    this.chip.hidden = true;
    this.pendingQuote = null;
    this.setCurrent(null);
    this.downPath = [];
    this.lastMouseTarget = null;
    this.mode = null;
    if (notify) this.send({ type: 'bn:mode', mode: null }).catch(() => {});
  }

  private targetFrom(e: Event): Element | null {
    const path = e.composedPath();
    if (path.includes(this.host)) return null;
    const t = path[0];
    return t instanceof Element ? t : null;
  }

  private onMove = (e: MouseEvent) => {
    const t = this.targetFrom(e);
    if (!t || t === this.lastMouseTarget) return;
    this.lastMouseTarget = t;
    this.downPath = [];
    this.setCurrent(t);
  };

  /**
   * 요소 모드에서는 앱이 클릭에 반응하지 않도록 포인터 이벤트를 막고, click에서 담는다.
   * (담기를 별도 click 리스너로 두면 여기의 stopImmediatePropagation에 막혀 실행되지 않는다)
   */
  private onBlock = (e: Event) => {
    if (e.composedPath().includes(this.host)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === 'click') {
      const t = this.current ?? this.targetFrom(e);
      if (t) this.captureElement(t);
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.stop();
      return;
    }
    if (this.mode !== 'element' || !this.current) return;
    const cur = this.current;
    let next: Element | null = null;
    switch (e.key) {
      case 'ArrowUp':
        if (cur.parentElement && cur.parentElement !== document.documentElement) {
          this.downPath.push(cur);
          next = cur.parentElement;
        }
        break;
      case 'ArrowDown': {
        const back = this.downPath.pop();
        next = back && cur.contains(back) ? back : cur.firstElementChild;
        break;
      }
      case 'ArrowLeft':
        next = cur.previousElementSibling;
        this.downPath = [];
        break;
      case 'ArrowRight':
        next = cur.nextElementSibling;
        this.downPath = [];
        break;
      case 'Enter':
        e.preventDefault();
        e.stopImmediatePropagation();
        this.captureElement(cur);
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (next && !this.host.contains(next)) this.setCurrent(next);
  };

  private onTextUp = (e: MouseEvent) => {
    if (e.composedPath().includes(this.host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const quote = sel ? quoteFromSelection(sel) : null;
      if (!sel || !quote) {
        this.chip.hidden = true;
        this.pendingQuote = null;
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const node = range.commonAncestorContainer;
      const container = (node.nodeType === 1 ? (node as Element) : node.parentElement)!;
      this.pendingQuote = { quote, rect, container };
      Object.assign(this.chip.style, {
        left: `${Math.min(rect.right + 6, innerWidth - 80)}px`,
        top: `${Math.max(4, rect.top - 30)}px`,
      });
      this.chip.hidden = false;
    }, 0);
  };

  private onDragStart = (e: MouseEvent) => {
    e.preventDefault();
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragRect.hidden = false;
    this.updateDrag(e);
    const move = (ev: MouseEvent) => this.updateDrag(ev);
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      const r = this.dragBox(ev);
      this.dragRect.hidden = true;
      this.dragStart = null;
      if (r.width >= 8 && r.height >= 8) this.captureRegion(r);
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  };

  private dragBox(e: MouseEvent): Box {
    const s = this.dragStart!;
    return {
      left: Math.min(s.x, e.clientX),
      top: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y),
    };
  }

  private updateDrag(e: MouseEvent) {
    const r = this.dragBox(e);
    Object.assign(this.dragRect.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    this.dragRect.dataset.size = `${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  // ---------- 캡처 ----------
  private base(kind: Evidence['kind']): Evidence {
    return {
      uid: uid(),
      kind,
      url: location.href,
      route: currentRoute(),
      capturedAt: Date.now(),
      viewportWidth: innerWidth,
      pageTitle: document.title,
      note: '',
    };
  }

  /** 오버레이를 숨기고 보이는 화면을 찍어 rect 주변만 잘라낸다. highlight가 있으면 테두리를 그린다 */
  private screenshotWarned = false;

  private async screenshot(rect: Box, highlight = true): Promise<string | undefined> {
    const prev = this.host.style.display;
    this.host.style.display = 'none';
    await nextFrame();
    await nextFrame();
    let res: { dataUrl?: string; error?: string } | undefined;
    try {
      res = await chrome.runtime.sendMessage({ type: 'bn:screenshot' });
    } finally {
      this.host.style.display = prev;
    }
    if (!res?.dataUrl) {
      if (res?.error && /activeTab|all_urls/.test(res.error) && !this.screenshotWarned) {
        this.screenshotWarned = true;
        this.pendingWarning = '스크린샷 없이 담았습니다. 툴바의 BugNotes 아이콘(Alt+Shift+B)을 한 번 누르면 이 탭에서 스크린샷이 켜집니다.';
      }
      return undefined;
    }
    const img = await createImageBitmap(dataUrlToBlob(res.dataUrl));
    const scale = img.width / innerWidth;
    const pad = 16;
    const x0 = Math.max(0, rect.left - pad);
    const y0 = Math.max(0, rect.top - pad);
    const x1 = Math.min(innerWidth, rect.left + rect.width + pad);
    const y1 = Math.min(innerHeight, rect.top + rect.height + pad);
    if (x1 <= x0 || y1 <= y0) return undefined;
    const sw = (x1 - x0) * scale;
    const sh = (y1 - y0) * scale;
    const out = Math.min(1, 1600 / sw);
    const canvas = new OffscreenCanvas(Math.round(sw * out), Math.round(sh * out));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, x0 * scale, y0 * scale, sw, sh, 0, 0, canvas.width, canvas.height);
    if (highlight) {
      const k = scale * out;
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(2, 2 * k);
      ctx.strokeRect((rect.left - x0) * k, (rect.top - y0) * k, rect.width * k, rect.height * k);
    }
    return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
  }

  /** 담은 결과는 사이드 패널에만 보여준다. 페이지에는 경고만 띄운다 */
  private async deliver(evidence: Evidence) {
    try {
      await this.send({ type: 'bn:captured', evidence });
      if (this.pendingWarning) {
        this.toast(this.pendingWarning, 'warn');
        this.pendingWarning = null;
      }
    } catch {
      this.toast('BugNotes 사이드 패널을 먼저 열어주세요', 'warn');
    }
  }

  private async describe(el: Element): Promise<Partial<Evidence>> {
    const table = tableSummary(el);
    const text = visibleText(el);
    const component = await componentFor(el);
    return {
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      label: friendlyName(el),
      text: truncate(text, table ? 300 : 500),
      html: outerHtmlPreview(el),
      table,
      component: component ?? undefined,
    };
  }

  private async captureElement(el: Element) {
    if (this.busy) return;
    this.busy = true;
    try {
      const info = await this.describe(el);
      const r = el.getBoundingClientRect();
      const ev: Evidence = { ...this.base(info.table ? 'container' : 'element'), ...info };
      ev.screenshot = await this.screenshot(r);
      await this.deliver(ev);
    } finally {
      this.busy = false;
    }
  }

  private async captureText() {
    const p = this.pendingQuote;
    if (!p || this.busy) return;
    this.busy = true;
    this.chip.hidden = true;
    try {
      const info = await this.describe(p.container);
      const ev: Evidence = {
        ...this.base('text'),
        selector: info.selector,
        tag: info.tag,
        label: info.label,
        component: info.component,
        quote: p.quote,
      };
      ev.screenshot = await this.screenshot(p.rect);
      await this.deliver(ev);
      window.getSelection()?.removeAllRanges();
    } finally {
      this.pendingQuote = null;
      this.busy = false;
    }
  }

  private async captureRegion(r: Box) {
    if (this.busy) return;
    this.busy = true;
    try {
      const ev: Evidence = {
        ...this.base('region'),
        rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
        children: elementsInRect(document, { x: r.left, y: r.top, width: r.width, height: r.height }, this.host),
        regionTexts: textsInRect(document, { x: r.left, y: r.top, width: r.width, height: r.height }, this.host),
      };
      this.catcher.hidden = true;
      ev.screenshot = await this.screenshot(r);
      this.catcher.hidden = this.mode !== 'region';
      await this.deliver(ev);
    } finally {
      this.busy = false;
    }
  }

  private async captureNetwork() {
    const snap = await this.networkSnapshot();
    if (snap.entries.length === 0) {
      this.toast('이 route에서 기록된 API 호출이 없습니다', 'warn');
      return;
    }
    await this.deliver({ ...this.base('network'), requests: snap.entries });
  }

  private async networkSnapshot(): Promise<NetworkSnapshot> {
    const route = currentRoute();
    const entries = (await bridge<NetworkEntry[]>({ op: 'network', route } as never)) ?? [];
    return { url: location.href, route, viewportWidth: innerWidth, entries };
  }

  // ---------- 강조 ([페이지로 이동]) ----------
  private pulse(r: Box) {
    const el = document.createElement('div');
    el.className = 'pulse';
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  private flash(selector: string): boolean {
    const el = findBySelector(document, selector);
    if (!el) {
      this.toast('이 페이지에서 요소를 찾지 못했습니다', 'warn');
      return false;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => this.pulse(el.getBoundingClientRect()), 450);
    return true;
  }
}
