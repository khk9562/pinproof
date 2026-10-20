import { MarkerInfo } from '@/lib/messages';
import { ICON } from './icons';

export type Box = { left: number; top: number; width: number; height: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface PopoverHead {
  /** 요소 이름 (예: `<td>`), 없으면 생략 */
  name?: string;
  /** 따옴표로 보여줄 글자 (요소 텍스트·담은 글자) */
  quote?: string;
  /** 컴포넌트 체인 (예: NodeRow › NodeListTable) */
  meta?: string;
  /** 소스 위치 또는 selector */
  src?: string;
}

export interface NewOptions {
  head: PopoverHead;
  /** 담길 곳: 지금 카테고리와 붙을 번호. null 이면 폴더 미연결 */
  to: { category: string; num: number } | null;
  /** 팝오버를 붙일 가로 위치(클릭 x) */
  x: number;
  /** 대상 영역(선택 강조·팝오버 위/아래 배치 기준) */
  target: Box;
  /** 대상 요소가 있으면 스크롤해도 선택 강조가 따라간다 */
  el?: Element;
  /** 임시 마커를 세울 자리 */
  pin?: { x: number; y: number };
  onSubmit: (note: string) => void;
  onCancel: () => void;
}

export interface EditOptions {
  marker: MarkerInfo;
  x: number;
  target: Box;
  onSave: (note: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * 고른 자리 바로 옆에 뜨는 메모 팝오버. 화면 전체에 투명한 막을 깔아 바깥을 누르면 취소한다.
 * Enter=담기(저장), Esc=취소. 한글 조합 중 Enter 는 무시한다.
 */
export class Popover {
  private shield: HTMLElement;
  private card: HTMLElement | null = null;
  private sel: HTMLElement;
  private pin: HTMLElement;
  private trackEl: Element | null = null;
  private cancelFn: (() => void) | null = null;

  constructor(private root: ShadowRoot) {
    this.shield = document.createElement('div');
    this.shield.style.cssText = 'position:fixed;inset:0;pointer-events:auto;';
    this.shield.hidden = true;
    this.shield.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.cancel();
    });
    this.sel = document.createElement('div');
    this.sel.className = 'sel';
    this.sel.hidden = true;
    this.pin = document.createElement('div');
    this.pin.className = 'pin temp';
    this.pin.hidden = true;
    root.append(this.shield, this.sel, this.pin);
  }

  get isOpen() {
    return this.card !== null;
  }

  openNew(o: NewOptions) {
    this.close(false);
    const to = o.to
      ? `<span class="p-to" title="&quot;${esc(o.to.category)}&quot;에 #${pad(o.to.num)} 로 담깁니다"><span class="lt temp">${o.to.num}</span><span class="p-cat">${esc(o.to.category)}</span></span>`
      : '<span class="p-to loose" title="사이드 패널에서 프로젝트 폴더를 연결하면 담을 수 있습니다">폴더 미연결</span>';
    const card = this.build(
      'pop',
      '항목 담기',
      `<div class="p-head"><div class="who">${headHtml(o.head, to)}</div></div>
       <div class="field">
         <textarea rows="1" maxlength="1000" placeholder="한 줄 메모 (선택)"></textarea>
         <div class="field-foot"><span class="sp"></span><kbd>Enter</kbd> 담기<span class="dot3"></span><kbd>Esc</kbd> 취소</div>
       </div>
       <div class="p-foot">
         <span class="vw" title="담을 때의 창 폭">${ICON.monitor}${innerWidth}w</span>
         <span class="sp"></span>
         <button class="btn-ghost" data-act="cancel">취소</button>
         <button class="btn-main" data-act="ok">담기</button>
       </div>`,
    );
    const ta = card.querySelector('textarea')!;
    const submit = () => {
      const note = ta.value.replace(/\s*\n\s*/g, ' ').trim();
      this.close(true);
      o.onSubmit(note);
    };
    this.cancelFn = () => {
      this.close(true);
      o.onCancel();
    };
    this.wire(card, ta, submit, { ok: submit, cancel: () => this.cancel() });
    this.showTarget(o.target, o.el);
    if (o.pin) {
      this.pin.textContent = o.to ? String(o.to.num) : '';
      this.pin.classList.toggle('loose', !o.to);
      Object.assign(this.pin.style, { left: `${o.pin.x}px`, top: `${o.pin.y}px` });
      this.pin.hidden = false;
    }
    this.mount(card, o.x, o.target);
    ta.focus();
  }

  openEdit(o: EditOptions) {
    this.close(false);
    const m = o.marker;
    const badge = `<span class="lt">${m.num}</span>`;
    const cat = `<span class="p-to plain" title="카테고리는 사이드 패널에서 바꿉니다"><span class="p-cat">${esc(m.category)}</span></span>`;
    const card = this.build(
      'pop edit',
      `항목 #${pad(m.num)} 편집`,
      `<div class="p-head">${badge}<div class="who">${headHtml(headOf(m), cat)}</div></div>
       <div class="field"><textarea rows="1" maxlength="1000" placeholder="한 줄 메모 (선택)"></textarea></div>
       <div class="p-foot">
         <button class="btn-del" data-act="delete" title="이 항목 삭제">${ICON.trash}삭제</button>
         <span class="sp"></span>
         <button class="btn-main" data-act="ok" disabled title="바뀐 내용이 없습니다">저장</button>
       </div>`,
    );
    const ta = card.querySelector('textarea')!;
    ta.value = m.note;
    const ok = card.querySelector<HTMLButtonElement>('[data-act="ok"]')!;
    ta.addEventListener('input', () => {
      const changed = ta.value.trim() !== m.note.trim();
      ok.disabled = !changed;
      ok.title = changed ? '' : '바뀐 내용이 없습니다';
    });
    const save = () => {
      const note = ta.value.replace(/\s*\n\s*/g, ' ').trim();
      this.close(true);
      if (note !== m.note.trim()) o.onSave(note);
      o.onClose();
    };
    this.cancelFn = () => {
      this.close(true);
      o.onClose();
    };
    this.wire(card, ta, save, {
      ok: save,
      delete: () => {
        this.close(true);
        o.onDelete();
        o.onClose();
      },
    });
    this.showTarget(o.target);
    this.mount(card, o.x, o.target);
    ta.focus();
    ta.select();
  }

  cancel() {
    const fn = this.cancelFn;
    if (fn) fn();
    else this.close(true);
  }

  close(animate: boolean) {
    this.cancelFn = null;
    this.trackEl = null;
    this.shield.hidden = true;
    this.sel.hidden = true;
    this.pin.hidden = true;
    const card = this.card;
    this.card = null;
    if (!card) return;
    // 사라지는 동안에도 입력란에 포커스가 남으면 바로 누른 Esc·단축키가 "입력 중"으로 무시된다
    (this.root.activeElement as HTMLElement | null)?.blur();
    if (animate) {
      card.classList.add('out');
      window.setTimeout(() => card.remove(), 120);
    } else card.remove();
  }

  /** 대상 요소가 스크롤로 움직이면 선택 강조를 따라 옮긴다(매 프레임) */
  tick() {
    if (!this.trackEl || this.sel.hidden) return;
    if (!this.trackEl.isConnected) return;
    const r = this.trackEl.getBoundingClientRect();
    this.placeSel({ left: r.left, top: r.top, width: r.width, height: r.height });
  }

  private build(cls: string, label: string, body: string): HTMLElement {
    const card = document.createElement('div');
    card.className = cls;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', label);
    card.innerHTML = `<button class="handle" aria-label="팝오버 옮기기" tabindex="-1"></button>${body}`;
    card.querySelector('.handle')!.addEventListener('mousedown', (e) => this.dragCard(card, e as MouseEvent));
    return card;
  }

  private wire(card: HTMLElement, ta: HTMLTextAreaElement, submit: () => void, acts: Record<string, () => void>) {
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
      }
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.cancel();
      }
    });
    card.addEventListener('click', (e) => {
      const act = (e.target as Element).closest('[data-act]')?.getAttribute('data-act');
      if (act && acts[act]) acts[act]();
      else if (act === 'cancel') this.cancel();
    });
  }

  private showTarget(target: Box, el?: Element) {
    this.trackEl = el ?? null;
    this.placeSel(target);
    this.sel.hidden = false;
  }

  private placeSel(b: Box) {
    Object.assign(this.sel.style, { left: `${b.left - 2}px`, top: `${b.top - 2}px`, width: `${b.width + 4}px`, height: `${b.height + 4}px` });
  }

  /** 클릭 x 를 가운데로, 대상 아래 10px. 아래가 모자라면 위로, 그래도 안 되면 화면 아래에 붙인다 */
  private mount(card: HTMLElement, x: number, target: Box) {
    this.shield.hidden = false;
    card.style.visibility = 'hidden';
    this.root.appendChild(card);
    this.card = card;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const left = Math.min(Math.max(10, x - w / 2), innerWidth - w - 10);
    const below = target.top + target.height + 10;
    const above = target.top - h - 10;
    const top = below + h <= innerHeight - 10 ? below : above >= 10 ? above : Math.max(10, innerHeight - h - 10);
    Object.assign(card.style, { left: `${left}px`, top: `${top}px`, visibility: '' });
  }

  private dragCard(card: HTMLElement, e: MouseEvent) {
    e.preventDefault();
    const sx = e.clientX - card.offsetLeft;
    const sy = e.clientY - card.offsetTop;
    const move = (ev: MouseEvent) => {
      card.style.left = `${Math.min(Math.max(0, ev.clientX - sx), innerWidth - card.offsetWidth)}px`;
      card.style.top = `${Math.min(Math.max(0, ev.clientY - sy), innerHeight - card.offsetHeight)}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  }
}

function pad(n: number) {
  return String(n).padStart(3, '0');
}

function headHtml(h: PopoverHead, right: string): string {
  const name = h.name ? esc(h.name) : '';
  const quote = h.quote ? ` <span class="q">"${esc(h.quote)}"</span>` : '';
  return (
    `<div class="p-row"><span class="p-name">${name}${quote}</span>${right}</div>` +
    (h.meta ? `<div class="p-meta">${esc(h.meta)}</div>` : '') +
    (h.src ? `<div class="p-src" title="${esc(h.src)}">${esc(h.src)}</div>` : '')
  );
}

/** 마커 정보로 팝오버 머리를 만든다 */
export function headOf(m: MarkerInfo): PopoverHead {
  if (m.kind === 'region') return { name: `영역 ${m.rect?.width ?? 0}×${m.rect?.height ?? 0}` };
  return {
    name: m.label || m.tag ? `<${m.label ?? m.tag}>` : undefined,
    quote: m.kind === 'text' ? m.quote : undefined,
    meta: m.component,
    src: m.source ?? m.selector,
  };
}
