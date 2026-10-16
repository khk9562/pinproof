import { loadSourceMap, originalPosition, verifyLine } from '../sourcemap';
import { ComponentInfo } from '../types';

/**
 * React 어댑터 (MAIN world에서 실행).
 * - 컴포넌트 체인: DOM 노드의 __reactFiber$ 키 → fiber.return을 따라 함수/클래스 컴포넌트 이름 수집
 * - 소스 위치:
 *   React 16~18 개발 모드: host fiber의 _debugSource {fileName, lineNumber, columnNumber}
 *   React 19 개발 모드: _debugSource가 제거됨 → _debugStack(Error)의 스택에서 첫 앱 코드 프레임을 파싱
 *   (Vite 등이 변환한 코드 기준 줄 번호라 근사값으로 표시)
 * 감지되지 않으면 null을 돌려주고, 기록에서는 그 항목만 빠진다.
 */

type Fiber = {
  type: unknown;
  return: Fiber | null;
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number };
  _debugStack?: { stack?: string } | string;
  _debugOwner?: Fiber | null;
};

function fiberOf(node: Element | null): Fiber | null {
  let cur: Element | null = node;
  while (cur) {
    for (const key of Object.keys(cur)) {
      if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
        return (cur as unknown as Record<string, Fiber>)[key];
      }
    }
    cur = cur.parentElement;
  }
  return null;
}

function componentName(type: unknown): string | null {
  if (!type) return null;
  if (typeof type === 'function') {
    const t = type as { displayName?: string; name?: string };
    return t.displayName || t.name || null;
  }
  if (typeof type === 'object') {
    const t = type as { displayName?: string; render?: unknown; type?: unknown };
    if (t.displayName) return t.displayName;
    if (t.render) return componentName(t.render); // forwardRef
    if (t.type) return componentName(t.type); // memo
  }
  return null;
}

/** 프레임워크 내부·라이브러리 래퍼로 보이는 이름은 체인에서 뺀다 */
const INTERNAL = /^(Fragment|StrictMode|Suspense|Profiler|Provider|Consumer|Context|Router|Routes|Route|ErrorBoundary|InnerLayoutRouter|OuterLayoutRouter|RenderFromTemplateContext|ScrollAndFocusHandler|RedirectBoundary|NotFoundBoundary|LoadingBoundary|HotReload|AppRouter|ServerRoot|Root)$/;

export function relativizePath(path: string): string {
  let p = path;
  try {
    if (/^https?:\/\//.test(p)) p = new URL(p).pathname;
  } catch {
    /* 그대로 사용 */
  }
  p = p.split('?')[0].replace(/^\/@fs/, '');
  const markers = ['/src/', '/app/', '/pages/', '/components/', '/lib/'];
  for (const m of markers) {
    const i = p.indexOf(m);
    if (i !== -1) return p.slice(i + 1);
  }
  return p.replace(/^\/+/, '');
}

export interface StackFrame {
  url: string;
  line: number;
  column: number;
}

/** React 19 _debugStack 문자열에서 첫 앱 코드 프레임을 찾는다 */
export function frameFromStack(stack: string): StackFrame | null {
  for (const line of stack.split('\n')) {
    const m = line.match(/\(?((?:https?:\/\/|\/)[^\s()]+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const url = m[1];
    if (/node_modules|\/\.vite\/deps\/|react-dom|react-jsx|jsx-dev-runtime|chunk-|\/@vite\/|\/_next\/static\/chunks\/(?!app\/)/.test(url)) continue;
    return { url, line: Number(m[2]), column: Number(m[3]) };
  }
  return null;
}

/** 소스맵 없이 변환 코드 기준 위치만 문자열로 */
export function sourceFromStack(stack: string): string | null {
  const f = frameFromStack(stack);
  return f ? `${relativizePath(f.url)}:${f.line}` : null;
}

/** 소스에서 요소를 다시 찾을 때 쓸 식별 문자열(우선순위 순) */
function identifyingStrings(el: Element): string[] {
  const out: string[] = [];
  for (const a of ['data-testid', 'aria-label', 'id', 'placeholder', 'title', 'alt', 'name']) {
    const v = el.getAttribute(a);
    if (v) out.push(v);
  }
  if (el.childElementCount === 0) {
    const t = (el.textContent ?? '').trim();
    if (t && t.length <= 60) out.push(t);
  }
  return out;
}

export async function detectReact(el: Element): Promise<ComponentInfo | null> {
  const host = fiberOf(el);
  if (!host) return null;

  const chain: string[] = [];
  let f: Fiber | null = host.return;
  while (f && chain.length < 6) {
    const name = componentName(f.type);
    if (name && !INTERNAL.test(name) && /^[A-Z]/.test(name) && chain[chain.length - 1] !== name) {
      chain.push(name);
    }
    f = f.return;
  }

  let source: string | undefined;
  let sourceApprox = false;
  if (host._debugSource?.fileName) {
    const s = host._debugSource;
    source = `${relativizePath(s.fileName)}:${s.lineNumber}`;
  } else if (host._debugStack) {
    const stack = typeof host._debugStack === 'string' ? host._debugStack : host._debugStack.stack;
    const frame = stack ? frameFromStack(stack) : null;
    if (frame) {
      // 변환된 코드 위치 → 소스맵으로 원본 줄 복원. 실패하면 변환 코드 기준 근사값
      const map = /^https?:/.test(frame.url) ? await loadSourceMap(frame.url) : null;
      const orig = map ? originalPosition(map, frame.line, frame.column) : null;
      if (orig && map) {
        const checked = await verifyLine(frame.url, map, orig, { tag: el.tagName.toLowerCase(), needles: identifyingStrings(el) });
        const file = relativizePath(orig.source.startsWith('/') || /^https?:/.test(orig.source) ? orig.source : frame.url);
        source = `${file}:${checked.line}`;
        sourceApprox = checked.approx;
      } else {
        source = `${relativizePath(frame.url)}:${frame.line}`;
        sourceApprox = true;
      }
    }
  }

  if (chain.length === 0 && !source) return null;
  return { framework: 'React', chain, source, sourceApprox };
}
