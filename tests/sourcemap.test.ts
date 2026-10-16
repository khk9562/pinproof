import { describe, expect, it } from 'vitest';
import { decodeVlq, loadSourceMap, locateInSource, originalPosition, verifyLine } from '../lib/sourcemap';

describe('decodeVlq', () => {
  it('기본 값', () => {
    expect(decodeVlq('AAAA')).toEqual([0, 0, 0, 0]);
    expect(decodeVlq('AACA')).toEqual([0, 0, 1, 0]);
    expect(decodeVlq('D')).toEqual([-1]);
    expect(decodeVlq('gB')).toEqual([16]);
  });
});

describe('originalPosition', () => {
  // 변환 코드 1줄 → 원본 1줄, 2줄 → 원본 5줄(+4), 3줄은 열 0과 열 10에서 각각 원본 6줄·40줄
  const map = { sources: ['/Users/me/app/src/App.tsx'], mappings: 'AAAA;AAIA;AACA,UAkCA' };

  it('줄 단위 대응', () => {
    expect(originalPosition(map, 1, 1)).toMatchObject({ source: '/Users/me/app/src/App.tsx', line: 1 });
    expect(originalPosition(map, 2, 5)).toMatchObject({ source: '/Users/me/app/src/App.tsx', line: 5 });
  });

  it('같은 줄에서는 column 이하의 가장 가까운 세그먼트', () => {
    expect(originalPosition(map, 3, 3)).toMatchObject({ source: '/Users/me/app/src/App.tsx', line: 6 });
    expect(originalPosition(map, 3, 14)).toMatchObject({ source: '/Users/me/app/src/App.tsx', line: 40 });
  });

  it('매핑이 없는 줄은 null', () => {
    expect(originalPosition(map, 9, 1)).toBeNull();
  });
});

describe('loadSourceMap', () => {
  it('Vite 인라인 소스맵(data URL)을 읽는다', async () => {
    const json = JSON.stringify({ version: 3, sources: ['App.tsx'], mappings: 'AAAA' });
    const b64 = Buffer.from(json).toString('base64');
    const code = `const a = 1;\n//# sourceMappingURL=data:application/json;base64,${b64}\n`;
    const fake = (async () => new Response(code)) as unknown as typeof fetch;
    expect(await loadSourceMap('http://localhost/src/App.tsx?t=1', fake)).toMatchObject({ sources: ['App.tsx'] });
  });
});

describe('verifyLine / locateInSource (소스맵 체인이 끊긴 경우)', () => {
  const real = [
    "import x from 'y';",
    '',
    'export function App() {',
    '  return (',
    '    <header>',
    '      <button',
    '        type="button"',
    '        aria-label="흐름 — 메인 화면으로"',
    '      >',
    '        흐름',
    '      </button>',
    '    </header>',
    '  );',
    '}',
  ].join('\n');

  it('식별 속성으로 실제 파일에서 <tag 시작 줄을 찾는다', () => {
    expect(locateInSource(real, 3, { tag: 'button', needles: ['흐름 — 메인 화면으로'] })).toEqual({ line: 6, exact: true });
  });

  it('맵 원본과 ?raw 내용이 다르면 다시 찾고, 같으면 그대로 둔다', async () => {
    const stylexOutput = 'export function App() {\n  return <header><button type="button" aria-label="흐름 — 메인 화면으로">흐름</button></header>;\n}';
    const map = { sources: ['App.tsx'], mappings: 'AAAA', sourcesContent: [stylexOutput] };
    const raw = (async () => new Response(`export default ${JSON.stringify(real)}`)) as unknown as typeof fetch;
    const hints = { tag: 'button', needles: ['흐름 — 메인 화면으로', '흐름'] };
    expect(await verifyLine('http://localhost:5190/src/App.tsx?t=1', map, { line: 2, sourceIndex: 0 }, hints, raw)).toEqual({ line: 6, approx: false });

    const same = { ...map, sourcesContent: [real] };
    expect(await verifyLine('http://localhost:5190/src/App.tsx', same, { line: 6, sourceIndex: 0 }, hints, raw)).toEqual({ line: 6, approx: false });
  });

  it('다시 찾지 못하면 근사값으로 표시', async () => {
    const map = { sources: ['App.tsx'], mappings: 'AAAA', sourcesContent: ['다른 내용'] };
    const raw = (async () => new Response(`export default ${JSON.stringify(real)}`)) as unknown as typeof fetch;
    expect(await verifyLine('http://localhost/src/App.tsx', map, { line: 4, sourceIndex: 0 }, { tag: 'div', needles: ['없는 문자열'] }, raw)).toEqual({ line: 4, approx: true });
  });
});
