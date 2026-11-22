import { RegionChild, TableSummary } from './types';

/**
 * 프레임워크와 무관한 DOM 추출 로직.
 * 클래스명은 StyleX·Tailwind·CSS Modules에서 해시/원자 단위인 경우가 많아 selector에 쓰지 않는다.
 * 우선순위: data-testid > id > aria-label > 구조 경로(nth-of-type)
 */

const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function attrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** React useId(:r1:, «r1»), 숫자로만 된 id, 해시처럼 보이는 id는 매 렌더마다 바뀔 수 있어 제외 */
export function isStableId(id: string): boolean {
  if (!id || id.length > 64) return false;
  if (/^[:«]|[:»]$/.test(id)) return false;
  if (/^\d/.test(id)) return false;
  if (/[a-f0-9]{8,}/i.test(id) && !/[-_]/.test(id)) return false;
  return true;
}

function isUnique(root: ParentNode, selector: string, el: Element): boolean {
  try {
    const found = root.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

/** 요소 하나만으로 고유하게 가리킬 수 있는 anchor selector */
function anchorFor(el: Element, doc: Document): string | null {
  for (const attr of TEST_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) {
      const sel = `[${attr}=${attrValue(v)}]`;
      if (isUnique(doc, sel, el)) return sel;
    }
  }
  if (el.id && isStableId(el.id)) {
    const sel = `#${cssEscape(el.id)}`;
    if (isUnique(doc, sel, el)) return sel;
  }
  const aria = el.getAttribute('aria-label');
  if (aria && aria.length <= 60) {
    const sel = `${el.tagName.toLowerCase()}[aria-label=${attrValue(aria)}]`;
    if (isUnique(doc, sel, el)) return sel;
  }
  return null;
}

function nthOfType(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (same.length === 1) return tag;
  return `${tag}:nth-of-type(${same.indexOf(el) + 1})`;
}

export function buildSelector(el: Element): string {
  const doc = el.ownerDocument;
  const own = anchorFor(el, doc);
  if (own) return own;

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== doc.body && cur !== doc.documentElement) {
    if (cur !== el) {
      const anchor = anchorFor(cur, doc);
      if (anchor) {
        parts.unshift(anchor);
        return parts.join(' > ');
      }
    }
    parts.unshift(nthOfType(cur));
    cur = cur.parentElement;
  }
  // body부터의 전체 경로는 항상 고유. 다시 찾을 때 덜 깨지도록 2단계 이상인 가장 짧은 고유 접미 경로를 쓴다
  for (let k = 2; k < parts.length; k++) {
    const candidate = parts.slice(-k).join(' > ');
    if (isUnique(doc, candidate, el)) return candidate;
  }
  return ['body', ...parts].join(' > ');
}

export function findBySelector(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** innerText는 jsdom에 없으므로 textContent로 대체 */
export function visibleText(el: Element): string {
  const t = (el as HTMLElement).innerText;
  return collapse(typeof t === 'string' ? t : el.textContent ?? '');
}

/** 사람이 읽을 이름: 버튼·링크는 글자, 입력은 placeholder/aria-label */
export function friendlyName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const aria = el.getAttribute('aria-label');
  if (aria) return `${tag} "${truncate(aria, 30)}"`;
  if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
    const text = visibleText(el);
    if (text) return `${tag} "${truncate(text, 30)}"`;
  }
  if (tag === 'input' || tag === 'textarea') {
    const ph = el.getAttribute('placeholder');
    if (ph) return `${tag} "${truncate(ph, 30)}"`;
  }
  return tag;
}

export function tableSummary(el: Element): TableSummary | undefined {
  const headerEls = el.matches('th, [role=columnheader]')
    ? []
    : Array.from(el.querySelectorAll('th, [role=columnheader]'));
  const rowEls = Array.from(el.querySelectorAll('tbody tr, [role=row]')).filter(
    (r) => !r.querySelector('th, [role=columnheader]'),
  );
  if (headerEls.length === 0 && rowEls.length === 0) return undefined;
  const headers = headerEls.map((h) => truncate(visibleText(h), 40)).filter(Boolean).slice(0, 30);
  return { headers, visibleRows: rowEls.length };
}

export function outerHtmlPreview(el: Element, max = 2000): string {
  const html = el.outerHTML;
  return html.length > max ? `${html.slice(0, max)}\n<!-- …${html.length - max}자 생략 -->` : html;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function inside(inner: DOMRect, outer: Rect): boolean {
  return (
    inner.width > 0 &&
    inner.height > 0 &&
    inner.left >= outer.x &&
    inner.top >= outer.y &&
    inner.right <= outer.x + outer.width &&
    inner.bottom <= outer.y + outer.height
  );
}

/** 영역 안에 완전히 들어간 요소 중 최상위만(조상이 이미 포함되면 제외), 최대 max개 */
export function elementsInRect(doc: Document, rect: Rect, ignore: Element | null, max = 10): RegionChild[] {
  const hits: Element[] = [];
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (ignore && (el === ignore || ignore.contains(el))) continue;
    if (!inside(el.getBoundingClientRect(), rect)) continue;
    if (hits.some((h) => h.contains(el))) continue;
    hits.push(el);
    if (hits.length >= max) break;
  }
  return hits.map((el) => ({
    selector: buildSelector(el),
    tag: el.tagName.toLowerCase(),
    text: truncate(visibleText(el), 80),
  }));
}

/**
 * 영역 안에 보이는 글자를 화면 순서대로 모은다(텍스트 노드 + 입력칸 placeholder/값/aria-label).
 * 요소가 영역에 완전히 들어가지 않아도 글자 중심이 영역 안이면 포함한다.
 */
export function textsInRect(doc: Document, rect: Rect, ignore: Element | null, maxChars = 1000): string[] {
  const out: string[] = [];
  let total = 0;
  const push = (t: string) => {
    const v = collapse(t);
    if (!v || out[out.length - 1] === v || total > maxChars) return;
    out.push(v);
    total += v.length;
  };
  const centerIn = (r: DOMRect) => {
    if (r.width === 0 || r.height === 0) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height;
  };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (ignore && ignore.contains(n)) continue;
    if (n.nodeType === Node.TEXT_NODE) {
      const parent = n.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      if (centerIn(range.getBoundingClientRect())) push(n.textContent);
    } else {
      const el = n as Element;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) continue;
      if (!centerIn(el.getBoundingClientRect())) continue;
      const input = el as HTMLInputElement;
      if (input.type === 'password') {
        push('[비밀번호 입력칸]');
        continue;
      }
      const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
      const value = el.tagName === 'SELECT' ? (el as HTMLSelectElement).selectedOptions[0]?.text ?? '' : input.value;
      push(`[${input.type || el.tagName.toLowerCase()} 입력칸${label ? ` "${label}"` : ''}${value ? ` = "${truncate(value, 40)}"` : ''}]`);
    }
  }
  return out;
}

/** 텍스트 선택을 exact + 앞뒤 문맥으로 저장(Hypothesis TextQuote 방식) */
export function quoteFromSelection(sel: Selection, context = 32): { exact: string; prefix: string; suffix: string } | null {
  if (sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const exact = range.toString();
  if (!exact.trim()) return null;
  const container =
    range.commonAncestorContainer.nodeType === 1
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement!;
  const block = (container.closest('p, li, td, th, h1, h2, h3, h4, h5, h6, section, article, div') ?? container) as Element;
  const full = block.textContent ?? '';
  const pre = block.ownerDocument.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();
  const after = full.slice(before.length + exact.length);
  return {
    exact,
    prefix: before.slice(-context),
    suffix: after.slice(0, context),
  };
}
