// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSelector, friendlyName, isStableId, quoteFromSelection, tableSummary } from '../lib/dom';
import { relativizePath, sourceFromStack } from '../lib/adapters/react';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildSelector', () => {
  it('data-testid를 가장 먼저 쓴다', () => {
    document.body.innerHTML = `<div class="x1a2b3c"><span data-testid="total">10</span></div>`;
    expect(buildSelector(document.querySelector('span')!)).toBe('[data-testid="total"]');
  });

  it('해시 클래스는 쓰지 않고 구조 경로로 고유하게 만든다', () => {
    document.body.innerHTML = `
      <main><section class="x9f8e7d"><p>a</p><p>b</p></section><section class="x9f8e7d"><p>c</p><p class="x1">d</p></section></main>`;
    const target = document.querySelectorAll('p')[3];
    const sel = buildSelector(target);
    expect(sel).not.toContain('x9f8e7d');
    expect(document.querySelectorAll(sel)).toHaveLength(1);
    expect(document.querySelector(sel)).toBe(target);
  });

  it('조상의 안정적인 id를 anchor로 쓴다', () => {
    document.body.innerHTML = `<div id="node-list"><ul><li>a</li><li>b</li></ul></div><ul><li>c</li><li>d</li></ul>`;
    const target = document.querySelectorAll('li')[1];
    const sel = buildSelector(target);
    expect(sel.startsWith('#node-list')).toBe(true);
    expect(document.querySelector(sel)).toBe(target);
  });

  it('React useId 같은 불안정한 id는 피한다', () => {
    expect(isStableId(':r1:')).toBe(false);
    expect(isStableId('«r3»')).toBe(false);
    expect(isStableId('123')).toBe(false);
    expect(isStableId('node-list')).toBe(true);
  });
});

describe('friendlyName / tableSummary', () => {
  it('버튼은 글자로 이름 붙인다', () => {
    document.body.innerHTML = `<button>  저장하기 </button><input placeholder="검색">`;
    expect(friendlyName(document.querySelector('button')!)).toBe('button "저장하기"');
    expect(friendlyName(document.querySelector('input')!)).toBe('input "검색"');
  });

  it('테이블 헤더와 보이는 행 수', () => {
    document.body.innerHTML = `<table><thead><tr><th>이름</th><th>CPU</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody></table>`;
    expect(tableSummary(document.querySelector('table')!)).toEqual({ headers: ['이름', 'CPU'], visibleRows: 2 });
  });

  it('role 기반 그리드(ag-grid 등)', () => {
    document.body.innerHTML = `<div role="grid"><div role="row"><div role="columnheader">이름</div></div><div role="row"><div>a</div></div><div role="row"><div>b</div></div></div>`;
    expect(tableSummary(document.querySelector('[role=grid]')!)).toEqual({ headers: ['이름'], visibleRows: 2 });
  });

  it('표가 아니면 undefined', () => {
    document.body.innerHTML = `<div><span>x</span></div>`;
    expect(tableSummary(document.querySelector('div')!)).toBeUndefined();
  });
});

describe('quoteFromSelection', () => {
  it('선택한 텍스트와 앞뒤 문맥', () => {
    document.body.innerHTML = `<p>오류: 미설치 VM 목록 조회에 실패했습니다. 다시 시도하세요</p>`;
    const text = document.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 24);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(quoteFromSelection(sel)).toEqual({ exact: '미설치 VM 목록 조회에 실패했습니다', prefix: '오류: ', suffix: '. 다시 시도하세요' });
  });
});

describe('React 어댑터 경로 처리', () => {
  it('Vite URL을 프로젝트 상대 경로로', () => {
    expect(relativizePath('http://localhost:5190/src/components/Card.tsx?t=1712')).toBe('src/components/Card.tsx');
    expect(relativizePath('/Users/me/work/app/src/App.tsx')).toBe('src/App.tsx');
  });

  it('React 19 _debugStack에서 라이브러리 프레임을 건너뛰고 앱 코드 위치를 찾는다', () => {
    const stack = [
      'Error: react-stack-top-frame',
      '    at exports.jsxDEV (http://localhost:5190/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:250:30)',
      '    at TimeCard (http://localhost:5190/src/components/TimeCard.tsx?t=17:42:13)',
      '    at react-stack-bottom-frame (http://localhost:5190/node_modules/.vite/deps/react-dom_client.js?v=1:1:1)',
    ].join('\n');
    expect(sourceFromStack(stack)).toBe('src/components/TimeCard.tsx:42');
  });
});
