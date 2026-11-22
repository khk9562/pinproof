/**
 * 개발 서버(Vite 등)가 변환한 모듈의 소스맵으로 "변환 코드 줄:열" → "원본 줄"을 찾는다.
 * React 19의 _debugStack은 변환된 코드 위치를 가리키므로, 이 단계를 거쳐야 정확한 줄 번호가 된다.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;

/** Base64 VLQ 세그먼트 하나를 정수 배열로 */
export function decodeVlq(segment: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_INDEX[ch];
    if (digit === undefined) throw new Error(`잘못된 VLQ 문자: ${ch}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

export interface RawSourceMap {
  sources: string[];
  mappings: string;
  sourceRoot?: string;
  sourcesContent?: (string | null)[];
}

/**
 * 변환 코드의 위치(1-based line, 1-based column)에 대응하는 원본 위치(1-based line)를 찾는다.
 * 해당 줄에서 column 이하인 가장 가까운 세그먼트를 쓰고, 없으면 그 줄의 첫 세그먼트를 쓴다.
 */
export function originalPosition(
  map: RawSourceMap,
  line: number,
  column: number,
): { source: string; line: number; sourceIndex: number } | null {
  const lines = map.mappings.split(';');
  let srcIdx = 0;
  let srcLine = 0;
  let found: { source: number; line: number } | null = null;
  for (let l = 0; l < lines.length && l < line; l++) {
    let genCol = 0;
    let firstOnLine: { source: number; line: number } | null = null;
    let best: { source: number; line: number } | null = null;
    for (const seg of lines[l].split(',')) {
      if (!seg) continue;
      const v = decodeVlq(seg);
      genCol += v[0];
      if (v.length >= 4) {
        srcIdx += v[1];
        srcLine += v[2];
        if (l === line - 1) {
          const pos = { source: srcIdx, line: srcLine };
          if (!firstOnLine) firstOnLine = pos;
          if (genCol <= column - 1) best = pos;
        }
      }
    }
    if (l === line - 1) found = best ?? firstOnLine;
  }
  if (!found) return null;
  const source = (map.sourceRoot ?? '') + (map.sources[found.source] ?? '');
  return { source, line: found.line + 1, sourceIndex: found.source };
}

const INLINE_MAP = /\/\/[#@] sourceMappingURL=data:application\/json;(?:charset=[\w-]+;)?base64,([A-Za-z0-9+/=]+)\s*$/m;
const EXTERNAL_MAP = /\/\/[#@] sourceMappingURL=(?!data:)(\S+)\s*$/m;

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const cache = new Map<string, Promise<RawSourceMap | null>>();

/** 모듈 URL의 소스맵을 가져온다(인라인 data URL 또는 외부 .map). 실패하면 null */
export function loadSourceMap(moduleUrl: string, fetchFn: typeof fetch = fetch): Promise<RawSourceMap | null> {
  let p = cache.get(moduleUrl);
  if (!p) {
    p = (async () => {
      try {
        const code = await (await fetchFn(moduleUrl)).text();
        const inline = code.match(INLINE_MAP);
        if (inline) return JSON.parse(decodeBase64Utf8(inline[1])) as RawSourceMap;
        const ext = code.match(EXTERNAL_MAP);
        if (ext) return (await (await fetchFn(new URL(ext[1], moduleUrl).href)).json()) as RawSourceMap;
      } catch {
        /* 소스맵 없음 */
      }
      return null;
    })();
    cache.set(moduleUrl, p);
  }
  return p;
}

/**
 * 플러그인 체인 중 하나가 소스맵을 잇지 않으면(예: StyleX) 맵의 "원본"이 실제 파일과 다르다.
 * Vite의 `?raw`로 실제 파일을 받아 비교하고, 다르면 요소의 식별 속성으로 실제 줄을 다시 찾는다.
 * 돌려주는 approx=true는 "정확한 줄을 확인하지 못함"을 뜻한다.
 */
export async function verifyLine(
  moduleUrl: string,
  map: RawSourceMap,
  mapped: { line: number; sourceIndex: number },
  hints: { tag: string; needles: string[] },
  fetchFn: typeof fetch = fetch,
): Promise<{ line: number; approx: boolean }> {
  const content = map.sourcesContent?.[mapped.sourceIndex];
  if (!content) return { line: mapped.line, approx: false };
  let raw: string | null = null;
  try {
    const u = new URL(moduleUrl);
    u.search = '?raw';
    const text = await (await fetchFn(u.href)).text();
    const m = text.match(/^export default (".*");?\s*$/s);
    if (m) raw = JSON.parse(m[1]) as string;
  } catch {
    /* Vite가 아니면 확인 불가 */
  }
  if (raw === null) return { line: mapped.line, approx: false };
  if (raw === content) return { line: mapped.line, approx: false };
  return relocate(raw, mapped.line, hints);
}

function relocate(raw: string, near: number, hints: { tag: string; needles: string[] }): { line: number; approx: boolean } {
  const found = locateInSource(raw, near, hints);
  return { line: found.line, approx: !found.exact };
}

/** 식별 문자열(aria-label, data-testid, 텍스트 등)이 있는 줄 중 near에 가장 가까운 곳 → 위로 올라가 `<tag` 시작 줄 */
export function locateInSource(raw: string, near: number, hints: { tag: string; needles: string[] }): { line: number; exact: boolean } {
  const lines = raw.split('\n');
  for (const needle of hints.needles) {
    if (!needle || needle.length < 2) continue;
    const hits: number[] = [];
    lines.forEach((l, i) => {
      if (l.includes(needle)) hits.push(i);
    });
    if (hits.length === 0) continue;
    hits.sort((a, b) => Math.abs(a - (near - 1)) - Math.abs(b - (near - 1)));
    const hit = hits[0];
    const open = new RegExp(`<${hints.tag}(?![\\w-])`, 'i');
    for (let i = hit; i >= Math.max(0, hit - 20); i--) {
      if (open.test(lines[i])) return { line: i + 1, exact: true };
    }
    return { line: hit + 1, exact: false };
  }
  return { line: near, exact: false };
}
